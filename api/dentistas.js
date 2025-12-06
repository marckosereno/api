// Archivo: api/dentistas.js

// La clave de la API de Places se carga automáticamente desde las variables de entorno de Vercel.
const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// Array de Consultas Variadas para superar el límite de 5-20 resultados por llamada.
// Esto obliga a la API a buscar en diferentes nichos y calles.
const searchQueries = [
    'dentistas Nuevo Progreso',
    'implantes dentales Nuevo Progreso',
    'ortodoncia Nuevo Progreso',
    'clínica dental cosmética Nuevo Progreso',
    'dentistas Avenida Benito Juárez Nuevo Progreso',
    'dentistas Plaza Río Nuevo Progreso',
    'dentistas Calle Coahuila Nuevo Progreso',
    'odontología infantil Nuevo Progreso',
    'coronas dentales Nuevo Progreso',
    'endodoncia Nuevo Progreso',
    'blanqueamiento dental Nuevo Progreso',
    'dentistas cerca de la Aduana Nuevo Progreso',
    'periodoncista Nuevo Progreso',
    'dentistas rating 5 Nuevo Progreso',
    'clínicas dentales económicas Nuevo Progreso'
];

/**
 * Función principal de la Serverless Function.
 * Ejecuta múltiples búsquedas segmentadas y maneja la paginación para consolidar la lista.
 */
export default async function handler(req, res) {
    if (!PLACES_API_KEY) {
        return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY no está configurada en Vercel." });
    }

    // Mapa para almacenar resultados únicos usando el place_id como clave
    const uniqueDentists = new Map();

    try {
        // Bucle sobre todas las consultas definidas en el array
        for (const query of searchQueries) {
            let next_page_token = null;
            let page = 0;

            // Bucle interno para manejar la paginación de la API de Places
            do {
                const url = buildPlacesApiUrl(query, next_page_token);
                
                // Pausa obligatoria: La API de Places requiere una pequeña espera (min. 2s) entre llamadas con pagetoken.
                if (page > 0) {
                    await new Promise(resolve => setTimeout(resolve, 2500));
                }
                
                const response = await fetch(url);
                if (!response.ok) {
                    // Si falla la búsqueda, saltamos esta consulta pero continuamos con las demás
                    console.error(`Error en la API de Places para la consulta '${query}'. Estado: ${response.status}`);
                    break; 
                }
                
                const data = await response.json();

                // Detener si no hay resultados o si el estado indica un problema (ej. OVER_QUERY_LIMIT)
                if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                     // Lanza error para terminar la ejecución si hay un problema grave con la clave o límites
                    throw new Error(`Error en la API de Places: ${data.status} para la consulta '${query}'`);
                }
                
                // Consolidación de Datos y Desduplicación
                data.results.forEach(place => {
                    // Solo si el lugar tiene un ID y no lo hemos visto antes
                    if (place.place_id && !uniqueDentists.has(place.place_id)) {
                        uniqueDentists.set(place.place_id, {
                            id: place.place_id,
                            name: place.name || 'Nombre Desconocido',
                            address: place.vicinity || place.formatted_address || 'N/A',
                            rating: place.rating || 'N/A',
                            // NOTA: El teléfono y el sitio web requieren la API de Place Details (costo extra).
                            // Se haría una llamada separada usando el ID si fuera necesario.
                            phone_website: 'Requiere Place Details API (ID disponible)' 
                        });
                    }
                });

                next_page_token = data.next_page_token;
                page++;

            } while (next_page_token && page < 5); // Límite de 5 páginas por consulta (para un máximo de ~100 resultados por consulta).
        }

        // Convertir el mapa de valores únicos de vuelta a un array para la respuesta
        const finalList = Array.from(uniqueDentists.values());
        
        return res.status(200).json({
            count: finalList.length,
            message: `¡Extracción completada! Se encontraron ${finalList.length} clínicas únicas de ${searchQueries.length} búsquedas.`,
            dentists: finalList,
        });

    } catch (error) {
        console.error("Error grave durante la extracción:", error.message);
        return res.status(500).json({ error: `Error interno del servidor: ${error.message}` });
    }
}

/**
 * Función auxiliar para construir la URL de la API de Places para Text Search.
 * Maneja la lógica específica cuando se usa el pagetoken.
 */
function buildPlacesApiUrl(query, pageToken) {
    const baseUrl = "https://maps.googleapis.com/maps/api/place/textsearch/json?";
    
    // Si hay un pagetoken, solo se envían el token y la clave (los demás parámetros se ignoran)
    if (pageToken) {
        return `${baseUrl}key=${PLACES_API_KEY}&pagetoken=${pageToken}`;
    }
    
    // Búsqueda inicial
    const params = new URLSearchParams({
        query: query,
        key: PLACES_API_KEY,
        language: 'es', // Preferencia de lenguaje
        type: 'dentist' // Filtro explícito de tipo
    });

    return baseUrl + params.toString();
}
