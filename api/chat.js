import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';
import * as fs from 'fs/promises';
import path from 'path';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 
const MAX_CHAT_RESULTS = 4; // Ya no se usa para lista, sino para el conteo total

// Mapeo de intención de usuario a Secciones de JSON y Query de API de Places
const CATEGORY_MAP = {
    // Patrón de Búsqueda -> { Secciones JSON, Query API de Places (para Google Search) }
    'tacos': {
        sections: ['taquerias_tacos_y_lonches', 'tacos_barbacoa'], 
        apiQuery: 'Taquerías y Tacos en Nuevo Progreso'
    },
    'taqueria': {
        sections: ['taquerias_tacos_y_lonches', 'tacos_barbacoa'], 
        apiQuery: 'Taquerías y Tacos en Nuevo Progreso'
    },
    'barbacoa': {
        sections: ['tacos_barbacoa'], 
        apiQuery: 'Barbacoa y Birria Nuevo Progreso'
    },
    'restaurante': {
        sections: ['restaurantes'], 
        apiQuery: 'Restaurantes en Nuevo Progreso'
    },
    'comer': {
        sections: ['restaurantes'], 
        apiQuery: 'Comida en Nuevo Progreso'
    },
    'artesanias': {
        sections: ['tiendas_artesanias'], 
        apiQuery: 'Tiendas de Artesanías Nuevo Progreso'
    },
    'souvenirs': {
        sections: ['tiendas_artesanias'], 
        apiQuery: 'Tiendas de Souvenirs Nuevo Progreso'
    },
    
    // --- ENTRADAS PARA CHIPS Y COBERTURA DE SALUD/ESTÉTICA ---
    'salud': { 
        sections: ['clinicas_dentales', 'salones_belleza', 'farmacias', 'opticas'], 
        apiQuery: 'Servicios de Salud y Estética en Nuevo Progreso'
    },
    'estetica': { 
        sections: ['clinicas_dentales', 'salones_belleza', 'farmacias', 'opticas'], 
        apiQuery: 'Servicios de Salud y Estética en Nuevo Progreso'
    },
    'dental': { 
        sections: ['clinicas_dentales'], 
        apiQuery: 'Clínicas Dentales en Nuevo Progreso'
    },
    'farmacia': {
        sections: ['farmacias'],
        apiQuery: 'Farmacias en Nuevo Progreso'
    },
    'optica': {
        sections: ['opticas'],
        apiQuery: 'Ópticas en Nuevo Progreso'
    }
};

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new PlacesClient({}); 

// 2. Definimos la Instrucción del Sistema MODIFICADA
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones para hacerlas más amigables y atractivas.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". NUNCA debes incluir precios, dar recomendaciones directas, o proporcionar detalles de contacto en la descripción. El servidor se encargará de limitar los botones de acción solo a "Ver en Mapa" y "Buscar en Google" para garantizar el cumplimiento.

---

### PROTOCOLO DE RECOMENDACIÓN LOCAL

Si el usuario pide recomendaciones, sugerencias o un listado de lugares (ej. '4 taquerías', 'dime restaurantes cerca'):
a) **EXCLUSIÓN DE SALUD:** NUNCA incluyas lugares de salud o estética en estas recomendaciones de listado CONVERSACIONAL.
b) **FORMATO:** Debes usar el MODO CONVERSACIONAL (Texto Plano).
c) **CONVERSACIÓN INICIAL:** Tu respuesta DEBE mencionar UN EJEMPLO DE LUGAR de la categoría solicitada usando el formato conversacional (ej: "¡Claro! 🌮 Si hablamos de taquerías, Taquería Cruz es famosa por sus tacos de bisteck.").
d) **CIERRE REQUERIDO:** Tu respuesta debe terminar con un mensaje que diga que encontraste 'X' lugares, pero que hay muchísimos más, y que para ver la lista completa, debe usar el botón en la interfaz.

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
 * Carga y devuelve los datos de progreso COMPLETO.
 * @returns {Array<object>} Lista de todos los lugares.
 */
async function getProgresoData() {
    try {
        const filePath = path.join(process.cwd(), 'progreso_data.json');
        const fileContent = await fs.readFile(filePath, 'utf-8');
        // El JSON debe ser un array de objetos
        return JSON.parse(fileContent); 
    } catch (e) {
        console.error("Error al cargar o parsear progreso_data.json:", e);
        return [];
    }
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
        let totalResultsCount = 0;
        let apiQueryForChip = null;
        let isLocalRecommendation = false;
        let actionButton = null; // Objeto para el botón de acción rápida

        // Patrón para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|salud|estetica|dental|farmacia|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        if (match) {
            
            // 1. Intentamos leer la data local COMPLETA
            const allLocalData = await getProgresoData();
            
            if (allLocalData.length > 0) {
                
                // 2. Determinar la intención del usuario usando el mapa
                const categoryKeyRaw = match[3].toLowerCase(); 
                
                let categoryKey;
                if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) {
                    categoryKey = 'tacos';
                } else if (categoryKeyRaw.includes('estetica') || categoryKeyRaw.includes('salud')) {
                    categoryKey = 'salud'; 
                } else if (categoryKeyRaw.includes('dental')) {
                    categoryKey = 'dental';
                } else if (categoryKeyRaw.includes('farmacia')) {
                    categoryKey = 'farmacia';
                } else if (categoryKeyRaw.includes('optica')) {
                    categoryKey = 'optica';
                } else {
                    categoryKey = categoryKeyRaw;
                }
                
                const categoryIntent = CATEGORY_MAP[categoryKey];
                
                if (categoryIntent) {
                    
                    // 3. Obtener el conteo total (incluyendo salud, para el botón)
                    const totalFullResults = allLocalData.filter(place => 
                        categoryIntent.sections.includes(place.Section)
                    ).length;

                    // 4. Obtener resultados NO saludables (para la conversación de ejemplo)
                    const nonHealthResults = allLocalData.filter(place => 
                        categoryIntent.sections.includes(place.Section) && place.isHealthPlace === false
                    );
                    
                    isLocalRecommendation = true;
                    apiQueryForChip = categoryIntent.apiQuery;
                    totalResultsCount = totalFullResults;
                    
                    let conversationStart = `¡Claro! ☀️ Nuevo Progreso tiene muchísimos lugares excelentes.`;
                    
                    // LÓGICA CONVERSACIONAL: Intentar dar un ejemplo si existe un lugar NO saludable
                    if (nonHealthResults.length > 0) {
                        
                        // Seleccionar un lugar aleatorio para el ejemplo conversacional
                        const randomIndex = Math.floor(Math.random() * nonHealthResults.length);
                        const randomPlace = nonHealthResults[randomIndex];
                        
                        // Formato del ejemplo a forzar
                        const forcedExample = `Por ejemplo, te puedo contar sobre **${randomPlace.Title}**: ${randomPlace.Description.trim()}`;
                        
                        conversationStart = `¡Claro que sí! 🌮 ${categoryIntent.apiQuery.replace(' en Nuevo Progreso', '').trim()} es un gran atractivo. ${forcedExample}.`;
                        
                    } else if (totalFullResults > 0 && categoryIntent.sections.some(s => ['clinicas_dentales', 'salones_belleza', 'farmacias', 'opticas'].includes(s))) {
                        
                         // Si solo hay salud, forzamos un resumen general sin mencionar nombres
                         conversationStart = `¡Claro! 🦷 En la categoría de ${categoryIntent.apiQuery.replace(' en Nuevo Progreso', '').trim()} (Salud y Estética) hay mucha oferta de alta calidad. `;
                         
                    }
                    
                    // 5. SOBRESCRIBIMOS el prompt para FORZAR el MODO CONVERSACIONAL con el ejemplo y el cierre
                    
                    promptToSend = `El usuario pidió una recomendación de ${categoryIntent.apiQuery}. Tu respuesta DEBE EMPEZAR con un saludo y la siguiente frase conversacional, sin inventar nombres ni cambiar la información del ejemplo (si aplica):
                    
                    --- FRASE FORZADA ---
                    ${conversationStart}
                    --- FIN DE FRASE FORZADA ---
                    
                    Tu respuesta DEBE TERMINAR con el CIERRE REQUERIDO del protocolo de recomendación local (mencionando que encontraste ${totalFullResults} lugares y la instrucción de "Ver todos los lugares"). NO uses el formato JSON estructurado.`;
                    
                    console.log("PROTOCOLO RECOMENDACIÓN ACTIVADO. Total encontrados:", totalFullResults);
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
                        const isHealthPlace = parsedJson.isHealthPlace === true; 

                        // **** REGLA DE SALUD DINÁMICA: Bloqueo de Enriquecimiento ****
                        if (isHealthPlace) {
                            console.log(`Regla de Salud Dinámica Aplicada: Bloqueando enriquecimiento Places para ${placeNameSearch}`);
                            
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
            // Si falla el parseo, la respuesta sigue siendo la original (texto plano)
            finalResponseData.responseText = modelResponseText; 
        }

        // AÑADIR EL actionButton SI EL PROTOCOLO FUE ACTIVADO
        if (isLocalRecommendation && totalResultsCount > 0) {
            actionButton = {
                type: 'showAll',
                query: apiQueryForChip, 
                text: `Ver todos los ${totalResultsCount} lugares`
            };
            finalResponseData.actionButton = actionButton;
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
