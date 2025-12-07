// ====================================================================
// Archivo: chat.js (Versión 7.1 - MODO BÚSQUEDA DIRECTA con SPS Estricto)
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
// NOTA: GEOGRAPHIC_CONTEXT ya no es crítico para findPlaceFromText con strictBounds
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// 🛑 CRÍTICO SPS: Definición del Viewport (Cercado Geográfico) de Nuevo Progreso
const NE_BOUND = { lat: 26.075, lng: -97.985 }; // Esquina Noreste del área de búsqueda
const SW_BOUND = { lat: 26.050, lng: -98.020 }; // Esquina Suroeste del área de búsqueda

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
// NOTA: Se asume que las claves se configuran correctamente en el entorno Vercel.
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
 * 🛑 Aplica Georreferenciación Estricta y Lógica de Confidencialidad.
 * @param {string} queryOrPlaceId Nombre del lugar o Place ID.
 * @returns {object|null} Objeto con detalles del lugar o null.
 */
async function getFullPlaceDetails(queryOrPlaceId) { 
    if (!placesApiKey) return null;
    
    let placeId = queryOrPlaceId;

    // A) Si no parece un Place ID, lo buscamos por texto (con georreferenciación estricta)
    if (!queryOrPlaceId.startsWith('ChI')) {
        try {
            console.log(`Buscando Place ID (SPS Estricto) para: ${queryOrPlaceId}`);
            
            // 🛑 IMPLEMENTACIÓN CRÍTICA: Georreferenciación Estricta
            const findPlaceResponse = await placesClient.findPlaceFromText({
                params: {
                    key: placesApiKey,
                    input: queryOrPlaceId, // Eliminamos GEOGRAPHIC_CONTEXT aquí
                    inputtype: PlaceInputType.textquery, // Usamos la constante importada
                    fields: ['place_id'], 
                    // locationBias con formato 'rectangle:swLat,swLng|neLat,neLng'
                    locationBias: `rectangle:${SW_BOUND.lat},${SW_BOUND.lng}|${NE_BOUND.lat},${NE_BOUND.lng}`, 
                    strictBounds: true, // 🛑 CRÍTICO: Fuerza a buscar SOLO dentro del rectángulo
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
        console.log("No se encontró Place ID dentro de Nuevo Progreso o la búsqueda falló.");
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

// Función auxiliar (más sencilla) para el modo Gemini (solo necesita ID/Imagen)
async function getPlaceDetails(query) { 
    // [Se recomienda actualizar esta función también con locationBias y strictBounds si Gemini la usa.]
    if (!placesApiKey) return null;
    
    const LOCATION_BIAS = { lat: 26.064, lng: -98.005 };
    let placeId = query;

    // Asumimos que esta función es llamada con el nombre del lugar
    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query, 
                inputtype: PlaceInputType.textquery,
                fields: ['place_id'], 
                locationBias: `rectangle:${SW_BOUND.lat},${SW_BOUND.lng}|${NE_BOUND.lat},${NE_BOUND.lng}`, 
                strictBounds: true, 
                language: 'es'
            }
        });
        placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
    } catch (e) {
        console.error("Error buscando Place ID en Modo Gemini:", e.message);
        return null;
    }
    
    // El resto de la función para obtener detalles del lugar sigue aquí...
    // ...
    return { 
        /* ... datos simplificados ... */ 
        isHealthPlace: false // Placeholder, la lógica de salud se hace en getFullPlaceDetails
    };
}

// Función auxiliar para pedir el nombre a Gemini (Se mantiene igual)
async function getPlaceNameFromAI(userPrompt, history) {
    // ...
}

// Función de utilidad para verificar similitud de nombres (Anti-Correlación) (Se mantiene igual)
function areNamesSimilar(searchName, returnedName) {
    // ...
}

// Función de utilidad para parsear el JSON de la respuesta del modelo (Se mantiene igual)
function parseModelResponse(responseText) {
    // ...
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
            
            // 🛑 Esta función ahora contiene el SPS Estricto y Confidencialidad
            const placeData = await getFullPlaceDetails(directSearchQuery); 
            
            if (placeData) {
                // Generar un JSON de Ficha de Lugar con todos los detalles
                const finalFicha = {
                    type: "place",
                    placeName: placeData.name,
                    placeToSearch: placeData.name,
                    placeCategory: placeData.placeCategory,
                    isHealthPlace: placeData.isHealthPlace, 
                    description: `📍 Dirección: ${placeData.formatted_address}. Encontrado vía búsqueda directa de Google Places.`, // Descripción simple y directa
                    isStructured: true,
                    // Datos enriquecidos (Teléfono y Web ya vienen filtrados por confidencialidad)
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
                    description: `No se pudo encontrar o recuperar detalles completos para el lugar: **${directSearchQuery}** en **Nuevo Progreso**. Por favor, verifica el nombre o intenta con el modo chat. 📍`,
                    isStructured: true
                };
                return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA DE CHAT NORMAL (GEMINI/RAG/CANÓNICO)
        // ----------------------------------------------------
        
        // [El resto de la lógica de la Versión 6.0 continúa aquí, sin cambios]
        
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 
        const placeNameFromAI = await getPlaceNameFromAI(userPrompt, history);
        
        // A. Verificar excepciones fijas (Yomis, Pinkys)
        // ...
        
        // B. Verificar en el Catálogo de Dentistas (usando el nombre identificado por AI)
        // ...

        if (forcedCanonicalResponse) {
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }
        
        // C. Lógica de Categorías (Forzar JSON)
        // ...
        
        // D. Llamada a Gemini y Enriquecimiento
        let promptToSend = userPrompt; 
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
        
        // ... [Lógica de Parseo y Reconstrucción del JSON (usando getPlaceDetails)] ...
        
        let finalResponseData = { responseText: modelResponseText };

        // ... [Fin de la lógica de Chat Normal] ...

        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en el handler principal:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo interno del servidor: " + error.message
        });
    }
}
