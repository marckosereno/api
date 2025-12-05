import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

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

// ⭐️ MAPA DE EXCEPCIONES CON DESCRIPCIONES CANÓNICAS PARA CORREGIR ALUCINACIONES
// Si la alucinación persiste, Gemini DEBE usar la categoría y descripción de aquí.
const EXCEPTION_DATA_MAP = {
    // Nombre exacto a buscar (en minúsculas, sin espacios extra): { category, description }
    'yomis': { 
        category: 'Spa y Masajes', 
        description: 'Yomis es un tranquilo spa especializado en masajes terapéuticos y relajantes para viajeros que buscan un descanso profundo. Ofrece una variedad de tratamientos para el bienestar y la salud.',
    },
    'pinkys': { 
        category: 'Tienda de Ropa y Accesorios', 
        description: 'Pinkys es una tienda de ropa y accesorios que ofrece las últimas tendencias de moda para damas y caballeros, con un enfoque en estilos casuales y de temporada.',
    }, 
};

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// 2. Definimos la Instrucción del Sistema
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones para hacerlas más amigables y atractivas.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". NUNCA debes incluir precios, dar recomendaciones directas, o proporcionar detalles de contacto en la descripción. El servidor se encargará de limitar los botones de acción solo a "Ver en Mapa" y "Buscar en Google" para garantizar el cumplimiento.

---

### PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES

**REGLA CRÍTICA:** Si el usuario pide recomendaciones, sugerencias o un listado de lugares (ej. '4 taquerías', 'dime restaurantes cerca'), DEBES usar el **MODO FICHA DE CATEGORÍA (JSON)** para dar un resumen general de la categoría. NUNCA debes listar lugares específicos o dar sugerencias directas. Tu descripción debe guiar al usuario a usar los botones de acción para que ellos exploren las opciones en el mapa.

---

3. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de un lugar o negocio **específico** (Salud o No Salud). Debe incluir la propiedad 'placeToSearch' con el nombre exacto del lugar.

4. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo para solicitudes de categorías generales O para **CUMPLIR EL PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES**.

5. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales o de seguimiento que no requieran una ficha.

6. Los formatos JSON requeridos son:
   
   // Formato para LUGAR ESPECÍFICO (Salud o No Salud)
   {
     "type": "place", 
     "placeName": "Nombre del Lugar", 
     "placeToSearch": "Nombre Exacto a buscar en Places API, ej: JM Dental Clinic", 
     "placeCategory": "Clasificación general del lugar, ej: Clínica Dental, Restaurante",
     "isHealthPlace": true/false, 
     "description": "Descripción corta de no más de 3 oraciones.",
     "isStructured": true
   }
   
   // Formato para CATEGORÍA GENERAL
   {
     "type": "category", 
     "categoryName": "Nombre de la Categoría, ej: Taquerías en Progreso",
     "description": "Resumen de la categoría en Progreso. Debes incluir una frase como: 'Usa el botón de 'Ver en Mapa' para explorar todas las opciones y elegir el lugar que más te interese. 🗺️'",
     "isStructured": true
   }

   // FORMATO DE FALLO: Si la búsqueda local falla (el servidor lo generará si no encuentra el lugar)
   {
     "type": "place_not_found", 
     "placeToSearch": "Nombre del Lugar No Encontrado", 
     "description": "El servidor generó este mensaje: El lugar no se encontró en Nuevo Progreso. 📍",
     "isStructured": true
   }
   
   // REGLA CLAVE: Si la respuesta requiere MÚLTIPLES FICHAS, debes envolver todas las fichas en un array y añadir la propiedad "isMultiStructured": true.
   // Ejemplo para múltiples categorías (la respuesta al usuario debe ser el JSON completo, texto conversacional opcional):
   {
     "isMultiStructured": true,
     "response": [
       { "type": "category", "categoryName": "Dentistas en Progreso", "description": "...", "isStructured": true },
       { "type": "category", "categoryName": "Oculistas en Progreso", "description": "...", "isStructured": true }
     ],
     "conversationText": "Hola, encontré varias opciones para ti:"
   }
   
   // El texto conversacional siempre debe ir ANTES o DESPUÉS de cualquier bloque JSON.`;


/**
 * Función que busca el nombre de un lugar en la API de Google Places.
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
            console.log("No se encontró un place_id cerca de Nuevo Progreso.");
            return null;
        }

        // 2. Obtener los detalles del lugar
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'reviews', 'website', 'photos', 'formatted_address', 'editorial_summary'] 
            }
        });

        const place = detailsResponse.data.result;
        
        // 🛑 VALIDACIÓN GEOFENCING FLEXIBLE: Debe contener 'Progreso' o 'Río Bravo'
        const address = place.formatted_address ? place.formatted_address.toLowerCase() : '';
        
        if (!address.includes('progreso') && !address.includes('río bravo')) {
            console.log(`Fallo de geofencing flexible: Dirección (${address}) no incluye "Progreso" o "Río Bravo".`);
            return null; 
        }
        
        // 3. Generar la URL de la foto y obtener el resumen editorial
        const photoReference = place.photos?.[0]?.photo_reference || null;
        let imageUrl = null;

        if (photoReference) {
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=250&photoreference=${photoReference}&key=${placesApiKey}`;
        }

        let editorialSummary = place.editorial_summary?.overview || null;
        
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null,
            websiteUrl: place.websiteUrl || null,
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
                            
                            const placeData = await getPlaceDetails(placeNameSearch);

                            if (placeData) {
                                
                                // 🛑 APLICAR CORRECCIÓN DE EXCEPCIÓN AL JSON INICIAL Y DATOS
                                const exceptionName = placeNameSearch.toLowerCase().replace(/\s/g, '');
                                let toolsToUse = [{ googleSearch: {} }]; // Por defecto, usamos la búsqueda

                                if (EXCEPTION_DATA_MAP[exceptionName]) {
                                    const exception = EXCEPTION_DATA_MAP[exceptionName];
                                    
                                    // 1. CORREGIR CATEGORÍA DEL JSON INICIAL (enrichedFicha)
                                    enrichedFicha.placeCategory = exception.category;
                                    
                                    // 2. FORZAR LA DESCRIPCIÓN CANÓNICA EN LOS DATOS DE PLACES
                                    placeData.editorialSummary = exception.description; 
                                    
                                    toolsToUse = []; // <--- DESACTIVAMOS EXPLÍCITAMENTE LAS HERRAMIENTAS
                                    console.log(`Excepción CANÓNICA aplicada y Forzada: ${placeNameSearch} a ${enrichedFicha.placeCategory}`);
                                }
                                
                                // ⭐️ PASO ANTI-ALUCINACIÓN: FORZAR A GEMINI A USAR LA DESCRIPCIÓN CORRECTA
                                let placePrompt = `El usuario preguntó por "${placeNameSearch}". Genera el JSON de FICHA DE LUGAR para responder.`;
                                
                                if (placeData.editorialSummary) {
                                    // Usa la descripción de Places API (que ahora podría ser la canónica forzada)
                                    // Le pasamos la categoría corregida y la descripción forzada/real.
                                    placePrompt += ` La categoría es: ${enrichedFicha.placeCategory}. La información de giro y descripción obtenida es: "${placeData.editorialSummary}". DEBES usar esta información para crear la 'description' en el JSON.`;
                                } else {
                                    // Caso de fallo total sin excepción, forzamos la búsqueda.
                                    placePrompt += ` No tenemos una descripción editorial. La categoría es: ${enrichedFicha.placeCategory}. Usa **tu herramienta de Google Search** para buscar el **giro y descripción** de "${placeNameSearch} Nuevo Progreso" y luego usa esa información para crear la 'description' del JSON.`;
                                }

                                // 🛑 RE-PROMPT A GEMINI PARA GENERAR LA FICHA ENRIQUECIDA (¡CON HERRAMIENTAS CONTROLADAS!)
                                const rePromptResult = await chat.sendMessage({ 
                                    message: placePrompt,
                                    tools: toolsToUse // Usar las herramientas controladas (vacías si hay excepción)
                                });
                                const rePromptText = rePromptResult.text.trim();
                                
                                try {
                                    // Intentamos parsear la respuesta (solo el JSON)
                                    const reParsedJson = JSON.parse(rePromptText.substring(rePromptText.indexOf('{'), rePromptText.lastIndexOf('}') + 1));
                                    
                                    // Usamos la ficha re-parseada
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
