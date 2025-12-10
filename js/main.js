// El código de JavaScript completo que proporcionaste:
// --- BLOQUE JAVASCRIPT: SETUP Y UTILIDADES ---

// **NOTA: Debe coincidir con el endpoint de Vercel/backend**
const BACKEND_URL = "/api/chat"; 
const MAX_CHAT_RESULTS = 4; // Límite de resultados mostrado en texto plano (DEBE COINCIDIR CON CHAT.JS)

let chatHistory = [];
let currentLanguage = 'es'; 
let categoriesVisible = false; 
let languageMenuVisible = false; 
let isBotTyping = false; // NUEVA variable de estado del bot

// 🛑 NUEVAS VARIABLES GLOBALES PARA LA FUNCIÓN DE BÚSQUEDA DIRECTA (SPS)
let isSPSMode = false; // 🛑 CAMBIO DE NOMBRE DE VARIABLE
let autocompleteService; // 🛑 CRÍTICO: Usaremos AutocompleteService en lugar de Autocomplete

// VARIABLES GLOBALES PARA EL PROTOCOLO DE RECOMENDACIÓN LOCAL
let lastTotalCount = 0; // Para guardar el conteo total de la última recomendación
let lastApiQuery = null; // Para guardar el query de Places para el chip

// ----------------------------------------------------
// 🛑 VARIABLES GLOBALES PARA LA CARACTERÍSTICA MENTION (@)
// ----------------------------------------------------
let isMentionMode = false; // Bandera para saber si el usuario acaba de escribir '@'
let currentMentionPlace = null; // { placeId: string, textName: string, query: string }
const MENTION_TOKEN = "[[PLACE_MENTION]]"; // Token a enviar al backend
// ----------------------------------------------------


// Referencias a Elementos del DOM
const inputElement = document.getElementById('user-input');
// 🛑 CRÍTICO: El botón de enviar ahora es #send-message-button
const sendButton = document.getElementById('send-message-button'); 
const messageContainer = document.getElementById('message-container');
const appAlertContainer = document.getElementById('app-alert-container');
const categoryChipsGroup = document.getElementById('category-chips-group');
const languageChipsGroup = document.getElementById('language-chips-group');
const categoryChips = document.querySelectorAll('#category-chips-group .category-chip');
const languageChips = document.querySelectorAll('#language-chips-group .language-chip');
const menuActionChips = document.querySelectorAll('#menu-actions .menu-action-chip');
const btnClearTop = document.getElementById('btn-clear-top'); 

// NUEVAS REFERENCIAS A ELEMENTOS DEL DOM para el panel de notificaciones
const btnNotifications = document.getElementById('btn-notifications');
const notificationModal = document.getElementById('notification-preferences-modal');
const notificationPanel = document.querySelector('#notification-preferences-modal .notification-panel');
const toggleNews = document.getElementById('toggle-news');
const toggleReminders = document.getElementById('toggle-reminders');
const togglePromotions = document.getElementById('toggle-promotions'); 
const btnDiscardChanges = document.getElementById('btn-discard-changes');
const btnApplyChanges = document.getElementById('btn-apply-changes');

// NUEVAS REFERENCIAS PARA EL BOTÓN DE ACCIÓN RÁPIDA "VER TODOS LOS LUGARES"
const quickActionFullList = document.getElementById('quick-action-full-list');
const btnViewAllPlaces = document.getElementById('btn-view-all-places');

// NUEVAS REFERENCIAS PARA CHIPS DINÁMICOS
const dynamicChipsGroup = document.getElementById('dynamic-chips-group');
const dynamicChipsList = document.getElementById('dynamic-chips-list');

// 🛑 NUEVAS REFERENCIAS PARA CHIPS DE AUTOCOMPLETADO
const autocompleteChipsGroupContainer = document.getElementById('autocomplete-chips-group-container');
// 🛑 NUEVA REFERENCIA CRÍTICA: La barra de búsqueda completa
const mapSearchBar = document.getElementById('map-search-bar'); 


// NUEVA REFERENCIA PARA LA BURBUJA DE ESCRITURA DEL USUARIO Y MODELO
const userTypingBubble = document.getElementById('user-typing-bubble');
const modelTypingBubble = document.getElementById('model-typing-bubble'); 

// 🛑 NUEVAS REFERENCIAS PARA EL MODO BÚSQUEDA DIRECTA (SPS)
const toggleButton = document.getElementById('toggle-mode-button');
const toggleIcon = document.getElementById('toggle-icon');
// 🛑 NUEVA REFERENCIA CRÍTICA: El texto del botón Action Chip
const toggleText = document.getElementById('toggle-text');


// 🛑 NUEVO: Objeto de mapeo de Subcategorías (Clave: Query del Chip de Categoría General)
const SUBCATEGORIES_MAP = {
    // --- CATEGORÍA SALUD Y ESTÉTICA ---
    "Dime sobre la Categoría Salud y Estética en Progreso": [
        { label: "Dentistas 🦷", query: "Mejores dentistas en Progreso" },
        { label: "Ópticas 👓", query: "Ópticas y lentes de contacto en Progreso" },
        { label: "Farmacias 💊", query: "Farmacias con medicamento de patente en Progreso" },
        { label: "Clínicas y Doctores 👨‍⚕️", query: "Clínicas y doctores en Progreso" },
        { label: "Cirugía Estética ✨", query: "Cirujanos plásticos y estética en Progreso" },
        { label: "Laboratorios 🧪", query: "Laboratorios de análisis clínicos en Progreso" },
        { label: "Veterinarios 🐶", query: "Veterinarias en Progreso" },
        { label: "Todos de Salud 🧭", query: "Todos los lugares de salud y estética en Progreso" }
    ],
    // --- CATEGORÍA COMPRAS Y TIENDAS ---
    "Dime sobre la Categoría Compras y Tiendas en Progreso": [
        { label: "Ropa y Moda 👕", query: "Tiendas de ropa y moda en Progreso" },
        { label: "Artesanías 🎁", query: "Artesanías y souvenirs en Progreso" },
        { label: "Vinos y Licores 🍾", query: "Tiendas de vinos y licores en Progreso" },
        { label: "Joyería y Regalos 💍", query: "Joyerías y tiendas de regalos en Progreso" },
        { label: "Todos de Compras 🛍️", query: "Todos los lugares de compras y tiendas en Progreso" }
    ],
    // --- CATEGORÍA ENTRETENIMIENTO Y ATRACCIONES ---
    "Dime sobre la Categoría Entretenimiento y Atracciones en Progreso": [
        { label: "Atracciones 🎡", query: "Atracciones turísticas en Progreso" },
        { label: "Bares y Cantinas 🍺", query: "Bares y cantinas en Progreso" },
        { label: "Hoteles y Hospedaje 🏨", query: "Hoteles y hospedaje en Progreso" },
        { label: "Eventos y Fiestas 🎉", query: "Próximos eventos y fiestas en Progreso" }
    ],
    // Nota: No es necesario añadir el chip 'Top 10 Dentistas' ya que es una búsqueda directa.
};


// Objeto de Traducción y textos de chips (ACTUALIZADO PARA SPS)
const UI_STRINGS = {
    es: {
        header: "PROGRESO TOUR GUIDE",
        placeholder: "Pregúntale al mapa",
        searchPlaceholder: "Nombre del lugar o negocio...", // 🛑 CAMBIO DE TEXTO
        goButton: "Enviar", // 🛑 CAMBIO DE TEXTO
        loadingStatus: "Respondiendo tu petición...", 
        categories: "✨️ Categorías",
        language: "🧢 Idioma",
        getThere: "🚀 Cómo Llegar",
        info: "ℹ️ Info",
        alertStructured: (name) => `¡Ficha verificada de ${name}!`,
        alertCategory: (name) => `Resumen de la categoría ${name}.`,
        chipHealth: "🏥 Salud & Estética",
        chipShopping: "🛍️ Compras",
        chipEntertainment: "🎺 Entretenimiento",
        chipDental: "🦷 Top 10 Dental",
        btnMap: "Ver en el Mapa 🧭",
        btnSearch: "Resultados en Google 🔍", 
        btnPhone: "Llamar Ahora 📞",
        btnReview: "Reseñas ⭐",
        btnWebsite: "Sitio Web/Redes 🌐", 
        // 🛑 NUEVO: Textos para el Action Chip de Modo
        spsMode: "Modo Pro ●Activado 🦾",
        chatMode: "Modo Chat 💬",
        mentionPlaceholder: (name) => `Conversando sobre ${name}...`
    },
    en: {
        header: "PROGRESO TOUR GUIDE",
        placeholder: "Ask the map",
        searchPlaceholder: "Enter the business name...", // 🛑 CAMBIO DE TEXTO
        goButton: "Send", // 🛑 CAMBIO DE TEXTO
        loadingStatus: "Processing your request...", 
        categories: "✨️ Categories",
        language: "🧢 Language",
        getThere: "🚀 How to get there",
        info: "ℹ️ Info",
        alertStructured: (name) => `Verified card for ${name}!`,
        alertCategory: (name) => `Summary for ${name} category.`,
        chipHealth: "🏥 Health & Beauty",
        chipShopping: "🛍️ Shopping",
        chipEntertainment: "🎺 Entertainment",
        chipDental: "🦷 Top 10 Dental",
        btnMap: "View on Map 🧭",
        btnSearch: "Search Results on Google 🔍", 
        btnPhone: "Call Now 📞",
        btnReview: "Reviews ⭐",
        btnWebsite: "Website/Social 🌐", 
        // 🛑 NUEVO: Textos para el Action Chip de Modo
        spsMode: "Pro Mode ●Active 🦾",
        chatMode: "Chat Mode 💬",
        mentionPlaceholder: (name) => `Conversing about ${name}...`
    }
};

// Estado inicial de las preferencias de notificación
let notificationPreferences = {
    news: true,      // Alertas de interfaz, historial, etc.
    reminders: true, // Alertas estructuradas (fichas de lugar/categoría)
    promotions: false
};


// Inicialización del estado
if (inputElement) inputElement.disabled = false;
if (sendButton) sendButton.disabled = false;

// --- Funciones de PERSISTENCIA y CONTROL DE CHAT ---

function saveHistory() {
    try {
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
    } catch (e) {
        console.error("Error al guardar el historial en localStorage", e);
    }
}

function clearChatHistory() {
    vibrateDevice();
    chatHistory = []; 
    localStorage.removeItem('chatHistory'); 
    
    // **IMPORTANTE**: Limpiar el mensaje-container y dejar solo las burbujas de typing
    if (messageContainer) {
        // Obtener las referencias de las burbujas de typing
        const typingBubbles = [userTypingBubble, modelTypingBubble];
        
        // Eliminar todos los hijos que NO son las burbujas de typing
        Array.from(messageContainer.children).forEach(child => {
            if (!typingBubbles.includes(child)) {
                messageContainer.removeChild(child);
            }
        });
        
        // Asegurar que las burbujas estén OCULTAS y sin ocupar espacio
        hideUserTypingBubble();
        hideModelTypingBubble();
    }
    
    // ALERTA DE CLEAR HISTORY USA 'news'
    alertUser(currentLanguage === 'es' ? '¡Conversación eliminada! Empecemos de cero. 👋' : 'Conversation cleared! Let\'s start fresh. 👋', 'i', 'news');
    
    scrollToBottom();
    // OCULTAR BOTONES DE ACCIÓN RÁPIDA
    quickActionFullList.classList.add('hidden');
    dynamicChipsGroup.classList.add('hidden'); // Ocultar chips dinámicos
    // 🛑 NUEVO: Ocultar chips de autocompletado
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';


    lastTotalCount = 0;
    lastApiQuery = null;
    
    // 🛑 NUEVO: Si está en modo SPS, volver a modo chat
    if (isSPSMode) toggleSPSMode();
    
    // 🛑 NUEVO: Resetear estado de Mención
    resetMentionMode();
    
    // Aseguramos que el placeholder se restablezca
    inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
}

function loadHistory() {
    // Inicializa chatHistory como array vacío si no se encuentra o es inválido
    let loaded = false;
    try {
        const savedHistory = localStorage.getItem('chatHistory');
        if (savedHistory) {
            const loadedHistory = JSON.parse(savedHistory);
            if (Array.isArray(loadedHistory) && loadedHistory.length > 0) {
                chatHistory = loadedHistory; 
                renderChat(); 
                scrollToBottom();
                loaded = true;
            }
        }
    } catch (e) {
        console.error("Error al cargar o parsear el historial de localStorage", e);
        // Si hay un error de parseo, aseguramos que el historial esté vacío
        chatHistory = []; 
    }
    // 3. ⚠️ CORRECCIÓN DE ERROR CLAVE: Asegurar que chatHistory esté listo.
    if (!loaded) {
        chatHistory = []; 
    }
    return loaded;
}

// NUEVAS FUNCIONES PARA LA PERSISTENCIA DE NOTIFICACIONES
function saveNotificationPreferences() {
    try {
        localStorage.setItem('notificationPreferences', JSON.stringify(notificationPreferences));
        alertUser('Preferencias de notificaciones guardadas. ✅', 'i', 'news');
    } catch (e) {
        console.error("Error al guardar las preferencias de notificación:", e);
    }
}

function loadNotificationPreferences() {
    try {
        const savedPrefs = localStorage.getItem('notificationPreferences');
        if (savedPrefs) {
            notificationPreferences = JSON.parse(savedPrefs);
        }
        // Aplicar el estado guardado a los toggles del modal
        if (toggleNews) toggleNews.checked = notificationPreferences.news;
        if (toggleReminders) toggleReminders.checked = notificationPreferences.preferences;
        // No aplicamos 'promotions' ya que está deshabilitado
    } catch (e) {
        console.error("Error al cargar las preferencias de notificación:", e);
    }
}

// --- Funciones de utilidad de tiempo (SIN CAMBIOS) ---
function formatTime(date) {
    if (!date) return '';
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12;
    hours = hours ? hours : 12; 
    const minutesStr = minutes < 10 ? '0'+minutes : minutes;
    return hours + ':' + minutesStr + ' ' + ampm;
}

// 🛑 NUEVA FUNCIÓN: Verificar si el usuario está cerca del fondo
function isScrolledToBottom() {
    if (!messageContainer) return true;
    // Permite un margen de 200px para considerarse "cerca del fondo"
    const scrollDifference = messageContainer.scrollHeight - messageContainer.scrollTop;
    const viewportHeight = messageContainer.clientHeight;
    const isNearBottom = scrollDifference <= viewportHeight + 200;
    return isNearBottom;
}

// FUNCIÓN DE ALERTA MEJORADA CON CONTROL DE PREFERENCIAS
function alertUser(m, t='i', preferenceType = 'news') {
    
    // 🛑 NUEVO: Si no es un error y la preferencia está desactivada, salir.
    if (t !== 'error' && !notificationPreferences[preferenceType]) {
        console.log(`Notificación de tipo "${preferenceType}" deshabilitada por el usuario. Mensaje: ${m}`);
        return; 
    }

    // --- MODO DE LIMPIEZA INMEDIATA PARA EVITAR ACUMULACIÓN ---
    if (appAlertContainer) {
        const existingAlert = appAlertContainer.querySelector('.notification-card');
        if (existingAlert) {
            existingAlert.remove(); 
        }
    }
    // --------------------------------------------------------
    
    const hideAlert = (alertElement) => {
        if (!alertElement || !alertElement.parentNode) return;
        alertElement.classList.remove('show');
        alertElement.style.opacity = '0';
        setTimeout(() => {
            if (alertElement.parentNode) alertElement.remove();
        }, 400); 
    };

    const a = document.createElement('div');
    const icon = (t === 'error') 
        ? '❌' 
        : (t === 'i' ? 'ℹ️' : '✅'); 

    a.className = 'notification-card opacity-0 pointer-events-auto';
    a.innerHTML = `
        <div class="message-content">
            <span class="mr-2">${icon}</span> 
            <span>${m}</span>
        </div>
        <button class="close-btn" aria-label="Cerrar notificación">×</button>
    `;

    if (appAlertContainer) appAlertContainer.appendChild(a);

    setTimeout(() => {
        a.classList.add('show');
        a.style.opacity = '1';
    }, 10); 

    const closeButton = a.querySelector('.close-btn');
    closeButton.addEventListener('click', () => {
        hideAlert(a);
    });
    
    setTimeout(() => {
        hideAlert(a);
    }, 4000);
}

function scrollToBottom() { 
    if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight; 
}

// FUNCIÓN MODIFICADA: Ahora solo desactiva la entrada
function toggleInput(d) {
    if (inputElement) inputElement.disabled = d;
    if (sendButton) sendButton.disabled = d;
}

// ----------------------------------------------------
// 🛑 NUEVA FUNCIÓN: Resetear el modo de Mención (@)
// ----------------------------------------------------
function resetMentionMode() {
    isMentionMode = false;
    currentMentionPlace = null;
    if (!isSPSMode) {
         inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
    }
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';
}

// --- Funciones de INTERFAZ CORE MODIFICADAS PARA EL PROBLEMA DEL TECLADO ---

// 🛑 FUNCIÓN MEJORADA: Scroll instantáneo más robusto usando la barra de búsqueda como target
function handleInputFocus() {
    if (!inputElement || !messageContainer || !document.getElementById('bottom-bar-search-wrapper')) return;

    // **PASO CLAVE 1:** Scroll instantáneo del contenedor de la barra completa a la vista.
    // Esto le dice al navegador que muestre este elemento justo encima del teclado.
    // CRÍTICO: Usamos 'bottom-bar-search-wrapper' que es el contenedor que flota
    const bottomBarWrapper = document.getElementById('bottom-bar-search-wrapper');

    bottomBarWrapper.scrollIntoView({ 
        behavior: 'instant',
        block: 'end' // Scroll para que el final del elemento quede a la vista
    });

    // **PASO CLAVE 2 (Timeout):** Chrome/Android a menudo requiere un breve retraso
    // para que la reubicación del viewport por el teclado se complete.
    setTimeout(() => {
         // 2a. Scroll del contenedor de mensajes al fondo
         messageContainer.scrollTop = messageContainer.scrollHeight;
         
         // 2b. Reconfirmar el scroll de la barra de chat (instantáneo)
         bottomBarWrapper.scrollIntoView({ 
            behavior: 'instant', 
            block: 'end' 
         });
         // No es necesario window.scrollTo(0, document.body.scrollHeight) si el contenedor
         // del chat está manejando el scroll correctamente, y en iOS puede causar rebotes.
    }, 150); 
}

function hideModelTypingBubble() {
    modelTypingBubble.classList.remove('show');
}

function showLoadingIndicator() {
    isBotTyping = true;
    // Ocultar indicador de typing del usuario (por si acaso)
    hideUserTypingBubble(); 
    
    // Mostrar indicador de typing del bot
    modelTypingBubble.classList.add('show'); 
    
    // Mostrar mensaje "Respondiendo tu petición..." en el input
    inputElement.placeholder = UI_STRINGS[currentLanguage].loadingStatus;
    
    // Deshabilitar entrada y botón (Y el botón de modo)
    inputElement.disabled = true;
    sendButton.disabled = true;
    toggleButton.disabled = true;
    
    // El scroll debe activarse cuando el bot empieza a escribir para mostrar el indicador.
    scrollToBottom(); 
}

function hideLoadingIndicator() {
    isBotTyping = false;
    // Ocultar indicador de typing del bot
    hideModelTypingBubble(); 
    
    // Revertir el input a su estado normal (según el modo actual)
    if (isSPSMode) { 
        inputElement.placeholder = UI_STRINGS[currentLanguage].searchPlaceholder;
    } else if (currentMentionPlace) {
         // 🛑 NUEVO: Si estamos en modo Mención, restaurar el placeholder de Mención
         inputElement.placeholder = UI_STRINGS[currentLanguage].mentionPlaceholder(currentMentionPlace.textName);
    } else {
        inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
    }
    
    inputElement.disabled = false;
    toggleButton.disabled = false;
    
    // El botón de enviar solo se activa si hay texto Y NO está en modo SPS
    sendButton.disabled = isSPSMode || inputElement.value.trim() === ''; 
}

function showUserTypingBubble() {
    // Solo mostrar si el bot no está respondiendo
    if (!isBotTyping) {
        userTypingBubble.classList.add('show');
        
        // 🛑 CAMBIO CRÍTICO: SCROLL CONDICIONAL
        if (isScrolledToBottom()) {
            scrollToBottom(); 
        }
    }
}

function hideUserTypingBubble() {
    userTypingBubble.classList.remove('show');
}

function handleTypingIndicator() {
    const inputValue = inputElement.value.trim();
    
    // Si el usuario empieza a escribir Y el bot no está respondiendo Y NO está en modo SPS
    if (inputValue.length > 0 && !isBotTyping && !isSPSMode) { 
        showUserTypingBubble();
    } else {
        hideUserTypingBubble();
    }
}

// --- NUEVAS FUNCIONES PARA EL MODO BÚSQUEDA DIRECTA (SPS MODE) ---

/**
 * Alterna entre el modo Chat (normal) y el modo Búsqueda SPS (Places API).
 */
function toggleSPSMode() { 
    isSPSMode = !isSPSMode;

    if (isSPSMode) {
        // Activar Modo SPS (Búsqueda)
        inputElement.classList.add('sps-mode'); 
        toggleButton.classList.add('active');
        toggleText.innerHTML = UI_STRINGS[currentLanguage].spsMode; 
        inputElement.placeholder = UI_STRINGS[currentLanguage].searchPlaceholder;
        
        // CRÍTICO: El botón de enviar debe estar SIEMPRE DESHABILITADO en Modo SPS.
        sendButton.disabled = true; 
        
        // Desactivar Modo Mención si estaba activo
        resetMentionMode();
        
        // Añadir el listener de input (manejará solo el autocompletado SPS)
        if (inputElement && !inputElement.hasAutocompleteListener) {
             inputElement.addEventListener('input', handleAutocompleteInput);
             inputElement.hasAutocompleteListener = true;
        }


    } else {
        // Activar Modo Chat (Normal)
        inputElement.classList.remove('sps-mode'); 
        toggleButton.classList.remove('active');
        toggleText.innerHTML = UI_STRINGS[currentLanguage].chatMode; 
        inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
        
        // Habilitar el botón de enviar solo si hay texto 
        sendButton.disabled = inputElement.value.trim() === ''; 
        
        // Ocultar chips de autocompletado
        autocompleteChipsGroupContainer.classList.add('hidden');
        autocompleteChipsGroupContainer.innerHTML = '';
        
        // 🛑 CRÍTICO: El listener DEBE QUEDARSE, pero su lógica se vuelve dual (SPS/Mention)
        // No lo removemos para que la lógica de Mención lo use.
    }
    inputElement.value = '';
    inputElement.focus();
}

// 🛑 FUNCIÓN MODIFICADA: Ahora maneja la lógica dual de SPS y Mención (@).
function handleAutocompleteInput(e) {
    const input = e.target.value;
    const inputTrimmed = input.trim();
    
    let query = inputTrimmed;
    
    // 1. Lógica de Detección de Modo Mención (@)
    // Solo aplica si NO estamos en Modo SPS.
    if (!isSPSMode) {
        const mentionIndex = input.lastIndexOf('@');
        
        // Comprobación de activación de Mención: Si encuentra '@' Y no hay un lugar ya seleccionado
        if (mentionIndex !== -1 && !currentMentionPlace) {
            isMentionMode = true;
            // La query de autocompletado es el texto después del '@'
            query = input.substring(mentionIndex + 1).trim(); 
        } else if (currentMentionPlace) {
            // Si ya hay un lugar seleccionado, salimos de autocompletado, pero mantenemos el Modo Mención
            autocompleteChipsGroupContainer.classList.add('hidden');
            return;
        } else {
            // Si no hay '@' y no estamos en modo Mención, volvemos al modo normal de input
            isMentionMode = false;
            autocompleteChipsGroupContainer.classList.add('hidden');
            return;
        }
    }
    
    // 2. Lógica de Autocompletado (Común para SPS y Mención)
    if (!autocompleteService) return;

    if (query.length > 2) {
        // Definir la zona de búsqueda (Progreso)
        const progressoBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(26.0, -98.1), // SW
            new google.maps.LatLng(26.1, -97.9)  // NE
        );

        autocompleteService.getPlacePredictions({ 
            input: query, // La query es el texto limpio (SPS) o el texto después de '@' (Mention)
            bounds: progressoBounds,
            strictBounds: true,
            types: ['establishment', 'geocode'],
            componentRestrictions: { country: 'mx' } 
        }, renderAutocompleteChips);
        
    } else {
        // Limpiar si la query es muy corta
        autocompleteChipsGroupContainer.classList.add('hidden');
        autocompleteChipsGroupContainer.innerHTML = '';
    }
}

// 🛑 NUEVA FUNCIÓN: Renderiza los chips de autocompletado y el chip de atribución
function renderAutocompleteChips(predictions, status) {
    autocompleteChipsGroupContainer.innerHTML = '';
    
    // Si no hay resultados o estamos en un estado de error
    if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions || predictions.length === 0) {
        autocompleteChipsGroupContainer.classList.add('hidden');
        return;
    }

    autocompleteChipsGroupContainer.classList.remove('hidden');

    // 1. Renderizar chips de resultados
    predictions.forEach(prediction => {
        const chip = document.createElement('button');
        chip.className = 'autocomplete-chip';
        
        // CRÍTICO: Usamos el .main_text o el .description para el texto del chip
        let chipText = prediction.structured_formatting ? prediction.structured_formatting.main_text : prediction.description;
        // Opcionalmente, podemos acortar el texto secundario
        if (prediction.structured_formatting && prediction.structured_formatting.secondary_text) {
             chipText += ` (${prediction.structured_formatting.secondary_text.split(',')[0].trim()})`;
        }

        chip.textContent = chipText;
        chip.dataset.placeId = prediction.place_id;
        chip.dataset.description = prediction.description; // Guardamos la descripción completa
        
        // 🛑 CRÍTICO: El handler de click es onPlaceSelected
        chip.onclick = () => onPlaceSelected({ 
            name: chipText, // Usamos el texto visible del chip
            place_id: prediction.place_id,
            description: prediction.description // El texto original completo para el historial
        });
        autocompleteChipsGroupContainer.appendChild(chip);
    });
    
    // 2. Renderizar el Chip de Atribución (Obligatorio)
    const attributionChip = document.createElement('div');
    attributionChip.className = 'attribution-chip';
    // Nota: El link de los ToS de Google Maps Platform es obligatorio.
    attributionChip.innerHTML = `
        Powered by Google 
        <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noopener noreferrer" 
           style="color: #007bff; margin-left: 5px;">
            Términos
        </a>
    `;
    autocompleteChipsGroupContainer.appendChild(attributionChip);

    // Aseguramos que el contenedor de chips se muestre
    autocompleteChipsGroupContainer.scrollLeft = 0;
}

/**
 * CRÍTICO: Se dispara cuando se selecciona un chip de lugar.
 * La lógica se bifurca para SPS o Mención (@).
 */
function onPlaceSelected(prediction) {
    const placeId = prediction.place_id;
    const placeName = prediction.name;
    const placeDescription = prediction.description;
    
    // 1. Limpiar el autocompletado visible
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';

    if (isSPSMode) { 
        // 🛑 MODO SPS (BÚSQUEDA DIRECTA)
        
        // a. Mostrar la acción del usuario
        chatHistory.push({ 
            role: 'user', 
            text: currentLanguage === 'es' 
                ? `⚡️ Búsqueda SPS del lugar: **${placeDescription}**`
                : `⚡️ SPS Search for place: **${placeDescription}**`,
            timestamp: new Date() 
        });
        if (typeof renderChat === 'function') renderChat();
        
        // b. Limpiar la interfaz de búsqueda
        inputElement.value = '';
        
        // c. Disparar el envío al backend con el PLACE ID
        handleSend(`Búsqueda directa del lugar ${placeName}`, placeId);
        
        // d. Mantenemos el estado visual de SPS
        toggleButton.disabled = true; 
        showLoadingIndicator(); 
        
    } else if (isMentionMode) {
        // 🛑 MODO MENCION (@)
        
        // a. Guardar el objeto del lugar
        currentMentionPlace = { 
            placeId: placeId, 
            textName: placeName,
            query: inputElement.value.substring(inputElement.value.lastIndexOf('@') + 1).trim()
        };
        
        // b. Reemplazar el texto @query con el nombre del lugar para el usuario
        const mentionIndex = inputElement.value.lastIndexOf('@');
        if (mentionIndex !== -1) {
            // Reemplazamos todo, desde el '@' hasta el final, con el nombre
            inputElement.value = inputElement.value.substring(0, mentionIndex) + '@' + placeName;
        }
        
        // c. Establecer el placeholder visual
        inputElement.placeholder = UI_STRINGS[currentLanguage].mentionPlaceholder(placeName);
        
        // d. Volver a habilitar el botón de envío
        sendButton.disabled = inputElement.value.trim() === '';
        
        // e. Desactivar la bandera de autocompletado, pero mantenemos currentMentionPlace
        isMentionMode = false;
    }
}

// --- Funciones de INTERACCIÓN (SIN CAMBIOS EN LÓGICA) ---

function vibrateDevice() {
    if ("vibrate" in navigator) {
        navigator.vibrate(100); 
    }
}

function hideChipGroup(groupElement, chipElements) {
    groupElement.classList.add('hidden');
    if (chipElements) {
        chipElements.forEach(chip => {
            chip.classList.remove('visible-chip');
        });
    } else if (groupElement.id === 'dynamic-chips-group') {
        dynamicChipsList.innerHTML = ''; // Limpiamos la lista al ocultar
    }
}

function showChipGroupWithWave(groupElement, chipElements) {
    groupElement.classList.remove('hidden');
    chipElements.forEach((chip, index) => {
        chip.style.transition = 'none';
        chip.classList.remove('visible-chip');

        void chip.offsetWidth; 

        setTimeout(() => {
            chip.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            chip.classList.add('visible-chip');
        }, index * 100); 
    });
}

function setInterfaceLanguage(lang) {
    const langChanged = currentLanguage !== lang;
    currentLanguage = lang;
    const strings = UI_STRINGS[lang];
    
    hideChipGroup(languageChipsGroup, languageChips);
    languageMenuVisible = false;
    
    // 🛑 CRÍTICO: Actualizar el placeholder y el texto del Action Chip
    if (isSPSMode) {
         inputElement.placeholder = strings.searchPlaceholder;
    } else if (currentMentionPlace) {
         inputElement.placeholder = strings.mentionPlaceholder(currentMentionPlace.textName);
    } else {
         inputElement.placeholder = strings.placeholder;
    }
    
    toggleText.textContent = isSPSMode ? strings.spsMode : strings.chatMode; 

    document.getElementById('go-text').textContent = strings.goButton; 

    document.getElementById('btn-categorias').textContent = strings.categories;
    document.getElementById('btn-lenguaje').textContent = strings.language;
    document.getElementById('btn-comollegar').textContent = strings.getThere;
    document.getElementById('btn-info').textContent = strings.info;

    const categoryChipTexts = [strings.chipHealth, strings.chipShopping, strings.chipEntertainment, strings.chipDental];
    categoryChips.forEach((chip, index) => {
        chip.textContent = categoryChipTexts[index];
    });

    if (langChanged) {
        alertUser(`Interfaz y conversación cambiadas a ${lang === 'es' ? 'Español' : 'English'}`, 'i', 'news');
    }
}

function handleMenuAction(actionChip) {
    const action = actionChip.getAttribute('data-action');
    const lang = currentLanguage;
    const query = actionChip.getAttribute(`data-query-${lang}`);

    vibrateDevice(); 

    // Siempre ocultar los botones de acción rápida
    quickActionFullList.classList.add('hidden');
    dynamicChipsGroup.classList.add('hidden'); // Ocultar chips dinámicos
    
    // Ocultar chips de autocompletado y resetear mención si no estamos en modo SPS
    if (!isSPSMode) {
        resetMentionMode(); // 🛑 NUEVO
    }
   
    lastTotalCount = 0;
    lastApiQuery = null;


    if (action !== 'CATEGORIES' && categoriesVisible) {
        hideChipGroup(categoryChipsGroup, categoryChips);
        categoriesVisible = false;
    }
    if (action !== 'LANGUAGE' && languageMenuVisible) {
        hideChipGroup(languageChipsGroup, languageChips);
        languageMenuVisible = false;
    }
    
    if (notificationModal.classList.contains('show')) {
        notificationModal.classList.remove('show');
    }


    if (action === 'CATEGORIES') {
        if (categoriesVisible) {
            hideChipGroup(categoryChipsGroup, categoryChips);
            categoriesVisible = false;
        } else {
            showChipGroupWithWave(categoryChipsGroup, categoryChips);
            categoriesVisible = true;
        }
    } else if (action === 'LANGUAGE') {
        if (languageMenuVisible) {
            hideChipGroup(languageChipsGroup, languageChips);
            languageMenuVisible = false;
        } else {
            showChipGroupWithWave(languageChipsGroup, languageChips);
            languageMenuVisible = true;
        }
    } else if (action === 'CLEAR_HISTORY') { 
        clearChatHistory();
        return;
    } else {
        if (query) {
            handleSend(query); 
            if (categoriesVisible) { hideChipGroup(categoryChipsGroup, categoryChips); categoriesVisible = false; }
            if (languageMenuVisible) { hideChipGroup(languageChipsGroup, languageMenuVisible); languageMenuVisible = false; }
        }
    }
}

// Función para crear las burbujas de mensaje (User/Model)
function createMessageBubble(m) {
    const w = document.createElement('div');
    
    const timeStr = m.timestamp ? formatTime(m.timestamp) : '';
    let timeSpan = '';
    
    if (m.role === 'user') { 
        w.className = 'flex justify-end mb-2'; 
        timeSpan = timeStr ? `<div class="user-timestamp-container"><span class="timestamp">${timeStr}</span></div>` : '';
        w.innerHTML = `
            <div class="flex flex-col items-end">
                <div class="user-bubble bg-black text-white p-3 shadow-md">${m.text}</div>
                ${timeSpan}
            </div>
        `; 
    } 
    else if (m.role === 'model') {
        w.className = 'flex flex-col justify-start w-full mb-2';
        timeSpan = timeStr ? `<div class="model-timestamp-container"><span class="timestamp">${timeStr}</span></div>` : '';
        
        let content = '';
        let actionsBar = '';
        let imageHTML = ''; 
        
        const strings = UI_STRINGS[currentLanguage];

        if (m.isStructured) { 
            
            const isPlaceOrCategory = (m.type === 'place' || m.type === 'category');
            
            if (isPlaceOrCategory && m.imageUrl) {
                // CRÍTICO: Envolver la imagen en el <a> con el URL del mapa para el enlace al hacer click
                imageHTML = `
                    <a href="${m.mapUrl || '#'}" target="_blank" rel="noopener noreferrer" class="image-link">
                        <img 
                            src="${m.imageUrl}" 
                            class="stacked-photo clickable-effect" 
                            alt="Imagen del lugar ${m.placeName || m.categoryName || ''}"
                            loading="lazy" 
                        >
                    </a>
                `;
            }
            
            // 1. Contenido de la burbuja (COMBINANDO IMAGEN Y TEXTO)
            content = `
                <div class="flex flex-col items-start">
                    <div class="model-bubble-wrapper p-3 shadow-md">
                        ${imageHTML} 
                        <div class="model-bubble">
                            ${m.text}
                        </div>
                    </div>
                </div>
            `;
            
            if (m.type !== 'place_not_found') {
                
                const hasSubMenu = m.menuKey && SUBCATEGORIES_MAP[m.menuKey];
                
                if (hasSubMenu) {
                    // --- REEMPLAZO POR CHIPS DE SUBCATEGORÍA (GLASS-CHIP) ---
                    const subChips = SUBCATEGORIES_MAP[m.menuKey];
                    let subChipsHTML = subChips.map(chip => {
                        // Usamos la clase 'glass-chip' para el menú de subcategoría
                        return `<div class="action-chip glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-query="${chip.query}">${chip.label}</div>`;
                    }).join('');

                    actionsBar = `
                        <div class="action-bar-container">
                            <div class="inline-flex space-x-3 p-1">
                                ${subChipsHTML}
                            </div>
                        </div>
                    `;
                } else {
                    // 🛑 LÓGICA DE BOTONES DE ACCIÓN PARA FICHAS ENRIQUECIDAS
                    
                    const isPlace = m.type === 'place';
                    const isHealthPlace = m.isHealthPlace === true; // Nuevo check de salud
                    const entityName = isPlace 
                        ? (m.placeName || (currentLanguage === 'es' ? 'Ubicación' : 'Location')) 
                        : (m.categoryName || (currentLanguage === 'es' ? 'Categoría' : 'Category'));
                    
                    let actionsHTML = '';
                    
                    // 1. Botón de Sitio Web / Redes Sociales (NUEVO)
                    if (isPlace && m.websiteUrl) {
                        actionsHTML += `
                            <div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="WEBSITE" data-website-url="${m.websiteUrl}">
                                ${strings.btnWebsite}
                            </div>
                        `;
                    }
                    
                    // 2. Botón principal: Ver en Mapa
                    if (m.mapUrl) {
                        actionsHTML += `
                            <div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="MAP" data-map-url="${m.mapUrl}">
                                ${strings.btnMap}
                            </div>
                        `;
                    }
                    
                    // 3. Botón Llamar y Reseñas (SOLO si es Lugar y NO es de Salud)
                    if (isPlace && !isHealthPlace) {
                        if (m.placePhone) {
                            actionsHTML += `
                                <div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="PHONE" data-phone="${m.placePhone}">
                                    ${strings.btnPhone}
                                </div>
                            `;
                        }
                        if (m.reviewUrl) {
                            actionsHTML += `
                                <div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="REVIEW" data-review-url="${m.reviewUrl}">
                                    ${strings.btnReview}
                                </div>
                            `;
                        }
                    }
                    
                    // 4. Botón secundario: Resultados en Google (para todos los casos)
                    if (entityName) {
                        actionsHTML += `
                            <div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="SEARCH" data-entity-name="${entityName}">
                                ${strings.btnSearch}
                            </div>
                        `;
                    }

                    if (actionsHTML.length > 0) {
                        actionsBar = `
                            <div class="action-bar-container">
                                <div class="inline-flex space-x-3 p-1">
                                    ${actionsHTML}
                                </div>
                            </div>
                        `;
                    } else {
                        actionsBar = '';
                    }
                }
            } // 🛑 Fin del IF CRÍTICO: m.type !== 'place_not_found'
            
            w.innerHTML = `
                <div class="flex flex-col items-start">
                    ${content}
                    ${actionsBar}
                    ${timeSpan}
                </div>
            `;

        } else {
            // 🛑 HTML MODIFICADO: Usamos el wrapper para el estilo de color para texto plano
            content = `<div class="model-bubble-wrapper p-3 pb-4 shadow-md">${m.text || ''}</div>`;
            w.innerHTML = `
                <div class="flex flex-col items-start">
                    ${content}
                    ${timeSpan}
                </div>
            `;
        }
    }
    return w;
}

// 🛑 NUEVA FUNCIÓN: Adjuntar listeners a los sub-chips dinámicamente creados
function attachSubMenuListeners() {
    // Selecciona chips de SUBMENÚ (glass-chip)
    const subMenuChips = messageContainer.querySelectorAll('.action-bar-container .glass-chip');
    
    subMenuChips.forEach(chip => {
        if (chip.classList.contains('listener-attached')) return; 
        
        chip.addEventListener('click', function() {
            vibrateDevice();
            const query = this.getAttribute('data-query');
            handleSend(query); 
        });
        
        chip.classList.add('listener-attached');
    });
    
    // 🛑 NUEVA LÓGICA: Adjuntar listeners a los botones de ACCIÓN (blue-glass-chip)
    const actionButtons = messageContainer.querySelectorAll('.action-bar-container .blue-glass-chip');
    
    actionButtons.forEach(button => {
        if (button.classList.contains('listener-attached')) return; 
        
        button.addEventListener('click', function() {
            vibrateDevice();
            const action = this.getAttribute('data-action');
            
            if (action === 'MAP' && this.getAttribute('data-map-url')) {
                window.open(this.getAttribute('data-map-url'), '_blank');
                alertUser(currentLanguage === 'es' ? 'Abriendo mapa en nueva ventana.' : 'Opening map in new window.', 'i', 'news');
            } else if (action === 'SEARCH' && this.getAttribute('data-entity-name')) {
                const entityName = this.getAttribute('data-entity-name');
                // Buscamos con el nombre de la entidad + ubicación fija
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(entityName + " Nuevo Progreso Tamps")}`;
                window.open(searchUrl, '_blank');
                alertUser(currentLanguage === 'es' ? `Buscando "${entityName}" en Google.` : `Searching for "${entityName}" on Google.`, 'i', 'news');
            } else if (action === 'PHONE' && this.getAttribute('data-phone')) {
                const phone = this.getAttribute('data-phone').replace(/\D/g, ''); // Limpiar el número
                window.location.href = `tel:${phone}`;
                alertUser(currentLanguage === 'es' ? `Llamando a ${this.getAttribute('data-phone')}.` : `Calling ${this.getAttribute('data-phone')}.`, 'i', 'news');
            } else if (action === 'REVIEW' && this.getAttribute('data-review-url')) {
                window.open(this.getAttribute('data-review-url'), '_blank');
                alertUser(currentLanguage === 'es' ? 'Abriendo reseña en nueva ventana.' : 'Opening review in new window.', 'i', 'news');
            } else if (action === 'WEBSITE' && this.getAttribute('data-website-url')) { // 🛑 NUEVA ACCIÓN
                window.open(this.getAttribute('data-website-url'), '_blank');
                alertUser(currentLanguage === 'es' ? 'Abriendo sitio web en nueva ventana.' : 'Opening website in new window.', 'i', 'news');
            }
        });
        
        button.classList.add('listener-attached');
    });
    
    // 🛑 NUEVA LÓGICA: Adjuntar listeners al contenedor <a> de la imagen.
    const imageLinks = messageContainer.querySelectorAll('.image-link');
    imageLinks.forEach(link => {
        const img = link.querySelector('.stacked-photo');
        if(img && !img.classList.contains('listener-attached')) {
            // El listener ya está implícito en la etiqueta <a>, solo aseguramos el efecto 'active'
            img.classList.add('listener-attached');
        }
    });

}

function renderChat() {
    if (messageContainer) {
        // Limpiar todo excepto las burbujas de escritura del usuario y modelo
        const typingBubbles = [userTypingBubble, modelTypingBubble];
        const messages = Array.from(messageContainer.children).filter(child => !typingBubbles.includes(child));
        messages.forEach(msg => msg.remove());

        // Renderizar el historial
        chatHistory.forEach((m) => { 
            const messageElement = createMessageBubble(m);
            // Insertar el mensaje antes de la burbuja de escritura del modelo
            messageContainer.insertBefore(messageElement, modelTypingBubble); 
        });
        
        scrollToBottom();
        
        // 🛑 NUEVO: Adjuntar listeners a los chips y botones después de renderizar
        attachSubMenuListeners(); 
    }
}

// --- NUEVA FUNCIÓN PARA RENDERIZAR CHIPS DINÁMICOS (se mantiene, pero la lógica de subcategorías va dentro de la burbuja ahora) ---
function renderDynamicChips(chips) {
    dynamicChipsList.innerHTML = ''; // Limpiar cualquier chip anterior
    
    // Ocultar cualquier otro chip de acción
    quickActionFullList.classList.add('hidden'); 
    hideChipGroup(categoryChipsGroup, categoryChips);
    categoriesVisible = false;
    hideChipGroup(languageChipsGroup, languageChips);
    languageMenuVisible = false;
    
    // Ocultar chips de autocompletado y resetear mención
    resetMentionMode();


    dynamicChipsGroup.classList.remove('hidden');

    chips.forEach((chipData, index) => {
        const chip = document.createElement('div');
        // Usamos la clase glass-chip que ya tiene buen estilo
        chip.className = 'dynamic-chip action-chip glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer'; 
        chip.textContent = chipData.label;
        chip.setAttribute('data-query', chipData.query);
        
        chip.addEventListener('click', function() {
            vibrateDevice();
            const query = this.getAttribute('data-query');
            // Al hacer clic, enviamos la nueva consulta, que el backend transformará en FICHA CATEGORÍA
            handleSend(query); 
            // Ocultamos los chips dinámicos después de la acción
            dynamicChipsGroup.classList.add('hidden'); 
        });

        // Aplicar el efecto de "Ola"
        chip.style.opacity = '0';
        chip.style.transform = 'translateY(20px)';
        chip.style.transition = 'none';

        void chip.offsetWidth; 

        setTimeout(() => {
            chip.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
            chip.style.opacity = '1';
            chip.style.transform = 'translateY(0)';
        }, index * 100); 

        dynamicChipsList.appendChild(chip);
    });
    
    // Aseguramos que el chat baje para ver los nuevos chips
    scrollToBottom();
}


// --- CÓDIGO DE CONEXIÓN AL BACKEND (ACTUALIZADO PARA RECIBIR PLACE ID) ---

async function getGeminiResponse(userPrompt, chatHistoryForAPI, placeId = null) { // 🛑 NUEVO: placeId como argumento
    
    const historyForAPI = chatHistoryForAPI.map(m => {
        const textContent = m.isStructured && m.description ? m.description : m.text;
        
        return {
            role: m.role,
            parts: [{ text: textContent }]
        };
    });

    try {
        const response = await fetch(BACKEND_URL, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                history: historyForAPI, 
                userPrompt: userPrompt, 
                currentLanguage: currentLanguage,
                directSearchQuery: placeId // 🛑 NUEVO: Envío del Place ID si existe
            }) 
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Error HTTP: ${response.status}. Mensaje: ${errorData.message || 'El servicio de chat falló.'}`);
        }

        const data = await response.json();
        return data.responseText; 

    } catch (error) {
        console.error("Fallo del Proxy o API de Gemini:", error);
        // ALERTA DE ERROR USA 'error' (SIEMPRE SE MUESTRA)
        alertUser(`Error de conexión: ${error.message}.`, 'error');
        return null;
    }
}

// --- Lógica Principal del Chatbot (handleSend) ---
async function handleSend(userPromptInput = null, placeIdForDirectSearch = null) { // 🛑 NUEVO: placeIdForDirectSearch
    
    const isSPSorDirect = placeIdForDirectSearch !== null;
    
    let userPrompt = userPromptInput || inputElement.value.trim();
    if (!userPrompt) return;
    
    // 🛑 CRÍTICO: Si está en modo SPS y se dispara un Enter, lo ignoramos (debe usar onPlaceSelected)
    if (isSPSMode && !isSPSorDirect) return; 
    
    // ----------------------------------------------------
    // 🛑 LÓGICA DE ENVÍO DE MENTION (@)
    // ----------------------------------------------------
    let placeIdForAPI = placeIdForDirectSearch; // Por defecto, es el de SPS
    
    if (currentMentionPlace && !isSPSorDirect) {
        // 1. Es un envío de Mención (Conversacional + Place ID)
        placeIdForAPI = currentMentionPlace.placeId;
        
        // 2. Reemplazar el nombre del lugar en el prompt con el token (para que Gemini lo procese)
        // Esto evita que Gemini piense que el nombre del lugar es parte de la pregunta.
        const mentionText = '@' + currentMentionPlace.textName;
        
        // Reemplazamos SÓLO la primera aparición (aunque debería ser la única)
        const regex = new RegExp(mentionText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        userPrompt = userPrompt.replace(regex, MENTION_TOKEN);
        
        // 3. Resetear el modo de mención después de enviar
        resetMentionMode();
    }
    // ----------------------------------------------------

    hideChipGroup(categoryChipsGroup, categoryChips);
    categoriesVisible = false;
    hideChipGroup(languageChipsGroup, languageChips);
    languageMenuVisible = false;

    // Limpiar el estado de todos los chips de acción al iniciar el envío
    quickActionFullList.classList.add('hidden');
    dynamicChipsGroup.classList.add('hidden'); 
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';

    // Utilizamos showLoadingIndicator para el nuevo efecto de status/input
    showLoadingIndicator(); 
    
    // Si el mensaje del usuario no se ha añadido por onPlaceSelected (i.e., NO es SPS), lo añadimos ahora
    if (!isSPSorDirect) {
        
        // Si fue una mención, el texto que guardamos en el historial debe ser el texto visible
        let userHistoryText = userPromptInput || inputElement.value.trim();
        if (placeIdForAPI && !isSPSorDirect) {
             // Si fue Mención, el texto ya tiene el '@Nombre'
             userHistoryText = inputElement.value.trim();
        }
        
        chatHistory.push({ role: 'user', text: userHistoryText, timestamp: new Date() }); 
    }
    
    if (typeof renderChat === 'function') renderChat();
    inputElement.value = '';

    const MAX_HISTORY_TO_SEND = 10; 
    const previousHistory = chatHistory.slice(0, -1); 
    const startIndex = Math.max(0, previousHistory.length - MAX_HISTORY_TO_SEND);
    const limitedHistory = previousHistory.slice(startIndex);
    
    // 🛑 CRÍTICO: Pasamos el Place ID, si existe (puede ser de SPS o de Mención)
    let modelResponseText = await getGeminiResponse(userPrompt, limitedHistory, placeIdForAPI); 
    
    // **IMPORTANTE**: Ocultar el estado de carga tan pronto como recibimos la respuesta.
    hideLoadingIndicator(); 

    if (modelResponseText === null) {
        // Si hay un error, el estado ya se ocultó arriba y el input se habilitó.
        return;
    }

    
    let finalMessage = { role: 'model', text: modelResponseText, timestamp: new Date(), isStructured: false };
    let totalCount = 0; 
    let apiQuery = null; 
    let dynamicChipsData = null; 

    try {
        const jsonStart = modelResponseText.indexOf('{');
        const jsonEnd = modelResponseText.lastIndexOf('}');
        
        if (jsonStart !== -1 && jsonEnd !== -1) {
            const jsonString = modelResponseText.substring(jsonStart, jsonEnd + 1);
            const parsedJson = JSON.parse(jsonString);

            // *** INICIO DE LA LÓGICA DE PROCESAMIENTO DE RESPUESTA (ACTUALIZADA) ***
            
            let fichasParaMostrar = [];
            // Separar el texto conversacional del JSON
            let conversationText = modelResponseText.replace(jsonString, '').trim();

            // 1. Manejo de Múltiples Fichas (NUEVO)
            if (parsedJson.isMultiStructured === true && Array.isArray(parsedJson.response)) {
                fichasParaMostrar = parsedJson.response;
                if (parsedJson.conversationText) conversationText = parsedJson.conversationText;
            } 
            // 2. Manejo de Respuesta Estructurada Única
            else if (parsedJson.isStructured === true) {
                fichasParaMostrar = [parsedJson];
            } 
            // 3. Manejo de Recomendación Local (Texto Plano Forzado con metadatos)
            else if (parsedJson.isLocalRecommendation === true) {
                totalCount = parsedJson.totalCount || 0;
                apiQuery = parsedJson.apiQueryForChip || null;
                
                // Solo mantenemos el texto conversacional
                finalMessage.text = conversationText;
                if (finalMessage.text.length < 5) finalMessage.text = modelResponseText;
            }
            
            // 4. Manejo de Chips Dinámicos (solo se usa para el caso de chips en la barra inferior)
            else if (parsedJson.isDynamicChips === true) {
                dynamicChipsData = parsedJson.chips;
                finalMessage.text = conversationText;
                if (finalMessage.text.length < 5) finalMessage.text = modelResponseText;
            }
            
            // 🛑 LÓGICA CLAVE: Control de Subcategorías. 
            // Solo si el prompt ES UNA CATEGORÍA PRINCIPAL, inyectamos el menúKey.
            
            let shouldAddMenuKey = SUBCATEGORIES_MAP[userPrompt];

            // Procesar Fichas (si hay una o varias)
            if (fichasParaMostrar.length > 0) {
                // Si hay fichas, el primer mensaje es el texto conversacional (si existe)
                if (conversationText.length > 0) {
                    // 🟢 FIX 1.1: Empujar el texto conversacional antes de las fichas
                    chatHistory.push({ role: 'model', text: conversationText, timestamp: new Date(), isStructured: false });
                }
                
                // Insertar cada ficha como un mensaje separado
                fichasParaMostrar.forEach(ficha => {
                    
                    // Determinar si esta ficha es una categoría con submenú
                    let menuKey = null;
                    if (ficha.type === 'category' && shouldAddMenuKey) {
                        menuKey = userPrompt; // Usamos el prompt del usuario como clave
                    }
                    
                    chatHistory.push({ 
                        role: 'model', 
                        isStructured: true,
                        type: ficha.type, 
                        text: ficha.description || ficha.text, 
                        placeName: ficha.placeName, 
                        placePhone: ficha.placePhone || null, 
                        mapUrl: ficha.mapUrl || null,
                        reviewUrl: ficha.reviewUrl || null,
                        websiteUrl: ficha.websiteUrl || null, // 🛑 NUEVO: Propiedad Website/Social
                        categoryName: ficha.categoryName || null,
                        isHealthPlace: ficha.isHealthPlace || false, // 🛑 NUEVO: Propiedad isHealthPlace
                        menuKey: menuKey, // <--- PROPIEDAD CLAVE AÑADIDA (SÓLO si es categoría principal)
                        imageUrl: ficha.imageUrl || null, // <-- ¡NUEVA PROPIEDAD DE IMAGEN!
                        timestamp: new Date()
                    });
                    
                    // Disparar la alerta (solo para la primera ficha para evitar spam)
                    if (fichasParaMostrar.indexOf(ficha) === 0) {
                       const isPlace = ficha.type === 'place';
                       const entityName = isPlace 
                            ? (ficha.placeName || (currentLanguage === 'es' ? 'Ubicación' : 'Location')) 
                            : (ficha.categoryName || (currentLanguage === 'es' ? 'Categoría' : 'Category'));

                       const alertText = isPlace 
                           ? UI_STRINGS[currentLanguage].alertStructured(entityName)
                           : UI_STRINGS[currentLanguage].alertCategory(entityName);
                       
                       if (typeof alertUser === 'function') alertUser(alertText, "i", "reminders");
                    }
                });

                // 🟢 FIX 1.2: El return debe estar aquí para el caso multi-ficha/ficha simple, si hubo conversacionText antes.
                saveHistory(); 
                if (typeof renderChat === 'function') renderChat();
                return; // 🛑 FINALIZA la ejecución de handleSend
            }
            
            // Si no hay fichas, el finalMessage ya tiene el texto plano (o la recomendación local).

        }
    } catch (e) {
        console.error("Error al parsear JSON estructurado, de chip o array:", e);
        // Si hay error de parseo, cae a texto plano (modelResponseText)
        finalMessage.text = modelResponseText;
    }

    // *** FIN DE LA LÓGICA DE PROCESAMIENTO DE RESPUESTA ***

    chatHistory.push(finalMessage); // <- Añade el mensaje final de texto plano/recomendación

    // 🟢 FIX 2.1: Limpiamos los estados de las variables globales ANTES de reasignar
    lastTotalCount = 0;
    lastApiQuery = null;
    
    // --- LÓGICA DE ACTIVACIÓN DE CHIPS Y ALERTA ---
    
    if (dynamicChipsData && dynamicChipsData.length > 0) {
        // Caso de CHIPS DINÁMICOS O SUBCATEGORÍAS FORZADAS
        renderDynamicChips(dynamicChipsData);
        quickActionFullList.classList.add('hidden'); // Asegurar que el otro chip esté oculto
        
    } else if (finalMessage.isStructured) {
        // Caso de FICHA ESTRUCTURADA (SOLO SI LLEGÓ UNA AQUÍ, si no, ya salió antes)
        const isPlace = finalMessage.type === 'place';
        const entityName = finalMessage.placeName || finalMessage.categoryName;

        const alertText = isPlace 
            ? UI_STRINGS[currentLanguage].alertStructured(entityName)
            : UI_STRINGS[currentLanguage].alertCategory(entityName);

        if (typeof alertUser === 'function') alertUser(alertText, "i", "reminders");
        
        quickActionFullList.classList.add('hidden');

    } else if (totalCount > MAX_CHAT_RESULTS && apiQuery) {
        // Caso de Recomendación Local Forzada (Texto Plano) con más de 4 resultados
        
        // 🟢 FIX 2.2: Guardar en las variables globales para el listener del botón
        lastTotalCount = totalCount;
        lastApiQuery = apiQuery;
        
        // Actualizar el texto del botón con el conteo
        btnViewAllPlaces.innerHTML = currentLanguage === 'es' 
            ? `➡️ Ver todos los ${totalCount} lugares` 
            : `➡️ View all ${totalCount} places`;

        // Mostrar el botón de acción rápida
        quickActionFullList.classList.remove('hidden');

    } else {
        // Otros casos de texto plano (ej. preguntas generales, menos de 4 resultados, o error)
        quickActionFullList.classList.add('hidden');
    }
    
    saveHistory(); 
    
    if (typeof renderChat === 'function') renderChat();
}

// --- Event Listeners e Inicio (ACTUALIZADO) ---

// 🛑 Listener del Botón de Enviar (Solo modo Chat)
if (sendButton) sendButton.addEventListener('click', () => {
    if (!isSPSMode) handleSend(); 
});

// 🛑 Listener de la Tecla Enter (Solo modo Chat)
if (inputElement) inputElement.addEventListener('keypress', function(e) { 
    if (e.key === 'Enter' && !isSPSMode) { 
        handleSend(); 
    } 
});

// 🛑 Listener del Botón de Alternar Modo (SPS)
if (toggleButton) toggleButton.addEventListener('click', toggleSPSMode);


// NUEVO LISTENER: Para el efecto de escritura del usuario y habilitar/deshabilitar el botón
if (inputElement) {
    
    // 🛑 CRÍTICO: ADICIÓN DEL LISTENER PARA EL FOCO DEL INPUT (SOLUCIÓN AL PROBLEMA DE SCROLL)
    inputElement.addEventListener('focus', handleInputFocus);
    
    // 🛑 CRÍTICO: ADICIÓN DEL LISTENER PARA EL MODO MENTION (@) Y SPS.
    // El listener 'input' ahora se usa para: 
    // 1. Detección de '@' y activación del Autocompletado/Mention.
    // 2. Control de la burbuja de typing (solo si no es SPS/Mention).
    // 3. Control del botón de envío (solo si no es SPS/Mention).
    if (!inputElement.hasAutocompleteListener) {
        inputElement.addEventListener('input', handleAutocompleteInput);
        inputElement.hasAutocompleteListener = true;
    }

    inputElement.addEventListener('input', () => {
        
        const inputValue = inputElement.value.trim();
        
        // Si el texto es modificado y ya existe un lugar en currentMentionPlace
        if (currentMentionPlace) {
            const mentionText = '@' + currentMentionPlace.textName;
            if (!inputElement.value.includes(mentionText)) {
                // Si el usuario borró o cambió el texto de la mención, lo reseteamos.
                resetMentionMode();
                // Y disparamos una búsqueda normal si hay texto restante
                if (!isSPSMode) {
                    handleAutocompleteInput({ target: inputElement }); 
                }
            }
        }
        
        // Habilitar/Deshabilitar el botón de envío (solo si NO está en modo SPS)
        sendButton.disabled = isSPSMode || inputValue === ''; 
        
        // Manejar la burbuja de escritura del usuario (solo si NO está en modo SPS O MENTION)
        if (!isSPSMode && !isMentionMode && !currentMentionPlace) { 
            handleTypingIndicator();
        } else {
            hideUserTypingBubble();
        }
    });
}

// Listeners para botones del menú principal (Categorías, Lenguaje, etc.)
menuActionChips.forEach(chip => {
    chip.addEventListener('click', function() {
        handleMenuAction(this);
    });
});

// Conexión del nuevo botón flotante superior
if (btnClearTop) {
    btnClearTop.addEventListener('click', function() {
        handleMenuAction(this); 
    });
}

// Oculta chips de categoría después de usarlos.
categoryChips.forEach(chip => {
    chip.addEventListener('click', function() {
        const lang = currentLanguage;
        const query = this.getAttribute(`data-query-${lang}`);
        handleSend(query); 
        hideChipGroup(categoryChipsGroup, categoryChips);
        categoriesVisible = false;
    });
});

// Oculta chips de idioma después de usarlos (la función setInterfaceLanguage ya lo hace).
languageChips.forEach(chip => {
    chip.addEventListener('click', function() {
        const lang = this.getAttribute('data-lang');
        setInterfaceLanguage(lang);
    });
});

// NUEVO LISTENER: Para el botón "VER TODOS LOS LUGARES" (usa las variables globales)
if (btnViewAllPlaces) {
    btnViewAllPlaces.addEventListener('click', () => {
        vibrateDevice();
        
        // Ocultar después de hacer clic, independientemente del éxito.
        quickActionFullList.classList.add('hidden'); 

        if (lastApiQuery) {
            
            // 🛑 LÓGICA DUAL: El botón usa la consulta API completa para buscar en Google (Local + Genérica).
            
            // 1. Codificar el query completo (ej: 'Taquerías y Tacos en Nuevo Progreso')
            const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(lastApiQuery + " Nuevo Progreso Tamps")}`;

            // 2. Abrir la búsqueda en una nueva pestaña/ventana (complementando la lista local)
            window.open(searchUrl, '_blank'); 
            
            alertUser(currentLanguage === 'es' 
                ? `Abriendo la lista completa en Google: "${lastApiQuery}"` 
                : `Opening the full list on Google: "${lastApiQuery}"`, 
            'i', 'news');
        } else {
            alertUser(currentLanguage === 'es' 
                ? 'No se encontró la consulta de lugares. Por favor, intenta de nuevo.' 
                : 'Place query not found. Please try again.', 
            'error');
        }
        
        // Limpiar el estado de las variables globales
        lastTotalCount = 0;
        lastApiQuery = null;
    });
}

// NUEVOS LISTENERS PARA EL PANEL DE NOTIFICACIONES
if (btnNotifications) {
    btnNotifications.addEventListener('click', () => {
        vibrateDevice();
        loadNotificationPreferences(); // Cargar preferencias al abrir el modal
        notificationModal.classList.add('show');
    });
}

// Cerrar el modal al hacer clic fuera del panel (overlay)
if (notificationModal) {
    notificationModal.addEventListener('click', (e) => {
        if (e.target === notificationModal) { 
            notificationModal.classList.remove('show');
        }
    });
}

// Botones dentro del modal
if (btnDiscardChanges) {
    btnDiscardChanges.addEventListener('click', () => {
        vibrateDevice();
        notificationModal.classList.remove('show');
        // No guarda, simplemente cierra
    });
}

if (btnApplyChanges) {
    btnApplyChanges.addEventListener('click', () => {
        vibrateDevice();
        // Actualizar el objeto `notificationPreferences` con el estado actual de los toggles
        notificationPreferences.news = toggleNews.checked;
        notificationPreferences.reminders = toggleReminders.checked;
        // promotions se mantiene en false ya que está deshabilitado

        saveNotificationPreferences(); 
        notificationModal.classList.remove('show');
    });
}

// Evita que el clic dentro del panel cierre el modal
if (notificationPanel) {
    notificationPanel.addEventListener('click', (e) => {
        e.stopPropagation(); 
    });
}

/**
 * Función de callback de la API de Maps.
 * Se llama cuando la API de Google Maps/Places ha cargado.
 */
window.initChatUI = function() {
    console.log("Google Maps API (Places) cargada.");
    
    // 🛑 CRÍTICO: Inicializar AutocompleteService aquí
    if (window.google && window.google.maps && google.maps.places) {
        autocompleteService = new google.maps.places.AutocompleteService();
        console.log("Google Maps AutocompleteService inicializado.");
    } else {
        console.error("No se pudo inicializar Google Maps AutocompleteService.");
    }
    
    // 1. Asegurarse de que ambas burbujas estén ocultas al inicio
    hideUserTypingBubble();
    hideModelTypingBubble();
    
    // 2. Establecer el idioma por defecto y actualizar la interfaz (sin disparar alerta)
    setInterfaceLanguage(currentLanguage); 
    
    // 3. Cargar el historial o asegura que chatHistory es []
    loadHistory(); 
    
    // 4. Cargar preferencias de notificación
    loadNotificationPreferences(); 
    
    // 5. Inicializar el modo en Chat (Normal)
    isSPSMode = true; // Forzar a que la función lo ponga en FALSE
    toggleSPSMode(); // Se inicializa en modo normal (chat)
    hideLoadingIndicator(); 
    
    // 🛑 NUEVO: Resetear el modo Mención
    resetMentionMode();

    // 6. Mensaje de bienvenida inicial (solo si el historial está vacío)
    if (chatHistory.length === 0) {
         const welcomeMessage = currentLanguage === 'es'
            ? "¡Hola! Soy tu guía turístico de confianza, listo para acompañarte en cada paso. Activa el chip Modo Chat 💬 para conversar normalmente o tócalo para usar la potente Búsqueda Geográfica Directa (SPS) ⚡️ y encontrar lo que buscas al instante."
            : "Hi! I am your trusted tour guide, ready to accompany you at every step. Activate the Chat Mode chip 💬 to chat normally or touch it to use the powerful Direct Geographic Search (SPS) ⚡️ and find what you are looking for instantly.";
         
         chatHistory.push({ role: 'model', text: welcomeMessage, timestamp: new Date(), isStructured: false });
         renderChat();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Fallback si Google Maps no carga (para desarrollo local sin clave)
    if (typeof window.google === 'undefined' || typeof window.google.maps === 'undefined') {
        console.warn("Advertencia: Google Maps API no cargada. Inicializando UI en modo básico.");
        window.initChatUI();
    }
});
