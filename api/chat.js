import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// [NUEVO] CONSTANTES PARA SALUDOS Y PROXIMIDAD
const PROGRESO_LAT = 26.064;
const PROGRESO_LNG = -98.005; 
const MAX_DISTANCE_KM = 5;    // 5 kilómetros

// Función de Distancia (Fórmula del Haversine) - Se mantiene igual
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radio de la Tierra en kilómetros
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distancia en kilómetros
}

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// 2. Definimos la Instrucción del Sistema (AJUSTADA para Imprecisión)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

**REGLA CRÍTICA DE DESCRIPCIÓN NEUTRA Y CLASIFICACIÓN:**
1.  Tu descripción en el campo "description" NUNCA debe incluir referencias geográficas explícitas o implícitas. Simplemente describe el tipo de negocio.
2.  Si el lugar es una clínica dental, farmacia u óptica, DEBES CLASIFICARLO CORRECTAMENTE y ser lo más neutral posible en la descripción. Evita clasificar como Óptica si es un servicio dental. **Si tienes dudas sobre la clasificación, usa una categoría general como 'Salud y Estética'.**
3.  Tu servidor es el encargado de verificar la ubicación y te quitará el JSON si fallas la verificación de proximidad.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y utiliza emojis relevantes.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". El servidor se encargará de limitar los botones de acción.

---

### PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES

**REGLA CRÍTICA:** Si el usuario pide recomendaciones, sugerencias o un listado de lugares, DEBES usar el **MODO FICHA DE CATEGORÍA (JSON)** para dar un resumen general. NUNCA debes listar lugares específicos o dar sugerencias directas.

---
// ... (Los formatos JSON se mantienen iguales) ...
`;


/**
 * Función que busca el nombre de un lugar en la API de Google Places y verifica su proximidad.
 */
async function getPlaceDetails(query) {
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // 1. Buscar el place_id y la geometría
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
        
        if (!placeId) {
            console.log("No se encontró un place_id para la consulta en Nuevo Progreso:", query);
            return null;
        }

        const placeLat = candidate.geometry.location.lat;
        const placeLng = candidate.geometry.location.lng;

        // FILTRO DE PROXIMIDAD
        const distance = getDistance(PROGRESO_LAT, PROGRESO_LNG, placeLat, placeLng);
        
        if (distance > MAX_DISTANCE_KM) {
            console.log(`Lugar encontrado (${candidate.name}) está a ${distance.toFixed(2)} km. Excede el límite de ${MAX_DISTANCE_KM} km.`);
            return null; // Fallo la verificación de proximidad
        }
        // FIN DEL FILTRO DE PROXIMIDAD

        // 2. Obtener los detalles del lugar (Solo si pasó el filtro de proximidad)
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
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // LÓGICA DE INTERCEPTACIÓN Y PRIORIDAD LOCAL (MODIFICADA para incluir Compras/Tiendas)
        let promptToSend = userPrompt;

        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|compra|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            const categoryKeyRaw = match[3].toLowerCase(); 
            let categoryName = "Lugares y Negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs') || categoryKeyRaw.includes('tienda') || categoryKeyRaw.includes('compra')) categoryName = "Tiendas y Compras"; // <-- [AJUSTE DE CATEGORÍA]
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = "Salud y Estética";
            
            promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso. La descripción debe guiar al usuario a usar los botones de acción ('Ver en Mapa' y 'Buscar en Google') para que ellos decidan qué lugar visitar, cumpliendo con la restricción de no recomendar lugares específicos.`;
            
            console.log("PROTOCOLO CATEGORÍA GENERAL ACTIVADO para:", categoryName);
        }
        // FIN DE LÓGICA DE INTERCEPTACIÓN


        // Inicializar el chat y enviar el prompt
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history 
        });

        const result = await chat.sendMessage({ message: promptToSend });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };
        let singlePlaceFailed = false;

        // Lógica de ENRIQUECIMIENTO con Places API
        try {
            const jsonStart = modelResponseText.indexOf('{');
            const jsonEnd = modelResponseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
                const parsedJson = JSON.parse(jsonString);
                
                let fichasToProcess = [];

                if (parsedJson.isMultiStructured === true && Array.isArray(parsedJson.response)) {
                    fichasToProcess = parsedJson.response;
                } else if (parsedJson.isStructured === true) {
                    fichasToProcess = [parsedJson];
                }

                if (fichasToProcess.length > 0) {
                    
                    const enrichedFichas = [];
                    
                    for (const ficha of fichasToProcess) {
                        let enrichedFicha = { ...ficha };

                        if (ficha.type === 'place' && ficha.placeToSearch) {
                            
                            const placeNameSearch = ficha.placeToSearch.trim();
                            const isHealthPlace = ficha.isHealthPlace === true; 

                            // **** REGLA DE SALUD DINÁMICA: Bloqueo de Enriquecimiento ****
                            if (isHealthPlace) {
                                console.log(`Regla de Salud Aplicada: Bloqueando enriquecimiento Places para ${placeNameSearch}`);
                                const baseMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeNameSearch + " Nuevo Progreso Tamps")}`;

                                enrichedFicha = {
                                    ...enrichedFicha,
                                    placePhone: null, 
                                    reviewUrl: null,   
                                    mapUrl: baseMapUrl 
                                };
                                enrichedFichas.push(enrichedFicha);

                            } else {
                                // SI NO ES SALUD: Procedemos con el enriquecimiento normal.
                                const placeData = await getPlaceDetails(placeNameSearch);

                                if (placeData) {
                                    // CASO DE ÉXITO
                                    enrichedFicha = {
                                        ...enrichedFicha,
                                        placeName: placeData.name,
                                        placePhone: placeData.phone,
                                        mapUrl: placeData.mapUrl,
                                        reviewUrl: placeData.reviewUrl, 
                                    };
                                    enrichedFichas.push(enrichedFicha);
                                    
                                } else {
                                    // CASO DE FALLO (No encontrado o fuera de radio)
                                    console.error(`ERROR: Lugar no localizado o fuera del radio de ${MAX_DISTANCE_KM}km. Sustituyendo con mensaje de error.`);

                                    const conversationalError = { 
                                        role: 'model', 
                                        text: currentLanguage === 'es' 
                                            ? `⛔️ Lo siento, el lugar **${ficha.placeName}** no pudo ser verificado ni localizado por Google Maps **dentro de Nuevo Progreso, Tamaulipas**. Por favor, verifica el nombre o intenta con una categoría general. 🕵️`
                                            : `⛔️ I apologize, but the place **${ficha.placeName}** could not be verified or located by Google Maps **within Nuevo Progreso, Tamaulipas**. Please verify the name or try a general category. 🕵️`,
                                        isStructured: false 
                                    };
                                    
                                    enrichedFichas.push(conversationalError);
                                    
                                    if (fichasToProcess.length === 1) {
                                        singlePlaceFailed = true;
                                    }
                                }
                            }
                        } else {
                            // Si es una ficha de Categoría, se añade directamente.
                            enrichedFichas.push(enrichedFicha);
                        }
                    }

                    // Después de procesar todas las fichas, reconstruir la respuesta final.
                    if (parsedJson.isMultiStructured === true) {
                         finalResponseData.responseText = JSON.stringify({
                             isMultiStructured: true,
                             response: enrichedFichas,
                             // Opcional: El texto conversacional del modelo
                             conversationText: modelResponseText.replace(jsonString, '').trim() || ''
                         });
                    } else {
                        // Es una ficha única (Exitosa o Fallida)
                        const finalFicha = enrichedFichas[0];
                        const conversationText = modelResponseText.replace(jsonString, '').trim();
                        
                        if (finalFicha.isStructured === true) {
                             // <-- [AJUSTE: AÑADIR SALUDO PROGRAMÁTICO si no hay texto]
                            const greeting = currentLanguage === 'es' ? '¡Claro! Aquí tienes la información sobre lo que encontré: ' : 'Sure! Here is the information I found: ';
                            finalResponseData.responseText = (conversationText || greeting) + JSON.stringify(finalFicha);
                        } else {
                            // Es el mensaje de error conversacional. Se añade al final.
                            finalResponseData.responseText = (conversationText ? conversationText + '\n\n' : '') + JSON.stringify(finalFicha);
                        }
                    }
                }

                // LÓGICA DE HARD DENIAL FINAL: Forzamos la respuesta a texto plano si la única ficha falló.
                if (singlePlaceFailed === true) {
                    // Si el proceso falló, extraemos solo el texto del objeto de error y lo enviamos como texto plano.
                    console.log("HARD DENIAL ACTIVADO: Forzando respuesta a texto plano.");
                    finalResponseData.responseText = enrichedFichas[0].text;
                }
                // FIN LÓGICA DE HARD DENIAL
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
