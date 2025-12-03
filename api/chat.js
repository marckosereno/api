import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

const MODEL_NAME = "gemini-2.5-flash"; 
const PROGRESO_LAT = 26.064;
const PROGRESO_LNG = -98.005; 
const MAX_DISTANCE_KM = 5;    // 5 kilómetros

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; 
}

const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new Client({}); 

// <-- [NUEVO] DEFINICIÓN DE LOS ESQUEMAS JSON ESPERADOS (Para forzar el output)
const PLACE_SCHEMA = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["place"] },
        placeName: { type: "string", description: "Nombre común o simplificado del lugar." },
        placeToSearch: { type: "string", description: "Nombre exacto para buscar en Places API (ej: Mustre Dental Clinic)." },
        placeCategory: { type: "string", description: "Clasificación general del lugar, ej: Clínica Dental, Restaurante." },
        isHealthPlace: { type: "boolean", description: "DEBE ser true si es salud (dental, óptica, farmacia), false en caso contrario." },
        description: { type: "string", description: "Descripción corta de no más de 3 oraciones. NUNCA incluir referencias geográficas." },
    },
    required: ["type", "placeToSearch", "placeCategory", "isHealthPlace", "description"]
};

const CATEGORY_SCHEMA = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["category"] },
        categoryName: { type: "string", description: "Nombre de la Categoría, ej: Taquerías y Tacos, Tiendas y Compras." },
        description: { type: "string", description: "Resumen de la categoría. Debe incluir una frase como: 'Usa el botón de 'Ver en Mapa' para explorar todas las opciones.' Emoji al final." },
    },
    required: ["type", "categoryName", "description"]
};

// <-- [NUEVO] FUNCIÓN PARA PARSEAR LA INTENCIÓN Y ELEGIR EL ESQUEMA
function getIntentAndSchema(userPrompt) {
    const normalizedPrompt = userPrompt.toLowerCase();
    
    // Palabras clave para CATEGORÍA
    const categoryKeywords = ['categoría', 'restaurante', 'taquería', 'tienda', 'compra', 'barbacoa', 'lugares', 'farmacia', 'dental', 'óptica', 'listado', 'recomienda', 'sugiere'];
    
    const isCategoryRequest = categoryKeywords.some(keyword => normalizedPrompt.includes(keyword));
    
    // Si la solicitud parece una lista, una categoría o una recomendación
    if (isCategoryRequest) {
        let categoryName = "Lugares y Negocios"; 
        
        if (normalizedPrompt.includes('taque') || normalizedPrompt.includes('tacos')) categoryName = "Taquerías y Tacos";
        else if (normalizedPrompt.includes('restaurante') || normalizedPrompt.includes('comer')) categoryName = "Restaurantes y Comida";
        else if (normalizedPrompt.includes('tienda') || normalizedPrompt.includes('compra') || normalizedPrompt.includes('artesanias') || normalizedPrompt.includes('souvenirs')) categoryName = "Tiendas y Compras";
        else if (normalizedPrompt.includes('barbacoa')) categoryName = "Barbacoa y Birria";
        else if (normalizedPrompt.includes('dental') || normalizedPrompt.includes('optica') || normalizedPrompt.includes('clinica') || normalizedPrompt.includes('farmacia') || normalizedPrompt.includes('salud')) categoryName = "Salud y Estética";
        else if (normalizedPrompt.includes('entretenimiento') || normalizedPrompt.includes('atracciones')) categoryName = "Entretenimiento y Atracciones";

        return { 
            intent: 'category', 
            categoryName: categoryName,
            schema: CATEGORY_SCHEMA,
            promptInstruction: `Genera una ficha de CATEGORÍA para '${categoryName}'. La descripción debe guiar al usuario a usar el botón 'Ver en Mapa' para explorar todas las opciones.`
        };
    }
    
    // Si no es una categoría, asumimos que es un LUGAR ESPECÍFICO
    return { 
        intent: 'place', 
        schema: PLACE_SCHEMA,
        promptInstruction: `Genera una ficha de LUGAR ESPECÍFICO para '${userPrompt}'. Asegúrate de clasificarlo correctamente (dental vs. óptica).`
    };
}


const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México.
Tu tarea es **siempre** responder con el formato JSON solicitado por el esquema.
REGLAS CRÍTICAS:
1. Tu descripción en el campo "description" **NUNCA debe incluir referencias geográficas** explícitas o implícitas ("en Progreso", "aquí", "cerca").
2. Para lugares de salud, DEBES ser preciso en la clasificación (ej. Clínica Dental) y **siempre** establecer "isHealthPlace": true.
3. Si el usuario pide recomendaciones o listas, debes usar el MODO FICHA DE CATEGORÍA.
4. Responde exclusivamente en español.`;


async function getPlaceDetails(query) {
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query + ", Nuevo Progreso Tamps, México",
                inputtype: 'textquery',
                fields: ['place_id', 'geometry'] 
            }
        });

        const candidate = findPlaceResponse.data.candidates?.[0];
        const placeId = candidate?.place_id;
        
        if (!placeId) return null;

        const placeLat = candidate.geometry.location.lat;
        const placeLng = candidate.geometry.location.lng;

        const distance = getDistance(PROGRESO_LAT, PROGRESO_LNG, placeLat, placeLng);
        
        if (distance > MAX_DISTANCE_KM) {
            console.log(`Lugar encontrado fuera del radio de ${MAX_DISTANCE_KM} km.`);
            return null; 
        }

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
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        
        // 1. DETERMINAR LA INTENCIÓN Y ESQUEMA
        const { intent, schema, categoryName, promptInstruction } = getIntentAndSchema(userPrompt);
        
        // 2. CONFIGURAR EL CHAT PARA MODO JSON FORZADO
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: BASE_SYSTEM_INSTRUCTION,
                responseMimeType: "application/json", // <-- FORZAR RESPUESTA JSON
                responseSchema: schema // <-- IMPONER LA ESTRUCTURA CORRECTA
            },
            history: history 
        });

        // 3. ENVIAR INSTRUCCIÓN CLARA AL MODELO
        const result = await chat.sendMessage({ message: promptInstruction });
        let modelResponseText = result.text.trim();
        
        // 4. INICIALIZACIÓN DE RESPUESTA
        let finalResponseData = { responseText: modelResponseText };
        let singlePlaceFailed = false;

        // 5. PARSEO Y ENRIQUECIMIENTO (Ahora más sencillo ya que esperamos un JSON limpio)
        try {
            // Eliminamos la detección de JSON ya que la API DEBE devolver un JSON limpio.
            const parsedJson = JSON.parse(modelResponseText);
            const ficha = parsedJson;
            let enrichedFicha = { ...ficha };

            // Añadimos el tipo estructurado para que el frontend lo reconozca
            enrichedFicha.isStructured = true; 

            if (intent === 'place' && ficha.placeToSearch) {
                
                const placeNameSearch = ficha.placeToSearch.trim();
                const isHealthPlace = ficha.isHealthPlace === true; 

                if (isHealthPlace) {
                    console.log(`Regla de Salud Aplicada: Bloqueando enriquecimiento Places para ${placeNameSearch}`);
                    const baseMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeNameSearch + " Nuevo Progreso Tamps")}`;

                    enrichedFicha = {
                        ...enrichedFicha,
                        placePhone: null, reviewUrl: null, mapUrl: baseMapUrl 
                    };

                } else {
                    const placeData = await getPlaceDetails(placeNameSearch);

                    if (placeData) {
                        enrichedFicha = {
                            ...enrichedFicha,
                            placeName: placeData.name,
                            placePhone: placeData.phone,
                            mapUrl: placeData.mapUrl,
                            reviewUrl: placeData.reviewUrl, 
                        };
                        
                    } else {
                        // CASO DE FALLO (No encontrado o fuera de radio)
                        console.error(`ERROR: Lugar no localizado o fuera del radio de ${MAX_DISTANCE_KM}km. Activando Hard Denial.`);
                        singlePlaceFailed = true; 

                        // Preparamos el mensaje de error para el Hard Denial
                        enrichedFicha = { 
                            role: 'model', 
                            text: currentLanguage === 'es' 
                                ? `⛔️ Lo siento, el lugar **${ficha.placeName}** no pudo ser verificado ni localizado por Google Maps **dentro de Nuevo Progreso, Tamaulipas**. Por favor, verifica el nombre o intenta con una categoría general. 🕵️`
                                : `⛔️ I apologize, but the place **${ficha.placeName}** could not be verified or located by Google Maps **within Nuevo Progreso, Tamaulipas**. Please verify the name or try a general category. 🕵️`,
                            isStructured: false 
                        };
                    }
                }
            }
            
            // 6. CONSTRUCCIÓN DE LA RESPUESTA FINAL
            if (singlePlaceFailed === true) {
                // HARD DENIAL: Retorna el texto puro para evitar Quick Actions
                finalResponseData.responseText = enrichedFicha.text;
                
            } else {
                // ÉXITO (Lugar o Categoría)
                
                // Añadir saludo conversacional solo si es un JSON estructurado exitoso
                const greeting = currentLanguage === 'es' 
                    ? (intent === 'place' ? '¡Claro! Aquí tienes la información sobre lo que encontré: ' : '¡Excelente! Aquí te presento un resumen de la categoría: ')
                    : 'Sure! Here is the information I found: ';

                finalResponseData.responseText = greeting + JSON.stringify(enrichedFicha);
            }

        } catch (jsonError) {
            console.error("Fallo catastrófico en el parseo JSON (Gemini no siguió el esquema):", jsonError);
            // Mensaje de fallback si Gemini devuelve un JSON inválido o texto plano no deseado
            finalResponseData.responseText = `Lo siento, hubo un problema al procesar tu solicitud. Por favor, sé más específico o intenta de nuevo.`; 
        }

        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo al obtener respuesta de Gemini: " + error.message
        });
    }
}
