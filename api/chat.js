import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO PARA EL FILTRADO ESTRICTO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// ⭐️ MAPA DE EXCEPCIONES CON DESCRIPCIONES CANÓNICAS PARA CORREGIR ALUCINACIONES
const EXCEPTION_DATA_MAP = {
    // Nombre exacto a buscar (en minúsculas, sin espacios extra): { category, description }
    'yomis': { 
        category: 'Spa y Masajes', 
        description: 'Yomis es un tranquilo spa especializado en masajes terapéuticos y relajantes para viajeros que buscan un descanso profundo. Ofrece una variedad de tratamientos para el bienestar y la salud.',
        // Nombre de búsqueda conocido para la API de Places (para la foto/mapa)
        searchName: 'Yomis Spa' 
    },
    'pinkys': { 
        category: 'Tienda de Ropa y Accesorios', 
        description: 'Pinkys es una tienda de ropa y accesorios que ofrece las últimas tendencias de moda para damas y caballeros, con un enfoque en estilos casuales y de temporada.',
        searchName: 'Pinkys Fashion'
    }, 
};

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// 2. Definimos la Instrucción del Sistema (Añadimos mitigación de sesgo)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.
**IMPORTANTE:** Tu clasificación debe ser precisa. No asumas que todas las búsquedas son restaurantes. Usa las categorías más específicas posibles (Spa, Tienda de Ropa, Clínica Dental, etc.).

REGLAS DE FORMATO:
// ... (El resto de las reglas del sistema se mantienen igual) ...
// ... (Formatos JSON se mantienen igual) ...`;

// ... (Resto de la función getPlaceDetails se mantiene igual) ...

/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * NOTA: Se solicitan SOLO campos básicos para minimizar costos (no reviews, no editorial_summary).
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si NO existe el lugar exacto en Nuevo Progreso.
 */
async function getPlaceDetails(query) { 
    
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // Coordenadas aproximadas de Nuevo Progreso para locationBias (26.064, -98.005)
    const LOCATION_BIAS = { lat: 26.064, lng: -98.005 };

    try {
        // 1. Buscar el place_id
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
            // console.log("No se encontró un place_id cerca de Nuevo Progreso.");
            return null;
        }

        // 2. Obtener los detalles del lugar (SOLO CAMPOS BÁSICOS PARA AHORRAR COSTOS)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                // ⭐️ CAMPOS BÁSICOS: NO PEDIR 'reviews' ni 'editorial_summary' (caros)
                fields: ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address'] 
            }
        });

        const place = detailsResponse.data.result;
        
        // 🛑 VALIDACIÓN GEOFENCING FLEXIBLE: Debe contener 'Progreso' o 'Río Bravo'
        const address = place.formatted_address ? place.formatted_address.toLowerCase() : '';
        
        if (!address.includes('progreso') && !address.includes('río bravo')) {
            // console.log(`Fallo de geofencing flexible: Dirección (${address}) no incluye "Progreso" o "Río Bravo".`);
            return null; 
        }
        
        // 3. Generar la URL de la foto
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;

        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

        // ⭐️ RETORNAR SOLO DATOS BÁSICOS
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null, // Usamos la URL base para el botón de reseña/Google Maps
            websiteUrl: place.website || null,
            imageUrl: imageUrl
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
        
        // Configuramos el idioma y el sistema
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // ----------------------------------------------------
        // ⭐️ LÓGICA ROBUSTA DE BYPASS CANÓNICO (PRIORIDAD AL SERVIDOR)
        // ----------------------------------------------------
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); // Para buscar 'yomis' en el mapa

        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            // Utilizamos includes para ser más flexibles (ej. "dónde está yomis spa" sigue disparando 'yomis')
            if (promptSearchKey.includes(key)) {
                
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                
                // 1. Buscar datos básicos (mapa/foto) a pesar de la alucinación
                const placeData = await getPlaceDetails(exceptionData.searchName);
                
                const isHealthPlace = exceptionData.category.includes('Spa'); // Determinar si es de salud/estética
                
                forcedCanonicalResponse = {
                    type: "place", 
                    placeName: placeData ? placeData.name : key.toUpperCase(), // Usar nombre encontrado o la clave
                    placeToSearch: exceptionData.searchName,
                    placeCategory: exceptionData.category, 
                    isHealthPlace: isHealthPlace,
                    description: exceptionData.description, // DESCRIPCIÓN CANÓNICA FIJA
                    isStructured: true,
                    // Datos de Places API (serán null si falla la API, pero el bot no falla)
                    mapUrl: placeData?.mapUrl || null,
                    imageUrl: placeData?.imageUrl || null,
                    placePhone: (placeData?.phone && !isHealthPlace) ? placeData.phone : null, 
                    reviewUrl: placeData?.reviewUrl || null, 
                    websiteUrl: (placeData?.websiteUrl && !isHealthPlace) ? placeData.websiteUrl : null,
                };
                break; // Detener el bucle, ya encontramos la excepción
            }
        }
        
        if (forcedCanonicalResponse) {
            // Retornar la respuesta CANÓNICA directamente (garantiza la corrección)
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }

        // ----------------------------------------------------
        // ⭐️ LÓGICA NORMAL (GEMINI + RAG de Reseñas)
        // ----------------------------------------------------
        
        // ... (El resto del código se mantiene igual, ya que maneja el flujo normal y de categorías)
        
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
            history: history,
            // ⭐️ Dejamos el tool de búsqueda por defecto, pero lo controlamos en el re-prompt
            tools: [{ googleSearch: {} }] 
        });

        // Enviamos el nuevo mensaje (original o modificado por la redirección a categoría) al modelo
        const result = await chat.sendMessage({ message: promptToSend });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };

        // Lógica de ENRIQUECIMIENTO con Places API
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
                            
                            // ⭐️ SOLO PEDIMOS DATOS BÁSICOS (Ahorro de Costos)
                            const placeData = await getPlaceDetails(placeNameSearch);

                            if (placeData) {
                                
                                // 🛑 EXCEPCIÓN: La lógica de excepción CANÓNICA ya fue manejada arriba. 
                                // Aquí solo queda la lógica de RAG (Reseñas) para lugares normales.
                                
                                // **LÓGICA NORMAL: USAR RE-PROMPT con GOOGLE SEARCH RAG (Reseñas)**

                                let toolsToUse = [{ googleSearch: {} }]; 
                                
                                // ⭐️ PASO ANTI-ALUCINACIÓN: FORZAR a Gemini a buscar una reseña
                                let placePrompt = `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder.`;
                                
                                // ⭐️ INSTRUCCIÓN DE RAG CON RESEÑAS
                                placePrompt += ` La categoría es: ${enrichedFicha.placeCategory}. **UTILIZA TU HERRAMIENTA DE GOOGLE SEARCH** para buscar la consulta: "reseñas de ${placeNameSearch} Nuevo Progreso". **Extrae las frases clave de una o dos reseñas reales y úsalas para componer la 'description' en el JSON.** Si no encuentras reseñas, resume el giro del lugar.`;

                                // 🛑 RE-PROMPT A GEMINI PARA GENERAR LA FICHA ENRIQUECIDA
                                const rePromptResult = await chat.sendMessage({ 
                                    message: placePrompt,
                                    tools: toolsToUse 
                                });
                                const rePromptText = rePromptResult.text.trim();
                                
                                try {
                                    // Intentamos parsear la respuesta (solo el JSON)
                                    const reParsedJson = JSON.parse(rePromptText.substring(rePromptText.indexOf('{'), rePromptText.lastIndexOf('}') + 1));
                                    
                                    // Usamos la ficha re-parseada
                                    enrichedFicha = {
                                        ...reParsedJson, // Ficha con la nueva descripción (RAG de reseña)
                                        placeName: placeData.name,
                                        mapUrl: placeData.mapUrl,
                                        imageUrl: placeData.imageUrl,
                                        // Restricciones de salud
                                        placePhone: isHealthPlace ? null : placeData.phone, 
                                        reviewUrl: placeData.reviewUrl, 
                                        websiteUrl: isHealthPlace ? null : placeData.websiteUrl,
                                    };
                                } catch (e) {
                                    console.error("Fallo al re-parsear el JSON de anti-alucinación. Usando descripción original.", e);
                                    
                                    // Fallback: Si el re-prompt falla, usamos la descripción original de Gemini
                                    enrichedFicha = {
                                        ...enrichedFicha,
                                        placeName: placeData.name,
                                        mapUrl: placeData.mapUrl,
                                        imageUrl: placeData.imageUrl,
                                        placePhone: isHealthPlace ? null : placeData.phone,
                                        reviewUrl: placeData.reviewUrl, 
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
                        
                        let finalConversationText = parsedJson.conversationText || modelResponseText.replace(jsonString, '').trim() || '';

                        // 🛑 REGLA BLINDADA: SI ALGUNA FICHA ES UNA EXCEPCIÓN, ELIMINAR EL TEXTO CONVERSACIONAL
                        const hasExceptionFicha = enrichedFichas.some(f => {
                            const placeName = f.placeToSearch ? f.placeToSearch.toLowerCase().replace(/\s/g, '') : null;
                            return placeName && EXCEPTION_DATA_MAP[placeName];
                        });

                        if (hasExceptionFicha) {
                            console.log("Excepción detectada en multi-fichas. Limpiando texto conversacional de forma agresiva.");
                            finalConversationText = ""; // Fuerza a vacío para evitar contaminación
                        }
                        
                         finalResponseData.responseText = JSON.stringify({
                             isMultiStructured: true,
                             response: enrichedFichas,
                             conversationText: finalConversationText
                         });
                    } else {
                         // Si es ficha única, simplemente retorna el JSON de la ficha enriquecida
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
