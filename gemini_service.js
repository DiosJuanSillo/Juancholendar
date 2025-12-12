const GEMINI_API_KEY = 'AIzaSyCEVt3vmXMkgVYD7Cz8iWZZ_rmWyndNlOk'; // Nueva Key del usuario

/**
 * Interactúa con la API de Gemini
 * Intenta varios modelos en orden hasta encontrar uno que funcione.
 * Si todos fallan, ejecuta un diagnóstico de permisos.
 * @param {string} userText - Mensaje del usuario
 * @param {Array} currentEvents - Lista de eventos actuales (contexto)
 * @returns {Promise<Object>} - Objeto con { text, action: { type, data } }
 */
async function chatWithGemini(userText, currentEvents) {
    const now = new Date();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Crear contexto de agenda
    let agendaContext = "NO HAY EVENTOS PRÓXIMOS.";
    if (currentEvents && currentEvents.length > 0) {
        agendaContext = currentEvents.map(e => {
            const start = e.start.dateTime || e.start.date;
            return `- ID: ${e.id} | Título: ${e.summary} | Inicio: ${start}`;
        }).join('\n');
    }

    // System Prompt Optimizado para Modo JSON
    const systemPrompt = `
    Eres SmartCal, un secretario virtual experto en Google Calendar.
    Tu OBJETIVO es ayudar al usuario a gestionar su agenda.

    INFORMACIÓN ACTUAL:
    - Fecha: ${now.toLocaleString('es-ES', { timeZone })}
    - Zona Horaria: ${timeZone}
    
    AGENDA DEL USUARIO:
    ${agendaContext}
    
    TU SALIDA DEBE SER SIEMPRE UN OBJETO JSON con esta estructura exacta:
    {
        "response_text": "Tu respuesta conversacional y amable aquí.",
        "action": null // O un objeto de acción si el usuario pide cambios
    }

    POSIBLES ACCIONES ("action"):
    1. CREAR EVENTO:
       { "type": "create", "data": { "summary": "Título", "start": "YYYY-MM-DDTHH:mm:ss", "end": "YYYY-MM-DDTHH:mm:ss" } }
       * Importante: "start" y "end" deben ser ISO 8601 completos. Si el usuario no dice duración, asume 1 hora.
    
    2. BORRAR EVENTO:
       { "type": "delete", "data": { "eventId": "ID_DEL_EVENTO" } }
    
    REGLAS:
    - Si el usuario solo saluda o pregunta, "action" es null.
    - Si pide crear algo pero faltan datos (hora, día), PREGUNTA en "response_text" y pon "action": null. NO inventes horas.
    `;

    const requestBody = {
        "contents": [{
            "parts": [{
                "text": systemPrompt + "\n\nUSUARIO: " + userText
            }]
        }],
        "generationConfig": {
            "temperature": 0.2, // Más determinista para JSON
            "maxOutputTokens": 800,
            "responseMimeType": "application/json" // FORZAR JSON NATIVO
        }
    };

    // Lista de modelos a probar (Fallback Strategy)
    // El modo JSON funciona mejor en modelos Pro/Flash recientes
    const modelsToTry = [
        'gemini-2.5-flash',
        'gemini-2.0-flash',
        'gemini-1.5-pro',
        'gemini-1.5-flash',
        'gemini-pro' // Este podría fallar con responseMimeType, atraparemos el error
    ];

    let lastError = null;

    // --- INTENTO DE CONEXIÓN ---
    for (const model of modelsToTry) {
        try {
            console.log(`Intentando conectar con modelo: ${model}...`);

            // Ajuste de config si es el modelo legacy (gemini-pro no soporta responseMimeType en v1beta a veces)
            const currentBody = JSON.parse(JSON.stringify(requestBody));
            if (model === 'gemini-pro') {
                delete currentBody.generationConfig.responseMimeType;
            }

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(currentBody)
            });

            const data = await response.json();

            if (response.status === 429 || (data.error && data.error.status === 'RESOURCE_EXHAUSTED')) {
                return { response_text: "⚠️ **Límite de uso alcanzado.**<br>Google indica que se ha excedido la cuota gratuita (Error 429).<br>Espera unos minutos o prueba mañana.", action: null };
            }

            if (!response.ok) {
                console.warn(`Fallo con ${model}:`, data.error?.message);
                lastError = data.error?.message || response.statusText;
                continue;
            }

            if (!data.candidates || data.candidates.length === 0) {
                if (data.promptFeedback?.blockReason) {
                    return { response_text: `Bloqueado por seguridad (${model}): ${data.promptFeedback.blockReason}`, action: null };
                }
                continue;
            }

            // ÉXITO
            const rawText = data.candidates[0].content.parts[0].text;

            // Extracción robusta de JSON (incluso si el modelo es chattier)
            let parsed;
            try {
                // Intento directo
                parsed = JSON.parse(rawText);
            } catch (jsonErr) {
                // Fallback: Buscar primer { y último }
                const match = rawText.match(/\{[\s\S]*\}/);
                if (match) {
                    try {
                        parsed = JSON.parse(match[0]);
                    } catch (e2) {
                        console.error("JSON corrupto incluso tras regex:", match[0]);
                        // Devolver el texto crudo como respuesta para depurar
                        return { response_text: rawText + " (Error procesando acción)", action: null };
                    }
                } else {
                    return { response_text: rawText, action: null };
                }
            }

            return parsed;

        } catch (error) {
            console.error(`Error de red con ${model}:`, error);
            lastError = error.message;
        }
    }

    // --- DIAGNÓSTICO ---

    // --- SI FALLAN TODOS: DIAGNÓSTICO ---
    let diagMsg = `No pude conectar con ningún cerebro disponible. Último error: ${lastError}`;

    try {
        console.log("Diagnóstico: Consultando lista de modelos permitidos...");
        const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`);
        const listData = await listResp.json();

        if (listData.models) {
            const names = listData.models.map(m => m.name.replace('models/', '')).join(', ');
            diagMsg += `<br><br><b>Diagnóstico:</b> Tu API Key es válida. Modelos visibles: <br><small>${names}</small>`;
            console.log("Modelos disponibles:", names);
        } else {
            diagMsg += `<br><br><b>Diagnóstico:</b> Tu API Key no lista modelos. Error: ${JSON.stringify(listData.error)}`;
        }
    } catch (diagErr) {
        diagMsg += `<br><br><b>Diagnóstico fallido:</b> No pude siquiera listar los modelos. ${diagErr.message}`;
    }

    return { response_text: diagMsg, action: null };
}

// Exponer al window
window.geminiService = {
    chat: chatWithGemini
};
