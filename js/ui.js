// ui.js - Manejo del frontend para el chatbot

// Contenedor donde van los chips dinámicos
const chipsContainer = document.getElementById("chips-container");

// Enviar mensaje al backend
export async function sendMessageToBot(userMessage) {
  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage })
    });

    const data = await response.json();
    renderBotMessage(data.reply);

    // Crear chip si es recomendación local
    if (data.isLocalRecommendation) {
      createChip("Ver todos los lugares", () => {
        getAllPlaces(data.apiQueryForChip);
      });
    }
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
  }
}

// Crear un chip-botón
function createChip(label, onClick) {
  const chip = document.createElement("button");
  chip.className = "chip-button";
  chip.innerText = label;
  chip.onclick = onClick;
  chipsContainer.appendChild(chip);
}

// Solicitar todos los lugares desde Google Places
async function getAllPlaces(query) {
  try {
    const response = await fetch(`/api/places?query=${encodeURIComponent(query)}`);
    const data = await response.json();
    renderPlacesList(data.results);
  } catch (error) {
    console.error("Error al obtener lugares:", error);
  }
}

// Renderizar texto del bot en el chat
function renderBotMessage(text) {
  const chatBox = document.getElementById("chat-box");
  const msg = document.createElement("div");
  msg.className = "bot-message";
  msg.innerText = text;
  chatBox.appendChild(msg);
}

// Renderizar lista completa de lugares
function renderPlacesList(places) {
  const chatBox = document.getElementById("chat-box");
  const wrapper = document.createElement("div");
  wrapper.className = "places-list";

  places.forEach((p) => {
    const item = document.createElement("div");
    item.className = "place-item";
    item.innerHTML = `<strong>${p.name}</strong><br>${p.formatted_address || "Dirección no disponible"}`;
    wrapper.appendChild(item);
  });

  chatBox.appendChild(wrapper);
}
