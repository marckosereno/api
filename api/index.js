// --- 1. IMPORTS Y CONFIGURACIÓN INICIAL ---
const { GoogleGenAI, Type } = require('@google/genai');
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


// --- 4. LÓGICA DE FILTRADO Y PROMPT (FUNCIÓN CORREGIDA) ---

// NUEVA LISTA DE CATEGORÍAS SENSIBLES
const SENSITIVE_CATEGORIES = [
    'clinicas_dentales', 
    'farmacias',
    'opticas',
    'esteticas' 
];

function generateSystemInstruction(allPlaces, currentLanguage) {
    // Lista de lugares solo para consulta interna (Regla 4), NO para ser usada como respuesta principal.
    const internalPlaceList = allPlaces.map(p => {
        return `Título: ${p.Title} | Categoría: ${p.Section} | Dirección: ${p.Address}`;
    }).join('\n'); 

    const lang = currentLanguage === 'es' ? 'español' : 'inglés';
    
    const instruction = `
        Eres un guía turístico e informador útil, amigable y **conciso** para el poblado de Nuevo Progreso, Tamaulipas.
        Tu misión es ser un asistente de conversación experto.

        --- REGLA CRÍTICA DE RESPUESTA (PRIORIDAD AL JSON ESTRUCTURADO) ---
        1. **Responde SIEMPRE** en ${lang}.
        2. **SIEMPRE DEBES UTILIZAR EL FORMATO JSON.**
        3. **FORMATO DE FICHA (Prioridad Máxima):** Si la pregunta del usuario es sobre un LUGAR, un NEGOCIO o una CATEGORÍA (ej. dentistas, restaurantes, "dónde comer", "Farmacias del Ahorro"), **DEBES** responder con un JSON donde **"isStructured" sea true**.
        4. **FORMATO CONVERSACIONAL (Último Recurso):** Si la pregunta es conversacional o general y NO se ajusta a una ficha (ej. "hola", "¿cómo llegar?", "borrar historial"), utiliza un JSON donde **"isStructured" sea false** y coloca la respuesta en "description".

        --- REGLAS PARA "isStructured": true (FICHAS) ---
        5. **FORMATO CONCISO:** La "description" de la ficha debe ser el resumen conciso. **Nunca incluyas las etiquetas `[Botón: ...]`** o descripciones largas sobre lo que es un lugar.
        6. **RESPUESTA DE CATEGORÍA:** Si es una pregunta de categoría (ej. "compras"):
           a. Usa `"type": "category"`.
           b. En "description", añade el DESCARGO DE RESPONSABILIDAD y dirige a usar los botones de búsqueda y mapa.
        7. **RESPUESTA DE LUGAR:** Si es un lugar específico (ej. "JM Dental Clinic"):
           a. Usa `"type": "place"`.
           b. Rellena los campos "placeName", "mapUrl", "placePhone", "reviewUrl" con la información **general de Google** o usa la **Lista Interna** si la información es específica y no quieres buscar en Google.
           c. Si es de salud (${SENSITIVE_CATEGORIES.join(', ')}), omite "placePhone" y "reviewUrl".

        --- DESCARGO DE RESPONSABILIDAD (Para añadir en Fichas de Categoría y Listas de Recomendación) ---
        (ESPAÑOL: "Nota: No proporcionamos información médica, precios, números de teléfono ni referencias de calidad. Le recomendamos usar los botones 'Ver en Mapa' o 'Buscar en Google' para más opciones y verificar la información de forma independiente.")
        (ENGLISH: "Note: We do not provide medical information, prices, phone numbers, or quality references. We recommend using the 'View on Map' or 'Search on Google' buttons for more options and to verify information independently.")

        --- LISTA INTERNA DE LUGARES (Úsala SOLO para dar una lista numerada de 5 a 12 lugares cuando se solicite) ---
        ${internalPlaceList}
        
    `;

    return instruction;
}

// --- 5. ESQUEMA DE RESPUESTA JSON ---
const responseSchema = {
    type: Type.OBJECT,
    properties: {
        isStructured: {
            type: Type.BOOLEAN,
            description: "Debe ser 'true' si es una ficha de lugar o categoría, 'false' si es una respuesta conversacional simple o una lista."
        },
        type: {
            type: Type.STRING,
            description: "Tipo de ficha: 'place', 'category', o 'text' (si isStructured es false)."
        },
        description: {
            type: Type.STRING,
            description: "El contenido principal de la respuesta. Si es una ficha, es la descripción concisa. Si es 'text', es la respuesta conversacional o la lista formateada."
        },
        // Propiedades opcionales, solo para type: 'place' o 'category'
        placeName: {
            type: Type.STRING,
            description: "Nombre del lugar (solo si type='place')."
        },
        categoryName: {
            type: Type.STRING,
            description: "Nombre de la categoría (solo si type='category')."
        },
        mapUrl: {
            type: Type.STRING,
            description: "URL de Google Maps para el lugar o una búsqueda general (solo si type='place' o 'category')."
        },
        placePhone: {
            type: Type.STRING,
            description: "Número de teléfono del lugar (solo si type='place' y NO es una categoría sensible)."
        },
        reviewUrl: {
            type: Type.STRING,
            description: "URL de reseñas del lugar (solo si type='place' y NO es una categoría sensible)."
        }
    },
    required: ["isStructured", "type", "description"]
};


// --- 6. FUNCIÓN HANDLER PRINCIPAL DE VERCEL ---
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
        
        const { contents, currentLanguage } = JSON.parse(body);

        if (!contents) {
            res.status(400).json({ error: true, message: "Falta el 'prompt' en el cuerpo de la petición." });
            return;
        }

        const systemInstruction = generateSystemInstruction(places, currentLanguage);

        // Llama a la API de Gemini
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents, 
            config: {
                systemInstruction: systemInstruction,
                temperature: 0.1,
                // 🛑 FORZAR SALIDA JSON
                responseMimeType: 'application/json',
                responseSchema: responseSchema
            }
        });

        // El texto de la respuesta de Gemini ahora debería ser un JSON string
        const textResponse = response.text.trim();

        res.setHeader('Content-Type', 'application/json');
        res.status(200).json({
            responseText: textResponse 
        });

    } catch (error) {
        console.error("Error al llamar a la API de Gemini:", error.message);
        
        let errorMessage = 'Lo siento, ocurrió un error en el servidor. Inténtalo de nuevo más tarde.';

        if (error.message.includes('Quota exceeded')) {
             console.error("Gemini API Quota Exceeded. The service is temporarily blocked by Google.");
             errorMessage = 'La cuota del servicio Gemini ha sido excedida. Por favor, inténtalo más tarde. 🚧';
        }
        
        res.status(500).json({ 
            error: true,
            message: errorMessage
        });
    }
};
