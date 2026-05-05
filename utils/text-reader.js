// Lector de texto con Web Speech API
import { logger } from './logger.js';

export class TextReader {
  constructor() {
    this.synthesis = window.speechSynthesis;
    this.utterance = null;
    this.isActive = false;
    this.isReading = false;
    this.isPaused = false;
    this.currentText = '';
    this.speed = 1.0;
    this.selectedText = '';
    this.highlightElements = [];
    this.hoverTimeout = null;
    this.hoverElement = null;
    this.lastMousePosition = null;
    this.lastHoveredElement = null;
    
    // Sistema de deduplicación para evitar redundancias
    this.lastReadText = '';
    this.lastReadTime = 0;
    this.DEDUPLICATION_WINDOW = 2000; // 2 segundos para considerar redundante
    
    // Detectar el idioma de la página al inicializar
    this.pageLanguage = this.detectPageLanguage();
  }
  
  detectPageLanguage() {
    // Obtener el idioma de la etiqueta HTML
    const htmlLang = document.documentElement.lang?.toLowerCase() || '';
    if (htmlLang.startsWith('es')) {
      return 'es-ES';
    } else if (htmlLang.startsWith('en')) {
      return 'en-US';
    }
    
    // Fallback: intentar detectar del meta tag
    const metaLang = document.querySelector('meta[http-equiv="content-language"]')?.content?.toLowerCase();
    if (metaLang && metaLang.startsWith('es')) {
      return 'es-ES';
    }
    
    // Fallback: usar español por defecto
    return 'es-ES';
  }

  async activate() {
    this.isActive = true;

    // Verificar que speechSynthesis esté disponible
    if (!this.synthesis) {
      logger.error('SpeechSynthesis no está disponible en este navegador');
      return;
    }

    // Asegurar que las voces estén cargadas antes de activar
    let voices = this.synthesis.getVoices();
    if (voices.length === 0) {
      logger.log('TextReader: Esperando a que se carguen las voces...');
      // En Chrome, las voces se cargan de forma asíncrona
      await new Promise((resolve) => {
        const checkVoices = () => {
          voices = this.synthesis.getVoices();
          if (voices.length > 0) {
            logger.log(`TextReader: ${voices.length} voces cargadas`);
            resolve();
          } else {
            // Si después de 2 segundos no hay voces, continuar de todos modos
            setTimeout(() => {
              if (this.synthesis.getVoices().length === 0) {
                logger.warn('TextReader: No se pudieron cargar voces, continuando de todos modos');
              }
              resolve();
            }, 2000);
            setTimeout(checkVoices, 100);
          }
        };
        
        // Escuchar el evento de cambio de voces
        if (this.synthesis.onvoiceschanged !== null) {
          this.synthesis.onvoiceschanged = () => {
            voices = this.synthesis.getVoices();
            if (voices.length > 0) {
              logger.log(`TextReader: Voces cargadas vía evento: ${voices.length}`);
              resolve();
            }
          };
        }
        
        checkVoices();
      });
    } else {
      logger.log(`TextReader: ${voices.length} voces disponibles`);
    }

    // Si fue desactivado mientras se cargaban las voces, no continuar
    if (!this.isActive) return;

    this.isPaused = false; // Asegurar que no esté pausado al activar
    await this.loadSpeed();
    this.setupTextSelection();
    this.setupHoverReading();
    this.setupEscapeHandler();
    
    // Hacer todos los elementos de contenido navegables temporalmente
    this.makeContentElementsFocusable();
    
    // Enfocar el primer elemento (ahora incluye contenido)
    this.focusFirstElement();
    
    logger.log('TextReader: Activado con navegación completa de contenido');
  }

  focusFirstElement() {
    // Obtener solo elementos de contenido (NO elementos interactivos)
    const selectors = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'p', 'blockquote'
      // Elementos interactivos excluidos: a, button, input, select, textarea, etc.
      // 'li' excluido - no debe ser focusable
    ].join(', ');

    const allElements = Array.from(document.querySelectorAll(selectors));
    
    // Filtrar elementos visibles y ordenar por posición en el DOM
    const visibleElements = allElements.filter(el => {
      try {
        const style = window.getComputedStyle(el);
        const tag = el.tagName?.toUpperCase() || '';
        // Excluir NAV y LI explícitamente
        if (tag === 'NAV' || tag === 'LI') {
          return false;
        }
        
        // Excluir divs que son contenedores de elementos interactivos
        if (tag === 'DIV') {
          const className = el.className?.toLowerCase() || '';
          const isContainerClass = className.includes('section-item') ||
                                  className.includes('menu-item') ||
                                  className.includes('item-container') ||
                                  className.includes('button-container') ||
                                  className.includes('link-container') ||
                                  className.includes('card-item') ||
                                  className.includes('product-item');
          
          // Verificar si contiene elementos interactivos directamente
          const hasInteractiveChildren = el.querySelector('button, a[href], input, select, textarea, [role="button"], [role="link"]') !== null;
          
          if (isContainerClass || hasInteractiveChildren) {
            return false;
          }
        }
        
        // Excluir elementos interactivos explícitamente
        const isInteractive = el.tagName === 'A' || 
                             el.tagName === 'BUTTON' || 
                             el.tagName === 'INPUT' || 
                             el.tagName === 'SELECT' || 
                             el.tagName === 'TEXTAREA' ||
                             el.hasAttribute('href') ||
                             el.hasAttribute('onclick') ||
                             (el.tabIndex >= 0 && !el.classList.contains('textreader-focusable'));
        
        if (isInteractive) {
          return false;
        }
        
        const hasContent = el.textContent?.trim().length > 0;
        return hasContent &&
               style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               !el.hasAttribute('aria-hidden') &&
               el.offsetParent !== null; // Está en el flujo del documento
      } catch (e) {
        return false;
      }
    });

    // Ordenar por posición en el documento
    visibleElements.sort((a, b) => {
      const position = a.compareDocumentPosition(b);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    const firstElement = visibleElements[0];

    if (firstElement) {
      logger.log('TextReader: Enfocando el primer elemento al activar:', firstElement.tagName);
      try {
        firstElement.focus();
        // El evento focusin se encargará de leer el elemento automáticamente
      } catch (e) {
        logger.warn('TextReader: Error al enfocar el primer elemento:', e);
      }
    }
  }

  deactivate() {
    this.isActive = false;
    this.stop();           // cancela síntesis; stop() pone isPaused = false internamente
    this.isPaused = true;  // sobreescribir: mantener pausado tras desactivación
    this.removeTextSelection();
    this.removeHoverReading();
    this.removeEscapeHandler();
    // Restaurar elementos de contenido a su estado original
    this.restoreContentElements();
    logger.log('TextReader: Desactivado completamente');
  }

  makeContentElementsFocusable() {
    // Elementos de contenido que deben ser navegables
    const contentSelectors = [
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  // Títulos
      'p',                                   // Párrafos
      // 'li',                               // Elementos de lista - EXCLUIDO: no deben ser focusables
      'blockquote',                          // Citas
      'span[role]',                          // Spans con roles
      'div[role]',                           // Divs con roles
      '[aria-label]:not(a):not(button):not(input)', // Elementos con aria-label que no son interactivos
      'article',                             // Artículos
      'section',                             // Secciones
      'aside',                               // Contenido lateral
      'main',                                // Contenido principal
      // 'nav',                              // Navegación - EXCLUIDO: no deben ser focusables
      'header',                              // Cabecera
      'footer',                              // Pie de página
      'figure',                              // Figuras
      'figcaption',                          // Pies de figura
      'caption',                             // Títulos de tabla
      'dt', 'dd',                            // Términos y definiciones
      'legend',                              // Leyendas de fieldset
      'label:not([for])',                    // Labels sin asociación
      'time',                                // Fechas/horas
      'address',                             // Direcciones
      'mark',                                // Texto marcado
      'code',                                // Código
      'pre',                                 // Texto preformateado
      'summary',                             // Resúmenes
      'span',                                // Spans (pueden contener precios)
      'div',                                 // Divs (pueden contener precios)
      '.price',                              // Clases comunes de precio
      '.amount',                             // Montos
      '.total',                              // Totales
      '.subtotal',                           // Subtotales
      '.cost',                               // Costos
      '[class*="price"]',                    // Cualquier clase que contenga "price"
      '[class*="precio"]',                   // Cualquier clase que contenga "precio"
      '[class*="amount"]',                   // Cualquier clase que contenga "amount"
      '[class*="total"]'                     // Cualquier clase que contenga "total"
    ];

    const allContentElements = [];
    contentSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => allContentElements.push(el));
      } catch (e) {
        logger.warn(`TextReader: Error al buscar selector ${selector}:`, e);
      }
    });

    // Filtrar y hacer focusables solo los que tienen contenido visible
    this.modifiedElements = [];
    const processedElements = new Set(); // Para evitar duplicados
    
    allContentElements.forEach(element => {
      try {
        // Evitar procesar el mismo elemento dos veces
        if (processedElements.has(element)) return;
        
        // Verificar que el elemento es visible y tiene contenido
        const style = window.getComputedStyle(element);
        const textContent = element.textContent?.trim() || '';
        const hasContent = textContent.length > 0;
        
        // Verificar si contiene números o símbolos de moneda (indicador de precio)
        const hasNumbers = /\d/.test(textContent);
        const hasCurrency = /€|\$|USD|EUR|£|¥/.test(textContent);
        const isPriceElement = hasNumbers && (hasCurrency || 
                                               element.className?.toLowerCase().includes('price') ||
                                               element.className?.toLowerCase().includes('precio') ||
                                               element.className?.toLowerCase().includes('amount') ||
                                               element.className?.toLowerCase().includes('total'));
        
        const isVisible = style.display !== 'none' && 
                         style.visibility !== 'hidden' && 
                         style.opacity !== '0';
        
        // No está ya focusable y no es un elemento interactivo
        const tag = element.tagName?.toUpperCase() || '';
        const role = element.getAttribute?.('role')?.toLowerCase() || '';
        const isInteractive = tag === 'A' || 
                             tag === 'BUTTON' || 
                             tag === 'INPUT' || 
                             tag === 'SELECT' || 
                             tag === 'TEXTAREA' ||
                             ['button', 'link', 'menuitem', 'tab', 'option'].includes(role) ||
                             element.hasAttribute('href') ||
                             element.hasAttribute('onclick');
        
        const notAlreadyFocusable = element.tabIndex < 0 && 
                                   !element.getAttribute('tabindex') &&
                                   !isInteractive;
        
        // Para span y div, solo incluir si tienen contenido relevante y no son contenedores vacíos
        const isSpanOrDiv = tag === 'SPAN' || tag === 'DIV';
        const hasRelevantContent = !isSpanOrDiv || 
                                   isPriceElement || 
                                   textContent.length < 200; // Evitar contenedores grandes

        // Excluir elementos NAV y LI explícitamente (no deben ser focusables)
        const isExcludedElement = tag === 'NAV' || tag === 'LI';
        
        // Excluir divs que son contenedores de elementos interactivos
        // Verificar si el div contiene botones, enlaces u otros elementos interactivos
        const isContainerDiv = tag === 'DIV';
        let isInteractiveContainer = false;
        if (isContainerDiv) {
          // Verificar clases comunes de contenedores (como section-item, menu-item, etc.)
          const className = element.className?.toLowerCase() || '';
          const isContainerClass = className.includes('section-item') ||
                                  className.includes('menu-item') ||
                                  className.includes('item-container') ||
                                  className.includes('button-container') ||
                                  className.includes('link-container') ||
                                  className.includes('card-item') ||
                                  className.includes('product-item');
          
          // Verificar si contiene elementos interactivos directamente
          const hasInteractiveChildren = element.querySelector('button, a[href], input, select, textarea, [role="button"], [role="link"]') !== null;
          
          isInteractiveContainer = isContainerClass || hasInteractiveChildren;
        }

        if (hasContent && isVisible && notAlreadyFocusable && hasRelevantContent && !isExcludedElement && !isInteractiveContainer) {
          // Guardar el tabindex original
          const originalTabIndex = element.getAttribute('tabindex');
          element.setAttribute('data-textreader-original-tabindex', originalTabIndex || 'none');
          element.setAttribute('tabindex', '0');
          
          // Agregar clase para identificación
          element.classList.add('textreader-focusable');
          
          // Marcar como precio si corresponde
          if (isPriceElement) {
            element.setAttribute('data-textreader-price', 'true');
          }
          
          this.modifiedElements.push(element);
          processedElements.add(element);
        }
      } catch (e) {
        // Silenciar errores
      }
    });

    logger.log(`TextReader: ${this.modifiedElements.length} elementos de contenido hechos focusables`);
  }

  restoreContentElements() {
    if (!this.modifiedElements) return;
    
    this.modifiedElements.forEach(element => {
      try {
        const originalTabIndex = element.getAttribute('data-textreader-original-tabindex');
        
        if (originalTabIndex === 'none') {
          element.removeAttribute('tabindex');
        } else {
          element.setAttribute('tabindex', originalTabIndex);
        }
        
        element.removeAttribute('data-textreader-original-tabindex');
        element.removeAttribute('data-textreader-price');
        element.classList.remove('textreader-focusable');
      } catch (e) {
        // Silenciar errores
      }
    });

    this.modifiedElements = [];
    logger.log('TextReader: Elementos de contenido restaurados');
  }

  setupEscapeHandler() {
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        logger.log('TextReader: ✓✓✓ Escape presionada - Desactivando lector de texto ✓✓✓');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.deactivate();
        // Notificar al content script que se desactivó
        this.notifyDeactivation();
      }
    };
    
    // Usar capture: true para interceptar antes que otros handlers
    document.addEventListener('keydown', this.escapeHandler, true);
    logger.log('TextReader: Handler de Escape configurado');
  }

  removeEscapeHandler() {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
      logger.log('TextReader: Handler de Escape removido');
    }
  }

  notifyDeactivation() {
    // Notificar que el lector de texto se ha desactivado
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({
        action: 'textReaderDeactivated'
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }

  async loadSpeed() {
    const stored = await chrome.storage.local.get(['textReaderSpeed']);
    if (stored.textReaderSpeed) {
      this.speed = stored.textReaderSpeed;
    }
  }

  setupTextSelection() {
    this.textSelectionHandler = this.handleTextSelection.bind(this);
    document.addEventListener('mouseup', this.textSelectionHandler);
    document.addEventListener('keyup', this.textSelectionHandler);
  }

  removeTextSelection() {
    if (this.textSelectionHandler) {
      document.removeEventListener('mouseup', this.textSelectionHandler);
      document.removeEventListener('keyup', this.textSelectionHandler);
    }
  }

  setupHoverReading() {
    this.hoverMouseOver = this.handleHoverMouseOver.bind(this);
    this.hoverMouseOut = this.handleHoverMouseOut.bind(this);
    this.mouseMove = this.handleMouseMove.bind(this);
    document.addEventListener('mouseover', this.hoverMouseOver, true);
    document.addEventListener('mouseout', this.hoverMouseOut, true);
    document.addEventListener('mousemove', this.mouseMove, true);
  }

  removeHoverReading() {
    if (this.hoverMouseOver) {
      document.removeEventListener('mouseover', this.hoverMouseOver, true);
    }
    if (this.hoverMouseOut) {
      document.removeEventListener('mouseout', this.hoverMouseOut, true);
    }
    if (this.mouseMove) {
      document.removeEventListener('mousemove', this.mouseMove, true);
    }
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
  }

  handleMouseMove(e) {
    // Guardar la posición del mouse para usarla cuando se hace clic en "Reproducir"
    this.lastMousePosition = { x: e.clientX, y: e.clientY };
    
    // También guardar el elemento actual si tiene texto
    const element = e.target;
    if (element && element.tagName !== 'SCRIPT' && element.tagName !== 'STYLE') {
      const text = this.getTextFromElement(element);
      if (text && text.trim().length >= 3) {
        this.lastHoveredElement = element;
      }
    }
  }

  handleHoverMouseOver(e) {
    // No leer si está pausado
    if (this.isPaused) {
      return;
    }
    
    // Solo leer en elementos que contengan texto significativo
    const element = e.target;
    if (!element || element.tagName === 'SCRIPT' || element.tagName === 'STYLE') {
      return;
    }

    // Guardar información del elemento para usar después con "Reproducir"
    this.lastHoveredElement = element;
    this.lastMousePosition = { x: e.clientX, y: e.clientY };

    const text = this.getTextFromElement(element);
    if (!text || text.trim().length < 3) {
      return;
    }

    // Limpiar timeout anterior
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
    }

    this.hoverElement = element;
    // Leer después de 500ms de hover
    this.hoverTimeout = setTimeout(() => {
      if (!this.isReading && !this.isPaused) {
        this.selectedText = text.trim();
        this.read(this.selectedText);
      }
    }, 500);
  }

  handleHoverMouseOut(e) {
    if (this.hoverTimeout) {
      clearTimeout(this.hoverTimeout);
      this.hoverTimeout = null;
    }
    this.hoverElement = null;
  }

  getTextFromElement(element) {
    if (!element) return '';
    
    // Obtener texto del elemento, excluyendo hijos que ya tienen texto propio
    let text = '';
    const children = element.childNodes;
    
    for (const node of children) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent + ' ';
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        // Solo incluir si es un elemento de texto simple (sin hijos complejos)
        if (node.children.length === 0 || node.tagName === 'SPAN' || node.tagName === 'EM' || node.tagName === 'STRONG') {
          text += node.textContent + ' ';
        }
      }
    }
    
    return text.trim() || element.textContent?.trim() || '';
  }

  handleTextSelection() {
    const selection = window.getSelection();
    if (selection.toString().trim()) {
      this.selectedText = selection.toString().trim();
      this.read(this.selectedText);
    }
  }

  async detectLanguage(text) {
    // SIEMPRE usar el idioma de la página si está disponible
    if (this.pageLanguage) {
      return this.pageLanguage;
    }
    
    // Fallback: Detectar idioma basado en caracteres comunes
    const spanishChars = /[áéíóúñüÁÉÍÓÚÑÜ]/;
    const englishPattern = /[a-zA-Z]{3,}/;
    
    const hasSpanish = spanishChars.test(text);
    const hasEnglish = englishPattern.test(text);
    
    if (hasSpanish && !hasEnglish) {
      return 'es-ES';
    } else if (hasEnglish && !hasSpanish) {
      return 'en-US';
    } else if (hasSpanish && hasEnglish) {
      // Si tiene ambos, usar el que tenga más palabras
      const words = text.split(/\s+/);
      const spanishWords = words.filter(w => spanishChars.test(w)).length;
      const englishWords = words.filter(w => englishPattern.test(w) && !spanishChars.test(w)).length;
      return spanishWords > englishWords ? 'es-ES' : 'en-US';
    }
    
    return 'es-ES'; // Default
  }

  async selectVoice(lang) {
    let voices = this.synthesis.getVoices();
    
    // Si no hay voces cargadas, esperar a que se carguen
    if (voices.length === 0) {
      voices = await new Promise((resolve) => {
        const checkVoices = () => {
          const loadedVoices = this.synthesis.getVoices();
          if (loadedVoices.length > 0) {
            resolve(loadedVoices);
          } else {
            setTimeout(checkVoices, 100);
          }
        };
        this.synthesis.onvoiceschanged = checkVoices;
        checkVoices();
      });
    }
    
    // Filtrar voces por idioma
    const langPrefix = lang.split('-')[0];
    const langVoices = voices.filter(voice => voice.lang.startsWith(langPrefix));
    
    if (langVoices.length > 0) {
      // Para español, priorizar voces de variantes españolas
      if (langPrefix === 'es') {
        // Intentar encontrar voces de diferentes países de habla hispana
        const preferredVariants = ['es-ES', 'es-MX', 'es-US', 'es-AR', 'es-CO', 'es-CL'];
        for (const variant of preferredVariants) {
          const voice = langVoices.find(v => v.lang === variant);
          if (voice) return voice;
        }
      }
      
      // Preferir voces locales exactas
      const localVoice = langVoices.find(v => v.lang === lang);
      if (localVoice) return localVoice;
      
      // Preferir voces nativas sobre redes
      const nativeVoices = langVoices.filter(v => !v.localService || v.localService === true);
      if (nativeVoices.length > 0) {
        return nativeVoices[0];
      }
      
      // Fallback a cualquier voz del idioma
      return langVoices[0];
    }
    
    // Fallback a cualquier voz disponible
    return voices.find(v => v.lang.startsWith(langPrefix)) || voices[0];
  }

  async read(text) {
    if (!this.isActive) return;
    if (!text || !text.trim()) {
      logger.warn('TextReader: No hay texto para leer');
      return;
    }

    // Asegurar que speed tenga un valor válido
    if (typeof this.speed !== 'number' || isNaN(this.speed) || this.speed <= 0) {
      logger.warn('TextReader: Speed inválido, usando valor por defecto 1.0');
      this.speed = 1.0;
    }

    // Verificar que speechSynthesis esté disponible
    if (!this.synthesis) {
      logger.error('TextReader: SpeechSynthesis no está disponible');
      return;
    }

    // Validar que speechSynthesis esté activo y disponible
    try {
      if (typeof this.synthesis.speak !== 'function') {
        logger.error('TextReader: SpeechSynthesis no tiene método speak disponible');
        return;
      }
    } catch (e) {
      logger.error('TextReader: Error al verificar SpeechSynthesis:', e);
      return;
    }

    // Cancelar la lectura anterior sin cambiar el estado de pausa
    try {
      if (this.synthesis.speaking || this.synthesis.pending) {
        this.synthesis.cancel();
        // Esperar un momento para que la cancelación se complete
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      this.isReading = false;
      this.removeHighlight();
      
      // Limpiar utterance anterior si existe
      if (this.utterance) {
        try {
          this.utterance.onerror = null;
          this.utterance.onstart = null;
          this.utterance.onend = null;
        } catch (e) {
          // Ignorar errores al limpiar handlers
        }
        this.utterance = null;
      }
    } catch (e) {
      logger.warn('TextReader: Error al cancelar lectura anterior:', e);
    }

    try {
      // Formatear el texto para mejorar la lectura de números y precios
      const formattedText = this.formatTextForSpeech(text);
      
      if (!formattedText || !formattedText.trim()) {
        logger.warn('TextReader: Texto formateado está vacío');
        return;
      }
      
      const lang = await this.detectLanguage(formattedText);
      const voice = await this.selectVoice(lang);

      logger.log('TextReader: Idioma detectado:', lang);
      logger.log('TextReader: Voz seleccionada:', voice?.name || 'ninguna');
      logger.log('TextReader: Texto formateado:', formattedText);

      // Cancelar cualquier síntesis activa antes de crear nuevo utterance
      // Hacerlo de forma silenciosa sin advertencias innecesarias
      if (this.synthesis && (this.synthesis.speaking || this.synthesis.pending)) {
        try {
          this.synthesis.cancel();
          // Esperar un momento para que la cancelación se complete
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Verificar una vez más y cancelar si aún está activa
          if (this.synthesis.speaking || this.synthesis.pending) {
            this.synthesis.cancel();
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (e) {
          // Ignorar errores al cancelar (puede que ya se haya cancelado)
        }
      }

      // Crear utterance con validación
      let utterance;
      try {
        utterance = new SpeechSynthesisUtterance(formattedText);
        
        if (!utterance) {
          logger.error('TextReader: No se pudo crear SpeechSynthesisUtterance');
          return;
        }
      } catch (createError) {
        logger.error('TextReader: Error al crear SpeechSynthesisUtterance:', createError);
        logger.error('TextReader: Detalles del error de creación:', {
          message: createError?.message,
          name: createError?.name,
          stack: createError?.stack
        });
        return;
      }
      
      // Configurar propiedades del utterance con validación
      try {
        utterance.lang = lang || 'es-ES';
        
        // Validar que speed esté en un rango válido (0.1 a 10)
        const validSpeed = Math.max(0.1, Math.min(10, this.speed || 1.0));
        utterance.rate = validSpeed;
        
        // Validar pitch (0 a 2)
        utterance.pitch = Math.max(0, Math.min(2, 1));
        
        // Validar volume (0 a 1)
        utterance.volume = Math.max(0, Math.min(1, 1));
        
        if (voice) {
          utterance.voice = voice;
        }
      } catch (configError) {
        logger.error('TextReader: Error al configurar propiedades del utterance:', configError);
        logger.error('TextReader: Detalles:', {
          lang: lang,
          speed: this.speed,
          voice: voice?.name,
          error: configError?.message
        });
        return;
      }
      
      // Asignar el utterance a la instancia solo después de configurarlo correctamente
      this.utterance = utterance;

      // Guardar referencia al contexto para los handlers
      const self = this;
      
      // Configurar handlers de eventos con validación
      try {
        this.utterance.onstart = () => {
          try {
            logger.log('TextReader: Iniciando lectura de texto');
            if (self) {
              self.isReading = true;
              self.highlightText(text);
            }
          } catch (e) {
            logger.error('TextReader: Error en onstart:', e);
          }
        };

        this.utterance.onend = () => {
          try {
            logger.log('TextReader: Lectura completada');
            if (self) {
              self.isReading = false;
              self.removeHighlight();
            }
          } catch (e) {
            logger.error('TextReader: Error en onend:', e);
          }
        };

        this.utterance.onerror = (error) => {
          try {
            // Obtener información del error de forma segura
            let errorInfo = 'unknown';
            let errorMessage = 'Error desconocido en síntesis de voz';
            
            if (error) {
              // SpeechSynthesisErrorEvent tiene propiedades específicas
              if (error.error) {
                errorInfo = error.error;
              } else if (error.type) {
                errorInfo = error.type;
              }
              
              if (error.message) {
                errorMessage = error.message;
              } else if (typeof error === 'string') {
                errorMessage = error;
              }
              
              // Intentar obtener más información del evento
              const errorType = error.type || 'unknown';
              const errorCode = error.charIndex !== undefined ? `charIndex: ${error.charIndex}` : '';
              
              // Solo loguear errores importantes, ignorar errores menores como "interrupted"
              if (errorInfo !== 'interrupted' && errorInfo !== 'canceled') {
                logger.warn('TextReader: Error en síntesis de voz:', {
                  error: errorInfo,
                  type: errorType,
                  message: errorMessage,
                  charIndex: error.charIndex,
                  code: errorCode,
                  utterance: error.utterance?.text?.substring(0, 50) || 'N/A'
                });
              }
            }
            
            // Limpiar estado de forma segura sin detener completamente la funcionalidad
            if (self) {
              self.isReading = false;
              try {
                self.removeHighlight();
              } catch (e) {
                // Ignorar errores menores al remover highlight
              }
              
              // No cancelar síntesis pendiente aquí, dejar que el siguiente elemento lo maneje
              // Esto permite que la navegación continúe incluso si hay errores menores
            }
          } catch (e) {
            // Fallback: si hay error en el handler de error, solo loguear sin detener
            logger.warn('TextReader: Error en handler onerror:', e);
          }
        };
      } catch (handlerError) {
        logger.error('TextReader: Error al configurar handlers del utterance:', handlerError);
        return;
      }

      // Intentar reproducir con manejo de errores
      try {
        // Verificar que speechSynthesis esté disponible antes de hablar
        if (!this.synthesis || typeof this.synthesis.speak !== 'function') {
          logger.error('TextReader: SpeechSynthesis no disponible para speak');
          this.isReading = false;
          this.removeHighlight();
          return;
        }
        
        // Verificar que no haya síntesis activa antes de hablar
        if (this.synthesis.speaking || this.synthesis.pending) {
          // Cancelar silenciosamente sin advertencias
          try {
            this.synthesis.cancel();
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (e) {
            // Ignorar errores al cancelar
          }
        }
        
        // Asegurar que las voces estén cargadas (especialmente en Chrome)
        const voices = this.synthesis.getVoices();
        if (voices.length === 0) {
          logger.warn('TextReader: No hay voces disponibles, esperando...');
          // Esperar un poco y reintentar
          setTimeout(() => {
            if (this.synthesis.getVoices().length > 0) {
              logger.log('TextReader: Voces cargadas, reintentando...');
              try {
                // Verificar de nuevo que no haya síntesis activa
                if (this.synthesis.speaking || this.synthesis.pending) {
                  this.synthesis.cancel();
                  setTimeout(() => {
                    this.synthesis.speak(this.utterance);
                  }, 50);
                } else {
                  this.synthesis.speak(this.utterance);
                }
              } catch (e) {
                logger.error('TextReader: Error al reintentar speak:', e);
                this.isReading = false;
                this.removeHighlight();
              }
            } else {
              logger.error('TextReader: No se pudieron cargar voces después de esperar');
              this.isReading = false;
              this.removeHighlight();
            }
          }, 100);
          return;
        }
        
        // Verificar una última vez que no haya síntesis activa
        if (this.synthesis.speaking || this.synthesis.pending) {
          // Cancelar silenciosamente
          try {
            this.synthesis.cancel();
            await new Promise(resolve => setTimeout(resolve, 50));
          } catch (e) {
            // Ignorar errores al cancelar
          }
        }
        
        this.synthesis.speak(this.utterance);
        logger.log('TextReader: Comando speak enviado');
      } catch (speakError) {
        logger.error('TextReader: Error al ejecutar speak:', speakError);
        logger.error('TextReader: Detalles del error:', {
          message: speakError?.message,
          name: speakError?.name,
          stack: speakError?.stack
        });
        this.isReading = false;
        this.removeHighlight();
      }
    } catch (error) {
      logger.error('TextReader: Error al leer texto:', error);
      this.isReading = false;
      try {
        this.removeHighlight();
      } catch (e) {
        logger.warn('TextReader: Error al remover highlight después de error:', e);
      }
    }
  }

  formatTextForSpeech(text) {
    let formatted = text;
    
    // Formatear precios en euros con decimales (59,99 € o 59.99€)
    formatted = formatted.replace(/(\d+)[.,](\d{2})\s*€/g, (match, euros, centimos) => {
      return `${euros} euros con ${centimos} céntimos`;
    });
    
    // Formatear precios en euros sin decimales (59 €)
    formatted = formatted.replace(/(\d+)\s*€/g, (match, amount) => {
      return `${amount} euros`;
    });
    
    // Formatear precios en dólares
    formatted = formatted.replace(/\$\s*(\d+)[.,](\d{2})/g, (match, dollars, cents) => {
      return `${dollars} dólares con ${cents} centavos`;
    });
    
    // Formatear números con separadores de miles (1.000 o 1,000)
    formatted = formatted.replace(/(\d{1,3})[.,](\d{3})/g, '$1$2');
    
    // Formatear porcentajes
    formatted = formatted.replace(/(\d+)\s*%/g, '$1 por ciento');
    
    // Formatear "GRATIS" para que se lea correctamente
    formatted = formatted.replace(/GRATIS/gi, 'gratis');
    
    // Formatear "FREE" para que se lea correctamente
    formatted = formatted.replace(/FREE/gi, 'gratis');
    
    // Formatear números de teléfono (opcional, para mejorar lectura)
    formatted = formatted.replace(/(\d{3})[\s-]?(\d{3})[\s-]?(\d{3})/g, '$1 $2 $3');
    
    // Reemplazar múltiples espacios por uno solo
    formatted = formatted.replace(/\s+/g, ' ').trim();
    
    return formatted;
  }

  highlightText(text) {
    try {
      if (!text || !text.trim()) {
        return;
      }
      
      // Limpiar highlights anteriores primero
      this.removeHighlight();
      
      // Buscar y resaltar el texto en la página
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
      );

      let node;
      while (node = walker.nextNode()) {
        try {
          const nodeText = node.textContent;
          if (nodeText && nodeText.includes(text)) {
            const range = document.createRange();
            const startIndex = nodeText.indexOf(text);
            const endIndex = startIndex + text.length;
            
            if (startIndex >= 0 && endIndex <= nodeText.length) {
              range.setStart(node, startIndex);
              range.setEnd(node, endIndex);
              
              const span = document.createElement('span');
              span.style.backgroundColor = '#ffeb3b';
              span.style.color = '#000';
              span.style.padding = '2px 4px';
              span.style.borderRadius = '2px';
              
              try {
                range.surroundContents(span);
                this.highlightElements.push(span);
                break; // Solo resaltar la primera ocurrencia
              } catch (e) {
                // Si no se puede envolver, crear un marcador
                try {
                  const marker = document.createElement('mark');
                  marker.textContent = text;
                  marker.style.backgroundColor = '#ffeb3b';
                  if (node.parentNode) {
                    node.parentNode.insertBefore(marker, node);
                    this.highlightElements.push(marker);
                  }
                } catch (e2) {
                  logger.warn('TextReader: Error al crear marcador de highlight:', e2);
                }
                break;
              }
            }
          }
        } catch (e) {
          // Continuar con el siguiente nodo si hay error
          logger.warn('TextReader: Error al procesar nodo de texto:', e);
        }
      }
    } catch (e) {
      logger.error('TextReader: Error en highlightText:', e);
    }
  }

  removeHighlight() {
    try {
      if (!this.highlightElements || this.highlightElements.length === 0) {
        return;
      }
      
      this.highlightElements.forEach(el => {
        try {
          if (el && el.parentNode) {
            const parent = el.parentNode;
            const textContent = el.textContent || el.innerText || '';
            const textNode = document.createTextNode(textContent);
            parent.replaceChild(textNode, el);
            parent.normalize();
          }
        } catch (e) {
          logger.warn('TextReader: Error al remover highlight individual:', e);
        }
      });
      this.highlightElements = [];
    } catch (e) {
      logger.warn('TextReader: Error al remover highlights:', e);
      // Asegurar que el array esté limpio incluso si hay error
      this.highlightElements = [];
    }
  }

  play() {
    // Si está pausado, reanudar
    if (this.isPaused) {
      this.pause(); // Esto lo reanudará
      return;
    }
    
    // Intentar obtener texto de diferentes fuentes
    let textToRead = '';
    
    // 1. Texto seleccionado actualmente
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      textToRead = selection.toString().trim();
      logger.log('TextReader: Usando texto seleccionado');
    }
    // 2. Texto previamente seleccionado
    else if (this.selectedText) {
      textToRead = this.selectedText;
      logger.log('TextReader: Usando texto previamente seleccionado');
    }
    // 3. Intentar obtener texto del último elemento sobre el que se hizo hover
    else if (this.lastHoveredElement) {
      textToRead = this.getTextFromElement(this.lastHoveredElement);
      if (textToRead) {
        logger.log('TextReader: Usando texto del último elemento con hover');
      }
    }
    // 4. Intentar obtener texto del elemento donde está el cursor del mouse
    else if (this.lastMousePosition) {
      const elementAtPoint = document.elementFromPoint(this.lastMousePosition.x, this.lastMousePosition.y);
      if (elementAtPoint) {
        textToRead = this.getTextFromElement(elementAtPoint);
        if (textToRead) {
          logger.log('TextReader: Usando texto del elemento en la posición del cursor');
        }
      }
    }
    // 5. Fallback: buscar texto visible en la página
    else {
      textToRead = this.getTextFromCursorPosition();
      if (textToRead) {
        logger.log('TextReader: Usando texto encontrado en la página');
      }
    }
    
    // 6. Si aún no hay texto, intentar del elemento con foco
    if (!textToRead && document.activeElement && document.activeElement !== document.body) {
      textToRead = this.getTextFromElement(document.activeElement);
      if (textToRead) {
        logger.log('TextReader: Usando texto del elemento con foco');
      }
    }
    
    // 7. Si aún no hay texto, intentar obtener texto del rango de selección (incluso si está vacío)
    if (!textToRead && selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (range) {
        const container = range.commonAncestorContainer;
        if (container) {
          if (container.nodeType === Node.TEXT_NODE) {
            textToRead = container.textContent?.trim() || '';
          } else if (container.nodeType === Node.ELEMENT_NODE) {
            textToRead = this.getTextFromElement(container);
          }
          if (textToRead) {
            logger.log('TextReader: Usando texto del contenedor de selección');
          }
        }
      }
    }

    if (textToRead && textToRead.trim()) {
      this.selectedText = textToRead.trim();
      this.read(this.selectedText);
    } else {
      logger.warn('TextReader: No hay texto disponible para leer. Selecciona texto en la página o haz hover sobre un elemento con texto.');
    }
  }

  // Normaliza el texto para evitar deletreo (elimina espacios múltiples entre letras)
  normalizeTextForReading(text) {
    if (!text) return '';
    
    // Eliminar espacios múltiples y normalizar
    let normalized = text.trim();
    
    // Reemplazar múltiples espacios por uno solo
    normalized = normalized.replace(/\s+/g, ' ');
    
    // Detectar si el texto parece estar deletreado
    // Patrón: letras individuales separadas por espacios (ej: "J E A N S" o "J. E. A. N. S")
    const words = normalized.split(/\s+/);
    const singleCharWords = words.filter(w => {
      // Contar letras individuales (pueden tener puntos: "J." o "J")
      const cleaned = w.replace(/[\.\s]/g, '');
      return cleaned.length === 1 && /[A-Za-z]/.test(cleaned);
    });
    const totalSingleChars = singleCharWords.length;
    const totalWords = words.length;
    
    // Si más del 50% son letras individuales y hay al menos 3, probablemente está deletreado
    // También verificar si hay un patrón de letras individuales consecutivas
    const hasConsecutiveSingleChars = words.some((w, i) => {
      if (i === 0) return false;
      const prevCleaned = words[i - 1].replace(/[\.\s]/g, '');
      const currCleaned = w.replace(/[\.\s]/g, '');
      return prevCleaned.length === 1 && currCleaned.length === 1 && 
             /[A-Za-z]/.test(prevCleaned) && /[A-Za-z]/.test(currCleaned);
    });
    
    if ((hasConsecutiveSingleChars && totalSingleChars >= 3) || 
        (totalSingleChars >= totalWords * 0.5 && totalWords > 2 && totalSingleChars >= 3)) {
      // Reconstruir como palabra completa eliminando espacios y puntos
      normalized = normalized.replace(/[\s\.]+/g, '');
    }
    
    // Normalizar espacios alrededor de puntuación
    normalized = normalized.replace(/\s+([.,;:!?])/g, '$1');
    normalized = normalized.replace(/([.,;:!?])\s+/g, '$1 ');
    
    // Eliminar espacios múltiples finales
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    return normalized;
  }

  // Extrae el nombre accesible de un elemento siguiendo prioridades ARIA/HTML
  getAccessibleName(element) {
    if (!element) return '';

    // 1) aria-label directa
    const ariaLabel = element.getAttribute?.('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    // 2) aria-labelledby
    const labelledBy = element.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      const acc = labelledBy
        .split(/\s+/)
        .map(id => document.getElementById(id))
        .filter(Boolean)
        .map(n => n.textContent?.trim() || '')
        .filter(Boolean)
        .join(' ')
        .trim();
      if (acc) return acc;
    }

    // 3) imágenes: alt
    if (element.tagName === 'IMG') {
      const alt = element.getAttribute('alt');
      if (alt && alt.trim()) return alt.trim();
    }

    // 4) enlaces/botones: texto visible o título
    const role = element.getAttribute?.('role') || '';
    const titleAttr = element.getAttribute?.('title');
    
    // Para enlaces y botones, usar textContent en lugar de innerText para evitar problemas de espaciado
    // textContent es más consistente y no se ve afectado por CSS
    let visibleText = '';
    if (/^(A|BUTTON)$/.test(element.tagName) || /button|link/.test(role)) {
      // Usar textContent que es más confiable para extraer texto sin formato
      visibleText = (element.textContent || '').trim();
      // Normalizar el texto visible para evitar deletreo
      if (visibleText) {
        visibleText = this.normalizeTextForReading(visibleText);
      }
    } else {
      // Para otros elementos, usar innerText o textContent
      visibleText = (element.innerText || element.textContent || '').trim();
      // Normalizar el texto visible para evitar deletreo
      if (visibleText) {
        visibleText = this.normalizeTextForReading(visibleText);
      }
    }
    
    if (titleAttr && titleAttr.trim()) return titleAttr.trim();
    if (/^(A|BUTTON)$/.test(element.tagName) || /button|link/.test(role)) {
      if (visibleText) return visibleText;
      const img = element.querySelector('img[alt]');
      if (img?.getAttribute('alt')) return img.getAttribute('alt').trim();
    }

    // 5) inputs: usar associated label
    if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
      // label por for
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const labelText = label?.innerText?.trim() || label?.textContent?.trim();
        if (labelText) return labelText;
      }
      // label ancestro
      const labelAncestor = element.closest('label');
      const labelAncestorText = labelAncestor?.innerText?.trim() || labelAncestor?.textContent?.trim();
      if (labelAncestorText) return labelAncestorText;
      if (titleAttr && titleAttr.trim()) return titleAttr.trim();
      if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
      // placeholder como último recurso (común en formularios modernos)
      const placeholder = element.getAttribute('placeholder');
      if (placeholder && placeholder.trim()) return placeholder.trim();
    }

    // 6) fallback a texto visible del elemento
    if (visibleText) {
      // Asegurar que el texto visible también esté normalizado
      return this.normalizeTextForReading(visibleText);
    }

    // 7) fallback a alt de imagen descendiente
    const imgChild = element.querySelector?.('img[alt]');
    if (imgChild?.getAttribute('alt')) return imgChild.getAttribute('alt').trim();

    return '';
  }

  // Detecta el tipo de elemento para anunciarlo con información detallada
  getElementType(element) {
    if (!element) return '';
    
    const tag = element.tagName?.toUpperCase() || '';
    const role = element.getAttribute?.('role')?.toLowerCase() || '';
    const type = element.getAttribute?.('type')?.toLowerCase() || '';
    const ariaLabel = element.getAttribute?.('aria-label');
    const ariaLevel = element.getAttribute?.('aria-level');
    
    // Priorizar role sobre tag
    if (role) {
      const roleMap = {
        'button': 'botón',
        'link': 'enlace',
        'heading': ariaLevel ? `encabezado nivel ${ariaLevel}` : 'encabezado',
        'img': 'imagen',
        'textbox': 'campo de texto',
        'combobox': 'lista desplegable',
        'checkbox': 'casilla de verificación',
        'radio': 'botón de opción',
        'searchbox': 'campo de búsqueda',
        'slider': 'control deslizante',
        'tab': 'pestaña',
        'tabpanel': 'panel de pestaña',
        'menuitem': 'elemento de menú',
        'menu': 'menú',
        'menubar': 'barra de menú',
        'option': 'opción',
        'listitem': 'elemento de lista',
        'list': 'lista',
        'navigation': 'región de navegación',
        'main': 'contenido principal',
        'article': 'artículo',
        'banner': 'cabecera del sitio',
        'complementary': 'contenido complementario',
        'contentinfo': 'información del contenido',
        'form': 'formulario',
        'search': 'región de búsqueda',
        'region': 'región',
        'dialog': 'diálogo',
        'alert': 'alerta',
        'status': 'estado',
        'log': 'registro',
        'marquee': 'contenido en movimiento',
        'timer': 'temporizador',
        'progressbar': 'barra de progreso',
        'tooltip': 'información emergente',
        'grid': 'cuadrícula',
        'treegrid': 'cuadrícula de árbol',
        'tree': 'árbol',
        'group': 'grupo'
      };
      if (roleMap[role]) return roleMap[role];
    }
    
    // Detectar por tag con información detallada
    switch (tag) {
      case 'H1':
        return 'título nivel 1';
      case 'H2':
        return 'título nivel 2';
      case 'H3':
        return 'título nivel 3';
      case 'H4':
        return 'título nivel 4';
      case 'H5':
        return 'título nivel 5';
      case 'H6':
        return 'título nivel 6';
      case 'A':
        const href = element.getAttribute('href');
        if (href) {
          // Detectar si es enlace externo
          const isExternal = href.startsWith('http') && !href.includes(window.location.hostname);
          return isExternal ? 'enlace externo' : 'enlace';
        }
        return 'ancla';
      case 'BUTTON':
        // Detectar tipo de botón
        const buttonType = element.getAttribute('type');
        if (buttonType === 'submit') return 'botón de envío';
        if (buttonType === 'reset') return 'botón de restablecer';
        return 'botón';
      case 'IMG':
        const alt = element.getAttribute('alt');
        return alt ? 'imagen' : 'imagen sin descripción';
      case 'INPUT':
        const inputTypes = {
          'text': 'campo de texto',
          'email': 'campo de correo electrónico',
          'password': 'campo de contraseña',
          'number': 'campo numérico',
          'tel': 'campo de teléfono',
          'url': 'campo de URL',
          'search': 'campo de búsqueda',
          'date': 'selector de fecha',
          'time': 'selector de hora',
          'datetime-local': 'selector de fecha y hora',
          'month': 'selector de mes',
          'week': 'selector de semana',
          'checkbox': 'casilla de verificación',
          'radio': 'botón de opción',
          'file': 'selector de archivo',
          'submit': 'botón de envío',
          'reset': 'botón de restablecer',
          'button': 'botón',
          'range': 'control deslizante',
          'color': 'selector de color'
        };
        const inputType = inputTypes[type] || 'campo de entrada';
        // Agregar estado si está marcado/desmarcado
        if (type === 'checkbox' || type === 'radio') {
          const checked = element.checked ? 'marcado' : 'desmarcado';
          return `${inputType}, ${checked}`;
        }
        // Agregar si es requerido
        if (element.hasAttribute('required')) {
          return `${inputType}, requerido`;
        }
        return inputType;
      case 'SELECT':
        const multiple = element.hasAttribute('multiple');
        return multiple ? 'lista desplegable de selección múltiple' : 'lista desplegable';
      case 'TEXTAREA':
        const rows = element.getAttribute('rows');
        return rows ? `área de texto de ${rows} líneas` : 'área de texto';
      case 'LABEL':
        return 'etiqueta';
      case 'UL':
        return 'lista sin ordenar';
      case 'OL':
        return 'lista ordenada';
      case 'LI':
        return 'elemento de lista';
      case 'DL':
        return 'lista de definiciones';
      case 'DT':
        return 'término de definición';
      case 'DD':
        return 'descripción de definición';
      case 'NAV':
        return 'región de navegación';
      case 'HEADER':
        return 'cabecera';
      case 'FOOTER':
        return 'pie de página';
      case 'MAIN':
        return 'contenido principal';
      case 'ARTICLE':
        return 'artículo';
      case 'SECTION':
        return 'sección';
      case 'ASIDE':
        return 'contenido complementario';
      case 'FORM':
        return 'formulario';
      case 'FIELDSET':
        return 'grupo de campos';
      case 'LEGEND':
        return 'leyenda';
      case 'TABLE':
        return 'tabla';
      case 'CAPTION':
        return 'título de tabla';
      case 'THEAD':
        return 'encabezado de tabla';
      case 'TBODY':
        return 'cuerpo de tabla';
      case 'TFOOT':
        return 'pie de tabla';
      case 'TR':
        return 'fila de tabla';
      case 'TD':
        return 'celda de tabla';
      case 'TH':
        return 'encabezado de celda';
      case 'P':
        return 'párrafo';
      case 'BLOCKQUOTE':
        return 'cita';
      case 'CODE':
        return 'código';
      case 'PRE':
        return 'texto preformateado';
      case 'DETAILS':
        const open = element.hasAttribute('open');
        return open ? 'detalles expandidos' : 'detalles colapsados';
      case 'SUMMARY':
        return 'resumen';
      case 'DIALOG':
        return 'diálogo';
      case 'MARK':
        return 'texto resaltado';
      case 'TIME':
        return 'fecha u hora';
      case 'METER':
        return 'medidor';
      case 'PROGRESS':
        const value = element.getAttribute('value');
        const max = element.getAttribute('max');
        if (value && max) {
          const percent = Math.round((parseFloat(value) / parseFloat(max)) * 100);
          return `barra de progreso, ${percent} por ciento`;
        }
        return 'barra de progreso';
      case 'SPAN':
      case 'DIV':
        // Detectar si es un elemento de precio
        const isPriceElement = element.getAttribute('data-textreader-price') === 'true';
        if (isPriceElement) {
          return 'precio';
        }
        // Detectar por clase
        const className = element.className?.toLowerCase() || '';
        if (className.includes('price') || className.includes('precio')) {
          return 'precio';
        }
        if (className.includes('amount') || className.includes('monto')) {
          return 'monto';
        }
        if (className.includes('total')) {
          return 'total';
        }
        if (className.includes('subtotal')) {
          return 'subtotal';
        }
        // Si no es ninguno de los anteriores, no retornar tipo
        return '';
      default:
        // Verificar si tiene atributos ARIA que indiquen tipo
        if (element.getAttribute('aria-checked') !== null) {
          const checked = element.getAttribute('aria-checked') === 'true';
          return checked ? 'casilla de verificación, marcada' : 'casilla de verificación, desmarcada';
        }
        if (element.getAttribute('aria-selected') !== null) {
          const selected = element.getAttribute('aria-selected') === 'true';
          return selected ? 'opción, seleccionada' : 'opción';
        }
        if (element.getAttribute('aria-pressed') !== null) {
          const pressed = element.getAttribute('aria-pressed') === 'true';
          return pressed ? 'botón de alternancia, presionado' : 'botón de alternancia';
        }
        if (element.getAttribute('aria-expanded') !== null) {
          const expanded = element.getAttribute('aria-expanded') === 'true';
          return expanded ? 'elemento expandible, expandido' : 'elemento expandible, colapsado';
        }
        // Si es focusable pero no tiene tipo específico, es probablemente texto interactivo
        if (element.tabIndex >= 0 || element.getAttribute('tabindex') !== null) {
          return 'elemento interactivo';
        }
        return '';
    }
  }

  /**
   * Verifica si un elemento debe ser leído basándose en su importancia y redundancia
   */
  shouldReadElement(element, name, elementType) {
    if (!element || !name) return false;
    
    // SIEMPRE leer elementos de contenido hechos focusables por el lector de texto
    const isTextReaderFocusable = element.classList.contains('textreader-focusable');
    if (isTextReaderFocusable) {
      return true;
    }
    
    const tag = element.tagName?.toUpperCase() || '';
    const role = element.getAttribute?.('role')?.toLowerCase() || '';
    
    // Normalizar el texto para comparación (sin diferencias de mayúsculas/minúsculas)
    const normalizedName = name.toLowerCase().trim();
    
    // Verificar si el mismo texto fue leído recientemente
    const timeSinceLastRead = Date.now() - this.lastReadTime;
    const isRecentDuplicate = normalizedName === this.lastReadText.toLowerCase() && 
                              timeSinceLastRead < this.DEDUPLICATION_WINDOW;
    
    // Elementos interactivos nativos siempre deben leerse
    const isInteractiveTag = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(tag);
    const isInteractiveRole = ['button', 'link', 'menuitem', 'tab', 'option', 'checkbox', 'radio'].includes(role);
    if (isInteractiveTag || isInteractiveRole) {
      return true;
    }

    // Lista de tipos de elementos que deben priorizarse
    const priorityTypes = ['enlace', 'enlace externo', 'ancla', 'botón', 'botón de envío',
                          'botón de restablecer', 'campo de texto', 'campo de correo electrónico',
                          'campo de contraseña', 'campo numérico', 'campo de teléfono',
                          'campo de búsqueda', 'campo de URL', 'selector de fecha',
                          'selector de hora', 'campo de entrada', 'lista desplegable',
                          'lista desplegable de selección múltiple', 'casilla de verificación',
                          'botón de opción', 'área de texto', 'control deslizante', 'precio'];

    // Lista de tipos que se pueden omitir si son redundantes (elementos contenedores)
    const skipTypes = ['elemento de lista', 'región de navegación', 'lista', 'sección',
                      'artículo', 'contenido complementario', 'grupo'];

    // Si es un elemento prioritario (interactivo), siempre leerlo
    if (priorityTypes.some(t => elementType.startsWith(t))) {
      return true;
    }
    
    // Si es un elemento que se puede omitir y es redundante, no leerlo
    if (skipTypes.includes(elementType) && isRecentDuplicate) {
      logger.log(`TextReader: Omitiendo lectura redundante - ${elementType}: ${name}`);
      return false;
    }
    
    // Si no es redundante o es un tipo importante, leerlo
    if (!isRecentDuplicate) {
      return true;
    }
    
    // Si es redundante pero es un elemento interactivo (a, button, input), leerlo de todos modos
    if (tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      return true;
    }
    
    // Si tiene role interactivo, leerlo
    if (['button', 'link', 'menuitem', 'tab', 'option'].includes(role)) {
      return true;
    }
    
    // Por defecto, omitir si es redundante
    return false;
  }

  // Lee el nombre accesible del elemento enfocado con información del tipo
  async readElementOnFocus(element) {
    try {
      if (!this.isActive) return { read: false, name: '', type: '' };
      if (!element) return { read: false, name: '', type: '' };
      
      const tag = element.tagName?.toUpperCase() || '';
      const role = element.getAttribute?.('role')?.toLowerCase() || '';
      
      // Verificar si es un elemento de precio marcado
      const isPriceElement = element.getAttribute('data-textreader-price') === 'true';
      
      // Ignorar elementos específicos por tag
      // Ignorar NAV (región de navegación) y LI (elemento de lista)
      if (tag === 'NAV' || tag === 'LI') {
        return { read: false, name: '', type: '' };
      }
      
      // Ignorar divs (excepto si son precios)
      if (tag === 'DIV') {
        const className = element.className?.toLowerCase() || '';
        const isPrice = isPriceElement || 
                       className.includes('price') || 
                       className.includes('precio') ||
                       className.includes('amount') ||
                       className.includes('monto') ||
                       className.includes('total') ||
                       className.includes('subtotal');
        
        // Solo leer divs si son elementos de precio
        if (!isPrice) {
          return { read: false, name: '', type: '' };
        }
      }
      
      const name = (this.getAccessibleName(element) || '').replace(/\s+/g, ' ').trim();
      if (!name) return { read: false, name: '', type: '' };

      // Normalizar el texto para evitar deletreo
      const normalizedName = this.normalizeTextForReading(name);

      // Obtener tipo de elemento
      const elementType = this.getElementType(element);
      
      // Ignorar elementos específicos que no deben leerse
      const ignoredTypes = ['región de navegación', 'elemento de lista'];
      if (elementType && ignoredTypes.includes(elementType)) {
        return { read: false, name: '', type: '' };
      }
      
      // Verificar si debe leer este elemento (evitar redundancias)
      // PERO siempre leer elementos de contenido hechos focusables por el lector de texto
      const isTextReaderFocusable = element.classList.contains('textreader-focusable');
      const shouldRead = isTextReaderFocusable || this.shouldReadElement(element, normalizedName, elementType);
      
      if (!shouldRead) {
        // Retornar información del elemento aunque no se lea (para el historial)
        return { read: false, name: normalizedName, type: elementType };
      }
      
      // Construir mensaje simplificado - solo incluir tipo si es importante
      let announcement = '';
      
      // role ya está declarado arriba en la función, reutilizarlo
      // Priorizar elementos interactivos y simplificar el anuncio
      const isInteractive = tag === 'A' || tag === 'BUTTON' || tag === 'INPUT' || 
                           tag === 'SELECT' || tag === 'TEXTAREA' ||
                           ['button', 'link', 'menuitem', 'tab', 'option'].includes(role);
      
      // Para elementos interactivos, usar formato simplificado: "tipo, nombre"
      if (isInteractive && elementType && elementType !== '') {
        // Para títulos, mantener formato completo
        if (tag.match(/^H[1-6]$/)) {
          const level = tag.charAt(1);
          announcement = `título nivel ${level}, ${normalizedName}`;
        } else if (isPriceElement) {
          announcement = `precio, ${normalizedName}`;
        } else {
          // Formato simplificado: solo tipo y nombre (sin repetir nombre)
          announcement = `${elementType}, ${normalizedName}`;
        }
      } else if (isPriceElement) {
        announcement = `precio, ${normalizedName}`;
      } else if (tag.match(/^H[1-6]$/)) {
        // Títulos siempre incluir tipo
        const level = tag.charAt(1);
        announcement = `título nivel ${level}, ${normalizedName}`;
      } else if (tag === 'P' || elementType === 'párrafo') {
        // Para párrafos, agregar "texto" antes del contenido
        announcement = `texto, ${normalizedName}`;
      } else {
        // Para otros elementos de texto no interactivos, agregar "texto" si no tienen tipo específico
        // Solo agregar "texto" si el elementoType está vacío o es genérico
        if (!elementType || elementType === '') {
          announcement = `texto, ${normalizedName}`;
        } else {
          // Si tiene un tipo específico, usar ese tipo
          announcement = `${elementType}, ${normalizedName}`;
        }
      }

      // Evitar repetir lectura exactamente igual de forma inmediata
      // Si ya está leyendo, cancelar suavemente antes de leer el nuevo elemento
      if (this.isReading) {
        try {
          if (this.synthesis && (this.synthesis.speaking || this.synthesis.pending)) {
            this.synthesis.cancel();
            // Esperar un momento para que la cancelación se complete
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } catch (e) {
          logger.warn('TextReader: Error al cancelar lectura anterior en readElementOnFocus:', e);
        }
      }
      
      // Limitar longitud para evitar leer textos muy largos
      const trimmed = announcement.length > 200 ? announcement.slice(0, 200) + '…' : announcement;
      
      // Guardar el texto leído para deduplicación
      this.lastReadText = normalizedName;
      this.lastReadTime = Date.now();
      
      // Guard final: verificar que el módulo sigue activo antes de hablar
      // (puede haber sido desactivado durante el procesamiento async anterior)
      if (!this.isActive) return { read: false, name: normalizedName, type: elementType };

      // Leer el texto (el método read() manejará la cancelación y creación del nuevo utterance)
      await this.read(trimmed);
      return { read: true, name: normalizedName, type: elementType }; // Retornar información completa
    } catch (e) {
      logger.error('TextReader: Error en readElementOnFocus:', e);
      // Intentar retornar información del elemento aunque haya error
      try {
        const name = (this.getAccessibleName(element) || '').replace(/\s+/g, ' ').trim();
        const elementType = this.getElementType(element);
        return { read: false, name: name || '', type: elementType || '' };
      } catch {
        return { read: false, name: '', type: '' };
      }
    }
  }

  getTextFromCursorPosition() {
    // Intentar obtener el elemento donde está el cursor del mouse usando document.elementFromPoint
    // Nota: Esto requiere que se haya guardado la posición del mouse, o usar una aproximación
    // Alternativamente, intentar obtener del elemento más cercano visible
    
    // Buscar el elemento más visible que contenga texto
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          // Filtrar elementos que probablemente no contengan texto útil
          const tag = node.tagName?.toUpperCase();
          if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED'].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Verificar si el elemento es visible
          const style = window.getComputedStyle(node);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
            return NodeFilter.FILTER_REJECT;
          }
          
          // Verificar si tiene texto
          const text = this.getTextFromElement(node);
          if (!text || text.trim().length < 10) {
            return NodeFilter.FILTER_REJECT;
          }
          
          return NodeFilter.FILTER_ACCEPT;
        }
      },
      false
    );

    // Buscar el primer elemento visible con texto suficiente
    let node;
    let bestMatch = null;
    let bestLength = 0;
    
    while (node = walker.nextNode()) {
      const text = this.getTextFromElement(node);
      if (text && text.trim().length >= 10 && text.trim().length <= 500) {
        // Preferir elementos con texto de longitud razonable (no demasiado largo)
        if (text.trim().length > bestLength) {
          bestMatch = node;
          bestLength = text.trim().length;
        }
      }
    }
    
    if (bestMatch) {
      return this.getTextFromElement(bestMatch);
    }
    
    // Fallback: intentar leer el texto del body si no se encuentra nada mejor
    const bodyText = document.body?.textContent?.trim();
    if (bodyText && bodyText.length > 50) {
      // Tomar solo los primeros 500 caracteres para no leer toda la página
      return bodyText.substring(0, 500).trim();
    }
    
    return '';
  }

  pause() {
    if (!this.synthesis) return;
    
    // Si está pausado, reanudar
    if (this.isPaused) {
      this.isPaused = false;
      if (this.synthesis.paused) {
        this.synthesis.resume();
      }
      logger.log('TextReader: Reanudando lectura');
    }
    // Si está leyendo, pausar
    else if (this.isReading) {
      this.isPaused = true;
      this.synthesis.pause();
      logger.log('TextReader: Pausando lectura');
    }
  }

  resume() {
    if (!this.synthesis) return;
    
    if (this.synthesis.paused) {
      this.synthesis.resume();
      logger.log('TextReader: Reanudando lectura');
    }
  }

  stop() {
    if (!this.synthesis) return;
    
    this.synthesis.cancel();
    this.isReading = false;
    this.isPaused = false;
    this.removeHighlight();
    logger.log('TextReader: Lectura detenida');
  }

  setSpeed(speed) {
    this.speed = speed;
    chrome.storage.local.set({ textReaderSpeed: speed });
  }
}
