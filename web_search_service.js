/**
 * Servicio de búsqueda web usando DuckDuckGo
 * Gratis e ilimitado
 */

/**
 * Busca en DuckDuckGo y devuelve resultados formateados
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Object>} - Resultados de búsqueda
 */
async function searchWeb(query) {
    try {
        // DuckDuckGo Instant Answer API
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

        const response = await fetch(url);
        const data = await response.json();

        let results = {
            abstract: null,
            answer: null,
            relatedTopics: []
        };

        // Respuesta directa (ej: "clima bogota", "2+2")
        if (data.Answer) {
            results.answer = data.Answer;
        }

        // Abstract (resumen de Wikipedia, etc.)
        if (data.Abstract) {
            results.abstract = {
                text: data.Abstract,
                source: data.AbstractSource,
                url: data.AbstractURL
            };
        }

        // Temas relacionados
        if (data.RelatedTopics && data.RelatedTopics.length > 0) {
            results.relatedTopics = data.RelatedTopics
                .filter(topic => topic.Text) // Solo los que tienen texto
                .slice(0, 5) // Máximo 5 resultados
                .map(topic => ({
                    text: topic.Text,
                    url: topic.FirstURL
                }));
        }

        // Si no hay resultados de Instant Answer, hacer búsqueda HTML
        if (!results.answer && !results.abstract && results.relatedTopics.length === 0) {
            return await searchWebScrape(query);
        }

        return results;

    } catch (error) {
        console.error('Error en búsqueda DuckDuckGo:', error);
        return { error: error.message };
    }
}

/**
 * Búsqueda alternativa usando DuckDuckGo HTML (más resultados)
 * @param {string} query - Término de búsqueda
 * @returns {Promise<Object>} - Resultados de búsqueda
 */
async function searchWebScrape(query) {
    try {
        // Usar un proxy CORS para evitar bloqueos
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

        const response = await fetch(proxyUrl + encodeURIComponent(ddgUrl));
        const html = await response.text();

        // Parsear resultados básicos del HTML
        const results = [];
        const regex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([^<]+)</g;

        let match;
        while ((match = regex.exec(html)) !== null && results.length < 5) {
            results.push({
                url: match[1],
                title: match[2].trim(),
                snippet: match[3].trim()
            });
        }

        return {
            searchResults: results,
            query: query
        };

    } catch (error) {
        console.error('Error en búsqueda scrape:', error);
        return { error: error.message, searchResults: [] };
    }
}

/**
 * Formatea los resultados de búsqueda para el modelo
 * @param {Object} results - Resultados de searchWeb
 * @returns {string} - Texto formateado para el contexto del modelo
 */
function formatSearchResults(results) {
    if (results.error) {
        return `[Error en búsqueda: ${results.error}]`;
    }

    let formatted = '--- RESULTADOS DE BÚSQUEDA WEB ---\n';

    if (results.answer) {
        formatted += `RESPUESTA DIRECTA: ${results.answer}\n\n`;
    }

    if (results.abstract) {
        formatted += `INFORMACIÓN (${results.abstract.source}):\n${results.abstract.text}\n`;
        formatted += `Fuente: ${results.abstract.url}\n\n`;
    }

    if (results.relatedTopics && results.relatedTopics.length > 0) {
        formatted += 'TEMAS RELACIONADOS:\n';
        results.relatedTopics.forEach((topic, i) => {
            formatted += `${i + 1}. ${topic.text}\n`;
        });
        formatted += '\n';
    }

    if (results.searchResults && results.searchResults.length > 0) {
        formatted += 'RESULTADOS DE BÚSQUEDA:\n';
        results.searchResults.forEach((result, i) => {
            formatted += `${i + 1}. ${result.title}\n   ${result.snippet}\n   URL: ${result.url}\n\n`;
        });
    }

    formatted += '--- FIN DE RESULTADOS ---';

    return formatted;
}

/**
 * Detecta si una pregunta necesita búsqueda web
 * @param {string} text - Texto del usuario
 * @returns {boolean} - True si necesita búsqueda
 */
function needsWebSearch(text) {
    const lowerText = text.toLowerCase();

    // Palabras clave que indican necesidad de búsqueda
    const searchTriggers = [
        'busca', 'buscar', 'búsqueda', 'google', 'internet',
        'qué es', 'quién es', 'cómo', 'cuándo', 'dónde',
        'clima', 'tiempo', 'temperatura', 'noticias', 'actualidad',
        'precio', 'cotización', 'dólar', 'euro',
        'significado', 'definición', 'wikipedia',
        'último', 'última', 'reciente', 'hoy', 'ayer',
        '/search', '/buscar'
    ];

    // Temas que probablemente necesitan info actual
    const currentInfoNeeded = [
        'presidente', 'gobierno', 'ley', 'covid', 'pandemia',
        'partido', 'resultado', 'marcador', 'gol'
    ];

    // Verificar triggers directos
    for (const trigger of searchTriggers) {
        if (lowerText.includes(trigger)) {
            return true;
        }
    }

    // Verificar si pregunta por información actual
    const isQuestion = lowerText.includes('?') ||
        lowerText.startsWith('qué') ||
        lowerText.startsWith('quién') ||
        lowerText.startsWith('cuál') ||
        lowerText.startsWith('cómo') ||
        lowerText.startsWith('cuánto');

    if (isQuestion) {
        for (const topic of currentInfoNeeded) {
            if (lowerText.includes(topic)) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Extrae el término de búsqueda de la pregunta del usuario
 * @param {string} text - Texto del usuario
 * @returns {string} - Término de búsqueda limpio
 */
function extractSearchQuery(text) {
    let query = text;

    // Remover comandos de búsqueda
    query = query.replace(/^\/?(buscar?|search)\s*/i, '');

    // Remover frases comunes
    query = query.replace(/^(qué es|quién es|cómo|cuándo|dónde|busca|búscame)\s*/i, '');

    // Limpiar signos de interrogación
    query = query.replace(/\?/g, '').trim();

    return query || text;
}

// Exponer al window
window.webSearchService = {
    search: searchWeb,
    format: formatSearchResults,
    needsSearch: needsWebSearch,
    extractQuery: extractSearchQuery
};
