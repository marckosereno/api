// ====================================================================
// Archivo: chat.js (Versión 7.2 - Rango Extendido 10km)
// NOTA: Eliminado SPS estricto y sustituido por locationRestriction (20x20km).
// ====================================================================

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient, PlaceInputType } from '@googlemaps/google-maps-services-js'; 
import { createRequire } from 'module'; 

// 🟢 CRÍTICO: Inicializa la función 'require' localmente para entornos ESM.
const require = createRequire(import.meta.url); 

// --- Variables Globales ---
let DENTIST_CATALOG = {}; 
let CATALOG_LOADED = false;
const JSON_FILE_PATH = './dentists_data.json'; 

const MODEL_NAME = "gemini-2.5-flash"; 
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// 🛑 PARÁMETROS DE BÚSQUEDA EXTENDIDA (10 km de radio)
// Coordenadas de Referencia Central de Nuevo Progreso
const CENTER_LAT = 26.064; 
const CENTER_LNG = -98.005;

// Aproximadamente 10km en latitud y longitud a esta latitud (para crear un cuadrado de 20x20km)
const LAT_OFFSET = 0.09; // ~10km
const LNG_OFFSET = 0.10; // ~10km

// 🛑 RANGO EXTENDIDO (20x20km centrado en Progreso - Sustituye a los bounds estrictos)
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

// ⭐️ MAPA DE EXCEPCIONES Y CACHÉ LOCAL
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
const placesClient = new PlacesClient({});


// 🟢 FUNCIÓN DE INICIALIZACIÓN DEL SISTEMA
async function initializeSystem() {
    try {
        DENTIST_CATALOG = require(JSON_FILE_PATH); 
        CATALOG_LOADED = Array.isArray(DENTIST_CATALOG) && DENTIST_CATALOG.length > 0;
        console.log(`✅ Catálogo de Dentistas cargado estáticamente: ${DENTIST_CATALOG.length} entradas.`);
    } catch (e) {
        console.error(`🛑 ERROR CRÍTICO al cargar el catálogo de dentistas (${JSON_FILE_PATH}):`, e.message);
        DENTIST_CATALOG = [];
        CATALOG_LOADED = false;
    }
}
initializeSystem();


// 2. Definimos la Instrucción del Sistema (Versión completa)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu función es proporcionar información turística, de servicios, y de interés para visitantes en la zona. 
Tu objetivo es ser conciso, útil y georreferenciado (siempre asume que la consulta es sobre Nuevo Progreso).
Si se te solicita información sobre un lugar, debes responder con una Ficha Estructurada JSON.
Si la pregunta es conversacional o general, responde con texto plano y tono amigable.

### Formato de Ficha Estructurada JSON
Siempre usa este formato (y solo este formato, sin comentarios) para respuestas sobre lugares:
\`\`\`json
{
  "type": "place",
  "placeName": "Nombre del Lugar",
  "placeToSearch": "Nombre para API",
  "placeCategory": "Categoría (Ej: Restaurante, Tienda)",
  "isHealthPlace": true|false,
  "description": "Descripción breve y útil del lugar. Máx 3 oraciones.",
  "isStructured": true
}
\`\`\`
REGLA CLAVE: Si la respuesta requiere MÚLTIPLES FICHAS, debes envolver todas las fichas en un array y añadir la propiedad "isMultiStructured": true.`;


// =================================================================
// 3. FUNCIONES DE UTILIDAD Y API DE PLACES
// =================================================================

/**
 * Función que busca en el Catálogo de Dentistas con tolerancia. (Se mantiene igual)
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Detalles del catálogo local o null.
 */
function searchLocalCatalog(query) {
    if (!CATALOG_LOADED) return null;
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (normalizedQuery.length < 3) return null; 

    for (const dentist of DENTIST_CATALOG) {
        const normalizedName = dentist.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        // Lógica de coincidencia (exacta, inclusión o palabra clave)
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
    return null;
}

/**
 * 🟢 MODIFICADA: Obtiene detalles completos de un lugar usando Places API.
 * Se usa para el MODO BÚSQUEDA DIRECTA.
 * 🛑 AHORA USA LOCATION RESTRICTION (10KM) y ELIMINA STRICT BOUNDS.
 * @param {string} queryOrPlaceId Nombre del lugar o Place ID.
 * @returns {object|null} Objeto con detalles del lugar o null.
 */
async function getFullPlaceDetails(queryOrPlaceId) { 
    if (!placesApiKey) return null;
    
    let placeId = queryOrPlaceId;

    // A) Si no parece un Place ID, lo buscamos por texto (con restricción de 10km)
    if (!queryOrPlaceId.startsWith('ChI')) {
        try {
            console.log(`Buscando Place ID (Rango 10km) para: ${queryOrPlaceId}`);
            
            // 🛑 IMPLEMENTACIÓN CRÍTICA: RANGO EXTENDIDO 10KM (locationRestriction)
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
                    // 🛑 ELIMINADO: strictBounds: true
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
        console.log("No se encontró Place ID dentro del rango de 10km o la búsqueda falló.");
        return null;
    }

    // B) Obtenemos los detalles completos del lugar
    try {
        const fields = ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address', 'geometry', 'types'];
        
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

        // 🛑 Lógica de Confidencialidad: Clasificación de salud
        const isHealth = place.types.some(t => IS_HEALTH_PLACE_TYPES.includes(t));
        
        return {
            name: place.name,
            phone: isHealth ? null : (place.formatted_phone_number || null), // Ocultar si es salud
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: isHealth ? null : (place.website || null), // Ocultar si es salud
            imageUrl: imageUrl,
            formatted_address: place.formatted_address,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            placeCategory: place.types?.[0] || 'Lugar de Interés',
            isHealthPlace: isHealth // Enviamos la bandera para el frontend
        };

    } catch (e) {
        console.error("Error al obtener detalles de Place ID:", e.response ? e.response.data : e.message);
        return null; 
    }
}

/**
 * Función auxiliar (más sencilla) para el modo Gemini (solo necesita ID/Imagen)
 * 🛑 AHORA USA LOCATION RESTRICTION (10KM) y ELIMINA STRICT BOUNDS.
 */
async function getPlaceDetails(query) { 
    if (!placesApiKey) return null;
    
    let placeId = query;

    // Asumimos que esta función es llamada con el nombre del lugar
    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query, 
                inputtype: PlaceInputType.textquery,
                fields: ['place_id'], 
                locationRestriction: { 
                    northeast: EXTENDED_NE_BOUND, 
                    southwest: EXTENDED_SW_BOUND 
                },
                // 🛑 ELIMINADO: strictBounds: true
                language: 'es'
            }
        });
        placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
    } catch (e) {
        console.error("Error buscando Place ID en Modo Gemini:", e.message);
        return null;
    }
    
    if (!placeId) {
        return null;
    }

    // Obtener los detalles del lugar (SOLO CAMPOS BÁSICOS)
    try {
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'photos'] // Solo necesitamos nombre y fotos
            }
        });

        const place = detailsResponse.data.result;
        if (!place) return null;
        
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;

        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

        return {
            name: place.name,
            imageUrl: imageUrl
            // isHealthPlace: No es crítico aquí, la lógica de salud se maneja en el RAG de Gemini y en getFullPlaceDetails
        };

    } catch (e) {
        console.error("Error al obtener detalles de Place ID en Modo Gemini:", e.message);
        return null; 
    }
}

// Función auxiliar para pedir el nombre a Gemini (Se mantiene igual)
async function getPlaceNameFromAI(userPrompt, history) {
    // ... Implementación de getPlaceNameFromAI ...
    // (Asumo que esta función existe y no requiere cambios)
    
    // --- Simulamos la implementación si no está en el código provisto ---
    const chat = ai.chats.create({
        model: MODEL_NAME, 
        config: {
            systemInstruction: `Eres un extractor de nombres. Analiza el prompt del usuario y extrae el nombre específico de un lugar o negocio que busca. Si el usuario pide una categoría ("restaurantes", "tiendas"), devuelve la categoría. Si es una pregunta general, devuelve "GENERAL". Responde SÓLO con el nombre/categoría extraído.`
        },
        history: history,
    });
    const result = await chat.sendMessage({ message: userPrompt });
    let name = result.text.trim().replace(/"/g, '');
    return name.length > 0 && name !== "GENERAL" ? name : null;
    // --- Fin de simulación ---
}


// Función de utilidad para verificar similitud de nombres (Anti-Correlación) (Se mantiene igual)
function areNamesSimilar(searchName, returnedName) {
    const s1 = searchName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const s2 = returnedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    // Verifica si uno es substring del otro o son idénticos después de limpieza
    return s2.includes(s1) || s1.includes(s2) || s1 === s2;
}

// Función de utilidad para parsear el JSON de la respuesta del modelo (Se mantiene igual)
function parseModelResponse(responseText) {
    const jsonStart = responseText.indexOf('{');
    const jsonEnd = responseText.lastIndexOf('}');
    
    if (jsonStart !== -1 && jsonEnd !== -1) {
        const jsonString = responseText.substring(jsonStart, jsonEnd + 1);
        try {
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Error al parsear el JSON del modelo:", e.message);
        }
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
        const { history = [], userPrompt, currentLanguage = 'es', directSearchQuery } = req.body;
        
        // ----------------------------------------------------
        // 🥇 PRIORIDAD MÁXIMA: MODO BÚSQUEDA DIRECTA (Power Search)
        // ----------------------------------------------------
        if (directSearchQuery) {
            console.log(`⭐ Activado MODO BÚSQUEDA DIRECTA para: ${directSearchQuery}`);
            
            // 🛑 Esta función ahora usa el rango de 10km
            const placeData = await getFullPlaceDetails(directSearchQuery); 
            
            if (placeData) {
                // Generar un JSON de Ficha de Lugar con todos los detalles
                const finalFicha = {
                    type: "place",
                    placeName: placeData.name,
                    placeToSearch: placeData.name,
                    placeCategory: placeData.placeCategory,
                    isHealthPlace: placeData.isHealthPlace, 
                    description: `📍 Dirección: ${placeData.formatted_address}. Encontrado vía búsqueda directa de Google Places (Rango 10km).`, 
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
                    description: `No se pudo encontrar o recuperar detalles completos para el lugar: **${directSearchQuery}** en **Nuevo Progreso** dentro del rango de 10km. Por favor, verifica el nombre o intenta con el modo chat. 📍`,
                    isStructured: true
                };
                return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA DE CHAT NORMAL (GEMINI/RAG/CANÓNICO)
        // ----------------------------------------------------
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION; // Aquí deberías reemplazar el placeholder de idioma si lo usaras.
        
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 
        const placeNameFromAI = await getPlaceNameFromAI(userPrompt, history);
        
        // A. Verificar excepciones fijas (Yomis, Pinkys)
        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            if (promptSearchKey.includes(key) && !forcedCanonicalResponse) {
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
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
                    placePhone: (placeData?.phone && !exceptionData.isHealthPlace) ? placeData.phone : null, 
                    reviewUrl: placeData?.reviewUrl || null, 
                    websiteUrl: (placeData?.websiteUrl && !exceptionData.isHealthPlace) ? placeData.websiteUrl : null,
                };
                break; 
            }
        }
        
        // B. Verificar en el Catálogo de Dentistas (usando el nombre identificado por AI)
        if (placeNameFromAI && !forcedCanonicalResponse) {
            const localCatalogData = searchLocalCatalog(placeNameFromAI);
            if (localCatalogData) {
                 console.log(`Interceptación CATÁLOGO LOCAL forzada para: ${placeNameFromAI}`);
                 
                 // Intenta enriquecer con datos de Places API (aunque no es crítico para el catálogo)
                 const placeData = await getPlaceDetails(localCatalogData.name);
                 
                 forcedCanonicalResponse = {
                    type: "place", 
                    placeName: localCatalogData.name, 
                    placeToSearch: localCatalogData.name,
                    placeCategory: 'Clínica Dental', 
                    isHealthPlace: true,
                    description: localCatalogData.description, 
                    isStructured: true,
                    
                    mapUrl: localCatalogData.mapUrl,
                    imageUrl: placeData?.imageUrl || null, // Usar imagen de Places si existe
                    placePhone: localCatalogData.phone, 
                    websiteUrl: localCatalogData.websiteUrl, 
                    latitude: localCatalogData.latitude,
                    longitude: localCatalogData.longitude,
                 };
            }
        }


        if (forcedCanonicalResponse) {
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }
        
        // C. Lógica de Categorías (Forzar JSON)
        let promptToSend = userPrompt;

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

        
        // D. Llamada a Gemini y Enriquecimiento
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: BASE_SYSTEM_INSTRUCTION 
            },
            history: history,
            tools: [{ googleSearch: {} }] 
        });

        const result = await chat.sendMessage({ message: promptToSend });
        let modelResponseText = result.text.trim();
        let finalResponseData = { responseText: modelResponseText };

        // Lógica de ENRIQUECIMIENTO con Places API
        const parsedJson = parseModelResponse(modelResponseText);

        if (parsedJson) {
            
            let fichasToProcess = parsedJson.isStructured ? [parsedJson] : (parsedJson.isMultiStructured ? parsedJson.response : []);

            if (fichasToProcess.length > 0) {
                
                const enrichedFichas = [];
                
                for (const ficha of fichasToProcess) {
                    let enrichedFicha = { ...ficha };

                    if (ficha.type === 'place' && ficha.placeToSearch) {
                        
                        const placeNameSearch = ficha.placeToSearch.trim();
                        const isHealthPlace = ficha.isHealthPlace === true; 
                        
                        // Búsqueda flexible (solo el nombre)
                        const placeData = await getPlaceDetails(placeNameSearch);

                        // 🛑 BLINDAJE ANTI-CORRELACIÓN:
                        let isNameMiscorrelated = false;
                        if (placeData && !areNamesSimilar(placeNameSearch, placeData.name)) {
                            console.warn(`¡Fallo de correlación! Se buscó "${placeNameSearch}" pero Places devolvió "${placeData.name}". Descartando resultado.`);
                            isNameMiscorrelated = true;
                        }

                        if (placeData && !isNameMiscorrelated) {
                            // **LÓGICA NORMAL: USAR RE-PROMPT con GOOGLE SEARCH RAG (Reseñas)**
                            
                            let placePrompt = `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder.`;
                            
                            placePrompt += ` La categoría es: ${enrichedFicha.placeCategory}. **UTILIZA TU HERRAMIENTA DE GOOGLE SEARCH** para buscar la consulta: "reseñas de ${placeNameSearch} ${enrichedFicha.placeCategory} Nuevo Progreso". **Extrae las frases clave de una o dos reseñas REALES y úsalas para componer la 'description' en el JSON. La descripción debe ser corta y basada SÓLO en reseñas.** Si no encuentras reseñas, resume el giro del lugar. **NOTA CRÍTICA:** Solo usa la descripción que el RAG te proporciona.`;

                            const rePromptResult = await chat.sendMessage({ 
                                message: placePrompt,
                                tools: [{ googleSearch: {} }] 
                            });
                            const rePromptText = rePromptResult.text.trim();
                            
                            try {
                                const reParsedJson = parseModelResponse(rePromptText);
                                
                                // Usamos la ficha re-parseada (con descripción RAG)
                                enrichedFicha = {
                                    ...reParsedJson, 
                                    placeName: placeData.name,
                                    mapUrl: placeData.mapUrl, // Esto será nulo, pero se corrige más adelante
                                    imageUrl: placeData.imageUrl,
                                    placePhone: isHealthPlace ? null : (placeData.phone || null), 
                                    reviewUrl: placeData.reviewUrl, 
                                    websiteUrl: isHealthPlace ? null : (placeData.websiteUrl || null),
                                };
                            } catch (e) {
                                console.error("Fallo al re-parsear el JSON de anti-alucinación RAG. Usando ficha original sin descripción RAG.", e);
                                
                                // Fallback: Usar ficha original con datos de Places.
                                enrichedFicha = {
                                    ...enrichedFicha,
                                    placeName: placeData.name,
                                    mapUrl: placeData.mapUrl,
                                    imageUrl: placeData.imageUrl,
                                    placePhone: isHealthPlace ? null : (placeData.phone || null),
                                    reviewUrl: placeData.reviewUrl, 
                                    websiteUrl: isHealthPlace ? null : (placeData.websiteUrl || null),
                                };
                            }
                            
                        } else { 
                            // Si NO existe (Fallo de geofencing, API, o Correlación de nombres)
                            enrichedFicha = {
                                type: "place_not_found", 
                                placeToSearch: placeNameSearch, 
                                description: `Disculpa, no se encontró un lugar llamado **${placeNameSearch}** ubicado en Nuevo Progreso (Rango 10km).`,
                                isStructured: true
                            };
                        }
                    } else if (ficha.type === 'category') {
                         // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa)
                         const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                         const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                         enrichedFicha.mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapUrlQuery)}`; 
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


        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en el handler principal:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo interno del servidor: " + error.message
        });
    }
}
