// Archivo: chat.js (Versión 6.0 - Mejoras de Robustez y Estandarización)

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js'; 
import { createRequire } from 'module'; 

// 🟢 CRÍTICO: Inicializa la función 'require' localmente para entornos ESM.
const require = createRequire(import.meta.url); 

// --- Variables Globales ---
let DENTIST_CATALOG = {}; 
let CATALOG_LOADED = false;
const JSON_FILE_PATH = './dentists_data.json'; 

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// ⭐️ MAPA DE EXCEPCIONES Y CACHÉ LOCAL (Mantenido para Blanqueo)
const EXCEPTION_DATA_MAP = {
    'yomis': { 
        category: 'Spa y Masajes', 
        description: 'Yomis es un tranquilo spa especializado en masajes terapéuticos y relajantes para viajeros que buscan un descanso profundo. Ofrece una variedad de tratamientos para el bienestar y la salud.',
        searchName: 'Yomis Spa',
        isHealthPlace: true
    },
    'pinkys': { 
        category: 'Tienda de Ropa y Accesorios', 
        description: 'Pinkys es una tienda de ropa y accesorios que ofrece las últimas tendencias de moda de moda para damas y caballeros, con un enfoque en estilos casuales y de temporada.',
        searchName: 'Pinkys Fashion',
        isHealthPlace: false
    }, 
};

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
// Usar PlacesClient
const placesClient = new PlacesClient({});


// 🟢 FUNCIÓN DE INICIALIZACIÓN DEL SISTEMA
async function initializeSystem() {
    try {
        // Carga estática y síncrona del JSON (si el entorno lo permite, si no usar fetch)
        DENTIST_CATALOG = require(JSON_FILE_PATH); 
        CATALOG_LOADED = Array.isArray(DENTIST_CATALOG) && DENTIST_CATALOG.length > 0;
        console.log(`✅ Catálogo de Dentistas cargado estáticamente: ${DENTIST_CATALOG.length} entradas.`);
    } catch (e) {
        console.error(`🛑 ERROR CRÍTICO al cargar el catálogo de dentistas (${JSON_FILE_PATH}):`, e.message);
        DENTIST_CATALOG = [];
        CATALOG_LOADED = false;
    }
}

// Llama a la inicialización al inicio
initializeSystem();


// 2. Definimos la Instrucción del Sistema 
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.
**REGLA DE ESTRICTO CUMPLIMIENTO:** Si la solicitud del usuario es para un LUGAR o CATEGORÍA, DEBES responder **EXCLUSIVAMENTE con un formato JSON**. Está **PROHIBIDO** responder en texto plano conversacional en estos casos. Usa el formato de FALLO si el servidor lo indica o si no estás seguro de la existencia del lugar.
**NOTA CRÍTICA DE CLASIFICACIÓN:** Tu clasificación debe ser precisa. No asumas que todas las búsquedas son restaurantes. Usa las categorías más específicas posibles (Spa, Tienda de Ropa, Clínica Dental, Taquería, etc.).
**REGLA CRÍTICA DE CONTEXTO:** Si el usuario solicita un **LUGAR ESPECÍFICO** (ej. "Farmacia Guadalajara", "El Cuñao"), DEBES IGNORAR CUALQUIER CATEGORÍA PREVIA del chat. Debes clasificar la nueva solicitud desde CERO.

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
 * Función de búsqueda en el JSON local (Catálogo de Dentistas) con tolerancia.
 * @param {string} query Nombre del lugar a buscar (ej: "Dr. Juarez").
 * @returns {object|null} Detalles del catálogo local o null.
 */
function searchLocalCatalog(query) {
    if (!CATALOG_LOADED) return null;
    
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (normalizedQuery.length < 3) return null; 

    for (const dentist of DENTIST_CATALOG) {
        const normalizedName = dentist.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        
        // Coincidencia exacta, inclusión o por palabra clave
        const isMatch = (
            normalizedName === normalizedQuery || 
            normalizedName.includes(normalizedQuery) || 
            normalizedQuery.includes(normalizedName) ||
            normalizedQuery.split(/\s+/).some(qWord => qWord.length > 2 && normalizedName.split(/\s+/).some(nWord => nWord.includes(qWord)))
        );
        
        if (isMatch) {
            return { 
                name: dentist.name,
                phone: dentist.phone || null,
                mapUrl: dentist.google_url || null,
                websiteUrl: dentist.website || null,
                description: dentist.description_summary || `Clínica dental verificada en Nuevo Progreso: ${dentist.name}`,
                latitude: dentist.latitude,
                longitude: dentist.longitude,
                isHealthPlace: true 
            };
        }
    }
    return null; // No encontrado
}

/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar (incluyendo foto URL) o null.
 */
async function getPlaceDetails(query) { 
    if (!placesApiKey) {
        // console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // Coordenadas aproximadas de Nuevo Progreso para locationBias (26.064, -98.005)
    const LOCATION_BIAS = { lat: 26.064, lng: -98.005 };

    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query + GEOGRAPHIC_CONTEXT, // Añadir contexto geográfico
                inputtype: 'textquery',
                fields: ['place_id'], 
                locationBias: `point:${LOCATION_BIAS.lat},${LOCATION_BIAS.lng}` 
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        if (!placeId) return null;

        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address'] 
            }
        });

        const place = detailsResponse.data.result;
        const photoReference = place.photos?.[0]?.photo_reference || null;
        
        // Generar la URL de la foto de Places
        let imageUrl = photoReference 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`
            : null;

        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: place.website || null,
            imageUrl: imageUrl
        };

    } catch (e) {
        console.error("Error al llamar a Google Places API:", e.response ? e.response.data : e.message);
        return null; 
    }
}

// Función auxiliar para pedir el nombre a Gemini (para la búsqueda local)
async function getPlaceNameFromAI(userPrompt, history) {
    const identificationPrompt = `El usuario pide información. Basándote en el historial y el prompt ("${userPrompt}"), identifica el nombre del lugar específico (ej. "Farmacia Guadalajara" o "Dr. Juan Pérez") que el usuario está preguntando. Responde ÚNICAMENTE con el nombre exacto que usarías para buscar. Si el usuario pide una categoría ("dame restaurantes"), responde ÚNICAMENTE con "CATEGORY_REQUEST".`;
    
    try {
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            history: history 
        });
        const result = await chat.sendMessage({ message: identificationPrompt });
        const name = result.text.trim();
        
        if (name && name !== "CATEGORY_REQUEST" && name.length > 3 && name.length < 50) {
            return name;
        }
        return null;
    } catch (e) {
        console.error("Error al identificar el nombre del lugar con IA:", e);
        return null;
    }
}

// Función de utilidad para verificar similitud de nombres (Anti-Correlación)
function areNamesSimilar(searchName, returnedName) {
    const s1 = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = returnedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Considerar si el nombre buscado está contenido en el devuelto (o viceversa)
    return s2.includes(s1) || s1.includes(s2); 
}

// Función de utilidad para parsear el JSON de la respuesta del modelo
function parseModelResponse(responseText) {
    try {
        const jsonStart = responseText.indexOf('{');
        const jsonEnd = responseText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
            return JSON.parse(jsonString);
        }
    } catch (e) {
        console.error("Fallo al parsear el JSON de la respuesta del modelo.", e);
    }
    return null;
}


// ----------------------------------------------------------------
// 🟢 FUNCIÓN PRINCIPAL DEL HANDLER
// ----------------------------------------------------------------
export default async function handler(req, res) {
    
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage = 'es' } = req.body;
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // ----------------------------------------------------
        // ⭐️ LÓGICA DE BLINDAJE CANÓNICO (PRIORIDAD 1)
        // ----------------------------------------------------
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 
        const placeNameFromAI = await getPlaceNameFromAI(userPrompt, history);

        // A. Verificar excepciones fijas (Yomis, Pinkys)
        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            if (promptSearchKey.includes(key)) {
                
                const placeData = await getPlaceDetails(exceptionData.searchName);
                
                forcedCanonicalResponse = {
                    type: "place", 
                    placeName: placeData ? placeData.name : exceptionData.searchName, 
                    placeToSearch: exceptionData.searchName,
                    placeCategory: exceptionData.category, 
                    isHealthPlace: exceptionData.isHealthPlace,
                    description: exceptionData.description, 
                    isStructured: true,
                    mapUrl: placeData?.mapUrl || null,
                    imageUrl: placeData?.imageUrl || null,
                    // Restringir datos de contacto para salud (Spa es salud en este contexto)
                    placePhone: (placeData?.phone && !exceptionData.isHealthPlace) ? placeData.phone : null, 
                    websiteUrl: (placeData?.websiteUrl && !exceptionData.isHealthPlace) ? placeData.websiteUrl : null,
                };
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                break; 
            }
        }
        
        // B. Verificar en el Catálogo de Dentistas (usando el nombre identificado por AI)
        if (!forcedCanonicalResponse && placeNameFromAI) {
             const localData = searchLocalCatalog(placeNameFromAI);
                 
             if (localData) {
                console.log(`✅ Interceptación LOCAL (Dentista): Encontrado '${localData.name}'`);
                
                // ENRIQUECIMIENTO: Llama a Places API SOLO para obtener la imagen
                const placeDataForImage = await getPlaceDetails(localData.name);
                
                forcedCanonicalResponse = {
                    type: "place", 
                    placeName: localData.name, 
                    placeToSearch: localData.name,
                    placeCategory: 'Clínica Dental',
                    isHealthPlace: localData.isHealthPlace,
                    description: localData.description || `Clínica dental verificada en Nuevo Progreso: ${localData.name}.`, 
                    isStructured: true,
                    // Datos del JSON
                    placePhone: localData.phone,
                    mapUrl: localData.mapUrl,
                    websiteUrl: localData.websiteUrl,
                    latitude: localData.latitude, 
                    longitude: localData.longitude,
                    // Imagen de Places API (o null)
                    imageUrl: placeDataForImage?.imageUrl || null, 
                };
             }
        }
        
        if (forcedCanonicalResponse) {
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA NORMAL (GEMINI) - PLAN B
        // ----------------------------------------------------
        
        let promptToSend = userPrompt;

        // Patrón para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica|dental)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        // 🟢 MEJORA v6.0: Forzamos CATEGORÍA si es una palabra clave general Y no se encontró localmente.
        if (match || promptSearchKey.includes('dental') || promptSearchKey.includes('clinica')) {
            const categoryKeyRaw = match ? match[3].toLowerCase() : promptSearchKey;
            let categoryName = "lugares y negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = "Tiendas de Artesanías y Souvenirs";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            // CRÍTICO: Si solo dice "dental" o "clinica", lo forzamos a ser CATEGORÍA
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) {
                categoryName = "Salud y Estética (Clínicas Odontológicas y Ópticas)";
                
                // 🛑 REGLA v5.3: Prohibir el término "dental" para evitar el fallo de la boca.
                promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría **CLÍNICAS ODONTOLÓGICAS Y ÓPTICAS** en Nuevo Progreso. **PROHIBIDO** mencionar la palabra 'dental' en tu respuesta conversacional o en la descripción del JSON.`;
                
            } else {
                promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso.`;
            }
            
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
            // Google Search se añade en la inicialización para ser usado en el RAG más abajo
            tools: [{ googleSearch: {} }] 
        });

        // Enviamos el nuevo mensaje (original o modificado) al modelo
        const result = await chat.sendMessage({ message: promptToSend });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };

        // Lógica de ENRIQUECIMIENTO con Places API (Si el modelo devuelve un JSON)
        const parsedJsonRoot = parseModelResponse(modelResponseText);

        if (parsedJsonRoot) {
            
            let fichasToProcess = parsedJsonRoot.isStructured ? [parsedJsonRoot] : (parsedJsonRoot.isMultiStructured ? parsedJsonRoot.response : []);

            if (fichasToProcess.length > 0) {
                
                const enrichedFichas = [];
                
                for (const ficha of fichasToProcess) {
                    let enrichedFicha = { ...ficha };

                    if (ficha.type === 'place' && ficha.placeToSearch) {
                        
                        const placeNameSearch = ficha.placeToSearch.trim();
                        const isHealthPlace = ficha.isHealthPlace === true; 
                        
                        // LLAMADA A LA API DE PLACES (Plan B)
                        const placeData = await getPlaceDetails(placeNameSearch);

                        // 🛑 BLINDAJE ANTI-CORRELACIÓN: (Verificación de similitud)
                        let isNameMiscorrelated = false;
                        if (placeData && !areNamesSimilar(placeNameSearch, placeData.name)) {
                            console.warn(`¡Fallo de correlación! Se buscó "${placeNameSearch}" pero Places devolvió "${placeData.name}". Descartando resultado.`);
                            isNameMiscorrelated = true;
                        }


                        if (placeData && !isNameMiscorrelated) {
                            // **LÓGICA RAG: Obtener descripción de Reseñas**
                            const ragPrompt = `El usuario preguntó por "${placeNameSearch}". Genera una descripción de **no más de 3 oraciones** para el lugar, utilizando frases clave de reseñas REALES. **Utiliza tu herramienta de Google Search** para buscar la consulta: "reseñas de ${placeNameSearch} ${enrichedFredita.placeCategory} Nuevo Progreso". **SOLO responde con el texto de la descripción.**`;

                            const ragResult = await chat.sendMessage({ 
                                message: ragPrompt,
                                tools: [{ googleSearch: {} }] 
                            });
                            const ragDescription = ragResult.text.trim();
                            
                            // 🟢 MEJORA v6.0: Fusión de datos directa
                            enrichedFicha = {
                                ...enrichedFicha, 
                                placeName: placeData.name,
                                description: ragDescription || enrichedFicha.description, // Usar RAG o el original
                                mapUrl: placeData.mapUrl,
                                imageUrl: placeData.imageUrl,
                                // Restricciones de salud: ocultar teléfono/web para salud
                                placePhone: isHealthPlace ? null : placeData.phone, 
                                reviewUrl: placeData.reviewUrl, 
                                websiteUrl: isHealthPlace ? null : placeData.websiteUrl,
                            };
                            
                        } else { 
                            // Si NO existe o falló la correlación, creamos un FALLO
                            enrichedFicha = {
                                type: "place_not_found", 
                                placeToSearch: placeNameSearch, 
                                description: `Disculpa, no se encontró un lugar llamado **${placeNameSearch}** en Nuevo Progreso. Por favor, verifica el nombre.`,
                                isStructured: true
                            };
                        }

                    } else if (ficha.type === 'category') {
                         // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa de la Categoría)
                         const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                         const mapUrlQuery = encodeURIComponent(categorySearch + GEOGRAPHIC_CONTEXT);
                         // CORRECCIÓN: Usar un host real de Google Maps, no googleusercontent.com
                         const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapUrlQuery}`;
                         
                         enrichedFicha.mapUrl = mapUrl; 
                    }
                    
                    enrichedFichas.push(enrichedFicha);
                }

                // Reconstruir la respuesta final.
                let finalResponseJson = parsedJsonRoot.isMultiStructured 
                    ? { isMultiStructured: true, response: enrichedFichas, conversationText: parsedJsonRoot.conversationText || '' }
                    : enrichedFichas[0];
                
                finalResponseData.responseText = JSON.stringify(finalResponseJson);

            }
        } 
        // Si no había JSON, finalResponseData.responseText ya tiene el texto plano.

        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en el handler principal:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo interno del servidor: " + error.message
        });
    }
}
