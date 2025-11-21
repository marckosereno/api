// api/index.js (En tu repositorio de GitHub)

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export default async function geminiProxy(req, res) {
    
    // Configuración CORS
    res.setHeader('Access-Control-Allow-Origin', '*'); // Permite acceso desde cualquier dominio (incluyendo mssg.me)
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Credentials', 'true'); // A veces necesario para fetch

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
    
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Configuración del servidor incompleta. Clave de API faltante." });
    }
    
    const body = req.body;
    if (!body || !body.contents) {
        return res.status(400).json({ error: "Contenido de solicitud JSON inválido." });
    }
    
    try {
        const response = await fetch(`${GEMINI_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body) 
        });

        const data = await response.json();
        res.status(response.status).json(data);

    } catch (error) {
        console.error("Error al conectar con la API de Gemini:", error);
        res.status(500).json({ error: "Fallo en el proxy del servidor Vercel." });
    }
}
