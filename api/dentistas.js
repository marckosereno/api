// La clave de la API de Places se carga automáticamente desde las variables de entorno de Vercel.
const PLACES_API_KEY = process.env.PLACES_API_KEY;

// 1. Array de Consultas Variadas para superar el límite de 5-20 resultados
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

// Función principal de la Serverless Function
export default async function handler(req, res) {
    if (!PLACES_API_KEY) {
        return res.status(500).json({ error: "PLACES_API_KEY no está configurada en Vercel." });
    }

    // Mapa para almacenar resultados únicos usando el place_id como clave
    const uniqueDentists = new Map();

    try {
        // 2. Bucle sobre todas las consultas
        for (const query of searchQueries) {
            let next_page_token = null;
            let page = 0;

            // 3. Bucle interno para la paginación (next_page_token)
            do {
                const url = buildPlacesApiUrl(query, next_page_token);
                
                // Pequeña pausa para evitar exceder los límites de velocidad de la API de Places
                if (page > 0) await new Promise(resolve => setTimeout(resolve, 2000));
                
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Error en la API de Places para la consulta '${query}'`);
                }
                
                const data = await response.json();
                
                // 4. Consolidación de Datos y Desduplicación
                data.results.forEach(place => {
                    // Solo si el lugar tiene un ID y no lo hemos visto antes
                    if (place.place_id) {
                        uniqueDentists.set(place.place_id, {
                            id: place.place_id,
                            name: place.name,
                            address: place.vicinity || place.formatted_address || 'N/A',
                            rating: place.rating || 'N/A',
                            // Usaremos un Place Details API Call para obtener el teléfono y el sitio web
                            // pero por simplicidad, los dejamos como N/A aquí y se harían en un paso posterior
                            phone_website: 'Requiere Place Details API' 
                        });
                    }
                });

                next_page_token = data.next_page_token;
                page++;

            } while (next_page_token && page < 4); // Límite de 4 páginas por consulta para evitar un ciclo infinito en el demo
        }

        // Convertir el mapa de valores únicos de vuelta a un array para la respuesta
        const finalList = Array.from(uniqueDentists.values());
        
        // El paso de la API de Gemini (limpieza/normalización) se insertaría aquí.

        return res.status(200).json({
            count: finalList.length,
            message: `¡Extracción completada! Se encontraron ${finalList.length} clínicas únicas.`,
            dentists: finalList,
        });

    } catch (error) {
        console.error("Error durante la extracción:", error);
        return res.status(500).json({ error: error.message });
    }
}

// Función auxiliar para construir la URL de la API de Places
function buildPlacesApiUrl(query, pageToken) {
    const baseUrl = "https://maps.googleapis.com/maps/api/place/textsearch/json?";
    const params = new URLSearchParams({
        query: query,
        key: PLACES_API_KEY,
        language: 'es', // Preferencia de lenguaje
        type: 'dentist' // Filtro explícito de tipo
    });

    if (pageToken) {
        params.set('pagetoken', pageToken);
        // Cuando se usa pagetoken, la URL solo debe contener key y pagetoken
        return `${baseUrl}key=${PLACES_API_KEY}&pagetoken=${pageToken}`;
    }

    return baseUrl + params.toString();
}
