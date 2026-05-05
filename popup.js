import { i18n } from './utils/i18n.js';
import { logger } from './utils/logger.js';

let currentLanguage = 'es';

document.addEventListener('DOMContentLoaded', async () => {
  // Cargar idioma guardado
  const stored = await chrome.storage.local.get(['language']);
  if (stored.language) {
    currentLanguage = stored.language;
    document.getElementById('languageSelect').value = currentLanguage;
  } else {
    // Detectar idioma del navegador
    const browserLang = navigator.language.split('-')[0];
    currentLanguage = browserLang === 'en' ? 'en' : 'es';
    document.getElementById('languageSelect').value = currentLanguage;
  }

  await i18n.init(currentLanguage);
  updateUI();

  // Event listeners
  document.getElementById('languageSelect').addEventListener('change', async (e) => {
    currentLanguage = e.target.value;
    await chrome.storage.local.set({ language: currentLanguage });
    await i18n.init(currentLanguage);
    updateUI();
  });

  document.getElementById('textReaderBtn').addEventListener('click', async () => {
    await activateFunction('textReader');
  });

  document.getElementById('keyboardNavBtn').addEventListener('click', async () => {
    await activateFunction('keyboardNav');
  });

  document.getElementById('visualNavBtn').addEventListener('click', async () => {
    await activateFunction('visualNav');
  });

  document.getElementById('a11yCheckBtn').addEventListener('click', async () => {
    await activateFunction('a11yCheck');
  });

});

function updateUI() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = i18n.t(key);
    if (el.classList.contains('function-btn')) {
      const btnText = el.querySelector('.btn-text');
      if (btnText) btnText.textContent = text;
    } else {
      el.textContent = text;
    }
  });
}

async function activateFunction(functionName) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tab) {
    showStatus('error', i18n.t('noActiveTab'));
    return;
  }

  // Verificar que no sea una página del navegador
  if (tab.url && (
      tab.url.startsWith('chrome://') || 
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('moz-extension://') ||
      tab.url.startsWith('edge://'))) {
    showStatus('error', i18n.t('notSupportedPage') || 'Esta función no está disponible en páginas del navegador');
    return;
  }

  try {
    // 1) Intentar enviar mensaje directamente
    let sent = await new Promise((resolve) => {
      try {
        chrome.tabs.sendMessage(tab.id, { action: 'activate', function: functionName }, () => {
          const err = chrome.runtime?.lastError;
          resolve(!err);
        });
      } catch (_) {
        resolve(false);
      }
    });

    // 2) Si no hay receptor, inyectar content.js y reintentar una vez
    if (!sent) {
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      } catch (_) {}

      sent = await new Promise((resolve) => {
        try {
          chrome.tabs.sendMessage(tab.id, { action: 'activate', function: functionName }, () => {
            const err = chrome.runtime?.lastError;
            resolve(!err);
          });
        } catch (_) {
          resolve(false);
        }
      });
    }
    
    if (!sent) throw new Error('No receiver for content message');
    
    // Abrir sidebar automáticamente
    await openSidebar();
    
    // Cerrar el popup después de un breve delay para asegurar que el sidebar se abra
    setTimeout(() => {
      window.close();
    }, 100);
  } catch (error) {
    logger.error('Error activating function:', error);
    showStatus('error', i18n.t('activationError'));
  }
}

async function openSidebar() {
  try {
    await chrome.sidePanel.open({ windowId: (await chrome.windows.getCurrent()).id });
  } catch (error) {
    logger.error('Error opening sidebar:', error);
    showStatus('error', i18n.t('sidebarError'));
  }
}

function showStatus(type, message) {
  const status = document.getElementById('status');
  status.className = `status ${type} active`;
  status.textContent = message;
  
  setTimeout(() => {
    status.classList.remove('active');
  }, 3000);
}
