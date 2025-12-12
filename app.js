/**
 * SmartCal App Logic - IA Powered by Gemini
 */

// Elementos del DOM
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const loginBtn = document.getElementById('google-login-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatMessages = document.getElementById('chat-messages');

// Estado
let lastFetchedEvents = [];

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    // Device Detection
    const deviceBadge = document.getElementById('device-badge');
    if (deviceBadge) {
        const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        if (isMobile) {
            deviceBadge.textContent = '📱 Móvil';
            deviceBadge.classList.add('mobile');
        } else {
            deviceBadge.textContent = '💻 Escritorio';
            deviceBadge.classList.add('desktop');
        }
    }

    loginBtn.addEventListener('click', () => window.authModule.login());
    signOutBtn.addEventListener('click', () => window.authModule.logout());
    window.authModule.setCallbacks(handleLoginSuccess, handleLogout);
    sendBtn.addEventListener('click', handleUserMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleUserMessage();
    });

    // --- SETTINGS LOGIC ---
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeSettings = document.getElementById('close-settings');
    const saveSettings = document.getElementById('save-settings');
    const ollamaUrlInput = document.getElementById('ollama-url');

    // Load saved URL
    ollamaUrlInput.value = localStorage.getItem('ollama_host') || 'http://localhost:11434';

    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
        // Small delay for animation
        setTimeout(() => settingsModal.classList.add('active'), 10);
    });

    function hideSettings() {
        settingsModal.classList.remove('active');
        setTimeout(() => settingsModal.classList.add('hidden'), 300);
    }

    closeSettings.addEventListener('click', hideSettings);

    saveSettings.addEventListener('click', () => {
        let url = ollamaUrlInput.value.trim();
        // Remove trailing slash if present
        if (url.endsWith('/')) url = url.slice(0, -1);

        if (url) {
            localStorage.setItem('ollama_host', url);
            alert('✅ Configuración guardada. La app ahora buscará la IA en: ' + url);
            hideSettings();
        }
    });

    // Close on click outside
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) hideSettings();
    });
});

// Sesión
function handleLoginSuccess(response) {
    switchScreen('chat');
    addBotMessage("¡Hola! Soy tu asistente inteligente. Ya estoy conectado a tu calendario. Cuéntame, ¿qué tienes en mente hoy?");
    // Pre-cargar eventos silenciosamente para dar contexto a Gemini
    refreshEventsList(true);
}

function handleLogout() {
    switchScreen('login');
    chatMessages.innerHTML = '';
}

function switchScreen(screenName) {
    if (screenName === 'chat') {
        loginScreen.classList.remove('active');
        loginScreen.classList.add('hidden');
        setTimeout(() => {
            chatScreen.classList.remove('hidden');
            chatScreen.classList.add('active');
        }, 500);
    } else {
        chatScreen.classList.remove('active');
        chatScreen.classList.add('hidden');
        setTimeout(() => {
            loginScreen.classList.remove('hidden');
            loginScreen.classList.add('active');
        }, 500);
    }
}

// Chat UI
async function handleUserMessage() {
    const text = userInput.value.trim();
    if (!text) return;

    addUserMessage(text);
    userInput.value = '';

    // Mostrar indicador de "Escribiendo..." o "Pensando..."
    const loadingId = addBotLoading();

    try {
        // 1. Obtener eventos actuales para contexto (importante para que sepa si estás libre)
        await refreshEventsList(true);

        // 2. Consultar a IA (Ahora usando Ollama Local por defecto,fallback a Gemini si se desea)
        // const decision = await window.geminiService.chat(text, lastFetchedEvents);
        const decision = await window.ollamaService.chat(text, lastFetchedEvents);

        // 3. Eliminar loading
        removeMessage(loadingId);

        // 4. Mostrar respuesta textual de Gemini
        if (decision.response_text) {
            addBotMessage(decision.response_text);
        }

        // 5. Ejecutar acciones si las hay
        // 5. Ejecutar acciones (Soporte para múltiples acciones)
        let actionsToExecute = [];
        if (decision.actions && Array.isArray(decision.actions)) {
            actionsToExecute = decision.actions;
        } else if (decision.action) {
            // Compatibilidad hacia atrás
            actionsToExecute = [decision.action];
        }

        for (const action of actionsToExecute) {
            if (action.type === 'create') {
                await createEvent(action.data);
            } else if (action.type === 'delete') {
                await deleteEvent(action.data.eventId);
            }
        }

    } catch (err) {
        removeMessage(loadingId);
        addBotMessage("Tuve un error procesando eso. " + err.message);
        console.error(err);
    }
}

function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'message user-message';
    div.textContent = text;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function addBotMessage(text) {
    const div = document.createElement('div');
    div.className = 'message bot-message';

    // 1. Detectar y convertir tablas Markdown a HTML
    // Regex busca bloques que parecen tabla: | col | col |\n|---|---|...
    // Nota: Es complejo hacerlo perfecto con regex, haremos una aproximación robusta para respuestas del LLM

    let formatted = text;

    // Función simple de parser de tabla
    if (text.includes('|') && text.includes('---')) {
        const lines = text.split('\n');
        let inTable = false;
        let tableHTML = '<table class="chat-table">';
        let processedLines = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('|')) {
                if (!inTable) {
                    inTable = true;
                    // Asumimos que la primera línea de tabla es Header
                    const headers = line.split('|').filter(c => c.trim() !== '').map(c => `<th>${c.trim()}</th>`).join('');
                    tableHTML += `<thead><tr>${headers}</tr></thead><tbody>`;
                    // Saltamos la siguiente línea si es separador |---|
                    if (lines[i + 1] && lines[i + 1].includes('---')) i++;
                } else {
                    // Filas normales
                    if (line.includes('---')) continue; // Ignorar separadores extra
                    const cells = line.split('|').filter(c => c.trim() !== '').map(c => `<td>${c.trim()}</td>`).join('');
                    tableHTML += `<tr>${cells}</tr>`;
                }
            } else {
                if (inTable) {
                    inTable = false;
                    tableHTML += '</tbody></table>';
                    processedLines.push(tableHTML);
                    tableHTML = '<table class="chat-table">'; // Reset por si hay otra
                }
                processedLines.push(line);
            }
        }
        if (inTable) {
            tableHTML += '</tbody></table>';
            processedLines.push(tableHTML);
        }
        formatted = processedLines.join('\n');
    }

    // 2. Formato de texto (Negritas, Cursivas, Saltos)
    formatted = formatted
        .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>') // Negrita
        .replace(/\*(.*?)\*/g, '<i>$1</i>')     // Cursiva
        .replace(/\n/g, '<br>');                 // Saltos de línea

    div.innerHTML = formatted;
    chatMessages.appendChild(div);
    scrollToBottom();
}

function addBotLoading() {
    const id = 'msg-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = 'message bot-message';
    div.innerHTML = '<i class="ri-loader-4-line" style="animation: spin 1s infinite linear;"></i> Pensando...';
    chatMessages.appendChild(div);
    scrollToBottom();
    return id;
}

function removeMessage(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- GOOGLE CALENDAR ACTIONS ---

async function refreshEventsList(silent = false) {
    try {
        const response = await gapi.client.calendar.events.list({
            'calendarId': 'primary',
            'timeMin': (new Date()).toISOString(),
            'showDeleted': false,
            'singleEvents': true,
            'maxResults': 100, // Aumentado a 100 para ver semanas futuras completas
            'orderBy': 'startTime',
        });
        lastFetchedEvents = response.result.items || [];
        if (!silent) console.log("Eventos actualizados:", lastFetchedEvents.length);
    } catch (err) {
        console.error("Error fetching events", err);
    }
}

async function createEvent(data) {
    // Validación básica de datos antes de llamar a API
    if (!data || !data.summary || !data.start || !data.end) {
        console.error("Datos incorrectos para evento:", data);
        addBotMessage(`❌ Error: La IA intentó crear un evento con datos incompletos. <br><small>${JSON.stringify(data)}</small>`);
        return;
    }

    // data: { summary, start (ISO), end (ISO) }
    const event = {
        'summary': data.summary,
        'description': 'Creado por SmartCal AI',
        'start': {
            'dateTime': data.start,
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
        'end': {
            'dateTime': data.end,
            'timeZone': Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
    };

    try {
        addBotMessage(`<i>⏳ Agendando: ${data.summary}...</i>`);
        const request = await gapi.client.calendar.events.insert({
            'calendarId': 'primary',
            'resource': event,
        });
        addBotMessage(`✅ <b>Hecho</b>. Evento creado: <a href="${request.result.htmlLink}" target="_blank" style="color: #6366f1;">Ver Link</a>`);
        // Actualizar contexto
        await refreshEventsList(true);
    } catch (err) {
        console.error("Google API Error:", err);
        const errorMsg = err.message || (err.result && err.result.error && err.result.error.message) || JSON.stringify(err);
        addBotMessage(`❌ Error con Google Calendar: ${errorMsg}`);
    }
}

async function deleteEvent(eventId) {
    if (!eventId) {
        addBotMessage("❌ Error interno: ID de evento no válido para borrar.");
        return;
    }

    try {
        addBotMessage("<i>⏳ Eliminando del calendario...</i>");
        await gapi.client.calendar.events.delete({
            'calendarId': 'primary',
            'eventId': eventId
        });
        addBotMessage("✅ Evento eliminado.");
        await refreshEventsList(true);
    } catch (err) {
        console.error("Error borrando:", err);
        const errorMsg = err.message || (err.result && err.result.error && err.result.error.message) || JSON.stringify(err);
        addBotMessage(`❌ Error borrando: ${errorMsg}`);
    }
}

// CSS Extra para loader
const style = document.createElement('style');
style.innerHTML = `
@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
`;
document.head.appendChild(style);
