import { GoogleGenAI } from '@google/genai';
// Importamos el cliente de Google Maps Platform
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. La Clave de API de Gemini es leída automáticamente.
const ai = new GoogleGenAI({});

// 2. Inicializamos el cliente de Places API usando la variable de entorno.
// Esto debe ejecutarse en el entorno del servidor (Vercel).
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({});

// El resto de tu BASE_SYSTEM_INSTRUCTION (Instrucciones para Gemini)
// La modificamos para pedir el NOMBRE DEL LUGAR en un campo específico.
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}**.
2. **MODO FICHA (JSON):** Úsalo SOLO si la solicitud es una búsqueda de un lugar o negocio (ej: "mejor dentista", "bares"). Debes incluir la propiedad 'placeToSearch' con el nombre exacto del lugar.
3. El formato JSON requerido es:
   {
     "placeName": "Nombre del Lugar",
     "placeToSearch": "Nombre Exacto a buscar en Places API, ej: Dr. Miguel Lopez Dental Clinic", // <-- ¡NUEVO CAMPO CRÍTICO!
     "description": "Descripción corta de no más de 3 oraciones.",
     "isStructured": true
   }`;

/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si falla.
 */
async function getPlaceDetails(query) {
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // Primero, hacemos una búsqueda para obtener el place_id
    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query + ", Nuevo Progreso Tamps, México",
                inputtype: 'textquery',
                fields: ['place_id']
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        
        if (!placeId) {
            console.log("No se encontró un place_id para la consulta:", query);
            return null;
        }

        // Segundo, obtenemos los detalles del lugar
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url'] // name, teléfono, URL de Google Maps
            }
        });

        const place = detailsResponse.data.result;
        
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null
        };

    } catch (e) {
        console.error("Error al llamar a Google Places API:", e.response ? e.response.data : e.message);
        return null;
    }
}


export default async function handler(req, res) {
    // ... (El manejo de POST y error 405 sigue igual) ...

    try {
        const { history = [], userPrompt, currentLanguage } = req.body;
        
        // Configuramos el idioma para la instrucción del sistema
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // ... (El código de inicialización de 'chat' sigue igual) ...
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history
        });

        // Enviamos el nuevo mensaje al modelo
        const result = await chat.sendMessage({ message: userPrompt });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };

        // 🚀 Lógica de ENRIQUECIMIENTO con Places API
        try {
            const jsonStart = modelResponseText.indexOf('{');
            const jsonEnd = modelResponseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
                const parsedJson = JSON.parse(jsonString);

                if (parsedJson.isStructured === true && parsedJson.placeToSearch) {
                    
                    const placeData = await getPlaceDetails(parsedJson.placeToSearch);

                    if (placeData) {
                        // Reemplazamos/añadimos los datos reales de Places al JSON
                        finalResponseData.responseText = JSON.stringify({
                            ...parsedJson,
                            placeName: placeData.name, // Nombre de Places (más preciso)
                            placePhone: placeData.phone, // Teléfono de Places
                            mapUrl: placeData.mapUrl, // URL de Google Maps
                        });
                        
                        console.log("Respuesta enriquecida con Places para:", placeData.name);
                    } else {
                        // Si falla Places, enviamos la respuesta original de Gemini
                        finalResponseData.responseText = modelResponseText;
                    }
                }
            }
        } catch (jsonError) {
            console.error("Fallo en el parseo o enriquecimiento del JSON:", jsonError);
            // Si el parseo falla, simplemente enviamos el texto plano original de Gemini
            finalResponseData.responseText = modelResponseText;
        }

        // Retornamos la respuesta (enriquecida o original) al frontend
        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo al obtener respuesta de Gemini: " + error.message
        });
    }
}
