import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';
// ⚠️ IMPORTANTE: Asegúrate de que tu herramienta de Google Search esté disponible aquí.
// Si el entorno te la proporciona directamente, solo asegúrate de poder acceder a ella.

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO PARA EL FILTRADO ESTRICTO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// Mapeo de intención de usuario a Categoría (Simplificado)
const CATEGORY_MAP = {
    'tacos': 'Taquerías y Tacos',
    'taqueria': 'Taquerías y Tacos',
    'barbacoa': 'Barbacoa y Birria',
    'restaurante': 'Restaurantes y Comida',
    'comer': 'Restaurantes y Comida',
    'artesanias': 'Tiendas de Artesanías y Souvenirs',
    'souvenirs': 'Tiendas de Artesanías y Souvenirs',
};

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 
// ⭐️ ASUMIENDO que la herramienta de búsqueda está disponible globalmente o se inicializa aquí
// const googleSearchClient = google.search; 

/**
 * Función que busca el nombre de un lugar en la API de Google Places,
 * aplicando el filtro geográfico estricto y la validación de nombre.
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si NO existe el lugar exacto en Nuevo Progreso.
 */
async function getPlaceDetails(query) {
    // ⚠️ ATENCIÓN: Esta función requiere acceso a Google Search Tool
    const googleSearchClient = global.google?.search; // Accediendo a la herramienta globalmente si está disponible
    
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // Coordenadas aproximadas de Nuevo Progreso para locationBias (26.064, -98.005)
    const LOCATION_BIAS = { lat: 26.064, lng: -98.005 };

    try {
        // 1. Buscar el place_id (usando locationBias como preferencia)
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query, 
                inputtype: 'textquery',
                fields: ['place_id'], 
                locationBias: `point:${LOCATION_BIAS.lat},${LOCATION_BIAS.lng}` 
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        
        if (!placeId) {
            console.log("No se encontró un place_id cerca de Nuevo Progreso.");
            return null;
        }

        // 2. Obtener los detalles del lugar (incluyendo formatted_address y editorial_summary)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'reviews', 'website', 'photos', 'formatted_address', 'editorial_summary'] 
            }
        });

        const place = detailsResponse.data.result;
        
        // 🛑 VALIDACIÓN GEOFENCING FLEXIBLE
        const address = place.formatted_address ? place.formatted_address.toLowerCase() : '';
        
        if (!address.includes('progreso') && !address.includes('río bravo')) {
            console.log(`Fallo de geofencing flexible: Dirección (${address}) no incluye "Progreso" o "Río Bravo".`);
            return null; 
        }
        
        // 3. Generar la URL de la foto y obtener/enriquecer el resumen editorial
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;

        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

        let editorialSummary = place.editorial_summary?.overview || null;
        
        // ⭐️ NUEVA LÓGICA: Si no hay resumen editorial, usa Google Search para verificar el giro
        if (!editorialSummary && googleSearchClient) {
             const searchQuery = `${query} Nuevo Progreso giro o categoría`;
             
             try {
                 const searchResult = await googleSearchClient.search({ queries: [searchQuery] });
                 
                 if (searchResult.result) {
                     // Usamos el resultado de la búsqueda como nuestro resumen
                     // Limitamos el resumen a 200 caracteres para no abrumar a Gemini
                     const summaryText = searchResult.result.substring(0, 200);
                     editorialSummary = `Según una búsqueda reciente, el giro del negocio es: ${summaryText}...`;
                     console.log(`Resumen de Search inyectado para ${query}.`);
                 }
             } catch (e) {
                 console.error("Fallo al ejecutar Google Search para el giro:", e.message);
             }
        }
        
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null,
            websiteUrl: place.website || null,
            imageUrl: imageUrl,
            editorialSummary: editorialSummary 
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

        // LÓGICA DE INTERCEPTACIÓN Y PRIORIDAD LOCAL (MODIFICADA para forzar CATEGORY JSON)
        let promptToSend = userPrompt;

        // Patrón para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            // 1. Determinar el nombre de la categoría para el JSON y el prompt
            const categoryKeyRaw = match[3].toLowerCase(); 
            let categoryName = "lugares y negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = "Tiendas de Artesanías y Souvenirs";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = "Salud y Estética";
            
            // 2. SOBRESCRIBIMOS el prompt para FORZAR el MODO FICHA DE CATEGORÍA
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

        // Enviamos el nuevo mensaje (original o modificado por la redirección a categoría) al modelo
        const result = await chat.sendMessage({ message: promptToSend });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };

        // Lógica de ENRIQUECIMIENTO con Places API (MODIFICADA para Array de Fichas)
        try {
            const jsonStart = modelResponseText.indexOf('{');
            const jsonEnd = modelResponseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
                const parsedJson = JSON.parse(jsonString);
                
                let fichasToProcess = [];

                // 1. Caso de Múltiples Fichas (Array)
                if (parsedJson.isMultiStructured === true && Array.isArray(parsedJson.response)) {
                    fichasToProcess = parsedJson.response;
                    console.log("Detectado formato MultiStructured. Fichas:", fichasToProcess.length);
                } 
                // 2. Caso de Ficha Única
                else if (parsedJson.isStructured === true) {
                    fichasToProcess = [parsedJson];
                }

                if (fichasToProcess.length > 0) {
                    
                    const enrichedFichas = [];
                    
                    for (const ficha of fichasToProcess) {
                        let enrichedFicha = { ...ficha };

                        if (ficha.type === 'place' && ficha.placeToSearch) {
                            
                            const placeNameSearch = ficha.placeToSearch.trim();
                            const isHealthPlace = ficha.isHealthPlace === true; 
                            
                            // Obtenemos los datos de Places API (con el nuevo filtro flexible y Google Search)
                            const placeData = await getPlaceDetails(placeNameSearch);

                            if (placeData) {
                                
                                // ⭐️ PASO ANTI-ALUCINACIÓN: FORZAR A GEMINI A USAR LA DESCRIPCIÓN CORRECTA
                                let placePrompt = `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder.`;
                                
                                if (placeData.editorialSummary) {
                                    placePrompt += ` La información de giro y descripción obtenida es: "${placeData.editorialSummary}". DEBES usar esta información, o inspirarte fuertemente en ella, para crear la 'description' en el JSON, ignorando cualquier contexto anterior si es contradictorio.`;
                                } else {
                                    placePrompt += ` El género del lugar inicialmente clasificado es: ${ficha.placeCategory}. Crea la 'description' del JSON basada en este género y el nombre del lugar.`;
                                }

                                // 🛑 RE-PROMPT A GEMINI PARA GENERAR LA FICHA CON LA DESCRIPCIÓN ENRIQUECIDA
                                const rePromptResult = await chat.sendMessage({ message: placePrompt });
                                const rePromptText = rePromptResult.text.trim();
                                
                                try {
                                    // Intentamos parsear la respuesta (solo el JSON)
                                    const reParsedJson = JSON.parse(rePromptText.substring(rePromptText.indexOf('{'), rePromptText.lastIndexOf('}') + 1));
                                    
                                    // Usamos la ficha re-parseada, pero mantenemos los datos de Places API (que son los confiables)
                                    enrichedFicha = {
                                        ...reParsedJson, // Ficha con la nueva descripción (anti-alucinación)
                                        placeName: placeData.name,
                                        mapUrl: placeData.mapUrl,
                                        imageUrl: placeData.imageUrl,
                                        // Restricciones de salud
                                        placePhone: isHealthPlace ? null : placeData.phone, 
                                        reviewUrl: isHealthPlace ? null : placeData.reviewUrl, 
                                        websiteUrl: isHealthPlace ? null : placeData.websiteUrl,
                                    };
                                } catch (e) {
                                    console.error("Fallo al re-parsear el JSON de anti-alucinación. Usando descripción original.", e);
                                    
                                    // Fallback: Si el JSON re-parseado falla, usamos la ficha original de Gemini
                                    enrichedFicha = {
                                        ...enrichedFicha,
                                        placeName: placeData.name,
                                        mapUrl: placeData.mapUrl,
                                        imageUrl: placeData.imageUrl,
                                        placePhone: isHealthPlace ? null : placeData.phone,
                                        reviewUrl: isHealthPlace ? null : placeData.reviewUrl, 
                                        websiteUrl: isHealthPlace ? null : placeData.websiteUrl,
                                    };
                                }
                                
                            } else { 
                                // Si NO existe (Fallo del geofencing)
                                enrichedFicha = {
                                    type: "place_not_found", 
                                    placeToSearch: placeNameSearch, 
                                    description: `Disculpa, no se encontró un lugar llamado **${placeNameSearch}** ubicado en Nuevo Progreso.`,
                                    isStructured: true
                                };
                            }
                        } else if (ficha.type === 'category') {
                             // ENRIQUECIMIENTO PARA CATEGORÍA (Permitir "Ver en Mapa")
                             
                             const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                             const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                             
                             // URL de Google Maps para búsqueda de categorías
                             const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapUrlQuery)}`;
                             
                             enrichedFicha.mapUrl = mapUrl; 
                        }
                        
                        enrichedFichas.push(enrichedFicha);
                    }

                    // Después de procesar todas las fichas, reconstruir la respuesta final.
                    if (parsedJson.isMultiStructured === true) {
                         finalResponseData.responseText = JSON.stringify({
                             isMultiStructured: true,
                             response: enrichedFichas,
                             conversationText: parsedJson.conversationText || modelResponseText.replace(jsonString, '').trim() || ''
                         });
                    } else {
                         finalResponseData.responseText = JSON.stringify(enrichedFichas[0]);
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
