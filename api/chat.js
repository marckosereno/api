import { GoogleGenAI } from '@google/genai';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. La Clave de API es leída automáticamente por el SDK desde GEMINI_API_KEY en Vercel
const ai = new GoogleGenAI({});

// 2. Definimos la Instrucción del Sistema una sola vez. 
// Usaremos un marcador de posición para el idioma.
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}**.
2. **MODO FICHA (JSON):** Úsalo SOLO si la solicitud es una búsqueda de un lugar o negocio (ej: "mejor dentista", "bares").
3. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales o de seguimiento.
4. El formato JSON requerido es:
   {
     "placeName": "Nombre del Lugar",
     "description": "Descripción corta de no más de 3 oraciones.",
     "placePhone": "Número de teléfono, e.g., +52 899 900 0000",
     "isStructured": true
   }`;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage } = req.body;
        
        // Configuramos el idioma para la instrucción del sistema
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // **ESTA ES LA CLAVE DEL AHORRO:** El systemInstruction se configura en la sesión.
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history // El historial se carga al iniciar la sesión
        });

        // Enviamos el nuevo mensaje al modelo
        const result = await chat.sendMessage({ message: userPrompt });

        // Retornamos la respuesta pura del modelo al frontend
        res.status(200).json({ 
            responseText: result.text.trim(),
        });

    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo al obtener respuesta de Gemini: " + error.message
        });
    }
}
