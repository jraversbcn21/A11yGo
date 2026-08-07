/**
 * Logger condicional para A11yGo
 * En producción log() y warn() están silenciados; error() siempre se imprime.
 * Activar el resto con: chrome.storage.local.set({ a11yGoDebug: true })
 */

let debugEnabled = false;

try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('a11yGoDebug', (result) => {
      debugEnabled = !!result.a11yGoDebug;
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.a11yGoDebug) {
        debugEnabled = !!changes.a11yGoDebug.newValue;
      }
    });
  }
} catch (_) {
  // Context invalidated or no chrome API available
}

export const logger = {
  log(...args) {
    if (debugEnabled) console.log(...args);
  },
  warn(...args) {
    if (debugEnabled) console.warn(...args);
  },
  // error() nunca se silencia: un fallo real debe ser diagnosticable sin
  // activar el flag de debug (p. ej. contexto de extensión invalidado)
  error(...args) {
    console.error(...args);
  },
  setDebug(enabled) {
    debugEnabled = enabled;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ a11yGoDebug: enabled });
      }
    } catch (_) {
      // Context invalidated
    }
  }
};
