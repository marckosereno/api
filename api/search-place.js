// api/search-place.js
import fetch from 'node-fetch';

export default async (req, res) => {
  // 1. Lee la clave API de forma segura
  const SERPAPI_KEY = process.env.SERPAPI_API_KEY; 
  
  // 2. Obtiene el lugar de la solicitud del cliente
  const { place } = req.query; 

  if (!place) {
    return res.status(400).json({ error: 'Falta el parámetro "place"' });
  }

  // 3. Construye la URL de SerpApi
  const serpApiUrl = `https://serpapi.com/search.json?engine=google_local&q=${encodeURIComponent(place)}&api_key=${SERPAPI_KEY}`;

  try {
    // 4. Llama a la API de SerpApi
    const serpResponse = await fetch(serpApiUrl);
    const data = await serpResponse.json();

    // 5. Extrae los datos clave y la URL de la miniatura del primer resultado local
    const firstLocalResult = data.local_results ? data.local_results[0] : null;

    if (firstLocalResult && firstLocalResult.thumbnail) {
      return res.status(200).json({
        title: firstLocalResult.title,
        address: firstLocalResult.address,
        thumbnailUrl: firstLocalResult.thumbnail, // <-- ¡La URL de la imagen!
        rating: firstLocalResult.rating
      });
    } else {
      return res.status(404).json({ error: 'Lugar o imagen no encontrados.' });
    }
  } catch (error) {
    console.error('Error al llamar a SerpApi:', error);
    return res.status(500).json({ error: 'Error interno del servidor.' });
  }
};
