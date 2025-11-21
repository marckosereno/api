// api/index.js (En tu repositorio de GitHub)

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

export default async function geminiProxy(req, res) {
    
    // 1. Configuración CORS - Necesaria para permitir la comunicación desde mssg.me
    // Permitir cualquier origen ('*')
    res.setHeader('Access-Control-Allow-Origin', '*'); 
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization'); // Añadimos Authorization por si acaso
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 2. Manejo de la solicitud Preflight (OPTIONS)
    // El navegador envía esto antes del POST; DEBE recibir las cabeceras CORS.
    if (req.method === 'OPTIONS') {
        // Enviar solo las cabeceras de CORS y terminar la solicitud con éxito (204 No Content o 200 OK)
        return res.status(204).end(); 
    }

    // --- Lógica Principal POST ---

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
