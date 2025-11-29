import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';
import * as fs from 'fs/promises';
import path from 'path';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// 2. Definimos la Instrucción del Sistema MODIFICADA
// Se añaden reglas para la recomendación local y exclusión de salud.
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones para hacerlas más amigables y atractivas.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". NUNCA debes incluir precios, dar recomendaciones directas, o proporcionar detalles de contacto en la descripción. El servidor se encargará de limitar los botones de acción solo a "Ver en Mapa" y "Buscar en Google" para garantizar el cumplimiento.

---

### PROTOCOLO DE RECOMENDACIÓN LOCAL

Si el usuario pide recomendaciones, sugerencias o un listado de lugares (ej. '4 taquerías', 'dime restaurantes cerca'):
a) **EXCLUSIÓN DE SALUD:** NUNCA incluyas lugares de salud o estética en estas recomendaciones de listado.
b) **FORMATO:** Debes usar el MODO CONVERSACIONAL (Texto Plano).
c) **CIERRE REQUERIDO:** Tu respuesta debe terminar con un mensaje que diga que encontraste 'X' lugares, pero que hay muchísimos más, y que para ver la lista completa, debe usar el botón en la interfaz.

Ejemplo de Cierre (Español): "Encontré X lugares, ¡pero hay muchísimos más! Para explorar la lista completa, por favor, selecciona el botón 'Ver todos los lugares'."

---

3. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de un lugar o negocio específico (Salud o No Salud). Debe incluir la propiedad 'placeToSearch' con el nombre exacto del lugar.

4. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo para solicitudes de categorías generales (Salud o No Salud).

5. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales, de seguimiento O para CUMPLIR EL PROTOCOLO DE RECOMENDACIÓN LOCAL.

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
     "categoryName": "Nombre de la Categoría, ej: Farmacias en Progreso",
     "description": "Resumen de la categoría en Progreso, finaliza con: 'Aquí te muestro todo lo relacionado a esta categoría.'",
     "isStructured": true
   }`;

/**
 * Carga y devuelve los datos de progreso, filtrando los de salud.
 * @returns {Array<object>} Lista de lugares no relacionados con salud.
 */
async function getProgresoData() {
    try {
        const filePath = path.join(process.cwd(), 'progreso_data.json');
        const fileContent = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(fileContent);

        // Filtro estricto de lugares relacionados con la salud para las recomendaciones
        return data.filter(place => 
            !place.isHealthPlace && 
            !['Óptica', 'Farmacia', 'Clínica', 'Dentista', 'Estética', 'Spa', 'Salud'].some(category => place.placeCategory.includes(category))
        );
    } catch (e) {
        console.error("Error al cargar o parsear progreso_data.json:", e);
        return [];
    }
}

/**
 * Busca lugares en la data local que coincidan con la categoría solicitada.
 * @param {string} category Categoría a buscar (ej: "taquería", "restaurante").
 * @param {number} count Número máximo de resultados.
 * @param {Array<object>} localData Datos locales filtrados (sin salud).
 * @returns {Array<object>} Lugares encontrados.
 */
function findLocalRecommendations(category, count, localData) {
    const matchingPlaces = localData.filter(place => 
        place.placeCategory.toLowerCase().includes(category.toLowerCase()) || 
        place.placeName.toLowerCase().includes(category.toLowerCase())
    );
    // Devuelve los primeros 'count' o todos si hay menos
    return matchingPlaces.slice(0, count);
}


/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * @param {string} query Nombre del lugar a buscar.
 * @returns {object|null} Objeto con detalles del lugar o null si falla.
 */
async function getPlaceDetails(query) {
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // 1. Buscar el place_id
    try {
        const findPlaceResponse = await placesClient.findPlaceFromText({
            params: {
                key: placesApiKey,
                input: query + ", Nuevo Progreso Tamps, México",
                inputtype: 'textquery',
                fields: ['place_id']
            }
        });

        const placeId = findPlaceResponse.data.candidates?.[0]?.place_id;
        
        if (!placeId) {
            console.log("No se encontró un place_id para la consulta:", query);
            return null;
        }

        // 2. Obtener los detalles del lugar (teléfono, URL, reseñas)
        const detailsResponse = await placesClient.placeDetails({
            params: {
                key: placesApiKey,
                place_id: placeId,
                fields: ['name', 'formatted_phone_number', 'url', 'reviews'] 
            }
        });

        const place = detailsResponse.data.result;
        
        return {
            name: place.name,
            phone: place.formatted_phone_number || null,
            mapUrl: place.url || null,
            reviewUrl: place.url || null 
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

        // LÓGICA DE INTERCEPTACIÓN Y PRIORIDAD LOCAL
        let promptToSend = userPrompt;

        // Patrón para detectar solicitudes de listado/recomendación (ej: "4 taquerías", "dame restaurantes")
        // No es perfecto, pero ayuda a identificar intenciones de listado.
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|bar|lugar|farmacia|óptica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            
            // 1. Intentamos leer la data local (sin salud)
            const localData = await getProgresoData();
            
            if (localData.length > 0) {
                // 2. Extraemos el conteo y la categoría
                const countMatch = match[2];
                const count = countMatch ? (isNaN(parseInt(countMatch)) ? 4 : parseInt(countMatch)) : 4; // Si dice "unos cuantos" o nada, usamos 4
                const category = match[3] || 'lugar';

                // 3. Buscamos en la data local (ya filtrada de salud)
                const recommendations = findLocalRecommendations(category, count, localData);
                const recommendationNames = recommendations.map(r => r.placeName);
                
                if (recommendationNames.length > 0) {
                    
                    // 4. SOBRESCRIBIMOS el prompt para FORZAR el MODO CONVERSACIONAL (texto plano)
                    const listText = recommendationNames.join(', ');
                    const foundCount = recommendationNames.length;
                    
                    // Construimos el nuevo prompt de instrucción para Gemini
                    promptToSend = `El usuario pidió una recomendación de ${count} lugares (${category}). Nuestra lista local ya pre-filtrada de salud encontró ${foundCount} lugares: ${listText}. Genera una respuesta AMIGABLE en modo conversacional (TEXTO PLANO) usando estos lugares. Tu respuesta DEBE TERMINAR con el cierre del protocolo de recomendación local (mencionando que encontraste ${foundCount} lugares y la instrucción de "Ver todos los lugares"). NO uses el formato JSON estructurado.`;
                    
                    console.log("PROTOCOLO LOCAL ACTIVADO. Nuevo prompt a Gemini:", promptToSend);
                }
            }
        }
        // FIN DE LÓGICA DE INTERCEPTACIÓN Y PRIORIDAD LOCAL


        // Inicializar el chat con el historial y la instrucción de sistema
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history 
        });

        // Enviamos el nuevo mensaje (original o modificado por el protocolo local) al modelo
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

                if (parsedJson.isStructured === true) {
                    
                    if (parsedJson.type === 'place' && parsedJson.placeToSearch) {
                        
                        const placeNameSearch = parsedJson.placeToSearch.trim();
                        // Utilizamos el nuevo flag booleano para la regla de salud
                        const isHealthPlace = parsedJson.isHealthPlace === true; 

                        // **** REGLA DE SALUD DINÁMICA: Bloqueo de Enriquecimiento ****
                        if (isHealthPlace) {
                            // SI ES SALUD: Bloqueamos el enriquecimiento de Places API (teléfono, reseñas)
                            console.log(`Regla de Salud Dinámica Aplicada: Bloqueando enriquecimiento Places para ${placeNameSearch}`);
                            
                            // Aseguramos que los campos sensibles estén nulos para que el frontend los ignore
                            // Usamos el nombre del lugar para generar la URL de búsqueda básica en Google Maps/Search.
                            const baseMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeNameSearch + " Nuevo Progreso Tamps")}`;

                            finalResponseData.responseText = JSON.stringify({
                                ...parsedJson,
                                placePhone: null, // Bloqueado
                                reviewUrl: null,   // Bloqueado
                                mapUrl: baseMapUrl // URL de búsqueda básica
                            });

                        } else {
                            // SI NO ES SALUD: Procedemos con el enriquecimiento normal (todos los botones).
                            const placeData = await getPlaceDetails(placeNameSearch);

                            if (placeData) {
                                // Enriquecemos con datos reales de Places
                                finalResponseData.responseText = JSON.stringify({
                                    ...parsedJson,
                                    placeName: placeData.name,
                                    placePhone: placeData.phone,
                                    mapUrl: placeData.mapUrl,
                                    reviewUrl: placeData.reviewUrl, 
                                });
                            } else {
                                // Si falla Places, al menos eliminamos placeToSearch para evitar confusiones
                                delete parsedJson.placeToSearch;
                                finalResponseData.responseText = JSON.stringify(parsedJson);
                            }
                        }
                        // **** FIN DE REGLA DE SALUD DINÁMICA ****
                        
                    } else if (parsedJson.type === 'category') {
                        // Si es una categoría, solo aseguramos que el JSON es válido y lo pasamos.
                        finalResponseData.responseText = JSON.stringify(parsedJson);
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
