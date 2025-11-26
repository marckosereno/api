// api/chat.js
const { GoogleGenAI } = require('@google/genai');
const { Client: PlacesClient } = require('@googlemaps/google-maps-services-js');
const rateLimit = require('express-rate-limit');
const fs = require('fs');

// 1. CONFIGURACIÓN DE APIS Y DATOS
// Asegúrate de que estas variables de entorno existan en Vercel
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PLACES_API_KEY = process.env.PLACES_API_KEY;

// Carga de datos de directorio local (asume que existe en la ruta relativa)
// Esto debe coincidir con la ubicación de tu archivo progreso_data.json
let places = [];
try {
    const dataPath = './data/progreso_data.json';
    const rawData = fs.readFileSync(dataPath);
    places = JSON.parse(rawData);
} catch (error) {
    console.error("Error al cargar progreso_data.json:", error.message);
}

const ai = new GoogleGenAI(GEMINI_API_KEY);
const placesClient = new PlacesClient({});

// --- LISTA DE CATEGORÍAS SENSIBLES (APLICAR RESTRICCIONES AQUÍ) ---
// Si una ficha tiene una de estas secciones, se eliminan teléfono y reseñas.
const SENSITIVE_CATEGORIES = ['Dentist', 'Pharmacy', 'Health', 'Health and Beauty', 'Doctor', 'Clinic', 'Optometrist', 'Salud & Estética'];

// --- 2. MIDDLEWARE DE RATE LIMITER (Protección contra 429) ---
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 10, // Máximo 10 peticiones por IP en 1 minuto
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        // Devuelve un error 429 cuando el límite se excede
        res.status(options.statusCode).json({
            error: true,
            message: "Demasiadas peticiones. Por favor, espera un minuto antes de volver a preguntar. 🐌"
        });
    }
});

// --- 3. FUNCIONES DE SEGURIDAD Y CONTEXTO ---

/**
 * Filtra placePhone y reviewUrl si la categoría es sensible, y añade un disclaimer.
 * @param {object} place La ficha del directorio local.
 * @param {object} responseJson El JSON estructurado generado por Gemini.
 */
function filterSensitiveData(place, responseJson, currentLanguage) {
    if (SENSITIVE_CATEGORIES.includes(place.Section)) {
        console.log(`[SEGURIDAD] Filtrando datos sensibles para: ${place.Section}`);
        
        // 🛑 ACCIÓN CLAVE: ANULAR DATOS SENSIBLES 🛑
        responseJson.placePhone = null;
        responseJson.reviewUrl = null;
        
        // Añadir el descargo de responsabilidad a la descripción
        const disclaimer = currentLanguage === 'es' 
            ? "\n\n⚠️ DESCARGO DE RESPONSABILIDAD: Esta información se proporciona únicamente con fines de directorio. No constituye consejo médico o legal. Consulte directamente al profesional para obtener información detallada y citas."
            : "\n\n⚠️ DISCLAIMER: This information is provided for directory purposes only. It does not constitute medical or legal advice. Please contact the professional directly for detailed information and appointments.";

        // Asegurar que el disclaimer se añade a la descripción generada por el modelo
        const originalText = responseJson.description || responseJson.text || '';
        responseJson.description = originalText + disclaimer;
        responseJson.text = responseJson.description; 
    }
    return responseJson;
}

/**
 * Genera la instrucción de sistema con reglas de seguridad estrictas.
 */
function generateSystemInstruction(places, currentLanguage) {
    const langInstructions = currentLanguage === 'es' 
        ? "Responde siempre en español. Si el usuario pide recomendaciones, utiliza la información de la lista de lugares."
        : "Always respond in English. If the user asks for recommendations, use the information from the list of places.";

    const placeSchema = {
        type: 'object',
        properties: {
            isStructured: { type: 'boolean', description: 'Siempre debe ser true para esta estructura.' },
            type: { type: 'string', enum: ['place', 'category'], description: 'El tipo de consulta resuelta.' },
            placeName: { type: 'string', description: 'Nombre exacto del lugar encontrado, solo si type es "place".' },
            categoryName: { type: 'string', description: 'Nombre de la categoría resumida, solo si type es "category".' },
            description: { type: 'string', description: 'Una descripción detallada y amable sobre el lugar o la categoría. Debe incluir la dirección y horario si está disponible.' },
            placePhone: { type: 'string', nullable: true, description: 'Número de teléfono extraído del directorio, si es un lugar específico y no es una categoría sensible (Dentist, Pharmacy). Debe ser nulo para categorías sensibles.' },
            mapUrl: { type: 'string', nullable: true, description: 'URL de Google Maps para el lugar o para la búsqueda de la categoría.' },
            reviewUrl: { type: 'string', nullable: true, description: 'URL directa a las reseñas de Google del lugar, si está disponible y no es una categoría sensible.' },
        },
        required: ['isStructured', 'type', 'description'],
    };

    const placeList = places.map(p => 
        `[${p.Title}] | Categoría: ${p.Section} | Dirección: ${p.Address} | Detalles: ${p.Description || 'No disponible'}`
    ).join('\n');

    return `
        Eres PROGRESO TOUR GUIDE, un asistente virtual experto en la ciudad de Nuevo Progreso, Tamaulipas.
        Tu principal fuente de conocimiento es el DIRECTORIO DE LUGARES que se te proporciona a continuación.
        
        DIRECTORIO DE LUGARES:
        ---
        ${placeList}
        ---

        1.  **PRIORIDAD**: Usa la información de este directorio y de tu conocimiento general sobre Progreso.
        2.  **FORMATO DE RESPUESTA**: Para consultas específicas sobre un lugar o una categoría, responde en el siguiente formato JSON estructurado, asegurando que sea un JSON válido y completo sin texto adicional antes o después. Usa el 'description' para tu texto conversacional.
        3.  **REGLA DE SEGURIDAD (ALTO RIESGO)**:
            * **NUNCA** proporciones consejos médicos, legales o financieros.
            * **Para categorías sensibles (como Dentistas, Farmacias, Salud)**: Tu respuesta debe ser estrictamente informativa y **DEBE incluir un descargo de responsabilidad (disclaimer)** en la propiedad 'description', indicando que la información es solo para directorio y no constituye consejo médico.
            * **Para categorías sensibles**: Los campos 'placePhone' y 'reviewUrl' en el JSON deben ser **NULL** por política de seguridad, a menos que el usuario esté preguntando por una categoría no sensible (ej. Restaurantes).
        4.  **RECOMENDACIONES**: Evita frases como "el mejor" o "el más seguro". Usa frases como "una opción popular" o "conoce las valoraciones en línea".

        ${langInstructions}
    `;
}

// --- 4. FUNCIÓN HANDLER PRINCIPAL ---
module.exports = async function handler(req, res) {
    // 4.1. Aplicar Rate Limiter
    const result = await new Promise(resolve => {
        limiter(req, res, () => resolve('ok'));
    });
    
    if (result !== 'ok') {
        // La respuesta de error 429 ya fue enviada por el Rate Limiter
        return; 
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    const { history, userPrompt, currentLanguage } = req.body;
    
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ message: 'GEMINI_API_KEY no está configurada.' });
    }
    
    try {
        const systemInstruction = generateSystemInstruction(places, currentLanguage);
        
        // El historial incluye la instrucción del sistema al inicio
        const contents = [
            {
                role: "system",
                parts: [{ text: systemInstruction }]
            },
            ...history,
            {
                role: "user",
                parts: [{ text: userPrompt }]
            }
        ];

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contents,
            config: {
                // Configuración para usar JSON de forma más consistente
                responseMimeType: "application/json",
            }
        });

        let responseText = response.text.trim();

        // 4.2. Post-procesamiento: Aplicar filtro de seguridad en el backend
        try {
            const jsonStart = responseText.indexOf('{');
            const jsonEnd = responseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
                let parsedJson = JSON.parse(jsonString);

                if (parsedJson.isStructured === true && parsedJson.type === 'place') {
                    // Encontrar la ficha local para verificar su categoría (Section)
                    const matchingPlace = places.find(p => p.Title === parsedJson.placeName);
                    
                    if (matchingPlace) {
                        // 🛑 APLICAR FILTRO DE SEGURIDAD 🛑
                        parsedJson = filterSensitiveData(matchingPlace, parsedJson, currentLanguage);
                        // Reemplazar la respuesta de texto con el JSON modificado
                        responseText = JSON.stringify(parsedJson); 
                    }
                }
            }
        } catch (e) {
            console.error("Error al parsear o filtrar JSON:", e);
            // Si falla el parseo o la limpieza, devolvemos el texto original para no interrumpir el chat
            // (el frontend intentará mostrar el texto plano)
        }


        res.status(200).json({ responseText });

    } catch (error) {
        console.error('Error al llamar a la API de Gemini:', error.message);
        const errorMessage = currentLanguage === 'es' 
            ? 'Lo siento, ocurrió un error en el servidor. Inténtalo de nuevo más tarde.'
            : 'Sorry, an error occurred on the server. Please try again later.';
            
        res.status(500).json({ message: errorMessage, errorDetails: error.message });
    }
};

