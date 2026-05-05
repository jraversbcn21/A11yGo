/**
 * Logger condicional para A11yGo
 * En producción los logs de debug están silenciados.
 * Activar con: chrome.storage.local.set({ a11yGoDebug: true })
 */

let debugEnabled = false;

try {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('a11yGoDebug', (result) => {
      debugEnabled = !!result.a11yGoDebug;
    });
  }
} catch (e) {
  // Context invalidated or no chrome API available
}

export const logger = {
  log(...args) {
    if (debugEnabled) console.log(...args);
  },
  warn(...args) {
    console.warn(...args);
  },
  error(...args) {
    console.error(...args);
  },
  setDebug(enabled) {
    debugEnabled = enabled;
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.set({ a11yGoDebug: enabled });
      }
    } catch (e) {
      // Context invalidated
    }
  }
};
