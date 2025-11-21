// Forzando redeploy
// api/index.js

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Vercel exporta la función como un handler de peticiones HTTP
export default async function geminiProxy(req, res) {
    // 1. Configuración de CORS
    // Vercel maneja esto mejor, pero es bueno dejar las cabeceras básicas.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. Obtener la clave secreta de las Variables de Entorno de Vercel
    // Vercel las expone a las funciones serverless a través de process.env
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
    
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Configuración del servidor incompleta. Clave de API faltante." });
    }
    
    // 3. Obtener el cuerpo de la solicitud del frontend
    const body = req.body;
    if (!body || !body.contents) {
        return res.status(400).json({ error: "Contenido de solicitud JSON inválido." });
    }
    
    try {
        // 4. Reenviar la solicitud a Gemini
        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body) 
        });

        // 5. Devolver la respuesta de Gemini (o el error)
        const data = await response.json();
        res.status(response.status).json(data); // Usar .json() para Vercel/Node

    } catch (error) {
        console.error("Error al conectar con la API de Gemini:", error);
        res.status(500).json({ error: "Fallo en el proxy del servidor Vercel." });
    }
}
