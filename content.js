// Content script que se inyecta en todas las páginas
// Prevenir múltiples inyecciones del script
if (window.a11yGoContentScriptLoaded) {
  // Already loaded, skip re-injection
} else {
  window.a11yGoContentScriptLoaded = true;

  let activeFunctions = new Set();
  let textReader = null;
  let keyboardNav = null;
  let visualNav = null;
  let a11yChecker = null;
  let logger = { log() {}, warn: console.warn.bind(console), error: console.error.bind(console) };

  // Promesa que se resuelve cuando los módulos están cargados
  let modulesReadyPromise = null;
  let modulesReady = false;

  // Inicializar módulos cuando se cargan
  modulesReadyPromise = (async () => {
    // Verificar que el contexto de la extensión sea válido antes de cargar módulos
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) {
      logger.warn('A11yGo: Contexto de extensión no válido, no se pueden cargar módulos');
      modulesReady = false;
      return;
    }

    // Cargar módulos dinámicamente
    try {
      const loggerModule = await import(chrome.runtime.getURL('utils/logger.js'));
      logger = loggerModule.logger;
      const { TextReader } = await import(chrome.runtime.getURL('utils/text-reader.js'));
      const { KeyboardNav } = await import(chrome.runtime.getURL('utils/keyboard-nav.js'));
      const { VisualNav } = await import(chrome.runtime.getURL('utils/visual-nav.js'));
      const { A11yChecker } = await import(chrome.runtime.getURL('utils/a11y-checker.js'));

      textReader = new TextReader();
      keyboardNav = new KeyboardNav();
      visualNav = new VisualNav();
      a11yChecker = new A11yChecker();
      modulesReady = true;
      logger.log('A11yGo: Módulos cargados correctamente');
      logger.log('A11yGo: keyboardNav instanciado:', !!keyboardNav);
      logger.log('A11yGo: keyboardNav type:', typeof keyboardNav);
      
      // Si había funciones pendientes de activación, activarlas ahora
      if (window.pendingActivations && window.pendingActivations.length > 0) {
        logger.log('A11yGo: Activando funciones pendientes:', window.pendingActivations);
        const pending = [...window.pendingActivations];
        window.pendingActivations = [];
        // Ejecutar activaciones pendientes
        pending.forEach(fn => {
          // Activar directamente sin esperar (ya estamos listos)
          activateFunctionDirectly(fn);
        });
      }
    } catch (error) {
      // Manejar específicamente el error de contexto inválido
      if (error.message && error.message.includes('Extension context invalidated')) {
        logger.warn('A11yGo: Contexto de extensión invalidado. La extensión puede haberse recargado.');
        // No loguear como error crítico, solo como advertencia
      } else {
        logger.error('A11yGo: Error loading modules:', error);
      }
      modulesReady = false;
    }
  })();

  // Envío seguro de mensajes al service worker/side panel
  function safeSendMessage(payload) {
    // Evita errores cuando el contexto de la extensión se ha invalidado
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage(payload, () => {
        // Silenciar errores benignos (p. ej., receptor inexistente)
        void chrome.runtime?.lastError;
      });
    } catch (_) {
      // Ignorar si el contexto se invalidó en mitad de la operación
    }
  }

  // Escuchar mensajes desde popup y sidebar
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'activate') {
      // Solo activar en el frame principal para evitar múltiples instancias en iframes
      if (window !== window.top) {
        sendResponse({ success: true });
        return true;
      }
      activateFunction(message.function).then(() => {
        sendResponse({ success: true });
      }).catch(error => {
        logger.error('A11yGo: Error activando función:', error);
        sendResponse({ success: false, error: error.message });
      });
      return true; // Mantener canal abierto para respuesta asíncrona
    } else if (message.action === 'textReader') {
      handleTextReaderCommand(message.command);
      sendResponse({ success: true });
    } else if (message.action === 'setSpeed') {
      if (textReader) {
        textReader.setSpeed(message.speed);
      }
      sendResponse({ success: true });
    } else if (message.action === 'runA11yCheck') {
      runA11yCheck().then(results => {
        sendResponse(results || []);
      }).catch(error => {
        logger.error('Error in a11y check:', error);
        sendResponse([]);
      });
      return true; // Mantener canal abierto para respuesta asíncrona
    } else if (message.action === 'visualNav') {
      handleVisualNavSetting(message.setting, message.value);
      sendResponse({ success: true });
    } else if (message.action === 'highlightElement') {
      highlightElement(message.selector, message.severity);
      sendResponse({ success: true });
    } else if (message.action === 'keyboardNavDeactivated') {
      // La navegación por teclado se desactivó con Escape
      activeFunctions.delete('keyboardNav');
      sendResponse({ success: true });
    } else if (message.action === 'textReaderDeactivated') {
      // El lector de texto se desactivó con Escape
      activeFunctions.delete('textReader');
      sendResponse({ success: true });
    } else if (message.action === 'visualNavDeactivated') {
      // La navegación visual se desactivó con Escape
      activeFunctions.delete('visualNav');
      sendResponse({ success: true });
    } else if (message.action === 'a11yCheckDeactivated') {
      // La validación de accesibilidad se desactivó con Escape
      activeFunctions.delete('a11yCheck');
      sendResponse({ success: true });
    }
  });

  async function activateFunction(functionName) {
    logger.log(`A11yGo: Activando función: ${functionName}`);
    
    // Esperar a que los módulos estén cargados
    if (!modulesReady && modulesReadyPromise) {
      logger.log(`A11yGo: Esperando a que los módulos se carguen para activar ${functionName}...`);
      // Guardar la activación pendiente
      if (!window.pendingActivations) {
        window.pendingActivations = [];
      }
      // Solo agregar si no está ya en la lista
      if (!window.pendingActivations.includes(functionName)) {
        window.pendingActivations.push(functionName);
      }
      
      try {
        await modulesReadyPromise;
        logger.log(`A11yGo: Módulos cargados, procediendo con activación de ${functionName}`);
        
        // Verificar si ya fue activada mientras esperábamos
        if (activeFunctions.has(functionName)) {
          logger.log(`A11yGo: ${functionName} ya fue activada durante la carga de módulos`);
          return;
        }
      } catch (error) {
        logger.error('A11yGo: Error esperando módulos:', error);
        return;
      }
    }
    
    // Ejecutar la activación solo si no está ya activa
    if (!activeFunctions.has(functionName)) {
      activateFunctionDirectly(functionName);
    } else {
      logger.log(`A11yGo: ${functionName} ya está activa, evitando reactivación`);
    }
  }

  function activateFunctionDirectly(functionName) {
    logger.log(`A11yGo: Ejecutando activación directa de ${functionName}`);
    
    // Verificar que los módulos estén cargados antes de activar
    if (!modulesReady) {
      // Si los módulos no están listos, intentar esperar un poco más
      if (modulesReadyPromise) {
        logger.warn(`A11yGo: Los módulos aún no están listos, esperando...`);
        modulesReadyPromise.then(() => {
          if (modulesReady) {
            logger.log(`A11yGo: Módulos cargados, activando ${functionName}`);
            activateFunctionDirectly(functionName);
          } else {
            logger.error(`A11yGo: Los módulos no se pudieron cargar. Verifica la consola para errores de sintaxis.`);
          }
        }).catch(error => {
          logger.error(`A11yGo: Error al cargar módulos para ${functionName}:`, error);
        });
        return;
      } else {
        logger.error(`A11yGo: Los módulos no están listos y no hay promesa de carga. No se puede activar ${functionName}`);
        return;
      }
    }
    
    // Desactivar otras funciones si es necesario
    deactivateAll();

    activeFunctions.add(functionName);

    switch (functionName) {
      case 'textReader':
        if (textReader) {
          textReader.activate();
          notifySidebar('switchPanel', { panel: 'textReader' });
        } else {
          logger.error('A11yGo: textReader es null o undefined. Los módulos pueden no haberse cargado correctamente.');
          activeFunctions.delete(functionName);
          return;
        }
        break;
      case 'keyboardNav':
        logger.log('A11yGo: Activando navegación por teclado');
        logger.log('A11yGo: keyboardNav existe?', !!keyboardNav);
        if (keyboardNav) {
          keyboardNav.activate();
          notifySidebar('switchPanel', { panel: 'keyboardNav' });
        } else {
          logger.error('A11yGo: keyboardNav es null o undefined. Los módulos pueden no haberse cargado correctamente.');
          activeFunctions.delete(functionName);
          return;
        }
        break;
      case 'visualNav':
        if (visualNav) {
          visualNav.activate();
          notifySidebar('switchPanel', { panel: 'visualNav' });
        } else {
          logger.error('A11yGo: visualNav es null o undefined. Los módulos pueden no haberse cargado correctamente.');
          activeFunctions.delete(functionName);
          return;
        }
        break;
    case 'a11yCheck':
      if (a11yChecker) {
        a11yChecker.activate();
        notifySidebar('switchPanel', { panel: 'a11yCheck' });
      } else {
        logger.error('A11yGo: a11yChecker es null o undefined. Los módulos pueden no haberse cargado correctamente.');
        activeFunctions.delete(functionName);
        return;
      }
      break;
    }

    chrome.storage.local.set({ activePanel: functionName });
    logger.log(`A11yGo: Función ${functionName} activada correctamente`);
  }

  function deactivateAll() {
    activeFunctions.clear();
    textReader?.deactivate();
    keyboardNav?.deactivate();
    visualNav?.deactivate();
    a11yChecker?.deactivate();
  }

  function handleTextReaderCommand(command) {
    if (!textReader) return;

    switch (command) {
      case 'play':
        textReader.play();
        break;
      case 'pause':
        textReader.pause();
        break;
      case 'stop':
        textReader.stop();
        // Desactivar completamente TODO el modo accesibilidad
        deactivateAll();
        chrome.storage.local.set({ activePanel: 'default' });
        notifySidebar('switchPanel', { panel: 'default' });
        break;
    }
  }

  function handleVisualNavSetting(setting, value) {
    if (!visualNav) return;
    visualNav.updateSetting(setting, value);
  }

  async function runA11yCheck() {
    try {
      // Solo ejecutar en el frame principal, no en iframes
      if (window !== window.top) {
        logger.log('A11yChecker: Ignorando ejecución en iframe');
        return [];
      }
      
      if (!a11yChecker) {
        logger.warn('A11yChecker: a11yChecker no está disponible');
        return [];
      }
      
      logger.log('A11yChecker: Ejecutando validación en frame principal');
      const results = await a11yChecker.check();
      logger.log(`A11yChecker: Enviando ${results.length} resultados al sidebar`);
      notifySidebar('updateResults', { results });
      return results || [];
    } catch (error) {
      logger.error('Error in runA11yCheck:', error);
      return [];
    }
  }

  // Variable para almacenar el overlay actual y su timer de limpieza
  let currentErrorOverlay = null;
  let currentOverlayTimer = null;
  let currentScrollHandler = null;

  function ensureHighlightStyles() {
    if (document.getElementById('a11y-error-animations')) return;
    const style = document.createElement('style');
    style.id = 'a11y-error-animations';
    style.textContent = `
      @keyframes a11y-pulse-error {
        0%   { box-shadow: 0 0 0 0    rgba(220,38,38,0.8), 0 0 16px 4px rgba(220,38,38,0.4); }
        50%  { box-shadow: 0 0 0 12px rgba(220,38,38,0),   0 0 24px 8px rgba(220,38,38,0.15); }
        100% { box-shadow: 0 0 0 0    rgba(220,38,38,0.8), 0 0 16px 4px rgba(220,38,38,0.4); }
      }
      @keyframes a11y-pulse-warning {
        0%   { box-shadow: 0 0 0 0    rgba(217,119,6,0.8), 0 0 16px 4px rgba(217,119,6,0.4); }
        50%  { box-shadow: 0 0 0 12px rgba(217,119,6,0),   0 0 24px 8px rgba(217,119,6,0.15); }
        100% { box-shadow: 0 0 0 0    rgba(217,119,6,0.8), 0 0 16px 4px rgba(217,119,6,0.4); }
      }
      @keyframes a11y-pulse-info {
        0%   { box-shadow: 0 0 0 0    rgba(37,99,235,0.8), 0 0 16px 4px rgba(37,99,235,0.4); }
        50%  { box-shadow: 0 0 0 12px rgba(37,99,235,0),   0 0 24px 8px rgba(37,99,235,0.15); }
        100% { box-shadow: 0 0 0 0    rgba(37,99,235,0.8), 0 0 16px 4px rgba(37,99,235,0.4); }
      }
      @keyframes a11y-highlight-enter {
        0%   { opacity: 0; transform: scale(1.08); }
        100% { opacity: 1; transform: scale(1); }
      }
      .a11y-error-highlight.severity-error   { animation: a11y-highlight-enter 0.2s ease-out, a11y-pulse-error   1.2s ease-in-out 0.2s infinite; }
      .a11y-error-highlight.severity-warning { animation: a11y-highlight-enter 0.2s ease-out, a11y-pulse-warning 1.2s ease-in-out 0.2s infinite; }
      .a11y-error-highlight.severity-info    { animation: a11y-highlight-enter 0.2s ease-out, a11y-pulse-info    1.2s ease-in-out 0.2s infinite; }
      .a11y-error-highlight-badge {
        position: absolute;
        top: -30px;
        left: -3px;
        padding: 4px 10px;
        border-radius: 4px 4px 0 0;
        font-size: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-weight: 700;
        letter-spacing: 0.4px;
        color: #fff;
        pointer-events: none;
        white-space: nowrap;
        box-shadow: 0 -2px 6px rgba(0,0,0,0.25);
      }
    `;
    document.head.appendChild(style);
  }

  function removeCurrentOverlay() {
    if (currentScrollHandler) {
      window.removeEventListener('scroll', currentScrollHandler, true);
      currentScrollHandler = null;
    }
    if (currentOverlayTimer) {
      clearTimeout(currentOverlayTimer);
      currentOverlayTimer = null;
    }
    if (currentErrorOverlay && currentErrorOverlay.parentNode) {
      currentErrorOverlay.parentNode.removeChild(currentErrorOverlay);
    }
    currentErrorOverlay = null;
  }

  function buildOverlay(element, severity) {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const PAD = 6;
    const overlay = document.createElement('div');
    overlay.className = `a11y-error-highlight severity-${severity || 'error'}`;

    // Colores por severidad
    const colors = {
      error:   { border: '#dc2626', bg: 'rgba(220,38,38,0.10)',   badge: '#dc2626' },
      warning: { border: '#d97706', bg: 'rgba(217,119,6,0.10)',   badge: '#d97706' },
      info:    { border: '#2563eb', bg: 'rgba(37,99,235,0.10)',    badge: '#2563eb' }
    };
    const c = colors[severity] || colors.error;

    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top - PAD}px;
      left: ${rect.left - PAD}px;
      width: ${Math.max(rect.width + PAD * 2, 30)}px;
      height: ${Math.max(rect.height + PAD * 2, 30)}px;
      border: 4px solid ${c.border};
      background: ${c.bg};
      pointer-events: none;
      z-index: 2147483647;
      box-sizing: border-box;
      border-radius: 4px;
      outline: 2px solid rgba(255,255,255,0.6);
      outline-offset: 2px;
    `;

    // Etiqueta de severidad
    const badge = document.createElement('span');
    badge.className = 'a11y-error-highlight-badge';
    badge.style.background = c.badge;
    const labels = { error: 'Error de accesibilidad', warning: 'Advertencia', info: 'Información' };
    badge.textContent = labels[severity] || severity;
    overlay.appendChild(badge);

    document.body.appendChild(overlay);
    return overlay;
  }

  function highlightElement(selector, severity) {
    try {
      if (!selector || !document || !document.body) return;

      removeCurrentOverlay();

      const element = document.querySelector(selector);
      if (!element || !(element instanceof Element)) {
        logger.warn('Highlight: Elemento no encontrado:', selector);
        return;
      }

      ensureHighlightStyles();

      // Mostrar elemento temporalmente si está oculto
      const computedStyle = window.getComputedStyle(element);
      const isHidden = computedStyle.display === 'none' ||
                       computedStyle.visibility === 'hidden' ||
                       computedStyle.opacity === '0';
      let restoreHidden = null;
      if (isHidden) {
        const orig = { display: element.style.display, visibility: element.style.visibility, opacity: element.style.opacity };
        element.style.display = 'block';
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        restoreHidden = () => {
          if (document.contains(element)) {
            element.style.display = orig.display;
            element.style.visibility = orig.visibility;
            element.style.opacity = orig.opacity;
          }
        };
      }

      // Scroll suave al elemento
      try { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}

      // Esperar a que el scroll suave se asiente (~600ms) antes de posicionar el overlay
      setTimeout(() => {
        try {
          if (!document.contains(element)) return;

          currentErrorOverlay = buildOverlay(element, severity || 'error');
          if (!currentErrorOverlay) return;

          // Actualizar posición del overlay al hacer scroll (el elemento se mueve con la página)
          currentScrollHandler = () => {
            if (!currentErrorOverlay || !document.contains(element)) return;
            const r = element.getBoundingClientRect();
            const PAD = 6;
            currentErrorOverlay.style.top  = `${r.top - PAD}px`;
            currentErrorOverlay.style.left = `${r.left - PAD}px`;
            currentErrorOverlay.style.width  = `${Math.max(r.width + PAD * 2, 30)}px`;
            currentErrorOverlay.style.height = `${Math.max(r.height + PAD * 2, 30)}px`;
          };
          window.addEventListener('scroll', currentScrollHandler, { passive: true, capture: true });

          // Eliminar overlay tras 12 segundos
          currentOverlayTimer = setTimeout(() => {
            removeCurrentOverlay();
            if (restoreHidden) restoreHidden();
          }, 12000);
        } catch (e) {
          logger.warn('Highlight: Error al crear overlay:', e);
        }
      }, 600);
    } catch (error) {
      logger.error('Highlight: Error al resaltar elemento:', error);
    }
  }

  function notifySidebar(action, data) {
    // Estructura uniforme: { action, ...data }
    const payload = { action };
    if (data) {
      if (data.panel) payload.panel = data.panel;
      if (data.results) payload.results = data.results;
      if (data.data) payload.data = data.data;
    }
    logger.log('Content: Notificando al sidebar:', action, payload);
    safeSendMessage(payload);
  }

  // Actualizar información de foco
  document.addEventListener('focusin', () => {
    // NAVEGACIÓN POR TECLADO: Actualizar estadísticas e historial
    if (activeFunctions.has('keyboardNav') && keyboardNav) {
      const focusData = keyboardNav.getFocusInfo();
      notifySidebar('updateFocus', { data: focusData });
    }
    
    // LECTOR DE TEXTO: Leer elemento enfocado
    if (activeFunctions.has('textReader') && textReader) {
      const focused = document.activeElement;
      if (focused && focused !== document.body) {
        // Leer el elemento (esto verificará redundancias internamente)
        // readElementOnFocus ahora retorna un objeto con { read, name, type }
        textReader.readElementOnFocus(focused).then(result => {
          // Agregar al historial si hay información válida del elemento
          // Agregar TODOS los elementos que tienen nombre y tipo, incluso si no se leen (por redundancia)
          if (result && result.name && result.name.trim() && result.type && result.type.trim()) {
            logger.log('TextReader: Agregando al historial:', result.name, '→', result.type, '(leído:', result.read, ')');
            notifySidebar('updateTextReaderFocus', { 
              data: {
                accessibleName: result.name,
                elementType: result.type
              }
            });
          } else {
            logger.log('TextReader: No se agregó al historial - nombre o tipo vacío:', result);
          }
        }).catch(error => {
          logger.error('A11yGo: Error al leer elemento enfocado:', error);
          // Intentar obtener información del elemento como fallback
          try {
            // Verificar si es un elemento de contenido hecho focusable por el lector de texto
            const isTextReaderFocusable = focused.classList.contains('textreader-focusable');
            const tag = focused.tagName?.toUpperCase() || '';
            const role = focused.getAttribute?.('role')?.toLowerCase() || '';
            
            // Solo obtener información si es un elemento de contenido hecho focusable
            // o si NO es un elemento interactivo nativo
            const isNativeInteractive = (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || 
                                         tag === 'SELECT' || tag === 'TEXTAREA') &&
                                        !isTextReaderFocusable;
            const isInteractiveRole = ['button', 'link', 'menuitem', 'tab', 'option'].includes(role) &&
                                     !isTextReaderFocusable;
            
            if (!isNativeInteractive && !isInteractiveRole) {
              const accessibleName = textReader.getAccessibleName ? textReader.getAccessibleName(focused) : '';
              const elementType = textReader.getElementType ? textReader.getElementType(focused) : '';
              if (accessibleName && accessibleName.trim() && elementType && elementType.trim()) {
                logger.log('TextReader: Agregando al historial (fallback):', accessibleName, '→', elementType);
                notifySidebar('updateTextReaderFocus', { 
                  data: {
                    accessibleName: accessibleName,
                    elementType: elementType
                  }
                });
              }
            }
          } catch (e) {
            logger.error('A11yGo: Error al obtener información del elemento:', e);
          }
        });
      }
    }
  });

} // Cierre del bloque if para prevenir múltiples inyecciones
