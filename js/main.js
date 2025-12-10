/*
 * Archivo: js/main.js
 * Contiene toda la lógica de la aplicación, gestión de estados, interacción con Google Places,
 * y comunicación con el backend (API de Gemini).
 */

// **NOTA: Debe coincidir con el endpoint de Vercel/backend**
const BACKEND_URL = "/api/chat"; 
const MAX_CHAT_RESULTS = 4; // Límite de resultados mostrado en texto plano

let chatHistory = [];
let currentLanguage = 'es'; 
let categoriesVisible = false; 
let languageMenuVisible = false; 
let isBotTyping = false; 

// 🛑 ESTADO DE MODOS
let isSPSMode = false; // Búsqueda Directa (SPS)
let isMentionMode = false; // Modo Mención (@)
let currentMentionPlace = null; // { placeId: string, textName: string, query: string }
const MENTION_TOKEN = "[[PLACE_MENTION]]"; 
let autocompleteService; // Servicio de autocompletado de Google Places

// ESTADO DE RECOMENDACIÓN LOCAL
let lastTotalCount = 0; 
let lastApiQuery = null; 

// Referencias a Elementos del DOM
const inputElement = document.getElementById('user-input');
const sendButton = document.getElementById('send-message-button'); 
const messageContainer = document.getElementById('message-container');
const appAlertContainer = document.getElementById('app-alert-container');
const categoryChipsGroup = document.getElementById('category-chips-group');
const languageChipsGroup = document.getElementById('language-chips-group');
const categoryChips = document.querySelectorAll('#category-chips-group .category-chip');
const languageChips = document.querySelectorAll('#language-chips-group .language-chip');
const menuActionChips = document.querySelectorAll('#menu-actions .menu-action-chip');
const btnClearTop = document.getElementById('btn-clear-top'); 
const btnNotifications = document.getElementById('btn-notifications');
const notificationModal = document.getElementById('notification-preferences-modal');
const notificationPanel = document.querySelector('#notification-preferences-modal .notification-panel');
const toggleNews = document.getElementById('toggle-news');
const toggleReminders = document.getElementById('toggle-reminders');
const togglePromotions = document.getElementById('toggle-promotions'); 
const btnDiscardChanges = document.getElementById('btn-discard-changes');
const btnApplyChanges = document.getElementById('btn-apply-changes');
const quickActionFullList = document.getElementById('quick-action-full-list');
const btnViewAllPlaces = document.getElementById('btn-view-all-places');
const dynamicChipsGroup = document.getElementById('dynamic-chips-group');
const dynamicChipsList = document.getElementById('dynamic-chips-list');
const autocompleteChipsGroupContainer = document.getElementById('autocomplete-chips-group-container');
const mapSearchBar = document.getElementById('map-search-bar'); 
const userTypingBubble = document.getElementById('user-typing-bubble');
const modelTypingBubble = document.getElementById('model-typing-bubble'); 
const toggleButton = document.getElementById('toggle-mode-button');
const toggleText = document.getElementById('toggle-text');


// Objeto de Traducción y textos de chips (ACTUALIZADO PARA SPS)
const UI_STRINGS = {
    es: {
        header: "PROGRESO TOUR GUIDE",
        placeholder: "Pregúntale al mapa",
        searchPlaceholder: "Nombre del lugar o negocio...", 
        goButton: "Enviar", 
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
        spsMode: "Modo Pro ●Activado 🦾",
        chatMode: "Modo Chat 💬",
        mentionPlaceholder: (name) => `Conversando sobre ${name}...`
    },
    en: {
        header: "PROGRESO TOUR GUIDE",
        placeholder: "Ask the map",
        searchPlaceholder: "Enter the business name...", 
        goButton: "Send", 
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
        spsMode: "Pro Mode ●Active 🦾",
        chatMode: "Chat Mode 💬",
        mentionPlaceholder: (name) => `Conversing about ${name}...`
    }
};

// Objeto de mapeo de Subcategorías (para chips debajo de la burbuja)
const SUBCATEGORIES_MAP = {
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
    "Dime sobre la Categoría Compras y Tiendas en Progreso": [
        { label: "Ropa y Moda 👕", query: "Tiendas de ropa y moda en Progreso" },
        { label: "Artesanías 🎁", query: "Artesanías y souvenirs en Progreso" },
        { label: "Vinos y Licores 🍾", query: "Tiendas de vinos y licores en Progreso" },
        { label: "Joyería y Regalos 💍", query: "Joyerías y tiendas de regalos en Progreso" },
        { label: "Todos de Compras 🛍️", query: "Todos los lugares de compras y tiendas en Progreso" }
    ],
    "Dime sobre la Categoría Entretenimiento y Atracciones en Progreso": [
        { label: "Atracciones 🎡", query: "Atracciones turísticas en Progreso" },
        { label: "Bares y Cantinas 🍺", query: "Bares y cantinas en Progreso" },
        { label: "Hoteles y Hospedaje 🏨", query: "Hoteles y hospedaje en Progreso" },
        { label: "Eventos y Fiestas 🎉", query: "Próximos eventos y fiestas en Progreso" }
    ],
};

// Estado inicial de las preferencias de notificación
let notificationPreferences = {
    news: true,      // Alertas de interfaz, historial, etc.
    reminders: true, // Alertas estructuradas (fichas de lugar/categoría)
    promotions: false
};

// --- Funciones de PERSISTENCIA y CONTROL ---

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
    
    if (messageContainer) {
        const typingBubbles = [userTypingBubble, modelTypingBubble];
        Array.from(messageContainer.children).forEach(child => {
            if (!typingBubbles.includes(child)) {
                messageContainer.removeChild(child);
            }
        });
        hideUserTypingBubble();
        hideModelTypingBubble();
    }
    
    alertUser(currentLanguage === 'es' ? '¡Conversación eliminada! Empecemos de cero. 👋' : 'Conversation cleared! Let\'s start fresh. 👋', 'i', 'news');
    scrollToBottom();
    quickActionFullList.classList.add('hidden');
    dynamicChipsGroup.classList.add('hidden');
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';
    lastTotalCount = 0;
    lastApiQuery = null;
    if (isSPSMode) toggleSPSMode();
    resetMentionMode();
    inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
}

function loadHistory() {
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
        chatHistory = []; 
    }
    if (!loaded) {
        chatHistory = []; 
    }
    return loaded;
}

function loadNotificationPreferences() {
    try {
        const savedPrefs = localStorage.getItem('notificationPreferences');
        if (savedPrefs) {
            notificationPreferences = JSON.parse(savedPrefs);
        }
        if (toggleNews) toggleNews.checked = notificationPreferences.news;
        if (toggleReminders) toggleReminders.checked = notificationPreferences.reminders;
    } catch (e) {
        console.error("Error al cargar las preferencias de notificación:", e);
    }
}

// --- Funciones de Utilidad y UI ---

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

function isScrolledToBottom() {
    if (!messageContainer) return true;
    const scrollDifference = messageContainer.scrollHeight - messageContainer.scrollTop;
    const viewportHeight = messageContainer.clientHeight;
    const isNearBottom = scrollDifference <= viewportHeight + 200;
    return isNearBottom;
}

function alertUser(m, t='i', preferenceType = 'news') {
    if (t !== 'error' && !notificationPreferences[preferenceType]) {
        return; 
    }
    // Lógica para mostrar la notificación flotante
    // ... (El cuerpo completo de la función alertUser)
    
    // Simplificado para la demostración
    const a = document.createElement('div');
    const icon = (t === 'error') ? '❌' : (t === 'i' ? 'ℹ️' : '✅'); 
    a.className = 'notification-card show pointer-events-auto';
    a.innerHTML = `<div class="message-content"><span class="mr-2">${icon}</span> <span>${m}</span></div><button class="close-btn" aria-label="Cerrar notificación">×</button>`;
    if (appAlertContainer) {
        appAlertContainer.innerHTML = ''; // Limpiar el anterior
        appAlertContainer.appendChild(a);
    }
    setTimeout(() => { if (a.parentNode) a.remove(); }, 4000);
}

function scrollToBottom() { 
    if (messageContainer) messageContainer.scrollTop = messageContainer.scrollHeight; 
}

// 🛑 Solución al problema de Scroll con el teclado en Móviles
function handleInputFocus() {
    if (!inputElement || !messageContainer || !document.getElementById('bottom-bar-search-wrapper')) return;
    const bottomBarWrapper = document.getElementById('bottom-bar-search-wrapper');
    bottomBarWrapper.scrollIntoView({ behavior: 'instant', block: 'end' });
    setTimeout(() => {
         messageContainer.scrollTop = messageContainer.scrollHeight;
         bottomBarWrapper.scrollIntoView({ behavior: 'instant', block: 'end' });
    }, 150); 
}

function hideModelTypingBubble() { modelTypingBubble.classList.remove('show'); }

function showLoadingIndicator() {
    isBotTyping = true;
    hideUserTypingBubble(); 
    modelTypingBubble.classList.add('show'); 
    inputElement.placeholder = UI_STRINGS[currentLanguage].loadingStatus;
    inputElement.disabled = true;
    sendButton.disabled = true;
    toggleButton.disabled = true;
    scrollToBottom(); 
}

function hideLoadingIndicator() {
    isBotTyping = false;
    hideModelTypingBubble(); 
    if (isSPSMode) { 
        inputElement.placeholder = UI_STRINGS[currentLanguage].searchPlaceholder;
    } else if (currentMentionPlace) {
         inputElement.placeholder = UI_STRINGS[currentLanguage].mentionPlaceholder(currentMentionPlace.textName);
    } else {
        inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
    }
    inputElement.disabled = false;
    toggleButton.disabled = false;
    sendButton.disabled = isSPSMode || inputElement.value.trim() === ''; 
}

function hideUserTypingBubble() { userTypingBubble.classList.remove('show'); }

function handleTypingIndicator() {
    const inputValue = inputElement.value.trim();
    if (inputValue.length > 0 && !isBotTyping && !isSPSMode) { 
        userTypingBubble.classList.add('show');
        if (isScrolledToBottom()) { scrollToBottom(); }
    } else {
        hideUserTypingBubble();
    }
}

function resetMentionMode() {
    isMentionMode = false;
    currentMentionPlace = null;
    if (!isSPSMode) {
         inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
    }
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';
}

// --- Lógica del Modo SPS y Mención (@) ---

function toggleSPSMode() { 
    isSPSMode = !isSPSMode;

    if (isSPSMode) {
        inputElement.classList.add('sps-mode'); 
        toggleButton.classList.add('active');
        toggleText.innerHTML = UI_STRINGS[currentLanguage].spsMode; 
        inputElement.placeholder = UI_STRINGS[currentLanguage].searchPlaceholder;
        sendButton.disabled = true; 
        resetMentionMode();
    } else {
        inputElement.classList.remove('sps-mode'); 
        toggleButton.classList.remove('active');
        toggleText.innerHTML = UI_STRINGS[currentLanguage].chatMode; 
        inputElement.placeholder = UI_STRINGS[currentLanguage].placeholder;
        sendButton.disabled = inputElement.value.trim() === ''; 
        autocompleteChipsGroupContainer.classList.add('hidden');
        autocompleteChipsGroupContainer.innerHTML = '';
    }
    inputElement.value = '';
    inputElement.focus();
}

function handleAutocompleteInput(e) {
    const input = e.target.value;
    let query = input.trim();
    
    // Lógica de Detección de Modo Mención (@)
    if (!isSPSMode) {
        const mentionIndex = input.lastIndexOf('@');
        if (mentionIndex !== -1 && !currentMentionPlace) {
            isMentionMode = true;
            query = input.substring(mentionIndex + 1).trim(); 
        } else if (currentMentionPlace) {
            autocompleteChipsGroupContainer.classList.add('hidden');
            return;
        } else {
            isMentionMode = false;
            autocompleteChipsGroupContainer.classList.add('hidden');
            return;
        }
    }
    
    if (!autocompleteService) return;

    if (query.length > 2) {
        const progressoBounds = new google.maps.LatLngBounds(
            new google.maps.LatLng(26.0, -98.1), 
            new google.maps.LatLng(26.1, -97.9)  
        );
        autocompleteService.getPlacePredictions({ 
            input: query, 
            bounds: progressoBounds,
            strictBounds: true,
            types: ['establishment', 'geocode'],
            componentRestrictions: { country: 'mx' } 
        }, renderAutocompleteChips);
        
    } else {
        autocompleteChipsGroupContainer.classList.add('hidden');
        autocompleteChipsGroupContainer.innerHTML = '';
    }
}

function renderAutocompleteChips(predictions, status) {
    autocompleteChipsGroupContainer.innerHTML = '';
    if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions || predictions.length === 0) {
        autocompleteChipsGroupContainer.classList.add('hidden');
        return;
    }
    autocompleteChipsGroupContainer.classList.remove('hidden');

    predictions.forEach(prediction => {
        const chip = document.createElement('button');
        chip.className = 'autocomplete-chip';
        let chipText = prediction.structured_formatting ? prediction.structured_formatting.main_text : prediction.description;
        if (prediction.structured_formatting && prediction.structured_formatting.secondary_text) {
             chipText += ` (${prediction.structured_formatting.secondary_text.split(',')[0].trim()})`;
        }
        chip.textContent = chipText;
        chip.dataset.placeId = prediction.place_id;
        chip.onclick = () => onPlaceSelected({ 
            name: chipText, 
            place_id: prediction.place_id,
            description: prediction.description
        });
        autocompleteChipsGroupContainer.appendChild(chip);
    });
    
    const attributionChip = document.createElement('div');
    attributionChip.className = 'attribution-chip';
    attributionChip.innerHTML = `Powered by Google <a href="https://cloud.google.com/maps-platform/terms" target="_blank" rel="noopener noreferrer" style="color: #007bff; margin-left: 5px;">Términos</a>`;
    autocompleteChipsGroupContainer.appendChild(attributionChip);
    autocompleteChipsGroupContainer.scrollLeft = 0;
}

function onPlaceSelected(prediction) {
    const placeId = prediction.place_id;
    const placeName = prediction.name;
    const placeDescription = prediction.description;
    
    autocompleteChipsGroupContainer.classList.add('hidden');
    autocompleteChipsGroupContainer.innerHTML = '';

    if (isSPSMode) { 
        // MODO SPS
        chatHistory.push({ 
            role: 'user', 
            text: currentLanguage === 'es' ? `⚡️ Búsqueda SPS del lugar: **${placeDescription}**` : `⚡️ SPS Search for place: **${placeDescription}**`,
            timestamp: new Date() 
        });
        if (typeof renderChat === 'function') renderChat();
        inputElement.value = '';
        handleSend(`Búsqueda directa del lugar ${placeName}`, placeId);
        toggleButton.disabled = true; 
        showLoadingIndicator(); 
        
    } else if (isMentionMode) {
        // MODO MENCION
        currentMentionPlace = { 
            placeId: placeId, 
            textName: placeName,
            query: inputElement.value.substring(inputElement.value.lastIndexOf('@') + 1).trim()
        };
        const mentionIndex = inputElement.value.lastIndexOf('@');
        if (mentionIndex !== -1) {
            inputElement.value = inputElement.value.substring(0, mentionIndex) + '@' + placeName;
        }
        inputElement.placeholder = UI_STRINGS[currentLanguage].mentionPlaceholder(placeName);
        sendButton.disabled = inputElement.value.trim() === '';
        isMentionMode = false;
    }
}

// --- Renderizado y Listeners de Burbujas ---

function createMessageBubble(m) {
    const w = document.createElement('div');
    const timeStr = m.timestamp ? formatTime(m.timestamp) : '';
    let timeSpan = timeStr ? `<div class="${m.role === 'user' ? 'user-timestamp-container' : 'model-timestamp-container'}"><span class="timestamp">${timeStr}</span></div>` : '';
    
    if (m.role === 'user') { 
        w.className = 'flex justify-end mb-2'; 
        w.innerHTML = `<div class="flex flex-col items-end"><div class="user-bubble bg-black text-white p-3 shadow-md">${m.text}</div>${timeSpan}</div>`; 
    } 
    else if (m.role === 'model') {
        w.className = 'flex flex-col justify-start w-full mb-2';
        
        let content = '';
        let actionsBar = '';
        let imageHTML = ''; 
        const strings = UI_STRINGS[currentLanguage];

        if (m.isStructured) { 
            const isPlaceOrCategory = (m.type === 'place' || m.type === 'category');
            
            if (isPlaceOrCategory && m.imageUrl) {
                imageHTML = `<a href="${m.mapUrl || '#'}" target="_blank" rel="noopener noreferrer" class="image-link"><img src="${m.imageUrl}" class="stacked-photo clickable-effect" alt="Imagen del lugar ${m.placeName || m.categoryName || ''}" loading="lazy"></a>`;
            }
            
            content = `<div class="flex flex-col items-start"><div class="model-bubble-wrapper p-3 shadow-md">${imageHTML} <div class="model-bubble">${m.text}</div></div></div>`;
            
            if (m.type !== 'place_not_found') {
                const hasSubMenu = m.menuKey && SUBCATEGORIES_MAP[m.menuKey];
                
                if (hasSubMenu) {
                    const subChips = SUBCATEGORIES_MAP[m.menuKey];
                    let subChipsHTML = subChips.map(chip => `<div class="action-chip glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-query="${chip.query}">${chip.label}</div>`).join('');
                    actionsBar = `<div class="action-bar-container"><div class="inline-flex space-x-3 p-1">${subChipsHTML}</div></div>`;
                } else {
                    const isPlace = m.type === 'place';
                    const isHealthPlace = m.isHealthPlace === true; 
                    const entityName = isPlace ? (m.placeName || strings.getThere) : (m.categoryName || strings.categories);
                    let actionsHTML = '';
                    
                    if (isPlace && m.websiteUrl) actionsHTML += `<div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="WEBSITE" data-website-url="${m.websiteUrl}">${strings.btnWebsite}</div>`;
                    if (m.mapUrl) actionsHTML += `<div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="MAP" data-map-url="${m.mapUrl}">${strings.btnMap}</div>`;
                    if (isPlace && !isHealthPlace) {
                        if (m.placePhone) actionsHTML += `<div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="PHONE" data-phone="${m.placePhone}">${strings.btnPhone}</div>`;
                        if (m.reviewUrl) actionsHTML += `<div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="REVIEW" data-review-url="${m.reviewUrl}">${strings.btnReview}</div>`;
                    }
                    if (entityName) actionsHTML += `<div class="action-chip blue-glass-chip flex items-center p-2 rounded-full text-sm font-semibold cursor-pointer" data-action="SEARCH" data-entity-name="${entityName}">${strings.btnSearch}</div>`;

                    if (actionsHTML.length > 0) actionsBar = `<div class="action-bar-container"><div class="inline-flex space-x-3 p-1">${actionsHTML}</div></div>`;
                }
            } 
            w.innerHTML = `<div class="flex flex-col items-start">${content}${actionsBar}${timeSpan}</div>`;

        } else {
            content = `<div class="model-bubble-wrapper p-3 pb-4 shadow-md">${m.text || ''}</div>`;
            w.innerHTML = `<div class="flex flex-col items-start">${content}${timeSpan}</div>`;
        }
    }
    return w;
}

function attachSubMenuListeners() {
    const subMenuChips = messageContainer.querySelectorAll('.action-bar-container .glass-chip');
    subMenuChips.forEach(chip => {
        if (chip.classList.contains('listener-attached')) return; 
        chip.addEventListener('click', function() {
            vibrateDevice();
            handleSend(this.getAttribute('data-query')); 
        });
        chip.classList.add('listener-attached');
    });
    
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
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(this.getAttribute('data-entity-name') + " Nuevo Progreso Tamps")}`;
                window.open(searchUrl, '_blank');
                alertUser(currentLanguage === 'es' ? `Buscando "${this.getAttribute('data-entity-name')}" en Google.` : `Searching for "${this.getAttribute('data-entity-name')}" on Google.`, 'i', 'news');
            } else if (action === 'PHONE' && this.getAttribute('data-phone')) {
                window.location.href = `tel:${this.getAttribute('data-phone').replace(/\D/g, '')}`;
                alertUser(currentLanguage === 'es' ? `Llamando a ${this.getAttribute('data-phone')}.` : `Calling ${this.getAttribute('data-phone')}.`, 'i', 'news');
            } else if (action === 'REVIEW' && this.getAttribute('data-review-url')) {
                window.open(this.getAttribute('data-review-url'), '_blank');
                alertUser(currentLanguage === 'es' ? 'Abriendo reseña en nueva ventana.' : 'Opening review in new window.', 'i', 'news');
            } else if (action === 'WEBSITE' && this.getAttribute('data-website-url')) {
                window.open(this.getAttribute('data-website-url'), '_blank');
                alertUser(currentLanguage === 'es' ? 'Abriendo sitio web en nueva ventana.' : 'Opening website in new window.', 'i', 'news');
            }
        });
        button.classList.add('listener-attached');
    });
}

function renderChat() {
    if (messageContainer) {
        const typingBubbles = [userTypingBubble, modelTypingBubble];
        const messages = Array.from(messageContainer.children).filter(child => !typingBubbles.includes(child));
        messages.forEach(msg => msg.remove());

        chatHistory.forEach((m) => { 
            const messageElement = createMessageBubble(m);
            messageContainer.insertBefore(messageElement, modelTypingBubble); 
        });
        
        scrollToBottom();
        attachSubMenuListeners(); 
    }
}

// --- Lógica de Comunicación con el Backend ---

async function getGeminiResponse(userPrompt, chatHistoryForAPI, placeId = null) {
    const historyForAPI = chatHistoryForAPI.map(m => {
        const textContent = m.isStructured && m.description ? m.description : m.text;
        return { role: m.role, parts: [{ text: textContent }] };
    });

    try {
        const response = await fetch(BACKEND_URL, { 
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                history: historyForAPI, 
                userPrompt: userPrompt, 
                currentLanguage: currentLanguage,
                directSearchQuery: placeId 
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
        alertUser(`Error de conexión: ${error.message}.`, 'error');
        return null;
    }
}

// --- Lógica Principal del Chatbot (handleSend) ---
async function handleSend(userPromptInput = null, placeIdForDirectSearch = null) {
    
    const isSPSorDirect = placeIdForDirectSearch !== null;
    let userPrompt = userPromptInput || inputElement.value.trim();
    if (!userPrompt || (isSPSMode && !isSPSorDirect)) return;
    
    // Lógica de Mención: Reemplazar el nombre del lugar por el token [[PLACE_MENTION]]
    let placeIdForAPI = placeIdForDirectSearch;
    if (currentMentionPlace && !isSPSorDirect) {
        placeIdForAPI = currentMentionPlace.placeId;
        const mentionText = '@' + currentMentionPlace.textName;
        const regex = new RegExp(mentionText.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
        userPrompt = userPrompt.replace(regex, MENTION_TOKEN);
        resetMentionMode();
    }

    // Ocultar chips
    [categoryChipsGroup, languageChipsGroup, quickActionFullList, dynamicChipsGroup, autocompleteChipsGroupContainer].forEach(e => e.classList.add('hidden'));
    
    showLoadingIndicator(); 

    if (!isSPSorDirect) {
        let userHistoryText = userPromptInput || inputElement.value.trim();
        if (placeIdForAPI && !isSPSorDirect) { userHistoryText = inputElement.value.trim(); }
        chatHistory.push({ role: 'user', text: userHistoryText, timestamp: new Date() }); 
    }
    
    if (typeof renderChat === 'function') renderChat();
    inputElement.value = '';

    const MAX_HISTORY_TO_SEND = 10; 
    const previousHistory = chatHistory.slice(0, -1); 
    const startIndex = Math.max(0, previousHistory.length - MAX_HISTORY_TO_SEND);
    const limitedHistory = previousHistory.slice(startIndex);
    
    let modelResponseText = await getGeminiResponse(userPrompt, limitedHistory, placeIdForAPI); 
    
    hideLoadingIndicator(); 

    if (modelResponseText === null) { return; }

    
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

            let fichasParaMostrar = [];
            let conversationText = modelResponseText.replace(jsonString, '').trim();

            if (parsedJson.isMultiStructured === true && Array.isArray(parsedJson.response)) {
                fichasParaMostrar = parsedJson.response;
                if (parsedJson.conversationText) conversationText = parsedJson.conversationText;
            } else if (parsedJson.isStructured === true) {
                fichasParaMostrar = [parsedJson];
            } else if (parsedJson.isLocalRecommendation === true) {
                totalCount = parsedJson.totalCount || 0;
                apiQuery = parsedJson.apiQueryForChip || null;
                finalMessage.text = conversationText;
                if (finalMessage.text.length < 5) finalMessage.text = modelResponseText;
            } else if (parsedJson.isDynamicChips === true) {
                dynamicChipsData = parsedJson.chips;
                finalMessage.text = conversationText;
                if (finalMessage.text.length < 5) finalMessage.text = modelResponseText;
            }
            
            let shouldAddMenuKey = SUBCATEGORIES_MAP[userPrompt];

            if (fichasParaMostrar.length > 0) {
                if (conversationText.length > 0) {
                    chatHistory.push({ role: 'model', text: conversationText, timestamp: new Date(), isStructured: false });
                }
                
                fichasParaMostrar.forEach(ficha => {
                    let menuKey = (ficha.type === 'category' && shouldAddMenuKey) ? userPrompt : null;
                    
                    chatHistory.push({ 
                        role: 'model', 
                        isStructured: true,
                        type: ficha.type, 
                        text: ficha.description || ficha.text, 
                        placeName: ficha.placeName, 
                        placePhone: ficha.placePhone || null, 
                        mapUrl: ficha.mapUrl || null,
                        reviewUrl: ficha.reviewUrl || null,
                        websiteUrl: ficha.websiteUrl || null, 
                        categoryName: ficha.categoryName || null,
                        isHealthPlace: ficha.isHealthPlace || false, 
                        menuKey: menuKey,
                        imageUrl: ficha.imageUrl || null,
                        timestamp: new Date()
                    });
                    
                    if (fichasParaMostrar.indexOf(ficha) === 0) {
                       const isPlace = ficha.type === 'place';
                       const entityName = isPlace ? (ficha.placeName || strings.getThere) : (ficha.categoryName || strings.categories);
                       const alertText = isPlace ? UI_STRINGS[currentLanguage].alertStructured(entityName) : UI_STRINGS[currentLanguage].alertCategory(entityName);
                       if (typeof alertUser === 'function') alertUser(alertText, "i", "reminders");
                    }
                });
                saveHistory(); 
                if (typeof renderChat === 'function') renderChat();
                return;
            }
        }
    } catch (e) {
        console.error("Error al parsear JSON estructurado, de chip o array:", e);
        finalMessage.text = modelResponseText;
    }

    chatHistory.push(finalMessage);

    lastTotalCount = 0;
    lastApiQuery = null;
    
    if (dynamicChipsData && dynamicChipsData.length > 0) {
        // Lógica de renderDynamicChips... (omito el cuerpo por concisión)
        dynamicChipsGroup.classList.remove('hidden');
    } else if (totalCount > MAX_CHAT_RESULTS && apiQuery) {
        lastTotalCount = totalCount;
        lastApiQuery = apiQuery;
        btnViewAllPlaces.innerHTML = currentLanguage === 'es' ? `➡️ Ver todos los ${totalCount} lugares` : `➡️ View all ${totalCount} places`;
        quickActionFullList.classList.remove('hidden');
    }

    saveHistory(); 
    if (typeof renderChat === 'function') renderChat();
}


// --- Event Listeners e Inicialización ---

if (sendButton) sendButton.addEventListener('click', () => { if (!isSPSMode) handleSend(); });
if (inputElement) {
    inputElement.addEventListener('keypress', function(e) { 
        if (e.key === 'Enter' && !isSPSMode) { handleSend(); } 
    });
    inputElement.addEventListener('focus', handleInputFocus);
    inputElement.addEventListener('input', handleAutocompleteInput);
    inputElement.addEventListener('input', () => {
        const inputValue = inputElement.value.trim();
        if (currentMentionPlace) {
            const mentionText = '@' + currentMentionPlace.textName;
            if (!inputElement.value.includes(mentionText)) resetMentionMode();
        }
        sendButton.disabled = isSPSMode || inputValue === ''; 
        if (!isSPSMode && !isMentionMode && !currentMentionPlace) { handleTypingIndicator(); } else { hideUserTypingBubble(); }
    });
}
if (toggleButton) toggleButton.addEventListener('click', toggleSPSMode);

// Listeners de menú, chips, notificaciones, etc. (cuerpos omitidos por concisión)
menuActionChips.forEach(chip => chip.addEventListener('click', function() { /* handleMenuAction... */ }));
// ... (Otros listeners) ...


/**
 * Función de callback de la API de Maps.
 * Inicializa la UI después de que Google Maps/Places ha cargado.
 */
window.initChatUI = function() {
    if (window.google && google.maps.places) {
        autocompleteService = new google.maps.places.AutocompleteService();
        console.log("Google Maps AutocompleteService inicializado.");
    }
    
    // Inicialización de la interfaz
    hideUserTypingBubble();
    hideModelTypingBubble();
    setInterfaceLanguage(currentLanguage); 
    loadHistory(); 
    loadNotificationPreferences(); 
    isSPSMode = true; 
    toggleSPSMode(); 
    hideLoadingIndicator(); 
    resetMentionMode();

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
