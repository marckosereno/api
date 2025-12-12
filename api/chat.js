// ====================================================================
// Archivo: chat.js (Versión 9.7 - Chips de Categoría Concisos)
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
// NOTA: Estas descripciones son fijas y no cambian de idioma, lo cual es una limitación aceptada del bypass canónico.
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

// 🛑 NUEVA CONSTANTE: Token de Mención (Debe coincidir con el frontend)
const MENTION_TOKEN = "[[PLACE_MENTION]]";

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 


// =======================================================
// 🛑 DEFINICIÓN DE FUNCIONES AUXILIARES
// =======================================================

/**
 * Función auxiliar para determinar si es un tipo de lugar de salud/privacidad.
 * @param {string[]} types - Tipos de lugar de Google Places.
 * @returns {boolean}
 */
function isHealthPlaceType(types) {
    if (!types) return false;
    return types.some(type => IS_HEALTH_PLACE_TYPES.includes(type));
}

/**
 * 🛠️ Compara nombres para el blindaje de correlación.
 * (Función areNamesSimilar)
 */
function areNamesimilar(name1, name2) {
    if (!name1 || !name2) return false;
    const cleanName1 = name1.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s/g, '');
    const cleanName2 = name2.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s/g, '');
    // Simple check: Uno incluye al otro, o son casi iguales (ajusta la lógica si es necesario)
    return cleanName1.includes(cleanName2) || cleanName2.includes(cleanName1);
}

/**
 * 🛠️ Genera una descripción dinámica usando Gemini (re-prompt).
 * (Función generateDynamicDescription)
 */
async function generateDynamicDescription(name, category, isHealth, currentLanguage) {
    const langText = currentLanguage === 'es' ? 'español' : 'inglés';
    
    // 🟢 Instrucción para tono OBJETIVO/IMPERSONAL y omisión de ubicación.
    const placePrompt = currentLanguage === 'es' 
        ? `Genera una descripción corta (2 oraciones) y atractiva para el lugar "${name}" en la categoría "${category}". Céntrate en los servicios, experiencia y el ambiente. **CRÍTICO 1: La descripción DEBE omitir cualquier mención a la ubicación geográfica (ej. "Nuevo Progreso").** **CRÍTICO 2: La descripción DEBE usar un tono objetivo/impersonal, NUNCA uses pronombres de primera persona del plural (ej. "nosotros", "nuestro", "nuestra").** Responde solo con el texto de la descripción en ${langText}.`
        : `Generate a short (2-sentence), appealing description for the place "${name}" in the category "${category}". Focus on services, experience, and atmosphere. **CRITICAL 1: The description MUST omit any mention of the geographic location (e.g., "Nuevo Progreso").** **CRITICAL 2: The description MUST use an objective/impersonal tone, NEVER use first-person plural pronouns (e.g., "we", "our").** Respond only with the description text in ${langText}.`;
    
    try {
        const result = await ai.chats.create({
            model: MODEL_NAME, 
            config: {
                // Se agregó "impersonal" al rol
                systemInstruction: `Eres un escritor de descripciones turísticas con tono profesional e impersonal. Tu única tarea es generar descripciones en el idioma solicitado.` 
            }
        }).sendMessage({ message: placePrompt });
        
        return result.text.trim();
    } catch (e) {
        console.error("Fallo al generar descripción dinámica:", e);
        return currentLanguage === 'es' 
            ? `Este lugar (${category}) es un punto de interés popular.`
            : `This place (${category}) is a popular point of interest.`;
    }
}

/**
 * 🛠️ Obtiene detalles de un lugar usando Búsqueda de Texto (para LÓGICA NORMAL/BYPASS).
 * (Función getPlaceDetails)
 */
async function getPlaceDetails(searchName, currentLanguage) {
    try {
        const response = await placesClient.textSearch({
            params: {
                query: searchName + GEOGRAPHIC_CONTEXT,
                key: placesApiKey,
                language: currentLanguage,
                // Restricción por coordenadas para geofencing
                location: { lat: CENTER_LAT, lng: CENTER_LNG },
                radius: 15000, // 15 km de radio
            },
        });

        if (response.data.results.length === 0) return null;

        const result = response.data.results[0];
        
        // Mapeo simple de datos
        return {
            name: result.name,
            place_id: result.place_id,
            isHealthPlace: isHealthPlaceType(result.types),
            // FIX: Corregido el formato del mapUrl
            mapUrl: `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(result.name + GEOGRAPHIC_CONTEXT)}&query_place_id=${result.place_id}`,
            // NOTA: Se necesitaría una llamada a Place Details para obtener teléfono, sitio web e imágenes completos. 
            // Para simplificar, asumimos que este dato se llenará con la búsqueda completa.
            phone: null,
            imageUrl: null, 
            reviewUrl: null,
            websiteUrl: null
        };
    } catch (e) {
        console.error("Error en Places API (textSearch):", e.message);
        return null;
    }
}


/**
 * 🛠️ Obtiene todos los detalles de un lugar usando Place ID (Para MODO DIRECTO/MENCIÓN HÍBRIDA).
 * (Función getFullPlaceDetails)
 */
async function getFullPlaceDetails(placeId, currentLanguage) {
    try {
        const response = await placesClient.placeDetails({
            params: {
                place_id: placeId,
                key: placesApiKey,
                language: currentLanguage,
                fields: [
                    'name', 'formatted_address', 'place_id', 'geometry/location', 
                    'formatted_phone_number', 'website', 'photos', 'types'
                ],
            },
        });
        
        const result = response.data.result;

        if (!result) return null;
        
        // 🛑 Lógica de Geofencing para Place ID (CRÍTICO)
        const lat = result.geometry.location.lat;
        const lng = result.geometry.location.lng;

        // Comprobación de límites (30km x 30km centrado)
        const isWithinBounds = 
            lat >= EXTENDED_SW_BOUND.lat && lat <= EXTENDED_NE_BOUND.lat &&
            lng >= EXTENDED_SW_BOUND.lng && lng <= EXTENDED_NE_BOUND.lng;

        if (!isWithinBounds) {
            console.log(`Lugar ID ${placeId} está fuera del rango geofence.`);
            return null; // Rechazar si está fuera del área de Nuevo Progreso
        }


        const isHealth = isHealthPlaceType(result.types);
        
        // Generación de URL de mapa y reseñas
        const mapUrl = `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(result.name)}&query_place_id=${placeId}`;
        const reviewUrl = `https://search.google.com/local/reviews?placeid=${placeId}`; // URL de reseñas directa
        
        let imageUrl = null;
        if (result.photos && result.photos.length > 0) {
            // Obtener el URL de la primera foto (se usa el parámetro maxwidth para evitar la llamada a getPhoto)
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${result.photos[0].photo_reference}&key=${placesApiKey}`;
        }

        // Devolvemos un PlaceCategory genérico basado en el primer tipo si no hay un mapeo más inteligente
        const placeCategory = result.types[0] || 'Lugar/Negocio';

        return {
            name: result.name,
            place_id: placeId,
            placeCategory: placeCategory.replace(/_/g, ' '), // Limpiar el nombre de la categoría
            isHealthPlace: isHealth,
            mapUrl: mapUrl,
            reviewUrl: reviewUrl,
            phone: isHealth ? null : result.formatted_phone_number || null, // Aplicar restricción de salud
            websiteUrl: isHealth ? null : result.website || null, // Aplicar restricción de salud
            imageUrl: imageUrl,
            latitude: lat,
            longitude: lng,
        };

    } catch (e) {
        // El error ReferenceError: getFullPlaceDetails is not defined está resuelto, ahora manejamos el error de API.
        console.error("Error en Places API (placeDetails):", e.message);
        return null;
    }
}
// =======================================================
// 🛑 FIN DE DEFINICIÓN DE FUNCIONES AUXILIARES
// =======================================================


// 2. Definimos la Instrucción del Sistema
// Usamos {LANG_PLACEHOLDER} para la inyección de idioma dinámico
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu misión es asistir a turistas.
**REGLAS CLAVE DE RESPUESTA Y FORMATO (CRÍTICO):**
1.  **Formato Estructurado (JSON):** Cuando el usuario pida información específica (un lugar, o un listado/categoría), DEBES responder con una o más fichas JSON estructuradas.
2.  **Formato Conversacional (Texto Plano):** Para saludos, preguntas generales, fallos, o mensajes de chat normales, responde en texto plano.
3.  **Localización (CRÍTICO):** NUNCA afirmes que un lugar se encuentra en Nuevo Progreso a menos que tengas confirmación del Place API. Si el Place API no devuelve un resultado, DEBES asumir que el lugar está fuera de tu jurisdicción (el área de 15km alrededor de Nuevo Progreso). Si el lugar no existe en Places API, NUNCA LO INVENTES; simplemente di que no lo puedes encontrar en el área. Si respondes con una ficha, usa el nombre devuelto por Places API. **CRÍTICO: Cuando generes una ficha de lugar ("type": "place"), la propiedad description DEBE OMITIR cualquier mención a la ubicación geográfica (ej. "Nuevo Progreso", "Progreso", "Tamaulipas").**
4.  **Tono (CRÍTICO):** Siempre eres profesional, amigable y muy útil. Para descripciones de lugares, **DEBES usar un tono objetivo e impersonal, NUNCA utilices pronombres o términos que te incluyan como "nosotros", "nuestro", "nuestra", "mi sistema", etc.** Céntrate en la experiencia, servicio o datos.
5.  **IDIOMA:** Responde SIEMPRE en {LANG_PLACEHOLDER}.
6.  **Multi-Ficha:** Si proporcionas más de una ficha (ej. "dame ideas para el día"), usa el formato 'isMultiStructured: true'.
7.  **Campos Health/Privacy:** Si un lugar es de salud/médico (dental, farmacia, clínica), el campo 'isHealthPlace' debe ser 'true' y DEBES OMITIR su número de teléfono y sitio web del JSON.

**FORMATOS JSON PERMITIDOS:**
{
    "type": "place" | "category" | "place_not_found",
    //... (Otros campos)
}
//...
El texto conversacional debe ir en "conversationText" y NO debe ser la respuesta principal.`;


// Ahora, el manejador principal (handler) puede ver todas las funciones definidas arriba.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        // 🛑 CAMBIO: `directSearchQuery` ahora puede ser un Place ID (para SPS o Mención)
        const { history = [], userPrompt, currentLanguage = 'es', directSearchQuery } = req.body; 
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        // 🛑 CAMBIO: Inyección de idioma en la instrucción base
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);
        
        // Traducciones para mensajes de fallo/notificaciones
        const translations = { 
            // AJUSTE DE TONO: Se modificó "nuestra área de cobertura" por "el área de cobertura"
            notFoundDirect: currentLanguage === 'es' 
                ? `Disculpa, no pudimos verificar o encontrar los detalles completos para el lugar: **{query}** en el área de cobertura de **Nuevo Progreso** (15km). Intenta con otra búsqueda. 📍`
                : `Sorry, we could not verify or retrieve complete details for the place: **{query}** in the **Nuevo Progreso** coverage area (15km). Please try another search. 📍`,
            // MODIFICADO para ser más enfático: el lugar no se encontró.
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
            
            // Si el Place ID enviado es un token para Mención Híbrida (no es Place ID real)
            const isPlaceId = directSearchQuery.startsWith('ChI');
            const isHybridMention = !isPlaceId && userPrompt.includes(MENTION_TOKEN);

            // Si es un ID, usamos getFullPlaceDetails
            if (isPlaceId) {
                console.log(`⭐ Activado MODO BÚSQUEDA DIRECTA/SPS (Place ID: ${directSearchQuery})`);
                
                // 🛑 CRÍTICO: Se pasa el Place ID (o el texto) a la función
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
                        description: fichaDescription, // <---- DESCRIPCIÓN 100% GEMINI Y DINÁMICA (SIN UBICACIÓN, TONO OBJETIVO)
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
                        // Usar traducción para el mensaje de fallo (VERSION 9.5 - TONO IMPERSONAL)
                        description: translations.notFoundDirect.replace('{query}', directSearchQuery),
                        isStructured: true
                    };
                    return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
                }
            } 
            
            // 🛑 NUEVO: MODO MENCIÓN HÍBRIDA
            if (isHybridMention) {
                
                // El Place ID está en directSearchQuery, pero el prompt real está en userPrompt.
                const placeId = directSearchQuery;
                const promptToSend = userPrompt; // Este prompt contiene el token

                console.log(`⭐ Activado MODO MENCIÓN HÍBRIDA (Place ID: ${placeId})`);
                
                // 1. Obtener los detalles del lugar (necesitamos el nombre real para el prompt de Gemini)
                // Usamos getFullPlaceDetails, pero solo necesitamos el nombre
                const placeData = await getFullPlaceDetails(placeId, currentLanguage);
                
                if (placeData) {
                    
                    // 2. Reemplazar el token en el prompt con el nombre real para el contexto de Gemini
                    // Ej: "Quiero ir a [[PLACE_MENTION]] mañana" -> "Quiero ir a Dentista Progreso mañana"
                    const promptWithPlaceName = promptToSend.replace(MENTION_TOKEN, placeData.name);
                    
                    // 3. ENVIAR A GEMINI para generar la respuesta CONVERSACIONAL
                    const chat = ai.chats.create({
                        model: MODEL_NAME, 
                        config: {
                            // Usamos el sistema de instrucción base
                            systemInstruction: finalSystemInstruction 
                        },
                        // Incluimos el historial previo
                        history: history,
                        // Usamos RAG para información en tiempo real (horarios, reseñas, etc.)
                        tools: [{ googleSearch: {} }] 
                    });

                    // Enviamos el mensaje enriquecido a Gemini
                    const result = await chat.sendMessage({ message: promptWithPlaceName });
                    
                    // Gemini DEBE responder en texto plano según la regla del SYSTEM_INSTRUCTION
                    return res.status(200).json({ responseText: result.text.trim() });
                    
                } else {
                    // Si el Place ID de la mención no funciona, devolvemos un error conversacional
                    const failedMessage = currentLanguage === 'es'
                        // AJUSTE DE TONO: Se modificó "nuestra área de cobertura" por "el área de cobertura"
                        ? "Disculpa, no pude encontrar la información para el lugar mencionado dentro del área de cobertura. ¿Podrías intentar la búsqueda directa (⚡️)?"
                        : "Sorry, I couldn't find the information for the mentioned place within the coverage area. Could you try the direct search (⚡️)?";
                    return res.status(200).json({ responseText: failedMessage });
                }
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA ROBUSTA DE BYPASS CANÓNICO (PRIORIDAD AL SERVIDOR)
        // ----------------------------------------------------
        // ... (Este bloque queda sin cambios ya que es una función de respaldo) ...

        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 

        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            // Utilizamos includes para ser más flexibles
            if (promptSearchKey.includes(key)) {
                
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                
                // 🛑 CRÍTICO: Se pasa el idioma
                const placeData = await getPlaceDetails(exceptionData.searchName, currentLanguage);
                
                const isHealthPlace = exceptionData.category.includes('Spa');
                
                // NOTA: La descripción canónica (exceptionData.description) es fija y no se traduce, y ya es location-agnostic
                
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

        // Lista de categorías que deberían forzar una ficha de categoría
        const categoryNouns = ['taquería', 'restaurante', 'tienda', 'barbacoa', 'lugar', 'lugares', 'souvenirs', 'artesanías', 'artesanias', 'clínica', 'clinica', 'farmacia', 'dental', 'óptica', 'optica', 'antojito', 'antojitos', 'comida', 'bares', 'bebidas', 'spa', 'masajes', 'desayuno', 'postre'];
        const pluralCategoryNouns = categoryNouns.map(n => n.endsWith('s') ? n : n + 's');
        const allCategoryNouns = [...new Set([...categoryNouns, ...pluralCategoryNouns])];

        // Patrón para detectar solicitudes de listado/recomendación (con verbo de comando)
        const commandRecommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(${categoryNouns.join('|')})s?`, 'i');

        let match = userPrompt.match(commandRecommendationPattern);
        let categoryKeyRaw = ''; // Inicializar

        if (match) {
            categoryKeyRaw = match[3].toLowerCase(); // Categoría encontrada por el comando
        } else {
            // 🛑 V9.6: Intentar detectar categoría como palabra única o frase corta
            const promptCleaned = userPrompt.trim().toLowerCase().replace(/^(los|las)\s+/i, ''); // Quitar "los " o "las " al inicio
            
            // Buscar coincidencia exacta con una de las categorías (singular o plural)
            if (allCategoryNouns.includes(promptCleaned)) {
                // Forzar la categoría
                categoryKeyRaw = promptCleaned.replace(/s$/, ''); // Usar la forma singular como clave (e.g., 'antojitos' -> 'antojito')
                // Mock a match structure to enter the 'if (match)' block
                match = [promptCleaned, '', '', categoryKeyRaw]; 
                console.log("PROTOCOLO CATEGORÍA STANDALONE ACTIVADO para:", categoryKeyRaw);
            }
        }
                
        if (match) {
            // Si llegamos aquí, categoryKeyRaw tiene la categoría base (singular)
            
            let categoryName = currentLanguage === 'es' ? "lugares y negocios" : "places and businesses"; 
            
            // Traducción de categorías forzada para el prompt RAG
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('taco')) categoryName = currentLanguage === 'es' ? "Taquerías y Tacos" : "Taco Stands and Taquerias";
            // V9.6: Añadido Antojitos
            else if (categoryKeyRaw.includes('antojito') || categoryKeyRaw.includes('comida')) categoryName = currentLanguage === 'es' ? "Antojitos Mexicanos y Comida Local" : "Mexican Snacks and Local Food";
            else if (categoryKeyRaw.includes('restaurante')) categoryName = currentLanguage === 'es' ? "Restaurantes y Comida Internacional" : "Restaurants and International Food";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = currentLanguage === 'es' ? "Barbacoa y Birria" : "Barbacoa and Birria";
            // V9.7: Ajuste del nombre de la categoría para ser más conciso
            else if (categoryKeyRaw.includes('artesania') || categoryKeyRaw.includes('souvenirs') || categoryKeyRaw.includes('tienda')) categoryName = currentLanguage === 'es' ? "Tiendas de Artesanías y Compras" : "Handicraft and Shopping";
            else if (categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia') || categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('spa') || categoryKeyRaw.includes('masajes')) categoryName = currentLanguage === 'es' ? "Salud y Estética" : "Health and Aesthetics";
            else if (categoryKeyRaw.includes('bares') || categoryKeyRaw.includes('bebidas')) categoryName = currentLanguage === 'es' ? "Bares y Vida Nocturna" : "Bars and Nightlife";
            else if (categoryKeyRaw.includes('lugar')) categoryName = currentLanguage === 'es' ? "Lugares de Interés General" : "General Points of Interest";
            else if (categoryKeyRaw.includes('desayuno')) categoryName = currentLanguage === 'es' ? "Lugares de Desayuno y Café" : "Breakfast and Coffee Places";
            else if (categoryKeyRaw.includes('postre')) categoryName = currentLanguage === 'es' ? "Postres y Panaderías" : "Desserts and Bakeries";

            // 🟢 CAMBIO V9.7: Instrucción CRÍTICA para que los 'items' sean CONCISOS y ACCIONABLES (Chips)
            promptToSend = currentLanguage === 'es' 
                ? `El usuario pidió un resumen de la categoría: ${categoryName}. DEBES responder con el JSON de FICHA DE CATEGORÍA ("type": "category"). **CRÍTICO: El arreglo "items" DEBE contener 8 subcategorías principales que sean CONCISAS y ACCIONABLES, adecuadas para usarse como botones o chips de navegación (ej. "Clínicas Dentales", "Tiendas de Piel"). No incluyas descripciones largas ni texto entre paréntesis en los items.** El resumen general de la descripción debe ser amigable. Responde SOLO con el JSON completo en ${langText}.`
                : `The user requested a summary of the category: ${categoryName}. YOU MUST respond with the CATEGORY CARD JSON ("type": "category"). **CRITICAL: The "items" array MUST contain 8 concise and actionable main subcategories, suitable for use as navigation buttons or chips (e.g., "Dental Clinics", "Leather Shops"). Do not include long descriptions or text in parentheses in the items.** The general description should be friendly. Respond ONLY with the complete JSON in ${langText}.`;
            
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
                
                // Usamos 'data' para el multi-structured si es necesario, aunque en tu código era 'response'
                let fichasToProcess = parsedJson.isStructured ? [parsedJson] : (parsedJson.isMultiStructured ? (parsedJson.response || parsedJson.data) : []);

                if (fichasToProcess.length > 0) {
                    
                    const enrichedFichas = [];
                    
                    for (const ficha of fichasToProcess) {
                        let enrichedFicha = { ...ficha };

                        if (ficha.type === 'place' && ficha.placeToSearch) {
                            
                            const placeNameSearch = ficha.placeToSearch.trim();
                            
                            // Búsqueda flexible (solo el nombre)
                            const searchForPlaces = placeNameSearch; 
                            
                            // 🛑 CRÍTICO: Se pasa el idioma
                            const placeData = await getPlaceDetails(searchForPlaces, currentLanguage);
                            const isHealthPlace = placeData?.isHealthPlace || ficha.isHealthPlace === true;


                            // 🛑 BLINDAJE ANTI-CORRELACIÓN:
                            let isNameMiscorrelated = false;
                            if (placeData && !areNamesimilar(placeNameSearch, placeData.name)) {
                                console.warn(`¡Fallo de correlación! Se buscó "${placeNameSearch}" pero Places devolvió "${placeData.name}". Descartando resultado.`);
                                isNameMiscorrelated = true;
                            }


                            if (placeData && !isNameMiscorrelated) {
                                // **LÓGICA NORMAL: USAR RE-PROMPT con GOOGLE SEARCH RAG (Reseñas)**
                                
                                // 🟢 REFUERZO RAG CRÍTICO: Se agregó la omisión de ubicación y el tono impersonal
                                let placePrompt = currentLanguage === 'es' 
                                    ? `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder. La categoría es: ${enrichedFicha.placeCategory}. **UTILIZA TU HERRAMIENTA DE GOOGLE SEARCH** para buscar la consulta: "reseñas de ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **CRÍTICO: Extrae las frases clave de una o dos reseñas REALES y úsalas para componer la 'description' en el JSON.** La descripción debe ser corta (2 a 3 oraciones), estar BASADA ESTRICTAMENTE EN LO QUE DICEN LOS CLIENTES Y SERVICIOS REALES. **ABSOLUTAMENTE PROHIBIDO usar frases de inicio como 'Se comenta que', 'Según las reseñas', o 'Este lugar es'. Y CRÍTICAMENTE, DEBES OMITIR cualquier mención a la ubicación geográfica (ej. "Nuevo Progreso", "Progreso"). Además, DEBES usar un tono objetivo e impersonal, NUNCA utilices pronombres o términos que te incluyan como "nosotros" o "nuestro". SÉ DIRECTO. Responde SOLO con el JSON completo en ${langText}.**`
                                    : `The user asked for "${placeNameSearch}". Generate the PLACE CARD JSON to respond. The category is: ${enrichedFicha.placeCategory}. **USE YOUR GOOGLE SEARCH TOOL** to search the query: "reviews for ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **CRITICAL: Extract key phrases from one or two REAL reviews and use them to compose the 'description' in the JSON.** The description must be short (2 to 3 sentences), strictly BASED ON WHAT CUSTOMERS SAY AND REAL SERVICES. **ABSOLUTELY PROHIBITED to use starting phrases like 'It is commented that', 'According to reviews', or 'This place is'. AND CRITICALLY, YOU MUST OMIT any mention of the geographic location (e.g., "Nuevo Progreso", "Progreso"). Additionally, YOU MUST use an objective/impersonal tone, NEVER use pronouns or terms that include you like "we" or "our". BE DIRECT. Respond ONLY with the complete JSON in ${langText}.**`;


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
                                    // 🛑 CRÍTICO: Usar traducción para el mensaje de fallo 
                                    description: translations.notFoundGeofence.replace('{query}', placeNameSearch),
                                    isStructured: true
                                };
                            }
                        } else if (ficha.type === 'category') {
                             // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa)
                             
                             const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                             const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                             
                             const mapUrl = `https://www.google.com/maps/search/?api=1&query=$${encodeURIComponent(mapUrlQuery)}`; // Formato correcto para query de categoría
                             
                             enrichedFicha.mapUrl = mapUrl; 
                        }
                        
                        enrichedFichas.push(enrichedFicha);
                    }

                    // Después de procesar todas las fichas, reconstruir la respuesta final.
                    let finalResponseJson = parsedJson.isMultiStructured 
                        ? { isMultiStructured: true, data: enrichedFichas, conversationText: parsedJson.conversationText || '' }
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
            // 🛑 CRÍTICO: Usar traducción para el mensaje de error
            message: translations.errorInternal + error.message
        });
    }
}
