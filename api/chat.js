import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({});

// 2. Definimos la Instrucción del Sistema
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}**.
2. **MODO FICHA DE LUGAR (JSON):** Úsalo SOLO si la solicitud es de un lugar o negocio específico (ej: "mejor dentista", "bares"). Debe incluir la propiedad 'placeToSearch' con el nombre exacto del lugar.
3. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo SOLO si la solicitud es una categoría general (ej: "Salud y Estética", "Restaurantes").
4. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales o de seguimiento.
5. Los formatos JSON requeridos son:
   
   // Formato para LUGAR ESPECÍFICO
   {
     "type": "place", 
     "placeName": "Nombre del Lugar", 
     "placeToSearch": "Nombre Exacto a buscar en Places API, ej: Dr. Miguel Lopez Dental Clinic", 
     "description": "Descripción corta de no más de 3 oraciones.",
     "isStructured": true
   }
   
   // Formato para CATEGORÍA GENERAL
   {
     "type": "category", 
     "categoryName": "Nombre de la Categoría, ej: Salud y Estética",
     "description": "Resumen de la categoría en Progreso, finaliza con: 'Aquí te muestro todo lo relacionado a esta categoría.'",
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
    
    // 1. Buscar el place_id
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

        // 2. Obtener los detalles del lugar (teléfono, URL, reseñas)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'reviews'] 
            }
        });

        const place = detailsResponse.data.result;
        
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            // reviewUrl usará la URL de Google Maps para las reseñas
            reviewUrl: place.url || null 
        };

    } catch (e) {
        console.error("Error al llamar a Google Places API:", e.response ? e.response.data : e.message);
        return null;
    }
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage } = req.body;
        
        // Configuramos el idioma
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // Inicializar el chat con el historial y la instrucción de sistema
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

        // Lógica de ENRIQUECIMIENTO con Places API (Solo si es type: "place")
        try {
            const jsonStart = modelResponseText.indexOf('{');
            const jsonEnd = modelResponseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
                const parsedJson = JSON.parse(jsonString);

                if (parsedJson.isStructured === true) {
                    
                    if (parsedJson.type === 'place' && parsedJson.placeToSearch) {
                        
                        const placeData = await getPlaceDetails(parsedJson.placeToSearch);

                        if (placeData) {
                            // Enriquecemos con datos reales de Places
                            finalResponseData.responseText = JSON.stringify({
                                ...parsedJson,
                                placeName: placeData.name,
                                placePhone: placeData.phone,
                                mapUrl: placeData.mapUrl,
                                reviewUrl: placeData.reviewUrl, // Nuevo campo
                            });
                        } else {
                            // Si falla Places, al menos eliminamos placeToSearch para evitar confusiones
                            delete parsedJson.placeToSearch;
                            finalResponseData.responseText = JSON.stringify(parsedJson);
                        }
                    } else if (parsedJson.type === 'category') {
                        // Si es una categoría, solo aseguramos que el JSON es válido y lo pasamos.
                        finalResponseData.responseText = JSON.stringify(parsedJson);
                    }
                }
            }
        } catch (jsonError) {
            console.error("Fallo en el parseo o enriquecimiento del JSON:", jsonError);
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
