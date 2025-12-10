// ====================================================================
// Archivo: chat.js (Versión 9.3 - BLINDAJE REFORZADO ANTI-ALUCINACIÓN)
// ====================================================================

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient, PlaceInputType } from '@googlemaps/google-maps-services-js'; 

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO PARA EL FILTRADO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// 🛑 PARÁMETROS DE BÚSQUEDA EXTENDIDA (15 km de radio)
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

// 🛑 Token de Mención (Debe coincidir con el frontend)
const MENTION_TOKEN = "[[PLACE_MENTION]]";

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 


// =======================================================
// 🛑 FUNCIONES AUXILIARES 
// =======================================================

/**
 * Función auxiliar para determinar si es un tipo de lugar de salud/privacidad.
 */
function isHealthPlaceType(types) {
    if (!types) return false;
    return types.some(type => IS_HEALTH_PLACE_TYPES.includes(type));
}

/**
 * 🛠️ Compara nombres para el blindaje de correlación.
 */
function areNamesSimilar(searchName, returnedName) {
    const s1 = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = returnedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    return s2.includes(s1) || s1.includes(s2) || s1 === s2;
}

/**
 * 🟢 MEJORADA: Genera una descripción dinámica y multifocal usando Gemini.
 * (Se eliminó el conteo estricto de palabras para reducir alucinaciones.)
 */
async function generateDynamicDescription(placeName, category, isHealthPlace, currentLanguage) {
    // 1. Definir y seleccionar un punto focal al azar
    const focusPoints = [
        'Experiencia General del Cliente (lo que más se comenta en las reseñas)',
        'Servicios y Oferta Principal (énfasis en qué se hace, qué se vende o cuál es el plato estrella)',
        'Atención al Cliente, Ambiente y Horarios'
    ];
    const selectedFocus = focusPoints[Math.floor(Math.random() * focusPoints.length)];

    // 2. Definir y seleccionar un tono al azar
    const tones = [
        'informal (como un amigo que da un dato clave)',
        'profesional (énfasis en la calidad y eficiencia del negocio)',
        'curioso (tono intrigante, haciendo preguntas o invitando a descubrir)'
    ];
    const selectedTone = tones[Math.floor(Math.random() * tones.length)];

    const langText = currentLanguage === 'es' ? 'español' : 'inglés';

    const chat = ai.chats.create({
        model: MODEL_NAME, 
        config: {
            // 🛑 OPTIMIZACIÓN: Se elimina el conteo estricto y el streaming.
            systemInstruction: `Eres un redactor turístico profesional con un tono **${selectedTone}**. Tu única tarea es generar una descripción sobre un negocio. La descripción debe:
            1. **Tener una longitud de máximo 3 oraciones cortas, incluyendo emojis.**
            2. Tener un tono de reporte o resumen de opiniones de terceros, NO tu opinión personal.
            3. **CRÍTICO:** Evitar las frases iniciales obvias y repetitivas como "Se comenta que..." o "Los clientes destacan...". **¡Sé creativo con la estructura de la oración para no repetir el patrón!**
            4. Enfocarse en el punto central de la descripción que se te pide.
            5. **Responder en el lenguaje: ${langText}.**
            6. Nunca usar la palabra 'recomendar'.`
        }
    });

    let descriptionPrompt = `Genera una descripción única y dinámica para el lugar: **${placeName}** (Categoría: ${category}). El enfoque principal de la descripción debe ser: **${selectedFocus}**.`;
    
    // Reforzar el tono de confianza para salud
    if (isHealthPlace) {
        descriptionPrompt += ` Asegúrate de que, incluso con el tono, se transmita un sentido de confianza y profesionalismo médico.`;
    }

    try {
        const result = await chat.sendMessage({ message: descriptionPrompt });
        return result.text.trim().replace(/"/g, ''); // Limpiar el texto de comillas si Gemini las añade
    } catch (e) {
        console.error("Fallo al generar descripción dinámica:", e.message);
        // Fallback genérico en caso de fallo de la API
        const fallback = currentLanguage === 'es'
            ? `**${placeName}** se distingue por estar ubicado estratégicamente en la zona comercial de Nuevo Progreso. Los visitantes suelen comentar la facilidad de acceso y la calidad del servicio que se ofrece en un horario conveniente para el turista.`
            : `**${placeName}** is distinguished by being strategically located in the commercial area of Nuevo Progreso. Visitors often comment on the easy access and the quality of service offered at a convenient time for tourists.`;

        return fallback;
    }
}

/**
 * 🛠️ Obtiene todos los detalles de un lugar usando Place ID (Para MODO DIRECTO/MENCIÓN HÍBRIDA).
 */
async function getFullPlaceDetails(queryOrPlaceId, currentLanguage) { 
    if (!placesApiKey) return null;
    
    let placeId = queryOrPlaceId;

    // A) Si no parece un Place ID, lo buscamos por texto (con rango de 15km)
    if (!queryOrPlaceId.startsWith('ChI')) {
        try {
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
                    language: currentLanguage
                }
            });
            placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        } catch (e) {
            console.error("Error buscando Place ID en Búsqueda Directa:", e.message);
            return null;
        }
    }
    
    if (!placeId) {
        return null;
    }

    // B) Obtenemos los detalles completos del lugar
    try {
        const fields = ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address', 'geometry', 'types', 'rating', 'user_ratings_total'];
        
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: fields,
                language: currentLanguage
            }
        });

        const place = detailsResponse.data.result;
        if (!place) return null;
        
        // Geofencing para Place ID (Se usa la geometría completa)
        const lat = place.geometry.location.lat;
        const lng = place.geometry.location.lng;
        const isWithinBounds = 
            lat >= EXTENDED_SW_BOUND.lat && lat <= EXTENDED_NE_BOUND.lat &&
            lng >= EXTENDED_SW_BOUND.lng && lng <= EXTENDED_NE_BOUND.lng;
        
        if (!isWithinBounds) {
            console.log(`Lugar ID ${placeId} está fuera del rango geofence.`);
            return null; 
        }

        const photoReference = place.photos?.[0]?.photo_reference || null;
        
        let imageUrl = photoReference 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=350&photoreference=${photoReference}&key=${placesApiKey}`
            : null;

        const isHealth = isHealthPlaceType(place.types);
        
        return {
            name: place.name,
            phone: isHealth ? null : (place.formatted_phone_number || null), 
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: isHealth ? null : (place.website || null), 
            imageUrl: imageUrl,
            formatted_address: place.formatted_address,
            latitude: lat,
            longitude: place.geometry.location.lng,
            placeCategory: (place.types?.[0] || 'Lugar de Interés').replace(/_/g, ' '),
            isHealthPlace: isHealth, 
            rating: place.rating || null, 
            user_ratings_total: place.user_ratings_total || 0 
        };

    } catch (e) {
        console.error("Error al obtener detalles de Place ID:", e.response ? e.response.data : e.message);
        return null; 
    }
}


/**
 * 🛠️ Obtiene detalles de un lugar usando Búsqueda de Texto (para LÓGICA NORMAL/BYPASS).
 */
async function getPlaceDetails(query, currentLanguage) { 
    
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
                language: currentLanguage
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
                fields: ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'types'],
                language: currentLanguage
            }
        });

        const place = detailsResponse.data.result;
        
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;
        const isHealth = isHealthPlaceType(place.types);


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


// =======================================================
// 2. Instrucción de Sistema BASE (OPTIMIZADA V9.3)
// =======================================================

// Usamos {LANG_PLACEHOLDER} para la inyección de idioma dinámico
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.
**REGLA DE ESTRICTO CUMPLIMIENTO:** Si la solicitud del usuario es para un LUGAR o CATEGORÍA, DEBES responder **EXCLUSIVAMENTE con un formato JSON**. Está **PROHIBIDO** responder en texto plano conversacional en estos casos. Usa el formato de FALLO si el servidor lo indica o si no estás seguro de la existencia del lugar.
**NOTA CRÍTICA DE CLASIFICACIÓN:** Tu clasificación debe ser precisa. No asumas que todas las búsquedas son restaurantes. Usa las categorías más específicas posibles (Spa, Tienda de Ropa, Clínica Dental, Taquería, etc.).
**REGLA CRÍTICA DE CONTEXTO:** Si el usuario solicita un **LUGAR ESPECÍFICO** (ej. "Farmacia Guadalajara", "El Cuñao"), DEBES IGNORAR CUALQUIER CATEGORÍA PREVIA del chat (ej. si la última búsqueda fue un restaurante). Debes clasificar la nueva solicitud desde CERO, de forma independiente.
**REGLA CRÍTICA DE MENCIÓN HÍBRIDA:** Si el prompt del usuario contiene el token **${MENTION_TOKEN}**, significa que el usuario está preguntando por el lugar asociado a ese token. Tu tarea es:
    1.  Identificar la pregunta del usuario (ej: "¿Está abierto mañana?").
    2.  Responder **directamente a esa pregunta** en modo conversacional (Texto Plano).
    3.  **No debes generar una ficha JSON** si la pregunta es sobre el lugar mencionado. **Solo genera la ficha JSON si el usuario hace una pregunta de LUGAR O CATEGORÍA diferente.**
**REGLA ANTI-ALUCINACIÓN:** NUNCA inventes o generes datos concretos (teléfono, sitio web, dirección, horarios) que el servidor no haya proporcionado previamente. Tu única tarea es generar la estructura JSON y las descripciones.
**REGLA ANTI-CONFIDENCIA:** Al clasificar un lugar, **nunca confirmes su existencia** de forma conversacional (ej: 'Sí, existe...') dentro del JSON. Tu única tarea es clasificar para que el servidor procese la búsqueda.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para salud, DEBES establecer el campo "isHealthPlace" en "true".

---

### PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES (MODO FICHA DE CATEGORÍA)
**REGLA CRÍTICA:** Si el usuario pide recomendaciones, sugerencias o un listado de lugares, DEBES usar el **MODO FICHA DE CATEGORÍA (JSON)**.

---

3. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de un lugar o negocio **específico** Y **NO** contiene el token de mención.
4. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo para solicitudes de categorías generales O para **CUMPLIR EL PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES**.

5. **MODO CONVERSACIONAL (Texto Plano):** Úsalo *SOLO* para preguntas generales o de seguimiento (ej: "gracias", "¿cómo está el clima?") que **no** requieran una ficha, O si el prompt contiene el token **${MENTION_TOKEN}**.

6. Los formatos JSON requeridos son:
   
   // Formato para LUGAR ESPECÍFICO (Salud o No Salud)
   {
     "type": "place", 
     "placeName": "Nombre del Lugar", 
     "placeToSearch": "Nombre Exacto a buscar en Places API", 
     "placeCategory": "Clasificación general del lugar, ej: Clínica Dental, Restaurante",
     "isHealthPlace": true/false, 
     "description": "Descripción corta de **máximo 3 oraciones**.",
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
   
   // REGLA CLAVE: Si la respuesta requiere MÚLTIPLAS FICHAS, debes envolver todas las fichas en un array y añadir la propiedad "isMultiStructured": true.
   // El texto conversacional debe ir en "conversationText" y NO debe ser la respuesta principal.`;

// =======================================================
// 3. Manejador Principal (handler)
// =======================================================

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage = 'es', directSearchQuery } = req.body; 
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);
        
        // Traducciones para mensajes de fallo/notificaciones
        const translations = {
            notFoundDirect: currentLanguage === 'es' 
                ? `No se pudo encontrar o recuperar detalles completos para el lugar: **{query}** en **Nuevo Progreso** dentro del rango de 15km. Por favor, verifica el nombre o intenta con el modo chat. 📍`
                : `Could not find or retrieve complete details for the place: **{query}** in **Nuevo Progreso** within the 15km range. Please check the name or try chat mode. 📍`,
            notFoundGeofence: currentLanguage === 'es'
                ? `Disculpa, no se encontró un lugar llamado **{query}** ubicado en Nuevo Progreso (Rango 15km).`
                : `Sorry, a place called **{query}** located in Nuevo Progreso (15km Range) was not found.`,
            errorInternal: currentLanguage === 'es'
                ? "Fallo al obtener respuesta de Gemini: "
                : "Failed to get response from Gemini: "
        };


        // ----------------------------------------------------
        // 🥇 PRIORIDAD MÁXIMA: MODO BÚSQUEDA DIRECTA (SPS/Power Search) O MENCIÓN HÍBRIDA
        // ----------------------------------------------------
        if (directSearchQuery) {
            
            const isPlaceId = directSearchQuery.startsWith('ChI');
            const isHybridMention = !isPlaceId && userPrompt.includes(MENTION_TOKEN);

            // Si es un ID o se necesita buscar ID por texto (SPS/Búsqueda Directa)
            if (isPlaceId || !isHybridMention) {
                console.log(`⭐ Activado MODO BÚSQUEDA DIRECTA/SPS (Query: ${directSearchQuery})`);
                
                const placeData = await getFullPlaceDetails(directSearchQuery, currentLanguage); 
                
                if (placeData) {
                    
                    const fichaDescription = await generateDynamicDescription(
                        placeData.name,
                        placeData.placeCategory,
                        placeData.isHealthPlace,
                        currentLanguage
                    );

                    // Generar un JSON de Ficha de Lugar con todos los detalles
                    const finalFicha = {
                        type: "place",
                        placeName: placeData.name,
                        placeToSearch: placeData.name,
                        placeCategory: placeData.placeCategory,
                        isHealthPlace: placeData.isHealthPlace, 
                        description: fichaDescription, // <---- DESCRIPCIÓN 100% GEMINI Y DINÁMICA
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
                    const failedFicha = {
                        type: "place_not_found", 
                        placeToSearch: directSearchQuery, 
                        description: translations.notFoundDirect.replace('{query}', directSearchQuery),
                        isStructured: true
                    };
                    return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
                }
            } 
            
            // 🛑 MODO MENCIÓN HÍBRIDA
            if (isHybridMention) {
                
                const placeId = directSearchQuery;
                const promptToSend = userPrompt; 

                console.log(`⭐ Activado MODO MENCIÓN HÍBRIDA (Place ID: ${placeId})`);
                
                const placeData = await getFullPlaceDetails(placeId, currentLanguage);
                
                if (placeData) {
                    
                    const promptWithPlaceName = promptToSend.replace(MENTION_TOKEN, placeData.name);
                    
                    const chat = ai.chats.create({
                        model: MODEL_NAME, 
                        config: {
                            systemInstruction: finalSystemInstruction 
                        },
                        history: history,
                        tools: [{ googleSearch: {} }] 
                    });

                    const result = await chat.sendMessage({ message: promptWithPlaceName });
                    
                    // Gemini DEBE responder en texto plano según la regla del SYSTEM_INSTRUCTION
                    return res.status(200).json({ responseText: result.text.trim() });
                    
                } else {
                    const failedMessage = currentLanguage === 'es'
                        ? "Disculpa, no pude encontrar la información para el lugar mencionado. ¿Podrías intentar la búsqueda directa (⚡️)?"
                        : "Sorry, I couldn't find the information for the mentioned place. Could you try the direct search (⚡️)?";
                    return res.status(200).json({ responseText: failedMessage });
                }
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA ROBUSTA DE BYPASS CANÓNICO (PRIORIDAD AL SERVIDOR)
        // ----------------------------------------------------
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 

        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            if (promptSearchKey.includes(key)) {
                
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                
                const placeData = await getPlaceDetails(exceptionData.searchName, currentLanguage);
                
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
            let categoryName = currentLanguage === 'es' ? "lugares y negocios" : "places and businesses"; 
            
            // Traducción de categorías forzada para el prompt RAG
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = currentLanguage === 'es' ? "Taquerías y Tacos" : "Taco Stands and Taquerias";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = currentLanguage === 'es' ? "Restaurantes y Comida" : "Restaurants and Food";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = currentLanguage === 'es' ? "Tiendas de Artesanías y Souvenirs" : "Handicraft and Souvenir Shops";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = currentLanguage === 'es' ? "Barbacoa y Birria" : "Barbacoa and Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = currentLanguage === 'es' ? "Salud y Estética" : "Health and Aesthetics";
            
            // 🛑 CRÍTICO: SOBRESCRIBIMOS el prompt para FORZAR el MODO FICHA DE CATEGORÍA y PROHIBIR LISTAS.
            promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso. **CRÍTICO: TU RESPUESTA DEBE SER UN ÚNICO JSON DE TIPO 'category'. NUNCA GENERES FICHAS DE 'place' O LISTAS DE LUGARES ESPECÍFICOS. Tu respuesta debe ser en ${langText}.**`;
            
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
                            const searchForPlaces = placeNameSearch; 
                            
                            const placeData = await getPlaceDetails(searchForPlaces, currentLanguage);
                            const isHealthPlace = placeData?.isHealthPlace || ficha.isHealthPlace === true;

                            // 🛑 BLINDAJE ANTI-CORRELACIÓN:
                            let isNameMiscorrelated = false;
                            if (placeData && !areNamesSimilar(placeNameSearch, placeData.name)) {
                                console.warn(`¡Fallo de correlación! Se buscó "${placeNameSearch}" pero Places devolvió "${placeData.name}". Descartando resultado.`);
                                isNameMiscorrelated = true;
                            }

                            if (placeData && !isNameMiscorrelated) {
                                // **LÓGICA NORMAL: USAR RE-PROMPT con GOOGLE SEARCH RAG (Reseñas)**
                                
                                // 🟢 OPTIMIZACIÓN DEL RAG: Se añade el blindaje de comillas y fallback simple.
                                let placePrompt = currentLanguage === 'es' 
                                    ? `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder. La categoría es: ${enrichedFicha.placeCategory}. **UTILIZA TU HERRAMIENTA DE GOOGLE SEARCH** para buscar la consulta: "reseñas de ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **CRÍTICO: Extrae 1-2 frases CLAVE de reseñas REALES. Si citas, usa comillas dobles. Si no encuentras reseñas relevantes, DEJA el campo 'description' como un simple texto de fallback (ej: 'Servicios de alta calidad en la zona céntrica').** La descripción debe ser corta, estar basada en las reseñas encontradas, y enfocada en lo que dicen los clientes. **CRÍTICO: Evita las frases de inicio repetitivas como 'Se comenta que' o 'Según las reseñas'. Responde en ${langText}.** Solo usa la descripción que el RAG te proporciona.`
                                    : `The user asked for "${placeNameSearch}". Generate the PLACE CARD JSON to respond. The category is: ${enrichedFicha.placeCategory}. **USE YOUR GOOGLE SEARCH TOOL** to search the query: "reviews for ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **CRITICAL: Extract 1-2 KEY phrases from REAL reviews. If you quote, use double quotes. If you cannot find relevant reviews, LEAVE the 'description' field as a simple fallback text (e.g., 'High quality services in the downtown area').** The description must be short, based on the reviews found, and focused on what customers say. **CRITICAL: Avoid repetitive starting phrases like 'It is commented that' or 'According to reviews'. Respond in ${langText}.** Only use the description provided by the RAG.`;


                                // Usar un nuevo chat para no contaminar el historial principal
                                const ragChat = ai.chats.create({
                                    model: MODEL_NAME, 
                                    config: {
                                        systemInstruction: finalSystemInstruction 
                                    }
                                });

                                const rePromptResult = await ragChat.sendMessage({ 
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
                                    description: translations.notFoundGeofence.replace('{query}', placeNameSearch),
                                    isStructured: true
                                };
                            }
                        } else if (ficha.type === 'category') {
                             // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa)
                             
                             const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                             const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                             
                             // 🟢 CORRECCIÓN: Usar URL de búsqueda de Google Maps estándar
                             const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapUrlQuery)}`; 
                             
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
                    finalResponseData.responseText = modelResponseText; 
                }
            }
        } catch (jsonError) {
            console.error("Fallo en el parseo o enriquecimiento del JSON.", jsonError);
            finalResponseData.responseText = modelResponseText; 
        }

        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ 
            error: true, 
            message: translations.errorInternal + error.message
        });
    }
}
