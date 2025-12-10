/*
 * Archivo: js/main.js
 * Contiene la lógica principal del chat, manejo de DOM, historial y comunicación con el backend.
 */

const BACKEND_URL = "/api/chat"; // Tu endpoint de backend
let chatHistory = [];
let currentLanguage = 'es'; // Idioma por defecto
let isBotTyping = false;

// Referencias a Elementos del DOM
const inputElement = document.getElementById('user-input');
const sendButton = document.getElementById('send-message-button');
const messageContainer = document.getElementById('message-container');
const btnClearHistory = document.getElementById('btn-clear-history');
const modelTypingBubble = document.getElementById('model-typing-bubble');
const categoryChips = document.querySelectorAll('#category-chips-group .category-chip');


// --- Funciones de Persistencia y Control ---

function saveHistory() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error("Error al guardar el historial:", e);
    }
}

function loadHistory() {
    try {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            chatHistory = JSON.parse(savedHistory);
        }
    } catch (e) {
        console.error("Error al cargar o parsear el historial:", e);
        chatHistory = [];
    }
}

function clearChatHistory() {
    chatHistory = [];
    localStorage.removeItem('chatHistory');
    if (messageContainer) {
        // Limpiar solo los mensajes, dejando la burbuja de typing
        const messages = Array.from(messageContainer.children).filter(child => child !== modelTypingBubble);
        messages.forEach(msg => msg.remove());
    }
    scrollToBottom();
    console.log("Historial de chat limpiado.");
    
    // Agregar un mensaje de bienvenida simple después de limpiar
    const welcomeMessage = currentLanguage === 'es' 
        ? "¡Hola! ¿En qué puedo ayudarte hoy?" 
        : "Hello! How can I help you today?";
    
    chatHistory.push({ role: 'model', text: welcomeMessage, timestamp: new Date() });
    renderChat();
}

// --- Funciones de Utilidad y UI ---

function formatTime(date) {
    if (!date) return '';
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const minutesStr = minutes < 10 ? '0' + minutes : minutes;
    return hours + ':' + minutesStr + ' ' + ampm;
}

function scrollToBottom() {
    if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight;
}

function showLoadingIndicator() {
    isBotTyping = true;
    modelTypingBubble.classList.remove('hidden');
    inputElement.disabled = true;
    sendButton.disabled = true;
    scrollToBottom();
}

function hideLoadingIndicator() {
    isBotTyping = false;
    modelTypingBubble.classList.add('hidden');
    inputElement.disabled = false;
    sendButton.disabled = inputElement.value.trim() === '';
    inputElement.focus();
}

// --- Renderizado de Burbujas ---

function createMessageBubble(m) {
    const w = document.createElement('div');
    // Usar new Date(m.timestamp) para parsear el string si viene de localStorage
    const timeStr = m.timestamp ? formatTime(new Date(m.timestamp)) : '';
    
    if (m.role === 'user') {
        w.className = 'flex justify-end mb-3';
        w.innerHTML = `
            <div class="flex flex-col items-end">
                <div class="user-bubble bg-black text-white p-3 shadow-md">${m.text}</div>
                ${timeStr ? `<span class="text-xs text-gray-400 mt-1">${timeStr}</span>` : ''}
            </div>
        `;
    } else if (m.role === 'model') {
        w.className = 'flex justify-start mb-3';
        
        let content = `<div class="model-bubble-wrapper shadow-sm"><div class="model-bubble">${m.text}</div></div>`;
        
        // El campo 'data' permite al backend enviar información estructurada (como URLs de imágenes o acciones)
        if (m.data && m.data.imageUrl) {
            content = `
                <div class="model-bubble-wrapper shadow-sm">
                    <img src="${m.data.imageUrl}" alt="Imagen de ${m.data.placeName || 'Lugar'}" class="w-full h-auto rounded-lg mb-2">
                    <div class="model-bubble">${m.text}</div>
                </div>
            `;
        }
        
        w.innerHTML = `
            <div class="flex flex-col items-start">
                ${content}
                ${timeStr ? `<span class="text-xs text-gray-400 mt-1">${timeStr}</span>` : ''}
            </div>
        `;
    }
    return w;
}

function renderChat() {
    // Limpiar mensajes existentes antes de la burbuja de 'typing'
    const messages = Array.from(messageContainer.children).filter(child => child !== modelTypingBubble);
    messages.forEach(msg => msg.remove());
    
    chatHistory.forEach((m) => {
        const messageElement = createMessageBubble(m);
        // Insertar antes de la burbuja de typing
        messageContainer.insertBefore(messageElement, modelTypingBubble);
    });
    
    scrollToBottom();
}

// --- Lógica de Comunicación con el Backend ---

async function getGeminiResponse(userPrompt, chatHistoryForAPI) {
    // Mapear historial al formato de la API
    const historyForAPI = chatHistoryForAPI.map(m => {
        return { role: m.role, parts: [{ text: m.text }] };
    });

    try {
        const response = await fetch(BACKEND_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                history: historyForAPI, 
                userPrompt: userPrompt, 
                currentLanguage: currentLanguage
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error HTTP: ${response.status}. Mensaje: ${errorData.message || 'El servicio de chat falló.'}`);
        }
        
        const data = await response.json();
        return data.responseText;

    } catch (error) {
        console.error("Fallo del Proxy o API:", error);
        return `Lo siento, hubo un error de conexión: ${error.message}`;
    }
}

// --- Lógica Principal de Envío ---
async function handleSend(userPromptInput = null) {
    const userPrompt = userPromptInput || inputElement.value.trim();
    if (!userPrompt) return;

    // 1. Mostrar mensaje del usuario
    chatHistory.push({ role: 'user', text: userPrompt, timestamp: new Date() });
    
    // 2. Limpiar input y actualizar UI
    inputElement.value = '';
    sendButton.disabled = true;
    renderChat(); 
    
    // 3. Mostrar indicador de typing
    showLoadingIndicator();

    // 4. Obtener respuesta (enviando historial limitado)
    const MAX_HISTORY_TO_SEND = 10;
    const startIndex = Math.max(0, chatHistory.length - MAX_HISTORY_TO_SEND);
    const limitedHistory = chatHistory.slice(startIndex, chatHistory.length - 1);

    let modelResponseText = await getGeminiResponse(userPrompt, limitedHistory);

    // 5. Ocultar indicador
    hideLoadingIndicator();

    // 6. Procesar respuesta del modelo
    let finalMessage = { role: 'model', text: modelResponseText, timestamp: new Date() };

    // Si tu backend envía un JSON, aquí iría la lógica para parsearlo y
    // actualizar finalMessage con datos estructurados (e.g., finalMessage.data = parsedJson)

    chatHistory.push(finalMessage);
    saveHistory(); 
    renderChat();
}

// --- Event Listeners e Inicialización ---

/**
 * Función de callback de la API de Maps.
 * Inicializa la UI después de que Google Maps/Places ha cargado.
 */
window.initChat = function() {
    loadHistory();
    renderChat();
    
    // Si no hay historial, agregar un mensaje de bienvenida
    if (chatHistory.length === 0) {
        const welcomeMessage = currentLanguage === 'es' 
            ? "¡Bienvenido! Soy tu guía. ¿Qué te gustaría saber sobre Progreso hoy?" 
            : "Welcome! I'm your guide. What would you like to know about Progreso today?";
        
        chatHistory.push({ role: 'model', text: welcomeMessage, timestamp: new Date() });
        renderChat();
    }
    
    // Listener para el botón de enviar
    if (sendButton) sendButton.addEventListener('click', () => handleSend());
    
    // Listener para la tecla Enter
    if (inputElement) {
        inputElement.addEventListener('keypress', function(e) { 
            if (e.key === 'Enter') { handleSend(); } 
        });
        // Controlar la activación/desactivación del botón de enviar
        inputElement.addEventListener('input', () => {
            sendButton.disabled = inputElement.value.trim() === '';
        });
    }

    // Listener para limpiar historial
    if (btnClearHistory) btnClearHistory.addEventListener('click', clearChatHistory);

    // Listener para los chips de categoría (acciones rápidas)
    categoryChips.forEach(chip => {
        chip.addEventListener('click', function() {
            const query = this.getAttribute('data-query-es'); 
            if (query) {
                handleSend(query);
            }
        });
    });
    
    // Asegurar que el scroll esté al final al cargar
    scrollToBottom();
}

document.addEventListener('DOMContentLoaded', () => {
    // Si la API de Maps no ha cargado (e.g., no hay clave o conexión lenta), 
    // la inicialización debe ocurrir a través del callback 'window.initChat'
    if (typeof window.google === 'undefined' && !document.querySelector('script[src*="maps.googleapis.com"]')) {
        console.warn("Google Maps API no detectada. Inicializando UI inmediatamente.");
        window.initChat();
    }
});
