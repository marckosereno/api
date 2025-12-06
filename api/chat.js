// Archivo: chat.js (Versión 7.0 - MODO BÚSQUEDA DIRECTA e Interceptación de API)

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js'; 
import { createRequire } from 'module'; 

// 🟢 CRÍTICO: Inicializa la función 'require' localmente para entornos ESM.
const require = createRequire(import.meta.url); 

// --- Variables Globales ---
let DENTIST_CATALOG = {}; 
let CATALOG_LOADED = false;
const JSON_FILE_PATH = './dentists_data.json'; 

const MODEL_NAME = "gemini-2.5-flash"; 
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

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


// 2. Definimos la Instrucción del Sistema (Se mantiene igual, solo para el modo Gemini)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
// ... [Instrucciones del sistema completas, omitidas por espacio, pero se usan las de la v6.0] ...
REGLA CLAVE: Si la respuesta requiere MÚLTIPLES FICHAS, debes envolver todas las fichas en un array y añadir la propiedad "isMultiStructured": true.
// ...`;


// =================================================================
// 3. FUNCIONES DE UTILIDAD Y API DE PLACES
// =================================================================

/**
 * Función que busca en el Catálogo de Dentistas con tolerancia.
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
 * 🟢 NUEVA FUNCIÓN: Obtiene detalles completos de un lugar usando Places API.
 * Se usa para el MODO BÚSQUEDA DIRECTA.
 * @param {string} queryOrPlaceId Nombre del lugar o Place ID.
 * @returns {object|null} Objeto con detalles del lugar o null.
 */
async function getFullPlaceDetails(queryOrPlaceId) { 
    if (!placesApiKey) return null;
    
    const LOCATION_BIAS = { lat: 26.064, lng: -98.005 };
    let placeId = queryOrPlaceId;

    // Si no parece un Place ID (ej. 'ChIJ...') asumimos que es un query de texto
    if (!queryOrPlaceId.startsWith('ChI')) {
        try {
            const findPlaceResponse = await placesClient.findPlaceFromText({
                params: {
                    key: placesApiKey,
                    input: queryOrPlaceId + GEOGRAPHIC_CONTEXT, 
                    inputtype: 'textquery',
                    fields: ['place_id'], 
                    locationBias: `point:${LOCATION_BIAS.lat},${LOCATION_BIAS.lng}` 
                }
            });
            placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        } catch (e) {
            console.error("Error buscando Place ID en Búsqueda Directa:", e.message);
            return null;
        }
    }
    
    if (!placeId) return null;

    try {
        // Obtenemos un set de campos más amplio para la búsqueda directa
        const fields = ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address', 'geometry', 'types'];
        
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: fields 
            }
        });

        const place = detailsResponse.data.result;
        const photoReference = place.photos?.[0]?.photo_reference || null;
        
        let imageUrl = photoReference 
            ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=350&photoreference=${photoReference}&key=${placesApiKey}`
            : null;

        // Clasificación heurística (simple) de salud basada en tipos de Places
        const isHealth = place.types.some(t => ['dentist', 'doctor', 'physiotherapist', 'pharmacy', 'hospital'].includes(t));

        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null, 
            websiteUrl: place.website || null,
            imageUrl: imageUrl,
            formatted_address: place.formatted_address,
            latitude: place.geometry.location.lat,
            longitude: place.geometry.location.lng,
            placeCategory: place.types[0] || 'Lugar de Interés',
            isHealthPlace: isHealth
        };

    } catch (e) {
        console.error("Error al obtener detalles de Place ID:", e.response ? e.response.data : e.message);
        return null; 
    }
}

// Función auxiliar (más sencilla) para el modo Gemini (solo necesita ID/Imagen)
async function getPlaceDetails(query) { 
    // [Se mantiene la función original getPlaceDetails de la v6.0 aquí, omitida por espacio]
    // ...
}

// Función auxiliar para pedir el nombre a Gemini
async function getPlaceNameFromAI(userPrompt, history) {
    // [Se mantiene la función original getPlaceNameFromAI de la v6.0 aquí, omitida por espacio]
    // ...
}

// Función de utilidad para verificar similitud de nombres (Anti-Correlación)
function areNamesSimilar(searchName, returnedName) {
    // [Se mantiene la función original areNamesSimilar de la v6.0 aquí, omitida por espacio]
    // ...
}

// Función de utilidad para parsear el JSON de la respuesta del modelo
function parseModelResponse(responseText) {
    // [Se mantiene la función original parseModelResponse de la v6.0 aquí, omitida por espacio]
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
        // 🟢 NUEVA PROPIEDAD: directSearchQuery (lugar, nombre exacto o place_id)
        const { history = [], userPrompt, currentLanguage = 'es', directSearchQuery } = req.body;
        
        // ----------------------------------------------------
        // 🥇 PRIORIDAD MÁXIMA: MODO BÚSQUEDA DIRECTA (Power Search)
        // ----------------------------------------------------
        if (directSearchQuery) {
            console.log(`⭐ Activado MODO BÚSQUEDA DIRECTA para: ${directSearchQuery}`);
            
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
                    // Datos enriquecidos
                    placePhone: placeData.isHealthPlace ? null : placeData.phone, // Ocultar teléfono para salud
                    mapUrl: placeData.mapUrl,
                    imageUrl: placeData.imageUrl,
                    reviewUrl: placeData.reviewUrl,
                    websiteUrl: placeData.isHealthPlace ? null : placeData.websiteUrl, // Ocultar web para salud
                    latitude: placeData.latitude,
                    longitude: placeData.longitude,
                };
                return res.status(200).json({ responseText: JSON.stringify(finalFicha) });
            } else {
                // Fallo en la búsqueda directa
                const failedFicha = {
                    type: "place_not_found", 
                    placeToSearch: directSearchQuery, 
                    description: `No se pudo encontrar o recuperar detalles completos para el lugar: **${directSearchQuery}** en Nuevo Progreso. Intenta nuevamente o usa el modo chat. 📍`,
                    isStructured: true
                };
                return res.status(200).json({ responseText: JSON.stringify(failedFicha) });
            }
        }


        // ----------------------------------------------------
        // ⭐️ LÓGICA DE CHAT NORMAL (GEMINI/RAG/CANÓNICO)
        // ----------------------------------------------------
        
        // [El resto de la lógica de la Versión 6.0 continúa aquí, omitida por espacio]
        // ... (Lógica de Blindaje Canónico, Excepciones, Catálogo Local, Lógica de Categorías y Re-Prompt RAG)
        
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 
        const placeNameFromAI = await getPlaceNameFromAI(userPrompt, history);
        
        // A. Verificar excepciones fijas (Yomis, Pinkys)
        // ... [Lógica de Excepciones] ...
        
        // B. Verificar en el Catálogo de Dentistas (usando el nombre identificado por AI)
        // ... [Lógica de Catálogo Local] ...

        if (forcedCanonicalResponse) {
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }
        
        // C. Lógica de Categorías (Forzar JSON)
        // ... [Lógica de Categorías] ...
        
        // D. Llamada a Gemini y Enriquecimiento
        // ... [Llamada a Gemini, Parseo, Enriquecimiento RAG/Places API] ...
        
        
        let promptToSend = userPrompt; // Placeholder para la lógica de categorías, etc.
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
        
        // ... [Lógica de Parseo y Enriquecimiento de Fichas (usando getPlaceDetails)] ...
        
        let finalResponseData = { responseText: modelResponseText };

        // ... [Lógica de Parseo y Reconstrucción del JSON (usando getPlaceDetails)] ...

        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en el handler principal:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo interno del servidor: " + error.message
        });
    }
}
