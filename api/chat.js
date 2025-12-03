import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// <-- [NUEVO] LISTA NEGRA MANUAL PARA ALUCINACIONES CONOCIDAS
const BLOCKED_PLACES = [
    'cine azteca',
    'cinépolis',
    'cinemex',
    // Puedes añadir más nombres de lugares que sabes que no existen en Progreso aquí
];

// 2. Definimos la Instrucción del Sistema (ACTUALIZADA)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

// <-- [MODIFICADO] LA REGLA MÁS ESTRICTA PARA LA DESCRIPCIÓN
**REGLA CRÍTICA DE DESCRIPCIÓN NEUTRA:**
1.  Tu descripción en el campo "description" **NUNCA debe incluir referencias geográficas** explícitas o implícitas ("en Progreso", "aquí", "cerca"). Simplemente describe el tipo de negocio.
2.  Tu servidor es el encargado de verificar la ubicación. Si la ficha no se enriquece, la respuesta final del sistema será un mensaje de negación explícita.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones para hacerlas más amigables y atractivas.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". NUNCA debes incluir precios, dar recomendaciones directas, o proporcionar detalles de contacto en la descripción. El servidor se encargará de limitar los botones de acción solo a "Ver en Mapa" y "Buscar en Google" para garantizar el cumplimiento.

---

// ... (El resto de las reglas de formato JSON se mantienen sin cambios) ...
`;


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
                // CLAVE DE VERIFICACIÓN: Forzamos la búsqueda en la zona de Nuevo Progreso
                input: query + ", Nuevo Progreso Tamps, México",
                inputtype: 'textquery',
                fields: ['place_id']
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        
        if (!placeId) {
            console.log("No se encontró un place_id para la consulta en Nuevo Progreso:", query);
            return null;
        }

        // 2. Obtener los detalles del lugar
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
        
        // Configuramos el idioma
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // <-- [NUEVO] LÓGICA DE BLOQUEO MANUAL Y HARD DENIAL INMEDIATO
        const normalizedPrompt = userPrompt.toLowerCase().trim();
        const foundBlockedPlace = BLOCKED_PLACES.some(blocked => normalizedPrompt.includes(blocked));

        if (foundBlockedPlace) {
            console.log(`BLOQUEO MANUAL ACTIVADO para: ${userPrompt}`);
            const denialMessage = currentLanguage === 'es' 
                ? `⛔️ Lo siento, el lugar relacionado con "${userPrompt}" **no se encuentra disponible o no existe dentro de Nuevo Progreso, Tamaulipas**. Por favor, intenta buscando una categoría general. 🕵️`
                : `⛔️ I apologize, but the place related to "${userPrompt}" **is unavailable or does not exist within Nuevo Progreso, Tamaulipas**. Please try searching for a general category. 🕵️`;
            
            // Retornamos el mensaje de negación explícita como respuesta final de texto plano.
            return res.status(200).json({ responseText: denialMessage });
        }
        // FIN LÓGICA DE BLOQUEO MANUAL

        // LÓGICA DE INTERCEPTACIÓN Y PRIORIDAD LOCAL (para forzar CATEGORY JSON)
        let promptToSend = userPrompt;

        // Patrón para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            // ... (Lógica de Categoría General se mantiene igual) ...
            const categoryKeyRaw = match[3].toLowerCase(); 
            let categoryName = "lugares y negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = "Tiendas de Artesanías y Souvenirs";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = "Salud y Estética";
            
            promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso. La descripción debe guiar al usuario a usar los botones de acción ('Ver en Mapa' y 'Buscar en Google') para que ellos decidan qué lugar visitar, cumpliendo con la restricción de no recomendar lugares específicos.`;
            
            console.log("PROTOCOLO CATEGORÍA GENERAL ACTIVADO para:", categoryName);
        }
        // FIN DE LÓGICA DE INTERCEPTACIÓN


        // Inicializar el chat con el historial y la instrucción de sistema
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history 
        });

        // Enviamos el nuevo mensaje (original o modificado) al modelo
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
                                    // CASO DE ÉXITO: El lugar existe y se enriquece.
                                    enrichedFicha = {
                                        ...enrichedFicha,
                                        placeName: placeData.name,
                                        placePhone: placeData.phone,
                                        mapUrl: placeData.mapUrl,
                                        reviewUrl: placeData.reviewUrl, 
                                    };
                                    enrichedFichas.push(enrichedFicha);
                                    
                                } else {
                                    // CASO DE FALLO/NO ENCONTRADO EN PROGRESO: Sustitución de la ficha
                                    console.error(`ERROR: Places API no encontró '${placeNameSearch}' dentro de Nuevo Progreso. Sustituyendo con mensaje de error.`);

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
                             conversationText: modelResponseText.replace(jsonString, '').trim() || ''
                         });
                    } else {
                         finalResponseData.responseText = JSON.stringify(enrichedFichas[0]);
                    }
                }

                // <-- [MODIFICADO: LÓGICA DE HARD DENIAL FINAL]
                // Si la ficha única falló (el caso de 'Cine Azteca' que Places no encontró)
                if (singlePlaceFailed === true) {
                    // Si el proceso falló, extraemos solo el texto del objeto de error
                    // y lo enviamos como texto plano, sin ninguna estructura JSON.
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
