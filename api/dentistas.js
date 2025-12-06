// Archivo: api/dentistas.js (Versión 3.1 - FINAL: Búsqueda extendida y campos potentes)

const PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;

// CAMPOS SOLICITADOS (Place Details)
// Se incluyen: Descripción (editorial_summary), Coordenadas (geometry), Icono, Rating, etc.
const DETAIL_FIELDS = [
    'place_id',
    'name',
    'formatted_address',
    'formatted_phone_number',
    'website',
    'opening_hours',
    'price_level',
    'editorial_summary',
    'url',
    'rating',
    'user_ratings_total',
    'icon',
    'geometry' 
];

// ARRAY DE CONSULTAS EXPANDIDO (20 TÉRMINOS)
const searchQueries = [
    // Búsquedas de alto tráfico
    'dentistas Nuevo Progreso',
    'clínica dental cosmética Nuevo Progreso',
    'dentistas Avenida Benito Juárez Nuevo Progreso',
    'dentistas cerca de la Aduana Nuevo Progreso',
    'dentistas Plaza Río Nuevo Progreso',
    
    // Búsquedas geográficas amplias (para capturar expansión a calles secundarias)
    'dentistas Colonias Nuevo Progreso',
    'dentistas calles secundarias Nuevo Progreso',
    'dentistas zona comercial Nuevo Progreso',
    'dentistas zona residencial Nuevo Progreso',
    'dentistas sobre el río Nuevo Progreso',
    
    // Búsquedas de nicho/especialidad
    'implantes dentales Nuevo Progreso',
    'ortodoncia Nuevo Progreso',
    'endodoncia Nuevo Progreso',
    'periodoncista Nuevo Progreso',
    'odontología infantil Nuevo Progreso',
    'cirugía maxilofacial Nuevo Progreso',
    
    // Búsquedas de servicio
    'laboratorio dental Nuevo Progreso',
    'clínicas dentales económicas Nuevo Progreso',
    'coronas dentales Nuevo Progreso',
    'servicios dentales emergencia Nuevo Progreso'
];

export default async function handler(req, res) {
    if (!PLACES_API_KEY) {
        return res.status(500).json({ error: "GOOGLE_PLACES_API_KEY no está configurada en Vercel." });
    }

    const uniqueDentists = new Map();

    try {
        // =========================================================
        // PASO 1: Obtener Place IDs únicos (Text Search con paginación extendida)
        // =========================================================
        for (const query of searchQueries) {
            let next_page_token = null;
            let page = 0;

            do {
                const url = buildTextSearchUrl(query, next_page_token);
                
                if (page > 0) await new Promise(resolve => setTimeout(resolve, 2500));
                
                const response = await fetch(url);
                if (!response.ok) {
                    console.error(`Error de búsqueda para '${query}': ${response.status}`);
                    break;
                }
                
                const data = await response.json();
                if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
                    throw new Error(`Error en la API de Text Search: ${data.status}`);
                }
                
                data.results.forEach(place => {
                    if (place.place_id && !uniqueDentists.has(place.place_id)) {
                        uniqueDentists.set(place.place_id, {
                            id: place.place_id,
                            name: place.name || 'Nombre Desconocido',
                            rating: place.rating || 'N/A'
                        });
                    }
                });

                next_page_token = data.next_page_token;
                page++;

            } while (next_page_token && page < 6); 
        }

        const idsToFetch = Array.from(uniqueDentists.keys());
        const detailedList = [];

        // =========================================================
        // PASO 2: Obtener detalles completos para cada ID (Place Details)
        // =========================================================
        for (const [index, placeId] of idsToFetch.entries()) {
            await new Promise(resolve => setTimeout(resolve, 100)); 

            const detailsUrl = buildPlaceDetailsUrl(placeId);
            const response = await fetch(detailsUrl);
            const data = await response.json();

            if (data.status === 'OK') {
                const details = data.result;
                
                const hours = details.opening_hours 
                    ? details.opening_hours.weekday_text.join(' | ') 
                    : 'Horario N/A';

                const price = details.price_level
                    ? '$'.repeat(details.price_level)
                    : 'Rango de Precio N/A';
                    
                detailedList.push({
                    id: details.place_id,
                    name: details.name,
                    address: details.formatted_address || 'Dirección N/A',
                    phone: details.formatted_phone_number || 'Teléfono N/A',
                    website: details.website || 'Sitio Web N/A',
                    google_url: details.url || 'URL de Maps N/A',
                    
                    // CAMPOS POTENTES
                    rating: details.rating || 'N/A',
                    total_ratings: details.user_ratings_total || 0,
                    latitude: details.geometry?.location?.lat || 'N/A',
                    longitude: details.geometry?.location?.lng || 'N/A',
                    icon_url: details.icon || 'Icono N/A',
                    
                    // DESCRIPCIÓN Y HORARIO
                    hours: hours,
                    price_range: price,
                    description_summary: details.editorial_summary 
                        ? details.editorial_summary.overview 
                        : 'Descripción N/A',
                    
                    photo_strategy: 'Usar Google Search (vía Gemini) para foto bajo demanda.'
                });
            } else {
                console.warn(`Error al obtener detalles para ID ${placeId}: ${data.status}`);
            }
        }
        
        return res.status(200).json({
            count: detailedList.length,
            message: `¡Extracción de detalles completada! Se procesaron ${idsToFetch.length} IDs. Lista lista para su JSON/DB.`,
            dentists: detailedList,
        });

    } catch (error) {
        console.error("Error grave durante la extracción:", error.message);
        return res.status(500).json({ error: `Error interno del servidor: ${error.message}` });
    }
}

// ----------------------------------------------------------------
// Funciones Auxiliares 
// ----------------------------------------------------------------

function buildPlaceDetailsUrl(placeId) {
    const baseUrl = "https://maps.googleapis.com/maps/api/place/details/json?";
    const params = new URLSearchParams({
        place_id: placeId,
        key: PLACES_API_KEY,
        language: 'es', 
        fields: DETAIL_FIELDS.join(',') 
    });
    return baseUrl + params.toString();
}

function buildTextSearchUrl(query, pageToken) {
    const baseUrl = "https://maps.googleapis.com/maps/api/place/textsearch/json?";
    
    if (pageToken) {
        return `${baseUrl}key=${PLACES_API_KEY}&pagetoken=${pageToken}`;
    }
    
    const params = new URLSearchParams({
        query: query,
        key: PLACES_API_KEY,
        language: 'es', 
        type: 'dentist' 
    });

    return baseUrl + params.toString();
}
