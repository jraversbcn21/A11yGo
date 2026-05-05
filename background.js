// Service worker para la extensión
import { logger } from './utils/logger.js';

chrome.runtime.onInstalled.addListener(() => {
  logger.log('A11yGo extension installed');
});

// Manejar mensajes desde popup y sidebar
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'textReader' || message.action === 'setSpeed') {
    // Redirigir comandos del lector de texto y velocidad al content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, message);
      }
    });
    
    // También guardar velocidad en storage si es setSpeed
    if (message.action === 'setSpeed') {
      chrome.storage.local.set({ textReaderSpeed: message.speed });
    }
  }
  
  return true;
});

// Abrir sidebar cuando se hace clic en la acción
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});

// Reinyectar content.js en cambios de navegación (incluye SPA)
async function injectContentToTab(tabId) {
  try {
    // Verificar que no sea una URL chrome://, chrome-extension:// o similar
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || 
        tab.url.startsWith('chrome://') || 
        tab.url.startsWith('chrome-extension://') ||
        tab.url.startsWith('moz-extension://') ||
        tab.url.startsWith('edge://')) {
      return; // No inyectar en páginas del navegador
    }
    
    chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content.js']
    });
  } catch (e) {
    // ignorar errores silenciosamente
  }
}

// Cuando se compromete una navegación o cambia el history de una SPA
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.tabId && details.transitionType !== 'auto_subframe') {
    injectContentToTab(details.tabId);
  }
});

chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  if (details.tabId) {
    injectContentToTab(details.tabId);
  }
});
