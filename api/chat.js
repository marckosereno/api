// 🛑 MODIFICACIÓN CRÍTICA en chat.js (Aproximadamente línea 500)

// ⭐️ PATRÓN DE RECOMENDACIÓN AMPLIO (Ahora incluye la palabra 'categoría' y simplifica la estructura)
const recommendationPattern = new RegExp(`(dime|recomienda|sugiere|dame|busca|quiero|lista|muestra|categoria).*\\s*(taquería|restaurante|tienda|barbacoa|lugar|souvenirs|artesanias|clinica|farmacia|dental|optica|peluqueria|estetica|compras|shopping|stores|comer)s?`, 'i');

// ... (resto del código)

// Después, en tu lógica (Aproximadamente línea 660, dentro del if (recMatch)),
// debemos asegurarnos de que categoryKeyRaw extraiga la palabra clave correcta:

if (recMatch) {
    // Si la coincidencia es [..., "categoria", "compras"], recMatch[2] podría ser 'compras'.
    // Usamos una lógica más robusta para encontrar la última palabra clave relevante.
    
    // Obtener la palabra clave de la categoría que coincide con el patrón
    let categoryKeyRaw = recMatch[recMatch.length - 1] ? recMatch[recMatch.length - 1].toLowerCase() : 'lugar';
    let categoryName = "Lugares y Negocios"; // Default

    // ... (El resto de tu lógica de mapeo sigue igual)
    
    // ...
}
