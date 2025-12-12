/**
 * Servicio para interactuar con Ollama (Local AI)
 * Requiere que Ollama se esté ejecutando en el equipo en el puerto 11434.
 */

// URL por defecto: Ngrok tunnel (cambiar cuando reinicies ngrok)
const DEFAULT_OLLAMA_HOST = 'https://janiya-unalcoholized-lurline.ngrok-free.dev';
const DEFAULT_MODEL = 'qwen3-coder:480b-cloud';

function getOllamaHost() {
  return localStorage.getItem('ollama_host') || DEFAULT_OLLAMA_HOST;
}

/**
 * Interactúa con la API local de Ollama
 * @param {string} userText - Mensaje del usuario
 * @param {Array} currentEvents - Lista de eventos actuales (contexto)
 * @returns {Promise<Object>} - Objeto con { text, action: { type, data } }
 */
async function chatWithOllama(userText, currentEvents) {
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

  // Formato de fecha explícito para ayudar al modelo
  const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  const dateStr = now.toLocaleString('es-ES', dateOptions);
  const isoDate = now.toISOString().split('T')[0];

  // System Prompt FEW-SHOT (Ejemplos Reales) para Llama 3.2 1B
  const systemPrompt = `
    Eres un asistente de calendario inteligente.
    HOY ES: ${dateStr} (ISO: ${isoDate})
    
    TUS TAREAS:
    1. Analizar la petición del usuario.
    2. Mirar la AGENDA DEL USUARIO abajo para encontrar IDs si piden borrar.
    3. Responder SIEMPRE en JSON.
    
    AGENDA DEL USUARIO:
    ${agendaContext}

    EJEMPLOS DE COMPORTAMIENTO (ÚSALOS DE GUÍA):

    Usuario: "Hola"
    Asistente:
    {
      "response_text": "¡Hola! ¿En qué te ayudo con tu agenda?",
      "actions": []
    }

    Usuario: "Agendar Proyecto a las 10am de hoy"
    Asistente:
    {
      "response_text": "Agendado para las 10:00.",
      "actions": [ { "type": "create", "data": { "summary": "Proyecto", "start": "${isoDate}T10:00:00", "end": "${isoDate}T11:00:00" } } ]
    }

    Usuario: "Tengo que hacer 3 tareas de 1 hora y 2 sesiones de gym esta semana. Organízame."
    Asistente:
    {
      "response_text": "He organizado tu semana: 3 bloques de estudio y 2 de gimnasio en tus huecos libres.",
      "actions": [
        { "type": "create", "data": { "summary": "Tarea 1", "start": "${isoDate}T16:00:00", "end": "${isoDate}T17:00:00" } },
        { "type": "create", "data": { "summary": "Gimnasio", "start": "${isoDate}T18:00:00", "end": "${isoDate}T19:30:00" } },
        { "type": "create", "data": { "summary": "Tarea 2", "start": "FECHA_MAÑANA_T10:00:00", "end": "..." } },
        { "type": "create", "data": { "summary": "Gimnasio", "start": "FECHA_PASADO_T18:00:00", "end": "..." } },
        { "type": "create", "data": { "summary": "Tarea 3", "start": "...", "end": "..." } }
      ]
    }

    Usuario: "Borrar la reunión de Proyecto"
    Asistente:
    {
      "response_text": "Entendido, borrando el evento.",
      "actions": [ { "type": "delete", "data": { "eventId": "ID_ENCONTRADO_EN_AGENDA" } } ]
    }

    Usuario: "Dame una tabla de estudio para hoy (4 horas)."
    Asistente:
    {
      "response_text": "Aquí tienes tu plan:\\n| Hora | Actividad |\\n|---|---|\\n| 9:00 | Estudio Profundo |\\n| 11:00 | Descanso |",
      "actions": [
        { "type": "create", "data": { "summary": "Estudio Profundo", "start": "${isoDate}T09:00:00", "end": "${isoDate}T11:00:00" } },
        { "type": "create", "data": { "summary": "Descanso", "start": "${isoDate}T11:00:00", "end": "${isoDate}T11:30:00" } }
      ]
    }

    Usuario: "Organízame el día completo para ser productivo, tengo que avanzar en mi tesis."
    Asistente:
    {
      "response_text": "He diseñado una rutina de alto rendimiento para tu tesis, con bloques de trabajo profundo y descansos estratégicos.",
      "actions": [
        { "type": "create", "data": { "summary": "Bloque Tesis: Investigación", "start": "${isoDate}T09:00:00", "end": "${isoDate}T11:00:00" } },
        { "type": "create", "data": { "summary": "Descanso Activo", "start": "${isoDate}T11:00:00", "end": "${isoDate}T11:30:00" } },
        { "type": "create", "data": { "summary": "Bloque Tesis: Redacción", "start": "${isoDate}T11:30:00", "end": "${isoDate}T13:30:00" } },
        { "type": "create", "data": { "summary": "Almuerzo", "start": "${isoDate}T13:30:00", "end": "${isoDate}T14:30:00" } },
        { "type": "create", "data": { "summary": "Revisión y Planificación Mañana", "start": "${isoDate}T14:30:00", "end": "${isoDate}T15:30:00" } }
      ]
    }

    INSTRUCCIONES CRÍTICAS - ESTRATEGIA DE HORARIOS:
    1. **AUTONOMÍA**: Si el usuario pide "organizar", TÚ decides las horas. No preguntes.
    2. **TIME BLOCKING**: Usa bloques de 90-120 min para tareas difíciles.
    3. **REALISMO**: Deja huecos de 15-30 min entre tareas intensas (Descansos).
    4. **TABLAS**: Si es complejo, dibuja una tabla Markdown en "response_text" Y crea los eventos en "actions".
    5. **ROL**: Si te piden actuar como experto, hazlo en el tono de "response_text", pero mantén el JSON estricto.

    LÓGICA TEMPORAL Y SEMANAL (MUY IMPORTANTE):
    1. **SEMANA ACTUAL**: Si piden "esta semana" o "Lunes a Viernes", asume la SEMANA ACTUAL.
    2. **DÍAS PASADOS**: Si estamos a Martes y piden "Lunes a Viernes", empieza desde HOY (Martes) hasta el Viernes. ¡NO agendes para el Lunes pasado ni saltes al Lunes siguiente!
    3. **HOY**: Incluye el día de HOY en la planificación (aunque sea tarde, ajusta las horas restantes).
    4. **COHERENCIA**: No mezcles semanas. (Ej: No hagas Mie-Jue-Vie-Lun-Mar). Mantén el bloque contiguo.

    TU TURNO. RESPONDE SOLO EN JSON:
    `;

  try {
    const HOST = getOllamaHost();

    // Skip connection pre-check (fails on CORS)
    // Go directly to chat request

    const requestBody = {
      model: DEFAULT_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText }
      ],
      stream: false,
      format: "json",
      options: {
        temperature: 0.2,
        num_predict: 32768,
        num_ctx: 32768
      }
    };

    const response = await fetch(`${HOST}/api/chat`, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const errData = await response.json();
        errorMsg = errData.error || errorMsg;
      } catch (e) { }
      throw new Error(`Error Ollama: ${errorMsg}`);
    }

    const data = await response.json();
    const rawContent = data.message.content;

    // Limpieza de JSON (fix newlines)
    try {
      return JSON.parse(rawContent);
    } catch (e1) {
      console.warn("JSON inválido, intentando reparar...", e1);
      const fixedContent = rawContent.replace(/\n/g, "\\n");
      try {
        return JSON.parse(fixedContent);
      } catch (e2) {
        console.error("No se pudo reparar JSON:", rawContent);
        return { response_text: rawContent, action: null };
      }
    }

  } catch (error) {
    console.error("Error Ollama Service:", error);
    // LANZAR error para que app.js pueda hacer fallback a Gemini
    throw new Error(`Ollama: ${error.message}`);
  }
}

// Exponer al window
window.ollamaService = {
  chat: chatWithOllama
};
