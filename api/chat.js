// 🚨 NOTA IMPORTANTE: Para que 'require' funcione, tu proyecto debe estar configurado como CommonJS.
// Si estás usando Node.js/Vercel, asegúrate de que tu package.json NO tenga "type": "module".

const { GoogleGenAI } = require('@google/genai');
const { Client: PlacesClient } = require('@googlemaps/google-maps-services-js');

// 🛑 Carga el JSON usando require (más estable en Node.js)
const data = require('../data/progreso_data.json'); 

// Usamos el modelo más rápido y económico para chat
const MODEL_NAME = "gemini-2.5-flash"; 

// 1. Inicializamos los clientes
const ai = new GoogleGenAI({});
const placesApiKey = process.env.GOOGLE_PLACES_API_KEY; 
const placesClient = new PlacesClient({});

// --- FUNCIÓN DE ALEATORIEDAD Y EXTRACCIÓN DE DATOS ---
/**
 * Selecciona una lista aleatoria de lugares de una categoría, limitada a un número máximo.
 * @param {string} categoryKey Clave de la categoría (ej. 'clinicas_dentales').
 * @param {number} limit Máximo de lugares a extraer.
 * @returns {Array} Lista de objetos con 'placeName'.
 */
function getRandomPlaces(categoryKey, limit = 10) {
    const categoryList = data[categoryKey];
    if (!categoryList || categoryList.length === 0) {
        return [];
    }
    
    // 1. Clonar el array para no modificar el original
    const listCopy = [...categoryList];

    // 2. Aplicar el algoritmo Fisher-Yates (Shuffle)
    for (let i = listCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [listCopy[i], listCopy[j]] = [listCopy[j], listCopy[i]];
    }

    // 3. Devolver los primeros 'limit' elementos
    return listCopy.slice(0, limit);
}


// 2. Definimos la Instrucción del Sistema (¡CORREGIDA! Sin backticks internos)
const BASE_SYSTEM_INSTRUCTION = `Eres PROGRESO TOUR GUIDE, un guía experto en Nuevo Progreso, Tamaulipas, México (26.064, -97.950). 
Tu tarea es responder siempre en el idioma indicado y mantener el contexto.

REGLAS DE FORMATO:
1. **Responde exclusivamente en {LANG_PLACEHOLDER}**.
2. **MODO FICHA DE LUGAR (JSON):** Úsalo si la solicitud es de UN LUGAR ESPECÍFICO que crees que existe, pero que no está asociado a una clave de categoría.
3. **MODO FICHA DE CATEGORÍA (JSON):** Úsalo si la solicitud es una lista o una categoría general que COINCIDE con una de las CLAVES DE BÚSQUEDA.
4. **MODO CONVERSACIONAL (Texto Plano):** Úsalo para preguntas generales o de seguimiento.
5. Los formatos JSON requeridos son:
   
   // Formato para LUGAR ESPECÍFICO (Para enriquecer con Places API)
   {
     "type": "place", 
     "placeName": "Nombre del Lugar", 
     "placeToSearch": "Nombre Exacto a buscar en Places API, ej: Dental Care Molar", 
     "description": "Descripción corta de no más de 3 oraciones. Usa el nombre REAL y LOCAL del lugar.",
     "isStructured": true
   }
   
   // Formato para CATEGORÍA GENERAL o LISTAS (La lista se insertará en el Backend)
   {
     "type": "category", 
     "categoryKey": "CLAVE_DE_BUSQUEDA", 
     "categoryName": "Nombre de la Categoría, ej: Clínicas Dentales",
     "description": "Comienza con un resumen breve y general de la categoría. Finaliza diciendo: 'Aquí tienes varias opciones destacadas de nuestra lista personalizada:'",
     "isStructured": true
   }

REGLAS CRÍTICAS PARA ASIGNAR CLAVES DE CATEGORÍA:
* Usa las siguientes CLAVES DE BÚSQUEDA para las categorías listadas: 
  [clinicas_dentales, taquerias_tacos_y_lonches, tacos_barbacoa, restaurantes, salones_belleza, tiendas_artesanias, farmacias, opticas].
* SI EL LUGAR SOLICITADO NO ES UNA CLAVE DE CATEGORÍA, debes usar el formato type: "place" y utilizar tu conocimiento para encontrar un nombre de negocio real en Nuevo Progreso y usarlo en el campo placeToSearch para que sea enriquecido.
* Si no puedes encontrar un lugar, responde con un mensaje de texto plano conversacional.`;

/**
 * Función que busca el nombre de un lugar en la API de Google Places.
 */
async function getPlaceDetails(query) {
    if (!placesApiKey) {
        console.error("GOOGLE_PLACES_API_KEY no definida.");
        return null;
    }
    
    // 1. Buscar el place_id, forzando la búsqueda a Nuevo Progreso
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


module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ message: 'Método no permitido' });
    }

    try {
        const { history = [], userPrompt, currentLanguage } = req.body;
        
        // Configuramos el idioma
        const langText = currentLanguage === 'es' ? 'español' : 'inglés';
        const finalSystemInstruction = BASE_SYSTEM_INSTRUCTION.replace('{LANG_PLACEHOLDER}', langText);

        // Inicializar el chat con el historial y la instrucción de sistema
        const chat = ai.chats.create({
            model: MODEL_NAME, 
            config: {
                systemInstruction: finalSystemInstruction 
            },
            history: history 
        });

        // Enviamos el nuevo mensaje al modelo
        const result = await chat.sendMessage({ message: userPrompt });
        let modelResponseText = result.text.trim();
        
        let finalResponseData = { responseText: modelResponseText };

        // Lógica de ENRIQUECIMIENTO/MANEJO DE DATOS LOCALES
        try {
            const jsonStart = modelResponseText.indexOf('{');
            const jsonEnd = modelResponseText.lastIndexOf('}');
            
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
                const parsedJson = JSON.parse(jsonString);

                if (parsedJson.isStructured === true) {
                    
                    if (parsedJson.type === 'category' && parsedJson.categoryKey) {
                        
                        // 🚀 LÓGICA DE LISTA DE CATEGORÍAS (Su base de datos)
                        const randomPlaces = getRandomPlaces(parsedJson.categoryKey, 10); 
                        
                        if (randomPlaces.length > 0) {
                            
                            // 1. Crear el texto detallado de la lista
                            let listText = "\n";
                            randomPlaces.forEach((place, index) => {
                                listText += `${index + 1}. **${place.placeName}**\n`; 
                            });
                            
                            // 2. Concatenar la introducción de Gemini con la lista.
                            const finalDescription = parsedJson.description + listText;

                            // 3. Crear una respuesta enriquecida (sigue siendo tipo 'category')
                            finalResponseData.responseText = JSON.stringify({
                                ...parsedJson,
                                description: finalDescription, 
                            });
                        } else {
                            // Si la clave existe pero la lista está vacía
                            parsedJson.description = (currentLanguage === 'es' 
                                ? "Lo siento, no tengo una lista de lugares para esa categoría. Intenta buscar en el mapa o en Google."
                                : "I'm sorry, I don't have a list of places for that category. Try searching on the map or Google.");
                            finalResponseData.responseText = JSON.stringify(parsedJson);
                        }

                    } else if (parsedJson.type === 'place' && parsedJson.placeToSearch) {
                        // 🚀 LÓGICA DE LUGAR ESPECÍFICO (Enriquecimiento con Places API)
                        const placeData = await getPlaceDetails(parsedJson.placeToSearch);

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
                            // Si falla Places (no encuentra el lugar real), respondemos sin enriquecer
                            delete parsedJson.placeToSearch;
                            finalResponseData.responseText = JSON.stringify(parsedJson);
                        }
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
