import { GoogleGenAI } from '@google/genai';
import { Client as PlacesClient } from '@googlemaps/google-maps-services-js';

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 
// El límite MAX_CHAT_RESULTS ya no es relevante, pero se mantiene para contexto.
// const MAX_CHAT_RESULTS = 4; 

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

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY;
const placesClient = new Client({}); 

// 2. Definimos la Instrucción del Sistema (PROTOCOLO ACTUALIZADO)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -98.005). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}** y **utiliza emojis relevantes** (ej: 🛍️, 🌮, 📍, ☀️) al inicio o final de tus respuestas o descripciones para hacerlas más amigables y atractivas.
2. **REGLA CRÍTICA DE SALUD Y PRIVACIDAD:** Para cualquier lugar o categoría relacionado con la salud (clínicas, farmacias, ópticas, etc.), DEBES establecer el campo "isHealthPlace" en "true". NUNCA debes incluir precios, dar recomendaciones directas, o proporcionar detalles de contacto en la descripción. El servidor se encargará de limitar los botones de acción solo a "Ver en Mapa" y "Buscar en Google" para garantizar el cumplimiento.

---

### PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES (ACTUALIZADO)

**REGLA CRÍTICA:** Si el usuario pide recomendaciones, sugerencias o un listado de lugares, NUNCA debes listar lugares específicos o dar sugerencias directas.

**REGLA DE RESPUESTA:**
1. **Si es una sola categoría:** DEBES usar el MODO FICHA DE CATEGORÍA (JSON).
2. **Si son múltiples categorías (detectadas por el backend):** DEBES usar el **MODO CONVERSACIONAL (Texto Plano)** para la respuesta principal (ej: "Claro, Progreso es conocido por esto y esto... Revisa las categorías específicas que solicitaste a continuación."). **NO** uses NINGÚN JSON estructurado.

---

3. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de un lugar o negocio **específico** (Salud o No Salud). Debe incluir la propiedad 'placeToSearch' con el nombre exacto del lugar.

4. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo para solicitudes de categorías generales O para **CUMPLIR EL PROTOCOLO DE RESTRICCIÓN DE RECOMENDACIONES** para *una sola categoría*.

5. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales, de seguimiento O para CUMPLIR la REGLA DE RESPUESTA (2) para múltiples categorías.

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
   }`;


/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 * (SIN CAMBIOS en esta función)
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

        // LÓGICA DE INTERCEPTACIÓN Y CHIPS DINÁMICOS (ACTUALIZADA)
        let promptToSend = userPrompt;
        let chipMetadata = null; 
        
        // Patrón genérico para detectar solicitudes de listado/recomendación
        const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra).*\\s+(\\d+|unos cuantos)?\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|oculista|optica)s?`, 'i');
        
        const match = userPrompt.match(recommendationPattern);
        
        // --- LÓGICA PARA MÚLTIPLES CATEGORÍAS (CHIPS DINÁMICOS) ---
        let categoriesFound = [];

        const userPromptLower = userPrompt.toLowerCase();
        
        // Detectar Dentista y Oculista/Optica (o combinaciones similares de salud)
        if ((userPromptLower.includes('dentista') || userPromptLower.includes('dental')) && 
            (userPromptLower.includes('oculista') || userPromptLower.includes('optica'))) {
                
            categoriesFound = [
                { label: currentLanguage === 'es' ? "Dentistas 🦷" : "Dentists 🦷", query: currentLanguage === 'es' ? "Categoría Dentistas en Progreso" : "Category Dentists in Progreso" },
                { label: currentLanguage === 'es' ? "Oculistas 👓" : "Opticians 👓", query: currentLanguage === 'es' ? "Categoría Oculistas en Progreso" : "Category Opticians in Progreso" }
            ];
            // Puedes añadir más lógica 'if/else if' aquí para detectar otras combinaciones
        }
        
        if (categoriesFound.length > 1) {
            // PROTOCOLO DE CHIPS DINÁMICOS ACTIVADO
            chipMetadata = {
                isDynamicChips: true,
                chips: categoriesFound
            };
            
            // Sobrescribir el prompt para forzar un texto conversacional amigable
            promptToSend = `El usuario ha solicitado información sobre múltiples categorías: ${categoriesFound.map(c => c.label).join(' y ')}. Responde en MODO CONVERSACIONAL con un saludo amigable (ej: "Claro, Progreso es conocido por sus servicios de salud. Revisa las categorías específicas que solicitaste a continuación.") y SÓLO genera texto. NO uses NINGÚN JSON estructurado.`;
            
            console.log("PROTOCOLO CHIPS DINÁMICOS ACTIVADO.");

        } else if (match) {
            // --- LÓGICA PARA UNA SOLA CATEGORÍA (FICHA CATEGORÍA) ---
            const categoryKeyRaw = match[3].toLowerCase(); 
            let categoryName = "lugares y negocios"; 
            
            if (categoryKeyRaw.includes('taque') || categoryKeyRaw.includes('tacos')) categoryName = "Taquerías y Tacos";
            else if (categoryKeyRaw.includes('restaurante') || categoryKeyRaw.includes('comer')) categoryName = "Restaurantes y Comida";
            else if (categoryKeyRaw.includes('artesanias') || categoryKeyRaw.includes('souvenirs')) categoryName = "Tiendas de Artesanías y Souvenirs";
            else if (categoryKeyRaw.includes('barbacoa')) categoryName = "Barbacoa y Birria";
            else if (categoryKeyRaw.includes('dental') || categoryKeyRaw.includes('oculista') || categoryKeyRaw.includes('optica') || categoryKeyRaw.includes('clinica') || categoryKeyRaw.includes('farmacia')) categoryName = "Salud y Estética";
            
            // SOBRESCRIBIMOS el prompt para FORZAR el MODO FICHA DE CATEGORÍA
            promptToSend = `El usuario pidió una recomendación o lista de ${categoryName}. DEBES usar el MODO FICHA DE CATEGORÍA (JSON) para responder con un resumen general de la categoría ${categoryName} en Nuevo Progreso. La descripción debe guiar al usuario a usar los botones de acción ('Ver en Mapa' y 'Buscar en Google') para que ellos decidan qué lugar visitar, cumpliendo con la restricción de no recomendar lugares específicos.`;
            
            console.log("PROTOCOLO FICHA DE CATEGORÍA ACTIVADO para:", categoryName);
        }
        // FIN DE LÓGICA DE INTERCEPTACIÓN


        // Inicializar el chat con el historial y la instrucción de sistema
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history 
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
                
                // Si la respuesta de Gemini es un JSON estructurado (lugar o categoría individual)
                if (parsedJson.isStructured === true) {
                    // ... (La lógica de enriquecimiento con Places API se mantiene igual)
                    
                    if (parsedJson.type === 'place' && parsedJson.placeToSearch) {
                        
                        const placeNameSearch = parsedJson.placeToSearch.trim();
                        const isHealthPlace = parsedJson.isHealthPlace === true; 

                        // **** REGLA DE SALUD DINÁMICA: Bloqueo de Enriquecimiento ****
                        if (isHealthPlace) {
                            console.log(`Regla de Salud Dinámica Aplicada: Bloqueando enriquecimiento Places para ${placeNameSearch}`);
                            const baseMapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeNameSearch + " Nuevo Progreso Tamps")}`;
                            finalResponseData.responseText = JSON.stringify({
                                ...parsedJson,
                                placePhone: null, 
                                reviewUrl: null,   
                                mapUrl: baseMapUrl 
                            });
                        } else {
                            const placeData = await getPlaceDetails(placeNameSearch);
                            if (placeData) {
                                finalResponseData.responseText = JSON.stringify({
                                    ...parsedJson,
                                    placeName: placeData.name,
                                    placePhone: placeData.phone,
                                    mapUrl: placeData.mapUrl,
                                    reviewUrl: placeData.reviewUrl, 
                                });
                            } else {
                                delete parsedJson.placeToSearch;
                                finalResponseData.responseText = JSON.stringify(parsedJson);
                            }
                        }
                        // **** FIN DE REGLA DE SALUD DINÁMICA ****
                        
                    } else if (parsedJson.type === 'category') {
                        finalResponseData.responseText = JSON.stringify(parsedJson);
                    }
                }
            }
        } catch (jsonError) {
            console.error("Fallo en el parseo o enriquecimiento del JSON:", jsonError);
            finalResponseData.responseText = modelResponseText; 
        }

        // --- LÓGICA DE ANEXAR METADATOS DE CHIPS DINÁMICOS ---
        if (chipMetadata) {
            // Anexamos el JSON de chips al final del texto conversacional de Gemini
            finalResponseData.responseText = finalResponseData.responseText.trim() + '\n' + JSON.stringify(chipMetadata);
        }
        
        // Retornamos la respuesta al frontend
        res.status(200).json(finalResponseData);

    } catch (error) {
        console.error("Error en la API de Gemini:", error);
        res.status(500).json({ 
            error: true, 
            message: "Fallo al obtener respuesta de Gemini: " + error.message
        });
    }
}
