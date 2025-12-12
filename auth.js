// Configuraciones de API de Google
// Credenciales proporcionadas por el usuario
const CLIENT_ID = '996686115852-utd86imrdu9ljmku5ubacktpg38pp6d4.apps.googleusercontent.com';
const API_KEY = 'AIzaSyAWny7ew7qDdtTwB3qqX4LJB5pgiA3s8oM';

// Discovery doc para Google Calendar API
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/calendar/v3/rest';

// Scopes de autorización (Permisos requeridos)
// 'https://www.googleapis.com/auth/calendar' permite leer y escribir
const SCOPES = 'https://www.googleapis.com/auth/calendar';

let tokenClient;
let gapiInited = false;
let gisInited = false;

// Callbacks para notificar a la app principal sobre cambios de estado
let onAuthSuccess = () => { };
let onAuthFail = () => { };

/**
 * Inicializa gapi (Google API Client Library)
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    checkAuthReady();
}

/**
 * Inicializa GIS (Google Identity Services)
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.error !== undefined) {
                console.error("Error de autenticación:", resp);
                throw (resp);
            }
            // Autenticación exitosa
            onAuthSuccess(resp);
        },
    });
    gisInited = true;
    checkAuthReady();
}

function checkAuthReady() {
    if (gapiInited && gisInited) {
        console.log("Servicios de Google listos. Intentando login silencioso...");

        // Intento de Silent Login (Persistencia)
        try {
            tokenClient.requestAccessToken({ prompt: '' });
        } catch (e) {
            console.log("Login silencioso falló (normal si es primera vez), esperando clic usuario.");
        }
    }
}

/**
 * Función pública para iniciar el flujo de login
 */
function handleAuthClick() {
    if (!tokenClient) {
        console.error("Google Identity Services no está listo");
        return;
    }
    // Solicita token de acceso. Si ya tiene uno, pedirá uno nuevo?
    // prompt: '' o 'consent'
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
}

/**
 * Función pública para cerrar sesión
 */
function handleSignoutClick() {
    const token = gapi.client.getToken();
    if (token !== null) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
        onAuthFail('User logged out');
    }
}

// Configurar los callbacks desde app.js
function setAuthCallbacks(successCb, failCb) {
    onAuthSuccess = successCb;
    onAuthFail = failCb;
}

// Exponer funciones globales para que las librerías async las encuentren o para uso desde app.js
window.gapiLoaded = gapiLoaded;
window.gisLoaded = gisLoaded;
window.authModule = {
    login: handleAuthClick,
    logout: handleSignoutClick,
    setCallbacks: setAuthCallbacks
};
