// api/index.js (Versión Final Optimizada sin CORS)

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export default async function geminiProxy(req, res) {
    
    // --- Lógica Principal POST (Sin CORS ni manejo de OPTIONS) ---

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
    
    if (!GEMINI_API_KEY) {
        return res.status(500).json({ error: "Configuración del servidor incompleta. Clave de API faltante." });
    }
    
    // Si el método no es POST, lo rechaza (Vercel lo permite por defecto)
    if (req.method !== 'POST') {
        return res.status(405).json({ error: "Método no permitido. Solo se acepta POST." });
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
        // Vercel se encarga de que la respuesta regrese al frontend correctamente.
        res.status(response.status).json(data);

    } catch (error) {
        console.error("Error al conectar con la API de Gemini:", error);
        res.status(500).json({ error: "Fallo en el proxy del servidor Vercel." });
    }
}
