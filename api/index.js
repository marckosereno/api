// --- 1. IMPORTS Y CONFIGURACIÓN INICIAL ---
const { GoogleGenAI } = require('@google/genai');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

// Inicializa el cliente Gemini
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const PLACES_API_KEY = process.env.PLACES_API_KEY; 

// --- 2. CARGA DE DATOS DE LUGARES ---
let places = [];
try {
    // 🟢 RUTA CORREGIDA: Usa process.cwd() para la detección automática en Vercel
    const dataPath = path.join(process.cwd(), 'data', 'progreso_data.json'); 
    
    const rawData = fs.readFileSync(dataPath, 'utf-8');
    places = JSON.parse(rawData);
} catch (error) {
    console.error("CRITICAL ERROR: Failed to load progreso_data.json or parse JSON:", error.message);
    throw new Error("Initialization failed: Missing or invalid data file.");
}


// --- 3. MIDDLEWARE DE RATE LIMITER (Protección contra 429) ---
const limiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 10, 
    
    // 🛑 CORRECCIÓN CLAVE: Desactivar encabezados estándar para evitar el crash en Vercel.
    standardHeaders: false, 
    legacyHeaders: false,

    keyGenerator: (req, res) => {
        // La forma más estable de obtener la IP real del usuario en Vercel.
        const ipHeader = req.headers['x-forwarded-for'];
        
        if (ipHeader) {
            return ipHeader.split(',')[0].trim();
        }
        
        return req.socket.remoteAddress || 'unknown';
    },

    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({
            error: true,
            message: "Demasiadas peticiones. Por favor, espera un minuto antes de volver a preguntar. 🐌"
        });
    }
});


// --- 4. LÓGICA DE FILTRADO Y PROMPT ---

// NUEVA LISTA DE CATEGORÍAS SENSIBLES
const SENSITIVE_CATEGORIES = [
    'clinicas_dentales', 
    'farmacias',
    'opticas',
    'esteticas' // Añadimos estética si también es sensible
];

function generateSystemInstruction(allPlaces, currentLanguage) {
    // Lista de lugares solo para consulta interna (Regla 4), NO para ser usada como respuesta principal.
    const internalPlaceList = allPlaces.map(p => {
        return `Título: ${p.Title} | Categoría: ${p.Section} | Dirección: ${p.Address}`;
    }).join('\n'); 

    const lang = currentLanguage === 'es' ? 'español' : 'inglés';
    
    const instruction = `
        Eres un guía turístico e informador útil y amigable para el poblado de Nuevo Progreso, Tamaulipas.
        Tu misión es ser un asistente de conversación experto que utiliza el conocimiento general de Google y la web, no solo la lista interna.

        --- REGLAS DE CONVERSACIÓN ---
        1. Responde siempre en ${lang}.
        2. **RESPUESTA POR DEFECTO (Categorías Generales):** Cuando un usuario pregunte por una categoría general (ej. "restaurantes" o "compras"), debes:
           a. Responder con una bienvenida y una descripción general de la categoría, usando el formato de FICHA ESTRUCTURADA TIPO CATEGORÍA.
           b. **NUNCA** listar los lugares de la base de datos interna. En el texto, invita al usuario a usar los botones 'Ver en Mapa' o 'Buscar en Google' para descubrir más opciones y ser autodependiente.
        3. **RESPUESTA ESPECÍFICA (Ficha de Lugar):** Si el usuario pregunta por un negocio **Específico** (ej. "¿Dónde está La Hacienda?"):
           a. Responde con la FICHA ESTRUCTURADA TIPO LUGAR. Utiliza tu conocimiento general y la lista interna si es necesario para dar una descripción.
           b. Si la categoría es de **Salud o Sensible** (palabras clave: ${SENSITIVE_CATEGORIES.join(', ')}), debes **Omitir** cualquier mención a Teléfono, Reseñas, Precios, Enlaces o Calidad, y añadir un DESCARGO DE RESPONSABILIDAD al final de tu descripción.

        --- REGLAS DE RECOMENDACIÓN INTERNA (SOLO SI SE SOLICITA) ---
        4. **RECOMENDACIÓN EXPLÍCITA (Lista Interna):** SOLO si el usuario pide explícitamente una recomendación o una lista (ej. "Recomiéndame 10 dentistas" o "Dame una lista de..."):
           a. Usa la siguiente LISTA INTERNA para generar una lista de 5 a 12 lugares de la categoría solicitada.
           b. Incluye siempre un DESCARGO DE RESPONSABILIDAD al final de la lista.
           c. **NUNCA** muestres números de teléfono, reseñas o precios de ningún lugar de la lista.

        --- DESCARGO DE RESPONSABILIDAD (Para añadir en Fichas de Salud y Listas de Recomendación) ---
        (ESPAÑOL: "Nota: No proporcionamos información médica, precios, números de teléfono ni referencias de calidad. Le recomendamos usar los botones 'Ver en Mapa' o 'Buscar en Google' para más opciones y verificar la información de forma independiente.")
        (ENGLISH: "Note: We do not provide medical information, prices, phone numbers, or quality references. We recommend using the 'View on Map' or 'Search on Google' buttons for more options and to verify information independently.")

        --- LISTA INTERNA DE LUGARES (Úsala SOLO para RECOMENDACIONES EXPLÍCITAS) ---
        ${internalPlaceList}
    `;

    return instruction;
}


// --- 5. FUNCIÓN HANDLER PRINCIPAL DE VERCEL ---
module.exports = async (req, res) => {
    // Aplica el Rate Limiter
    await new Promise(resolve => {
        limiter(req, res, () => {
            resolve();
        });
    });

    if (res.finished) {
        return;
    }
    
    if (req.method !== 'POST') {
        res.status(405).json({ message: 'Solo se permiten peticiones POST' });
        return;
    }

    try {
        let body = '';
        await new Promise((resolve, reject) => {
            req.on('data', chunk => {
                body += chunk.toString();
            });
            req.on('end', resolve);
            req.on('error', reject);
        });
        
        // 🟢 CORRECCIÓN CLAVE 1: Desestructurar 'contents' y 'currentLanguage'
        const { contents, currentLanguage } = JSON.parse(body);

        // 🟢 CORRECCIÓN CLAVE 2: Validar si 'contents' está presente
        if (!contents) {
            res.status(400).json({ error: true, message: "Falta el 'prompt' en el cuerpo de la petición." });
            return;
        }

        const systemInstruction = generateSystemInstruction(places, currentLanguage);

        // Llama a la API de Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            // 🟢 CORRECCIÓN CLAVE 3: Pasar el array 'contents' completo
            contents: contents, 
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1 
            }
        });

        const textResponse = response.text.trim();

        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
            responseText: textResponse // Nota: cambiado a responseText para coincidir con el frontend
        });

    } catch (error) {
        console.error("Error al llamar a la API de Gemini:", error.message);
        
        if (error.message.includes('Quota exceeded')) {
             console.error("Gemini API Quota Exceeded. The service is temporarily blocked by Google.");
        }
        
        res.status(500).json({ 
            error: true,
            message: 'Lo siento, ocurrió un error en el servidor. Inténtalo de nuevo más tarde.'
        });
    }
};
