// --- 1. IMPORTS Y CONFIGURACIÓN INICIAL ---
const { GoogleGenAI } = require('@google/genai');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// Inicializa el cliente Gemini y Places
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const PLACES_API_KEY = process.env.PLACES_API_KEY; // Nota: No se usa directamente en este código, pero es útil si añades la funcionalidad.

// --- 2. CARGA DE DATOS DE LUGARES ---
let places = [];
try {
    // 🟢 RUTA CORREGIDA: Usa process.cwd() para la detección automática en Vercel
    const dataPath = path.join(process.cwd(), 'data', 'progreso_data.json'); 
    
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    places = JSON.parse(rawData);
} catch (error) {
    console.error("CRITICAL ERROR: Failed to load progreso_data.json or parse JSON:", error.message);
    // En un entorno de producción, esto debería lanzar un error que detenga la ejecución.
    throw new Error("Initialization failed: Missing or invalid data file.");
}


// --- 3. MIDDLEWARE DE RATE LIMITER (Protección contra 429) ---
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // Máximo 10 peticiones por IP en 1 minuto
    
    // 🛑 CORRECCIÓN CLAVE: Desactivar encabezados estándar para evitar el crash en Vercel.
    standardHeaders: false, 
    legacyHeaders: false,

    keyGenerator: (req, res) => {
        // Esta es la forma más estable de obtener la IP real del usuario en Vercel.
        const ipHeader = req.headers['x-forwarded-for'];
        
        if (ipHeader) {
            // Devuelve la primera IP de la lista.
            return ipHeader.split(',')[0].trim();
        }
        
        return req.socket.remoteAddress || 'unknown';
    },

    handler: (req, res, next, options) => {
        // Devuelve un error 429 cuando el límite se excede
        res.status(options.statusCode).json({
            error: true,
            message: "Demasiadas peticiones. Por favor, espera un minuto antes de volver a preguntar. 🐌"
        });
    }
});


// --- 4. LÓGICA DE FILTRADO Y PROMPT ---

// Categorías sensibles que requieren una respuesta de advertencia
const SENSITIVE_CATEGORIES = [
    'clinicas_dentales', 
    'farmacias',
    'opticas' 
];

/**
 * Genera la instrucción del sistema para Gemini, filtrando datos sensibles.
 * @param {Array} allPlaces - El array completo de lugares cargados.
 * @param {string} currentLanguage - Idioma del usuario (e.g., 'es').
 * @returns {string} Instrucción del sistema.
 */
function generateSystemInstruction(allPlaces, currentLanguage) {
    // Mapea y formatea la lista de lugares
    const placeList = allPlaces.map(p => {
        const isSensitive = SENSITIVE_CATEGORIES.includes(p.Section);
        
        let details = [];
        details.push(`Título: ${p.Title}`);
        details.push(`Categoría: ${p.Section}`);
        details.push(`Dirección: ${p.Address}`);
        
        if (p.Description) {
            details.push(`Descripción: ${p.Description}`);
        }
        
        // Aplica el filtro de seguridad para categorías sensibles
        if (isSensitive) {
            details.push(`NOTA IMPORTANTE: No dar números de teléfono, enlaces, o información sobre precios o calidad para ${p.Title}.`);
        } else {
             // Si el lugar no es sensible, podrías añadir más información aquí si estuviera disponible.
        }
        
        return details.join(' | '); // Une los detalles de un solo lugar
    }).join('\n'); // Separa cada lugar con un salto de línea

    const instruction = `
        Eres un guía turístico e informador útil y amigable para el poblado de Nuevo Progreso, Tamaulipas, México. 
        Tu objetivo es ayudar a los visitantes a encontrar información sobre negocios locales basándote exclusivamente en la lista de lugares proporcionada a continuación.
        
        --- REGLAS ESTRICTAS ---
        1. Responde siempre en ${currentLanguage === 'es' ? 'español' : 'inglés'}.
        2. **Solo** utiliza la información de la lista de lugares proporcionada. Si la información no está en la lista, debes decir amablemente que no tienes esa información, sin inventar nada.
        3. Si la pregunta incluye una categoría sensible (farmacias, ópticas, o clínicas dentales), **NUNCA** proporciones información médica, números de teléfono, precios, o enlaces externos. En su lugar, usa el texto de "NOTA IMPORTANTE" de la lista para recordarte esa regla en tu respuesta.
        4. Sé conciso y responde directamente a lo que el usuario pide, usando los datos exactos del campo 'Título' y 'Categoría'.
        
        --- LISTA DE LUGARES DE NUEVO PROGRESO ---
        ${placeList}
    `;

    return instruction;
}


// --- 5. FUNCIÓN HANDLER PRINCIPAL DE VERCEL ---

/**
 * Función principal para manejar las peticiones HTTP.
 * @param {import('http').IncomingMessage} req - El objeto de la petición HTTP.
 * @param {import('http').ServerResponse} res - El objeto de la respuesta HTTP.
 */
module.exports = async (req, res) => {
    // Aplica el Rate Limiter (si el límite se excede, el handler dentro de limiter se encarga de la respuesta)
    await new Promise(resolve => {
        limiter(req, res, () => {
            resolve();
        });
    });

    // Si el Rate Limiter ya respondió (429), salimos de la función
    if (res.finished) {
        return;
    }
    
    // Solo permitimos peticiones POST
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Solo se permiten peticiones POST' });
        return;
    }

    try {
        let body = '';
        // Lee el cuerpo de la petición (JSON)
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', resolve);
            req.on('error', reject);
        });

        const { prompt, language } = JSON.parse(body);

        if (!prompt) {
            res.status(400).json({ error: true, message: "Falta el 'prompt' en el cuerpo de la petición." });
            return;
        }

        const systemInstruction = generateSystemInstruction(places, language);

        // Llama a la API de Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1 // Temperatura baja para respuestas factuales
            }
        });

        const textResponse = response.text.trim();

        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
            response: textResponse
        });

    } catch (error) {
        // En caso de error (e.g., cuota de Gemini, error de parsing JSON, etc.)
        console.error("Error al llamar a la API de Gemini:", error.message);
        
        // Si el error es una cuota excedida de Google, mostramos un error más específico en el log.
        if (error.message.includes('Quota exceeded')) {
             console.error("Gemini API Quota Exceeded. The service is temporarily blocked by Google.");
        }
        
        res.status(500).json({ 
            error: true,
            message: 'Lo siento, ocurrió un error en el servidor. Inténtalo de nuevo más tarde.'
        });
    }
};
