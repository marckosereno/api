// ====================================================================
// Archivo: chat.js (Versión 8.2 - Rango 15km y Descripción Conversacional)
// NOTA: Base en chat-6.1. Rango extendido a 15km. Descripción conversacional ampliada y sin métricas.
// ====================================================================

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient, PlaceInputType } from '@googlemaps/google-maps-services-js'; 

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO PARA EL FILTRADO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// 🛑 PARÁMETROS DE BÚSQUEDA EXTENDIDA (15 km de radio - MODIFICADO)
// Coordenadas de Referencia Central de Nuevo Progreso
const CENTER_LAT = 26.064; 
const CENTER_LNG = -98.005;

// Aproximadamente 15km en latitud y longitud a esta latitud (para crear un cuadrado de 30x30km)
const LAT_OFFSET = 0.135; // ~15km
const LNG_OFFSET = 0.150; // ~15km

// 🛑 RANGO EXTENDIDO (30x30km centrado en Progreso - Sustituye a los bounds estrictos/bias simple)
const EXTENDED_NE_BOUND = { lat: CENTER_LAT + LAT_OFFSET, lng: CENTER_LNG + LNG_OFFSET }; 
const EXTENDED_SW_BOUND = { lat: CENTER_LAT - LAT_OFFSET, lng: CENTER_LNG - LNG_OFFSET }; 


// 🛑 TIPOS DE SALUD (Para Confidencialidad)
const IS_HEALTH_PLACE_TYPES = [
    'dentist', 
    'doctor', 
    'hospital', 
    'pharmacy', 
    'health', 
    'physiotherapist',
    'veterinary_care'
];

// ⭐️ MAPA DE EXCEPCIONES CON DESCRIPCIONES CANÓNICAS PARA CORREGIR ALUCINACIONES
const EXCEPTION_DATA_MAP = {
    'yomis': { 
        category: 'Spa y Masajes', 
        description: 'Yomis es un tranquilo spa especializado en masajes terapéuticos y relajantes para viajeros que buscan un descanso profundo. Ofrece una variedad de tratamientos para el bienestar y la salud.',
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


// 2. Definimos la Instrucción del Sistema
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.
**REGLA DE ESTRICTO CUMPLIMIENTO:** Si la solicitud del usuario es para un LUGAR o CATEGORÍA, DEBES responder **EXCLUSIVAMENTE con un formato JSON**. Está **PROHIBIDO** responder en texto plano conversacional en estos casos. Usa el formato de FALLO si el servidor lo indica o si no estás seguro de la existencia del lugar.
**NOTA CRÍTICA DE CLASIFICACIÓN:** Tu clasificación debe ser precisa. No asumas que todas las búsquedas son restaurantes. Usa las categorías más específicas posibles (Spa, Tienda de Ropa, Clínica Dental, Taquería, etc.).
**REGLA CRÍTICA DE CONTEXTO:** Si el usuario solicita un **LUGAR ESPECÍFICO** (ej. "Farmacia Guadalajara", "El Cuñao"), DEBES IGNORAR CUALQUIER CATEGORÍA PREVIA del chat (ej. si la última búsqueda fue un restaurante). Debes clasificar la nueva solicitud desde CERO, de forma independiente.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para salud, DEBES establecer el campo "isHealthPlace" en "true".

---

### PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES (MODO FICHA DE CATEGORÍA)
**REGLA CRÍTICA:** Si el usuario pide recomendaciones, sugerencias o un listado de lugares, DEBES usar el **MODO FICHA DE CATEGORÍA (JSON)**.

---

3. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de un lugar o negocio **específico**.
4. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo para solicitudes de categorías generales O para **CUMPLIR EL PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES**.

5. **MODO CONVERSACIONAL (Texto Plano):** Úsalo *SOLO* para preguntas generales o de seguimiento (ej: "gracias", "¿cómo está el clima?") que **no** requieran una ficha.

6. Los formatos JSON requeridos son:
   
   // Formato para LUGAR ESPECÍFICO (Salud o No Salud)
   {
     "type": "place", 
     "placeName": "Nombre del Lugar", 
     "placeToSearch": "Nombre Exacto a buscar en Places API", 
     "placeCategory": "Clasificación general del lugar, ej: Clínica Dental, Restaurante",
     "isHealthPlace": true/false, 
     "description": "Descripción corta de no más de 3 oraciones.",
     "isStructured": true
   }
   
   // Formato para CATEGORÍA GENERAL
   {
     "type": "category", 
     "categoryName": "Nombre de la Categoría",
     "description": "Resumen de la categoría...",
     "isStructured": true
   }

   // FORMATO DE FALLO: Úsalo si no estás seguro de la existencia del lugar o si el servidor lo indica.
   {
     "type": "place_not_found", 
     "placeToSearch": "Nombre del Lugar No Encontrado", 
     "description": "El lugar no se encontró en Nuevo Progreso. Si el usuario insiste, aconséjale usar Google Search. 📍",
     "isStructured": true
   }
   
   // REGLA CLAVE: Si la respuesta requiere MÚLTIPLES FICHAS, debes envolver todas las fichas en un array y añadir la propiedad "isMultiStructured": true.
   // El texto conversacional debe ir en "conversationText" y NO debe ser la respuesta principal.`;

/**
 * 🟢 MODIFICADA: Genera una opinión/reseña simulada, conversacional y ampliada.
 * NO incluye estrellas ni número de reseñas.
 */
function generateSimulatedReview(category) {
    const defaultReview = "Este es un lugar altamente recomendado por la comunidad local. Perfecto para una visita rápida o para encontrar ese artículo especial.";
    
    // Mapeo de tipos de lugares comunes (de la API) a OPINIONES/SUGERENCIAS humanas
    const categoryMap = {
        'restaurant': '¡Definitivamente tienes que visitarlo! Los clientes frecuentes mencionan que es el lugar ideal para ir en familia o con amigos. Su menú tiene un sabor auténtico que lo convierte en una parada obligatoria para el buen comer en Progreso. El ambiente es muy acogedor y el servicio, excepcional.',
        'dentist': 'Si buscas servicios dentales de alta calidad, esta es una excelente opción. Los visitantes suelen destacar el profesionalismo del personal y la tecnología moderna que utilizan. Ofrecen una atención muy amable y detallada, lo que genera mucha confianza.',
        'pharmacy': 'Conocida por tener un amplio surtido de medicinas y productos de bienestar. Los clientes dicen que el personal es muy atento y siempre está dispuesto a ayudarte a encontrar exactamente lo que necesitas. Es una opción confiable para tus necesidades de salud.',
        'clothing_store': 'Perfecta para los amantes de la moda. Aquí puedes encontrar las últimas tendencias en ropa y accesorios a muy buenos precios. Los compradores suelen comentar que siempre encuentran algo único y de temporada. ¡Ideal para llevar un recuerdo de Progreso!',
        'bar': 'Un excelente ambiente para relajarse y disfrutar al final del día. Es muy popular por sus bebidas bien preparadas y la buena música. Los locales lo recomiendan como el mejor lugar para pasar una noche divertida.',
        'cafe': 'Un rincón tranquilo para hacer una pausa. Los clientes lo consideran ideal para tomar un café por la tarde o disfrutar de un desayuno ligero. El servicio es rápido, amigable y te hará sentir como en casa.',
        'general': defaultReview
    };

    // Intentar encontrar una coincidencia basada en el tipo de lugar (category)
    const categoryKey = Object.keys(categoryMap).find(key => category.toLowerCase().includes(key)) || 'general';

    return categoryMap[categoryKey];
}


/**
 * 🟢 NUEVA FUNCIÓN: Obtiene detalles completos de un lugar usando Places API (Modo Búsqueda Directa).
 * Usa el rango de 15km.
 */
async function getFullPlaceDetails(queryOrPlaceId) { 
    if (!placesApiKey) return null;
    
    let placeId = queryOrPlaceId;

    // A) Si no parece un Place ID, lo buscamos por texto (con rango de 15km)
    if (!queryOrPlaceId.startsWith('ChI')) {
        try {
            console.log(`Buscando Place ID (Rango 15km) para: ${queryOrPlaceId}`);
            
            // 🛑 IMPLEMENTACIÓN CRÍTICA: RANGO EXTENDIDO 15KM (locationRestriction)
            const findPlaceResponse = await placesClient.findPlaceFromText({
                params: {
                    key: placesApiKey,
                    input: queryOrPlaceId, 
                    inputtype: PlaceInputType.textquery, 
                    fields: ['place_id'], 
                    locationRestriction: { 
                        northeast: EXTENDED_NE_BOUND, 
                        southwest: EXTENDED_SW_BOUND 
                    },
                    language: 'es'
                }
            });
            placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        } catch (e) {
            console.error("Error buscando Place ID en Búsqueda Directa:", e.message);
            return null;
        }
    }
    
    if (!placeId) {
        console.log("No se encontró Place ID dentro del rango de 15km o la búsqueda falló.");
        return null;
    }

    // B) Obtenemos los detalles completos del lugar
    try {
        // Se incluyen rating y user_ratings_total aunque no se usen en el texto final, son necesarios para getFullPlaceDetails
        const fields = ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address', 'geometry', 'types', 'rating', 'user_ratings_total'];
        
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: fields,
                language: 'es'
            }
        });

        const place = detailsResponse.data.result;
        if (!place) return null;
        
        const photoReference = place.photos?.[0]?.photo_reference || null;
        
        let imageUrl = photoReference 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=350&photoreference=${photoReference}&key=${placesApiKey}`
            : null;

        const isHealth = place.types.some(t => IS_HEALTH_PLACE_TYPES.includes(t));
        
        return {
            name: place.name,
            phone: isHealth ? null : (place.formatted_phone_number || null), 
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: isHealth ? null : (place.website || null), 
            imageUrl: imageUrl,
            formatted_address: place.formatted_address,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            placeCategory: place.types?.[0] || 'Lugar de Interés',
            isHealthPlace: isHealth, 
            rating: place.rating || null, // Se mantienen los campos para la función de reseña, aunque no se usen.
            user_ratings_total: place.user_ratings_total || 0 
        };

    } catch (e) {
        console.error("Error al obtener detalles de Place ID:", e.response ? e.response.data : e.message);
        return null; 
    }
}


/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * Ahora usa un rango de 15km (locationRestriction).
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si NO existe el lugar exacto en el rango.
 */
async function getPlaceDetails(query) { 
    
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    try {
        // 1. Buscar el place_id
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query, 
                inputtype: 'textquery',
                fields: ['place_id'], 
                // 🛑 IMPLEMENTACIÓN CRÍTICA: RANGO EXTENDIDO 15KM
                locationRestriction: { 
                    northeast: EXTENDED_NE_BOUND, 
                    southwest: EXTENDED_SW_BOUND 
                },
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        
        if (!placeId) {
            return null;
        }

        // 2. Obtener los detalles del lugar (SOLO CAMPOS BÁSICOS)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'types'] 
            }
        });

        const place = detailsResponse.data.result;
        
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;
        const isHealth = place.types.some(t => IS_HEALTH_PLACE_TYPES.includes(t));


        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

        return {
            name: place.name,
            phone: isHealth ? null : (place.formatted_phone_number || null),
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: isHealth ? null : (place.website || null),
            imageUrl: imageUrl,
            isHealthPlace: isHealth
        };

    } catch (e) {
        console.error("Error al llamar a Google Places API:", e.response ? e.response.data : e.message);
        return null; 
    }
}

// Función de utilidad para verificar similitud de nombres (Anti-Correlación)
function areNamesSimilar(searchName, returnedName) {
    const s1 = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = returnedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return s2.includes(s1) || s1.includes(s2) || s1 === s2;
}


export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        // Se añade directSearchQuery
        const { history = [], userPrompt, currentLanguage, directSearchQuery } = req.body; 
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // ----------------------------------------------------
        // 🥇 PRIORIDAD MÁXIMA: MODO BÚSQUEDA DIRECTA (SPS/Power Search)
        // ----------------------------------------------------
        if (directSearchQuery) {
            console.log(`⭐ Activado MODO BÚSQUEDA DIRECTA (15km) para: ${directSearchQuery}`);
            
            // Usamos la función con rango de 15km y datos completos
            const placeData = await getFullPlaceDetails(directSearchQuery); 
            
            if (placeData) {
                
                // 🛑 CRÍTICO: Generar reseña humana/opinión (CONVERSACIONAL)
                const simulatedReview = generateSimulatedReview(
                    placeData.placeCategory
                    // Ya no pasamos rating/totalRatings
                );

                // Generar un JSON de Ficha de Lugar con todos los detalles
                const finalFicha = {
                    type: "place",
                    placeName: placeData.name,
                    placeToSearch: placeData.name,
                    placeCategory: placeData.placeCategory,
                    isHealthPlace: placeData.isHealthPlace, 
                    description: simulatedReview, // <---- DESCRIPCIÓN HUMANA Y CONVERSACIONAL
                    isStructured: true,
                    // Datos enriquecidos 
                    placePhone: placeData.phone, 
                    mapUrl: placeData.mapUrl,
                    imageUrl: placeData.imageUrl,
                    reviewUrl: placeData.reviewUrl,
                    websiteUrl: placeData.websiteUrl, 
                    latitude: placeData.latitude,
                    longitude: placeData.longitude,
                };
                return res.status(200).json({ responseText: JSON.stringify(finalFicha) });
            } else {
                // Fallo en la búsqueda directa (no encontrado o fuera de bounds)
                const failedFicha = {
                    type: "place_not_found", 
                    placeToSearch: directSearchQuery, 
                    description: `No se pudo encontrar o recuperar detalles completos para el lugar: **${directSearchQuery}** en **Nuevo Progreso** dentro del rango de 15km. Por favor, verifica el nombre o intenta con el modo chat. 📍`,
                    isStructured: true
                };
                return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA ROBUSTA DE BYPASS CANÓNICO (PRIORIDAD AL SERVIDOR)
        // ----------------------------------------------------
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 

        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            // Utilizamos includes para ser más flexibles
            if (promptSearchKey.includes(key)) {
                
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                
                // Usamos getPlaceDetails (que también ya usa 15km)
                const placeData = await getPlaceDetails(exceptionData.searchName);
                
                const isHealthPlace = exceptionData.category.includes('Spa');
                
                forcedCanonicalResponse = {
                    type: "place", 
                    placeName: placeData ? placeData.name : exceptionData.searchName, 
                    placeToSearch: exceptionData.searchName,
                    placeCategory: exceptionData.category, 
                    isHealthPlace: isHealthPlace,
                    description: exceptionData.description, // DESCRIPCIÓN CANÓNICA FIJA
                    isStructured: true,
                    // Datos de Places API
                    mapUrl: placeData?.mapUrl || null,
                    imageUrl: placeData?.imageUrl || null,
                    placePhone: (placeData?.phone && !isHealthPlace) ? placeData.phone : null, 
                    reviewUrl: placeData?.reviewUrl || null, 
                    websiteUrl: (placeData?.websiteUrl && !isHealthPlace) ? placeData.websiteUrl : null,
                };
                break; 
            }
        }
        
        if (forcedCanonicalResponse) {
            // Retornar la respuesta CANÓNICA directamente (GARANTÍA DE BLINDAJE)
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }

        // ----------------------------------------------------
        // ⭐️ LÓGICA NORMAL (GEMINI + RAG de Reseñas)
        // ----------------------------------------------------
        
        let promptToSend = userPrompt;

        // Patrón para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            const categoryKeyRaw = match[3].toLowerCase(); 
            let categoryName = "lugares y negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = "Tiendas de Artesanías y Souvenirs";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = "Salud y Estética";
            
            // SOBRESCRIBIMOS el prompt para FORZAR el MODO FICHA DE CATEGORÍA
            promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso.`;
            
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
            tools: [{ googleSearch: {} }] 
        });

        // Enviamos el nuevo mensaje (original o modificado) al modelo
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
                
                let fichasToProcess = parsedJson.isStructured ? [parsedJson] : (parsedJson.isMultiStructured ? parsedJson.response : []);

                if (fichasToProcess.length > 0) {
                    
                    const enrichedFichas = [];
                    
                    for (const ficha of fichasToProcess) {
                        let enrichedFicha = { ...ficha };

                        if (ficha.type === 'place' && ficha.placeToSearch) {
                            
                            const placeNameSearch = ficha.placeToSearch.trim();
                            
                            // Búsqueda flexible (solo el nombre)
                            const searchForPlaces = placeNameSearch; 
                            
                            // Esta función ahora usa 15km
                            const placeData = await getPlaceDetails(searchForPlaces);
                            const isHealthPlace = placeData?.isHealthPlace || ficha.isHealthPlace === true;


                            // 🛑 BLINDAJE ANTI-CORRELACIÓN:
                            let isNameMiscorrelated = false;
                            if (placeData && !areNamesSimilar(placeNameSearch, placeData.name)) {
                                console.warn(`¡Fallo de correlación! Se buscó "${placeNameSearch}" pero Places devolvió "${placeData.name}". Descartando resultado.`);
                                isNameMiscorrelated = true;
                            }


                            if (placeData && !isNameMiscorrelated) {
                                // **LÓGICA NORMAL: USAR RE-PROMPT con GOOGLE SEARCH RAG (Reseñas)**
                                
                                // REFUERZO RAG: MÁS AGRESIVO EN LAS INSTRUCCIONES
                                let placePrompt = `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder.`;
                                
                                placePrompt += ` La categoría es: ${enrichedFicha.placeCategory}. **UTILIZA TU HERRAMIENTA DE GOOGLE SEARCH** para buscar la consulta: "reseñas de ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **Extrae las frases clave de una o dos reseñas REALES y úsalas para componer la 'description' en el JSON. La descripción debe ser corta y basada SÓLO en reseñas.** Si no encuentras reseñas, resume el giro del lugar. **NOTA CRÍTICA:** Solo usa la descripción que el RAG te proporciona.`;

                                const rePromptResult = await chat.sendMessage({ 
                                    message: placePrompt,
                                    tools: [{ googleSearch: {} }] 
                                });
                                const rePromptText = rePromptResult.text.trim();
                                
                                try {
                                    const reParsedJson = JSON.parse(rePromptText.substring(rePromptText.indexOf('{'), rePromptText.lastIndexOf('}') + 1));
                                    
                                    // Usamos la ficha re-parseada (con descripción RAG)
                                    enrichedFicha = {
                                        ...reParsedJson, 
                                        placeName: placeData.name,
                                        mapUrl: placeData.mapUrl,
                                        imageUrl: placeData.imageUrl,
                                        // Restricciones de salud
                                        placePhone: isHealthPlace ? null : placeData.phone, 
                                        reviewUrl: placeData.reviewUrl, 
                                        websiteUrl: isHealthPlace ? null : placeData.websiteUrl,
                                    };
                                } catch (e) {
                                    console.error("Fallo al re-parsear el JSON de anti-alucinación RAG. Usando ficha original sin descripción RAG.", e);
                                    
                                    // Fallback: Si el RAG falla, usamos la ficha original y dejamos la descripción del primer intento de Gemini
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
                                // Si NO existe (Fallo de geofencing, API, o Correlación de nombres)
                                enrichedFicha = {
                                    type: "place_not_found", 
                                    placeToSearch: placeNameSearch, 
                                    description: `Disculpa, no se encontró un lugar llamado **${placeNameSearch}** ubicado en Nuevo Progreso (Rango 15km).`,
                                    isStructured: true
                                };
                            }
                        } else if (ficha.type === 'category') {
                             // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa)
                             
                             const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                             const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                             
                             const mapUrl = `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(mapUrlQuery)}`;
                             
                             enrichedFicha.mapUrl = mapUrl; 
                        }
                        
                        enrichedFichas.push(enrichedFicha);
                    }

                    // Después de procesar todas las fichas, reconstruir la respuesta final.
                    let finalResponseJson = parsedJson.isMultiStructured 
                        ? { isMultiStructured: true, response: enrichedFichas, conversationText: parsedJson.conversationText || '' }
                        : enrichedFichas[0];
                    
                    finalResponseData.responseText = JSON.stringify(finalResponseJson);

                } else {
                    // Si el modelo generó texto sin JSON (FALLO GRAVE), lo devuelve.
                    finalResponseData.responseText = modelResponseText; 
                }
            }
        } catch (jsonError) {
            console.error("Fallo en el parseo o enriquecimiento del JSON. Asumiendo que el texto no contenía JSON estructurado.", jsonError);
            finalResponseData.responseText = modelResponseText; 
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
