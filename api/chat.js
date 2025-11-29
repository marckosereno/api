// api/chat.js - Vercel Serverless Function UNIFICADA
// Maneja lógica local, historial, fichas estructuradas y alineación forzada.

import fs from "fs";
import path from "path";

// Endpoint de Gemini Flash
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

// Debe coincidir con el valor en index.html
const MAX_CHAT_RESULTS = 4; 

export default async function handler(req, res) {
  // Aceptamos solo POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Solo se permite POST." });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "Falta GEMINI_API_KEY en variables de entorno." });
  }

  // Desestructuramos el cuerpo de la solicitud (incluye historial y lenguaje)
  const { userPrompt, currentLanguage, history } = req.body;

  if (!userPrompt) {
    return res.status(400).json({ error: "Falta el parámetro userPrompt." });
  }

  // --- 1. Lógica de Detección Local y Carga de Datos ---
  
  const dataPath = path.join(process.cwd(), "data/progreso_data.json");
  let localData = [];

  try {
    const file = fs.readFileSync(dataPath, "utf8");
    localData = JSON.parse(file);
  } catch (err) {
    console.error("Error leyendo progreso_data.json:", err);
    // Continuamos sin datos locales si falla la lectura
  }
  
  // Expresión regular para detectar categorías clave
  const regex = /(taquer[íi]as?|tacos?|lonches?|restaurantes?|barbacoa|birria|artesan[íi]as?|souvenirs?|spa|sal[oó]n|belleza|peluquer[íi]a)/i;
  const match = userPrompt.match(regex);

  const sectionMap = {
      "taquerías": "taquerias_tacos_y_lonches",
      "taqueria": "taquerias_tacos_y_lonches",
      "tacos": "taquerias_tacos_y_lonches",
      "lonches": "taquerias_tacos_y_lonches",
      "barbacoa": "tacos_barbacoa",
      "birria": "tacos_barbacoa",
      "restaurante": "restaurantes",
      "restaurantes": "restaurantes",
      "artesanía": "tiendas_artesanias",
      "artesanías": "tiendas_artesanias",
      "souvenirs": "tiendas_artesanias",
      "salón": "salones_belleza",
      "spa": "salones_belleza",
      "belleza": "salones_belleza",
      "peluquería": "salones_belleza"
  };

  // --- 2. Bloque de Recomendación Local (Prioridad Alta) ---

  if (match) {
    const keyword = match[0].toLowerCase();
    const section = sectionMap[keyword];

    if (section && localData.length > 0) {
      const matches = localData.filter(
        // Excluir HealthPlace para este tipo de recomendación
        (p) => p.Section === section && !p.isHealthPlace
      );

      if (matches.length > 0) {
        // Seleccionamos un número aleatorio de lugares
        const picks = matches.sort(() => Math.random() - 0.5).slice(0, MAX_CHAT_RESULTS);

        // Alineación Forzada: Crea la lista numerada que Gemini DEBE usar
        const recommendationList = picks
          .map((x, i) => `${i + 1}. **${x.Title}:** ${x.Description.trim()}`)
          .join("\n");
        
        const langCode = currentLanguage === 'es' ? 'es' : 'en';

        const promptText = (langCode === 'es') 
            ? `El usuario preguntó sobre '${userPrompt}'. Tu respuesta DEBE EMPEZAR con un saludo amigable (ej: "¡Claro que sí! 🌮 Nuevo Progreso tiene..."), ser muy concisa, y DEBE usar **estricta y únicamente** la siguiente lista numerada de ${picks.length} lugares en tu listado de respuesta, sin inventar detalles. Usa el formato **Nombre:** Descripción:\n\n--- LISTA FORZADA ---\n${recommendationList}\n--- FIN DE LISTA ---\n\nTu respuesta DEBE TERMINAR con un mensaje claro que indique que hay ${matches.length} lugares en total (o que solo se muestran los primeros ${picks.length}) y que el usuario puede presionar el botón 'Ver todos los lugares' para explorar la lista completa.`
            : `The user asked about '${userPrompt}'. Your response MUST START with a friendly greeting, be very concise, and MUST **strictly and only** use the following numbered list of ${picks.length} places in your response, without inventing details. Use the format **Name:** Description:\n\n--- FORCED LIST ---\n${recommendationList}\n--- END OF LIST ---\n\nYour response MUST END with a clear message indicating that there are ${matches.length} total places (or that only the first ${picks.length} are shown) and that the user can press the 'View all places' button for the full list.`;

        // 3. Llamada a Gemini con el prompt forzado
        const contents = [{ role: "user", parts: [{ text: promptText }] }];
        
        const geminiResponse = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: contents })
        });

        const data = await geminiResponse.json();
        const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || (langCode === 'es' ? "Aquí tienes algunos lugares recomendados." : "Here are some recommended places.");

        // Retorno con Metadatos para el Chip de Acción Rápida
        return res.status(200).json({
          responseText: replyText, 
          isLocalRecommendation: true,
          totalCount: matches.length,
          apiQueryForChip: `${keyword} en Nuevo Progreso`
        });
      }
    }
  }

  // --- 4. Fallback a Gemini (Con Historial y Lógica de Ficha Estructurada) ---

  // Instrucción de sistema para forzar JSON para fichas
  const systemInstruction = `Eres un guía turístico experto en Nuevo Progreso, Tamaulipas. Responde de forma concisa y amigable.
    
    Si el usuario pregunta por un lugar específico (ej: 'Farmacia Río Bravo', 'Dental Clinic', 'Restaurant'), o por una categoría amplia (ej: 'Dentistas', 'Salud y Estética'), responde usando **SOLO** un objeto JSON.

    ## Formato JSON para Ficha de Lugar Específico
    Si el lugar es específico y existe:
    {
      "isStructured": true,
      "type": "place",
      "placeName": "[Nombre del lugar, ej: Dental Progress]",
      "description": "[Descripción corta del lugar/servicios]",
      "placePhone": "[Número de teléfono solo si está en la ficha]",
      "mapUrl": "[Link a Google Maps para direcciones, si es fácil de obtener]",
      "reviewUrl": "[Link a reseñas de Google del lugar, si es fácil de obtener]"
    }
    
    ## Formato JSON para Ficha de Categoría General
    Si la pregunta es sobre una categoría general (ej: 'Farmacias'):
    {
      "isStructured": true,
      "type": "category",
      "categoryName": "[Nombre de la categoría, ej: Farmacias]",
      "description": "[Resumen de la categoría y sus beneficios en la zona, mencionando lugares top]",
      "mapUrl": "[Link a Google Maps con búsqueda para la categoría, ej: https://maps.app.goo.gl/search/Pharmacies+Progreso]"
    }

    De lo contrario, responde en texto plano de forma amigable usando el historial de conversación. Asegúrate de responder siempre en el idioma solicitado: ${currentLanguage === 'es' ? 'Español' : 'English'}. NO uses emojis en la respuesta final de texto plano ni en el JSON.`;


  // Configuración de la Llamada de Fallback (para usar el historial)
  const contents = [
      { role: "system", parts: [{ text: systemInstruction }] },
      ...history, // Se inserta el historial del chat
      { role: "user", parts: [{ text: userPrompt }] }
  ];

  try {
    const fallBackResp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: contents })
    });

    const data = await fallBackResp.json();
    const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "Error: No se pudo obtener la respuesta.";
    
    // El frontend parseará el JSON si es una ficha estructurada.
    return res.status(200).json({ responseText: replyText });
    
  } catch (error) {
    console.error("Error fallback Gemini:", error);
    return res.status(500).json({ error: "Error procesando solicitud con Gemini." });
  }
}
