// Archivo: chat.js (Versión Definitiva 4.0 - Búsqueda Tolerante y Enriquecimiento de Imagen)

import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js'; 
import { createRequire } from 'module'; 

const require = createRequire(import.meta.url); 

// 🛑 SOLUCIÓN CRÍTICA: Carga estática y síncrona del JSON usando el 'require' local.
const DENTIST_CATALOG = require('./dentists_data.json'); 
const CATALOG_LOADED = true; 
console.log(`✅ Catálogo de Dentistas cargado estáticamente: ${DENTIST_CATALOG.length} entradas.`);

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// CONTEXTO GEOGRÁFICO FIJO
const GEOGRAPHIC_CONTEXT = ", Nuevo Progreso, Tamaulipas, México";

// ⭐️ MAPA DE EXCEPCIONES Y CACHÉ LOCAL
const EXCEPTION_DATA_MAP = {
    'yomis': { 
        category: 'Spa y Masajes', 
        description: 'Yomis es un tranquilo spa especializado en masajes terapéuticos y relajantes para viajeros que buscan un descanso profundo. Ofrece una variedad de tratamientos para el bienestar y la salud.',
        searchName: 'Yomis Spa' 
    },
    'pinkys': { 
        category: 'Tienda de Ropa y Accesorios', 
        description: 'Pinkys es una tienda de ropa y accesorios que ofrece las últimas tendencias de moda de moda para damas y caballeros, con un enfoque en estilos casuales y de temporada.',
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
 * Función de búsqueda en el JSON local (Catálogo de Dentistas) con tolerancia.
 * @param {string} query Nombre del lugar a buscar (ej: "Dr. Juarez").
 * @returns {object|null} Detalles completos del JSON o null.
 */
function searchLocalCatalog(query) {
    if (!CATALOG_LOADED) return null;
    
    // Normalización de la búsqueda
    const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    // Si la consulta es demasiado corta después de la normalización, regresamos null (para evitar falsos positivos)
    if (normalizedQuery.length < 3) return null; 

    for (const dentist of DENTIST_CATALOG) {
        // Normaliza el nombre del dentista en el JSON
        const normalizedName = dentist.name.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        
        // 1. Coincidencia exacta
        if (normalizedName === normalizedQuery) {
            return { 
                name: dentist.name,
                phone: dentist.phone || null,
                mapUrl: dentist.google_url || null,
                websiteUrl: dentist.website || null,
                description: dentist.description_summary || 'Clínica dental verificada en Nuevo Progreso.',
                latitude: dentist.latitude,
                longitude: dentist.longitude,
                isHealthPlace: true 
            };
        }

        // 2. Coincidencia por inclusión (si la consulta incluye el nombre completo o viceversa)
        if (normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName)) {
            return { 
                name: dentist.name,
                phone: dentist.phone || null,
                mapUrl: dentist.google_url || null,
                websiteUrl: dentist.website || null,
                description: dentist.description_summary || 'Clínica dental verificada en Nuevo Progreso.',
                latitude: dentist.latitude,
                longitude: dentist.longitude,
                isHealthPlace: true 
            };
        }
        
        // 3. Coincidencia por palabra clave (útil para buscar por apellido o fragmento)
        const queryWords = normalizedQuery.split(/\s+/).filter(word => word.length > 2);
        const nameWords = normalizedName.split(/\s+/).filter(word => word.length > 2);
        
        // Si cualquier palabra clave (de más de 2 letras) de la búsqueda coincide con una del nombre
        const commonWord = queryWords.some(qWord => 
            nameWords.some(nWord => nWord.includes(qWord))
        );

        if (commonWord) {
             return { 
                name: dentist.name,
                phone: dentist.phone || null,
                mapUrl: dentist.google_url || null,
                websiteUrl: dentist.website || null,
                description: dentist.description_summary || 'Clínica dental verificada en Nuevo Progreso.',
                latitude: dentist.latitude,
                longitude: dentist.longitude,
                isHealthPlace: true 
            };
        }
    }
    return null; // No encontrado en el catálogo local
}

/**
 * Función que busca el nombre de un lugar en la API de Google Places (Plan B / Enriquecimiento de imagen).
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si NO existe el lugar exacto.
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
            return null;
        }

        // 2. Obtener los detalles del lugar (SOLO CAMPOS BÁSICOS)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'website', 'photos', 'formatted_address'] 
            }
        });

        const place = detailsResponse.data.result;
        
        // 3. Generar la URL de la foto
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;

        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

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
        
        if (name && name !== "CATEGORY_REQUEST" && name.length < 50) {
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
    return s2.includes(s1) || s1.includes(s2) || s1 === s2;
}


export default async function handler(req, res) {
    
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage } = req.body;
        
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // ----------------------------------------------------
        // ⭐️ LÓGICA DE BLINDAJE CANÓNICO Y DENTISTAS (PRIORIDAD AL SERVIDOR)
        // ----------------------------------------------------
        let forcedCanonicalResponse = null; 
        const promptSearchKey = userPrompt.toLowerCase().replace(/\s/g, ''); 

        // 1. Verificar excepciones fijas (Yomis, Pinkys)
        for (const [key, exceptionData] of Object.entries(EXCEPTION_DATA_MAP)) {
            if (promptSearchKey.includes(key)) {
                
                console.log(`Interceptación CANÓNICA forzada para: ${key}`);
                
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
        
        // 2. Verificar en el Catálogo de Dentistas (Con Búsqueda Tolerante)
        if (!forcedCanonicalResponse) {
             const placeNameFromAI = await getPlaceNameFromAI(userPrompt, history);

             if (placeNameFromAI) {
                 const localData = searchLocalCatalog(placeNameFromAI);
                 
                 if (localData) {
                    console.log(`Interceptación LOCAL (Dentista) forzada para: ${localData.name} con búsqueda: ${placeNameFromAI}`);
                    
                    // 🟢 ENRIQUECIMIENTO: Llama a Places API SOLO para obtener la imagen
                    // Nota: Usamos localData.name para la búsqueda de imagen, que es el nombre canónico del JSON.
                    const placeDataForImage = await getPlaceDetails(localData.name);
                    
                    forcedCanonicalResponse = {
                        type: "place", 
                        placeName: localData.name, 
                        placeToSearch: localData.name,
                        placeCategory: 'Clínica Dental',
                        isHealthPlace: localData.isHealthPlace,
                        description: localData.description, 
                        isStructured: true,
                        // Datos del JSON
                        placePhone: localData.phone,
                        mapUrl: localData.mapUrl,
                        websiteUrl: localData.websiteUrl,
                        // 🟢 AGREGADO: Imagen de Places API
                        imageUrl: placeDataForImage?.imageUrl || null, 
                        latitude: localData.latitude, 
                        longitude: localData.longitude
                    };
                 }
             }
        }
        
        if (forcedCanonicalResponse) {
            return res.status(200).json({ responseText: JSON.stringify(forcedCanonicalResponse) });
        }

        // ----------------------------------------------------
        // ⭐️ LÓGICA NORMAL (GEMINI + RAG de Reseñas) - PLAN B
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
                            const isHealthPlace = ficha.isHealthPlace === true; 
                            
                            const searchForPlaces = placeNameSearch; 
                            
                            // LLAMADA A LA API DE PLACES (PLAN B para lugares NO dentistas)
                            const placeData = await getPlaceDetails(searchForPlaces);

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
                                    
                                    // Fallback
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
                                // Si NO existe 
                                enrichedFicha = {
                                    type: "place_not_found", 
                                    placeToSearch: placeNameSearch, 
                                    description: `Disculpa, no se encontró un lugar llamado **${placeNameSearch}** ubicado en Nuevo Progreso.`,
                                    isStructured: true
                                };
                            }
                        } else if (ficha.type === 'category') {
                             // ENRIQUECIMIENTO PARA CATEGORÍA (Mapa)
                             
                             const categorySearch = ficha.categoryName.replace(/en Progreso/i, '').trim();
                             const mapUrlQuery = categorySearch + GEOGRAPHIC_CONTEXT;
                             
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
