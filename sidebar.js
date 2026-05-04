import { i18n } from './utils/i18n.js';

let currentLanguage = 'es';
let currentPanel = 'default';
let activeTabId = null;

document.addEventListener('DOMContentLoaded', async () => {
  // Cargar idioma guardado
  const stored = await chrome.storage.local.get(['language']);
  if (stored.language) {
    currentLanguage = stored.language;
  } else {
    const browserLang = navigator.language.split('-')[0];
    currentLanguage = browserLang === 'en' ? 'en' : 'es';
  }

  await i18n.init(currentLanguage);
  updateUI();

  // Si hay un módulo activo (activado desde popup antes de que el sidebar abriera),
  // mostrar su panel. Resuelve el race condition: el switchPanel message se envía
  // antes de que el sidebar esté abierto, pero el storage ya tiene el valor correcto.
  try {
    const stored = await chrome.storage.local.get(['activePanel']);
    if (stored.activePanel && stored.activePanel !== 'default') {
      switchPanel(stored.activePanel);
    }
  } catch (e) { /* ignorar */ }

  // Event listeners
  document.getElementById('closeBtn').addEventListener('click', () => {
    window.close();
  });

  // Text Reader controls
  document.getElementById('speedControl').addEventListener('input', (e) => {
    document.getElementById('speedValue').textContent = `${e.target.value}x`;
    chrome.runtime.sendMessage({
      action: 'setSpeed',
      speed: parseFloat(e.target.value)
    });
  });

  document.getElementById('playBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'textReader', command: 'play' });
  });

  document.getElementById('pauseBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'textReader', command: 'pause' });
  });

  document.getElementById('stopBtn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'textReader', command: 'stop' });
  });

  // Visual Nav controls
  document.getElementById('showFocusables').addEventListener('change', (e) => {
    sendToContent({ action: 'visualNav', setting: 'showFocusables', value: e.target.checked });
  });

  document.getElementById('showTabOrder').addEventListener('change', (e) => {
    sendToContent({ action: 'visualNav', setting: 'showTabOrder', value: e.target.checked });
  });

  document.getElementById('highlightFocus').addEventListener('change', (e) => {
    sendToContent({ action: 'visualNav', setting: 'highlightFocus', value: e.target.checked });
  });

  // A11y Check controls
  document.getElementById('runCheckBtn').addEventListener('click', async () => {
    await runA11yCheck();
  });

  document.getElementById('clearResultsBtn').addEventListener('click', () => {
    clearResults();
  });

  document.getElementById('exportReportBtn').addEventListener('click', () => {
    exportReport();
  });

  // Escuchar mensajes del content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'switchPanel') {
      switchPanel(message.panel);
    } else if (message.action === 'updateResults') {
      updateResults(message.results);
    } else if (message.action === 'updateFocus') {
      // Para Navegación por Teclado
      updateFocus(message.data);
    } else if (message.action === 'updateTextReaderFocus') {
      // Para Lector de Texto
      updateTextReaderFocus(message.data);
    } else if (message.action === 'keyboardNavDeactivated') {
      // La navegación por teclado se desactivó con Escape
      handleKeyboardNavDeactivation();
    } else if (message.action === 'textReaderDeactivated') {
      // El lector de texto se desactivó con Escape
      handleTextReaderDeactivation();
    } else if (message.action === 'visualNavDeactivated') {
      // La navegación visual se desactivó con Escape
      handleVisualNavDeactivation();
    } else if (message.action === 'updateVisualNavHistory') {
      // Historial de navegación visual actualizado
      updateVisualNavHistory(message.history);
    } else if (message.action === 'a11yCheckDeactivated') {
      // La validación de accesibilidad se desactivó con Escape
      handleA11yCheckDeactivation();
    }
  });

});

function updateUI() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    const text = i18n.t(key);
    el.textContent = text;
  });
}

function switchPanel(panelName) {
  console.log(`Sidebar: switchPanel llamado, cambiando de '${currentPanel}' a '${panelName}'`);
  
  // Ocultar todos los paneles
  document.querySelectorAll('.panel').forEach(panel => {
    panel.classList.add('hidden');
  });

  // Mostrar el panel seleccionado
  const panel = document.getElementById(`${panelName}Panel`);
  if (panel) {
    panel.classList.remove('hidden');
    currentPanel = panelName;
    console.log(`Sidebar: Panel '${panelName}' ahora visible`);
  } else {
    document.getElementById('defaultPanel').classList.remove('hidden');
    currentPanel = 'default';
    console.log('Sidebar: Panel por defecto visible');
  }
}

async function sendToContent(message) {
  let tabId = activeTabId;
  if (!tabId) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    tabId = tab?.id;
  }
  if (!tabId) {
    console.warn('Sidebar: No se encontró tab activo');
    return;
  }
  try {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Sidebar: Error enviando mensaje:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('Sidebar: Error al enviar mensaje:', error);
  }
}

async function runA11yCheck() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    console.warn('A11yCheck: No hay pestaña activa');
    return;
  }
  activeTabId = tab.id;

  // Mostrar mensaje de carga
  const resultsList = document.getElementById('resultsList');
  if (resultsList) {
    const loadingItem = document.createElement('li');
    loadingItem.className = 'loading-message';
    loadingItem.textContent = 'Analizando página...';
    resultsList.innerHTML = '';
    resultsList.appendChild(loadingItem);
  }

  try {
    console.log('A11yCheck: Ejecutando validación en la pestaña:', tab.id);
    const results = await chrome.tabs.sendMessage(tab.id, {
      action: 'runA11yCheck'
    });
    console.log('A11yCheck: Resultados recibidos:', results?.length || 0);
    updateResults(results || []);
  } catch (error) {
    console.error('Error running a11y check:', error);
    // Si hay error, mostrar array vacío en lugar de fallar silenciosamente
    updateResults([]);
  }
}

function updateResults(results) {
  console.log('Sidebar: updateResults llamado con:', results);
  
  if (!results) {
    console.warn('Sidebar: results es null o undefined');
    return;
  }

  console.log(`Sidebar: Procesando ${results.length} resultados`);

  // Actualizar contadores
  const errors = results.filter(r => r.severity === 'error').length;
  const warnings = results.filter(r => r.severity === 'warning').length;
  const info = results.filter(r => r.severity === 'info').length;

  console.log(`Sidebar: Errores: ${errors}, Advertencias: ${warnings}, Info: ${info}`);

  const errorCountEl = document.getElementById('errorCount');
  const warningCountEl = document.getElementById('warningCount');
  const infoCountEl = document.getElementById('infoCount');
  
  console.log('Sidebar: Elementos encontrados:', {
    errorCount: !!errorCountEl,
    warningCount: !!warningCountEl,
    infoCount: !!infoCountEl
  });
  
  if (errorCountEl) errorCountEl.textContent = errors;
  if (warningCountEl) warningCountEl.textContent = warnings;
  if (infoCountEl) infoCountEl.textContent = info;
  
  console.log('Sidebar: Contadores actualizados en UI');

  // Mostrar resultados
  const resultsList = document.getElementById('resultsList');
  
  if (!resultsList) {
    console.error('Sidebar: No se encontró el elemento resultsList');
    return;
  }
  
  resultsList.innerHTML = '';
  console.log('Sidebar: Limpiada lista de resultados');

  // Si no hay resultados, mostrar mensaje
  if (results.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'history-empty';
    emptyItem.textContent = 'No se encontraron problemas de accesibilidad';
    resultsList.appendChild(emptyItem);
    return;
  }

  results.forEach((result, index) => {
    try {
      const item = document.createElement('li');
      item.className = `result-item ${result.severity}`;
      item.innerHTML = `
        <div class="result-header">
          <span class="result-title">${escapeHtml(result.title || 'Sin título')}</span>
          <span class="result-type ${result.severity}">${result.severity}</span>
        </div>
        <div class="result-description">${escapeHtml(result.description || 'Sin descripción')}</div>
        ${result.element ? `<div class="result-element">${escapeHtml(result.element)}</div>` : ''}
      `;
      item.addEventListener('click', () => {
        // Marcar este ítem como seleccionado y desmarcar el anterior
        document.querySelectorAll('.result-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        // Navegar al elemento en la página
        highlightElement(result.selector, result.severity);
      });
      resultsList.appendChild(item);
    } catch (e) {
      console.error('Sidebar: Error al crear item de resultado:', e);
    }
  });
  
  console.log(`Sidebar: ${results.length} resultados agregados a la lista`);

  // Cambiar al panel de resultados si no está activo
  if (currentPanel !== 'a11yCheck') {
    switchPanel('a11yCheck');
  }

  // Resetear scroll al inicio de la lista
  resultsList.scrollTop = 0;
}

function clearResults() {
  document.getElementById('errorCount').textContent = '0';
  document.getElementById('warningCount').textContent = '0';
  document.getElementById('infoCount').textContent = '0';
  document.getElementById('resultsList').innerHTML = '';
}

function highlightElement(selector, severity) {
  sendToContent({
    action: 'highlightElement',
    selector: selector,
    severity: severity || 'error'
  });
}

// Arrays para almacenar los historiales (independientes)
let navigationHistory = []; // Para Navegación por Teclado
let textReaderHistory = []; // Para Lector de Texto
const MAX_HISTORY_ITEMS = 20;
let lastNavigatedElement = null; // Para evitar duplicados en navegación por teclado
let lastTextReaderElement = null; // Para evitar duplicados en lector de texto

function updateFocus(data) {
  document.getElementById('focusableCount').textContent = data.total || 0;
  document.getElementById('currentFocus').textContent = data.current || '-';
  
  // Agregar al historial si hay información válida
  if (data.accessibleName && data.elementType) {
    addToNavigationHistory(data.accessibleName, data.elementType);
  }
}

function addToNavigationHistory(name, type) {
  // Normalizar el nombre (eliminar espacios extra)
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  
  // Verificar si es el mismo elemento que el anterior para evitar duplicados
  if (lastNavigatedElement && 
      lastNavigatedElement.name === normalizedName && 
      lastNavigatedElement.type === type) {
    console.log('KeyboardNav History: Elemento duplicado, no se agrega al historial');
    return;
  }
  
  // Crear entrada del historial
  const historyEntry = {
    name: normalizedName,
    type: type,
    timestamp: Date.now()
  };
  
  // Guardar como último elemento navegado
  lastNavigatedElement = {
    name: normalizedName,
    type: type
  };
  
  // Agregar al inicio del array
  navigationHistory.unshift(historyEntry);
  
  // Limitar el tamaño del historial
  if (navigationHistory.length > MAX_HISTORY_ITEMS) {
    navigationHistory = navigationHistory.slice(0, MAX_HISTORY_ITEMS);
  }
  
  console.log('KeyboardNav History: Agregado -', normalizedName, '→', type);
  
  // Actualizar la UI
  updateNavigationHistoryUI();
}

function updateNavigationHistoryUI() {
  const historyList = document.getElementById('navigationHistoryList');
  if (!historyList) return;
  
  // Limpiar lista actual
  historyList.innerHTML = '';
  
  // Si no hay historial, mostrar mensaje
  if (navigationHistory.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'history-empty';
    emptyItem.textContent = 'No hay historial de navegación';
    historyList.appendChild(emptyItem);
    return;
  }
  
  // Agregar cada entrada del historial
  navigationHistory.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    
    const content = document.createElement('div');
    content.className = 'history-content';
    content.innerHTML = `<span class="history-name">${escapeHtml(entry.name)}</span> <span class="history-arrow">→</span> <span class="history-type">${escapeHtml(entry.type)}</span>`;
    
    item.appendChild(content);
    historyList.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function handleKeyboardNavDeactivation() {
  // Mantener el panel visible con el historial para que el QA pueda revisar los resultados
}

function handleTextReaderDeactivation() {
  // Mantener el panel visible con el historial para que el QA pueda revisar los resultados
}

function handleVisualNavDeactivation() {
  // Mantener el panel visible con el historial para que el QA pueda revisar los resultados
}

// Array para almacenar el historial de navegación visual
let visualNavHistory = [];

function updateVisualNavHistory(history) {
  visualNavHistory = history || [];
  updateVisualNavHistoryUI();
}

function updateVisualNavHistoryUI() {
  const historyList = document.getElementById('visualNavHistoryList');
  if (!historyList) return;
  
  // Limpiar lista actual
  historyList.innerHTML = '';
  
  // Si no hay historial, mostrar mensaje
  if (visualNavHistory.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'history-empty';
    emptyItem.textContent = 'No hay historial de navegación';
    historyList.appendChild(emptyItem);
    return;
  }
  
  // Agregar cada entrada del historial
  visualNavHistory.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    
    const content = document.createElement('div');
    content.className = 'history-content';
    content.innerHTML = `<span class="history-tab-order">Tab ${entry.tabOrder}:</span> <span class="history-name">${escapeHtml(entry.name)}</span> <span class="history-arrow">→</span> <span class="history-type">${escapeHtml(entry.type)}</span>`;
    
    item.appendChild(content);
    historyList.appendChild(item);
  });
}

function handleA11yCheckDeactivation() {
  // Mantener el panel visible con los resultados para que el QA pueda revisarlos
}

// Funciones para el Lector de Texto
function updateTextReaderFocus(data) {
  // Agregar al historial del lector de texto si hay información válida
  if (data.accessibleName && data.elementType) {
    addToTextReaderHistory(data.accessibleName, data.elementType);
  }
}

function addToTextReaderHistory(name, type) {
  // Normalizar el nombre (eliminar espacios extra)
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  
  // Crear entrada del historial
  const historyEntry = {
    name: normalizedName,
    type: type,
    timestamp: Date.now()
  };
  
  // Guardar como último elemento leído
  lastTextReaderElement = {
    name: normalizedName,
    type: type
  };
  
  // Agregar al inicio del array
  textReaderHistory.unshift(historyEntry);
  
  // Limitar el tamaño del historial
  if (textReaderHistory.length > MAX_HISTORY_ITEMS) {
    textReaderHistory = textReaderHistory.slice(0, MAX_HISTORY_ITEMS);
  }
  
  console.log('TextReader History: Agregado -', normalizedName, '→', type);
  
  // Actualizar la UI
  updateTextReaderHistoryUI();
}

function updateTextReaderHistoryUI() {
  const historyList = document.getElementById('textReaderHistoryList');
  if (!historyList) return;
  
  // Limpiar lista actual
  historyList.innerHTML = '';
  
  // Si no hay historial, mostrar mensaje
  if (textReaderHistory.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'history-empty';
    emptyItem.textContent = 'No hay historial de navegación';
    historyList.appendChild(emptyItem);
    return;
  }
  
  // Agregar cada entrada del historial
  textReaderHistory.forEach((entry, index) => {
    const item = document.createElement('li');
    item.className = 'history-item';
    
    const content = document.createElement('div');
    content.className = 'history-content';
    content.innerHTML = `<span class="history-name">${escapeHtml(entry.name)}</span> <span class="history-arrow">→</span> <span class="history-type">${escapeHtml(entry.type)}</span>`;
    
    item.appendChild(content);
    historyList.appendChild(item);
  });
}

async function exportReport() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const results = Array.from(document.querySelectorAll('.result-item')).map(item => ({
    title: item.querySelector('.result-title').textContent,
    severity: item.classList.contains('error') ? 'error' : 
              item.classList.contains('warning') ? 'warning' : 'info',
    description: item.querySelector('.result-description').textContent,
    element: item.querySelector('.result-element')?.textContent || ''
  }));

  const report = {
    url: tab?.url || 'unknown',
    timestamp: new Date().toISOString(),
    summary: {
      errors: document.getElementById('errorCount').textContent,
      warnings: document.getElementById('warningCount').textContent,
      info: document.getElementById('infoCount').textContent
    },
    results: results
  };

  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `a11y-report-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
