// Modo de navegación visual

export class VisualNav {
  constructor() {
    this.isActive = false;
    this.settings = {
      showFocusables: true,
      showTabOrder: true,
      highlightFocus: true
    };
    this.overlays = [];
    this.focusableElements = [];
    this.tabOrderOverlays = [];
    this.focusOverlay = null;
    this.navigationHistory = [];
    this.lastNavigatedElement = null;
    this.MAX_HISTORY_ITEMS = 20;
    this.updateTimer = null;
    this.resizeObserver = null;
    this.scrollHandler = null;
    this.resizeHandler = null;
    this.focusUpdateHandler = null;
  }

  activate() {
    if (this.isActive) return;
    
    this.isActive = true;
    this.updateFocusableElements();
    this.applySettings();
    this.setupFocusHandlers();
    this.setupEscapeHandler();
    this.setupUpdateHandlers();
    console.log('VisualNav: Activado');
  }

  deactivate() {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.removeOverlays();
    this.removeFocusHandlers();
    this.removeEscapeHandler();
    this.removeUpdateHandlers();
    // Limpiar historial al desactivar
    this.navigationHistory = [];
    this.lastNavigatedElement = null;
    this.notifyHistoryUpdate(); // Notificar para limpiar el sidebar
    console.log('VisualNav: Desactivado completamente');
  }

  setupEscapeHandler() {
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        console.log('VisualNav: ✓✓✓ Escape presionada - Desactivando navegación visual ✓✓✓');
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
    console.log('VisualNav: Handler de Escape configurado');
  }

  removeEscapeHandler() {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
      console.log('VisualNav: Handler de Escape removido');
    }
  }

  notifyDeactivation() {
    // Notificar que la navegación visual se ha desactivado
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({
        action: 'visualNavDeactivated'
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }

  updateSetting(setting, value) {
    if (this.settings.hasOwnProperty(setting)) {
      this.settings[setting] = value;
      this.applySettings();
    }
  }

  /**
   * Calcula el orden real de tabulación según WCAG/Axe Core:
   * 1. Elementos con tabindex positivo (1, 2, 3...) van primero, ordenados ascendente
   * 2. Elementos con tabindex="0" o sin tabindex van después, en orden DOM
   * 3. Elementos con tabindex="-1" se excluyen del orden de tabulación
   * 
   * Usa compareDocumentPosition para obtener el orden real del navegador
   */
  calculateTabOrder(elements) {
    // Obtener tabindex de cada elemento
    const elementsWithTabIndex = elements.map(el => {
      const tabIndexAttr = el.getAttribute('tabindex');
      let tabIndex = null;
      
      if (tabIndexAttr !== null) {
        const parsed = parseInt(tabIndexAttr, 10);
        if (!isNaN(parsed)) {
          tabIndex = parsed;
        }
      }
      
      return {
        element: el,
        tabIndex: tabIndex
      };
    });
    
    // Separar elementos según su tabindex
    const positiveTabIndex = elementsWithTabIndex.filter(e => e.tabIndex !== null && e.tabIndex > 0);
    const zeroOrNullTabIndex = elementsWithTabIndex.filter(e => e.tabIndex === null || e.tabIndex === 0);
    
    // Ordenar elementos con tabindex positivo por valor ascendente
    positiveTabIndex.sort((a, b) => {
      if (a.tabIndex !== b.tabIndex) {
        return a.tabIndex - b.tabIndex;
      }
      // Si tienen el mismo tabindex, usar compareDocumentPosition para orden DOM
      return this.compareDOMOrder(a.element, b.element);
    });
    
    // Ordenar elementos con tabindex 0 o null por posición DOM usando compareDocumentPosition
    zeroOrNullTabIndex.sort((a, b) => this.compareDOMOrder(a.element, b.element));
    
    // Combinar: primero los positivos, luego los naturales
    const ordered = [...positiveTabIndex, ...zeroOrNullTabIndex];
    
    return ordered.map(e => e.element);
  }
  
  /**
   * Compara el orden de dos elementos en el DOM usando compareDocumentPosition
   * Retorna: negativo si a está antes que b, positivo si b está antes que a, 0 si son iguales
   */
  compareDOMOrder(a, b) {
    if (a === b) return 0;
    
    // Usar compareDocumentPosition para determinar el orden relativo
    const position = a.compareDocumentPosition(b);
    
    // Si a está antes que b en el documento
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    
    // Si a está después que b en el documento
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    
    // Fallback: comparar por posición visual (top, luego left)
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    
    // Primero comparar por posición vertical (top)
    const topDiff = rectA.top - rectB.top;
    if (Math.abs(topDiff) > 5) { // Tolerancia de 5px para considerar "misma línea"
      return topDiff;
    }
    
    // Si están en la misma línea (aproximadamente), comparar por posición horizontal (left)
    return rectA.left - rectB.left;
  }

  /**
   * Verifica si un elemento es realmente visible y focusable
   */
  isElementVisibleAndFocusable(element) {
    if (!element || !document.contains(element)) {
      return false;
    }
    
    // Excluir elementos con tabindex="-1"
    const tabIndex = element.getAttribute('tabindex');
    if (tabIndex === '-1') {
      return false;
    }
    
    // Verificar atributos que ocultan elementos
    if (element.hasAttribute('disabled') || 
        element.getAttribute('aria-disabled') === 'true' ||
        element.getAttribute('aria-hidden') === 'true') {
      return false;
    }
    
    // Verificar estilos computados
    const style = window.getComputedStyle(element);
    
    // Verificar display y visibility
    if (style.display === 'none' || 
        style.visibility === 'hidden' || 
        style.opacity === '0') {
      return false;
    }
    
    // Verificar si el elemento tiene dimensiones válidas
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      return false;
    }
    
    // Verificar si el elemento está dentro de un contenedor oculto
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      const parentStyle = window.getComputedStyle(parent);
      if (parentStyle.display === 'none' || 
          parentStyle.visibility === 'hidden' ||
          parent.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      parent = parent.parentElement;
    }
    
    // EXCLUIR DIVs y otros elementos contenedores que no son interactivos por sí mismos
    const tagName = element.tagName?.toLowerCase();
    
    // Si es un div, span u otro elemento contenedor genérico
    if (tagName === 'div' || tagName === 'span' || tagName === 'section' || 
        tagName === 'article' || tagName === 'aside' || tagName === 'main' ||
        tagName === 'header' || tagName === 'footer' || tagName === 'nav') {
      
      // Solo incluir si tiene interacción explícita:
      // 1. Tiene tabindex positivo (mayor que 0)
      // 2. Tiene role interactivo
      // 3. Tiene contenteditable="true"
      // 4. Tiene event handlers de click (aunque esto es difícil de detectar, mejor confiar en tabindex/role)
      
      const hasPositiveTabIndex = tabIndex !== null && parseInt(tabIndex, 10) > 0;
      const role = element.getAttribute('role');
      const interactiveRoles = ['button', 'link', 'tab', 'menuitem', 'option', 'checkbox', 'radio', 'switch'];
      const hasInteractiveRole = role && interactiveRoles.includes(role);
      const isContentEditable = element.getAttribute('contenteditable') === 'true';
      
      // Si no tiene ninguna de estas características, es solo un contenedor y se excluye
      if (!hasPositiveTabIndex && !hasInteractiveRole && !isContentEditable) {
        return false;
      }
    }
    
    return true;
  }

  updateFocusableElements() {
    // Selectores más específicos - excluir divs y contenedores genéricos
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]'
    ].join(', ');

    const allElements = Array.from(document.querySelectorAll(selectors));
    
    // Filtrar elementos que son realmente visibles y focusables
    // Esto también excluirá divs que no son interactivos
    const elements = allElements.filter(el => this.isElementVisibleAndFocusable(el));

    // Ordenar según el orden real de tabulación
    this.focusableElements = this.calculateTabOrder(elements);
    console.log(`VisualNav: Orden de tabulación calculado correctamente para ${this.focusableElements.length} elementos (de ${allElements.length} encontrados)`);
    console.log(`VisualNav: Divs contenedores no interactivos excluidos`);
  }

  applySettings() {
    this.removeOverlays();

    if (this.settings.showFocusables) {
      this.showFocusables();
    }

    if (this.settings.showTabOrder) {
      this.showTabOrder();
    }

    if (this.settings.highlightFocus) {
      this.setupFocusHighlight();
    }
  }

  showFocusables() {
    this.focusableElements.forEach((element, index) => {
      const overlay = this.createOverlay(element, index);
      this.overlays.push(overlay);
      document.body.appendChild(overlay);
    });
  }

  showTabOrder() {
    // Calcular el orden real de tabulación para cada elemento
    this.focusableElements.forEach((element, index) => {
      // El índice ya representa el orden correcto después de calculateTabOrder
      const tabOrder = index + 1;
      const tabOrderOverlay = this.createTabOrderOverlay(element, tabOrder);
      this.tabOrderOverlays.push(tabOrderOverlay);
      document.body.appendChild(tabOrderOverlay);
    });
  }

  createOverlay(element, index) {
    const overlay = document.createElement('div');
    overlay.className = 'a11y-visual-overlay';
    overlay.dataset.elementIndex = index;
    overlay.dataset.elementId = this.getElementId(element);
    
    // Guardar referencia al elemento en el overlay
    overlay._elementRef = element;
    
    // Usar position: fixed para mejor precisión
    overlay.style.cssText = `
      position: fixed;
      border: 2px solid #4a90e2;
      background: rgba(74, 144, 226, 0.1);
      pointer-events: none;
      z-index: 999998;
      box-sizing: border-box;
      display: none;
    `;
    
    // Actualizar posición inicial
    this.updateOverlayPosition(overlay, element);
    
    return overlay;
  }

  createTabOrderOverlay(element, order) {
    const overlay = document.createElement('div');
    overlay.className = 'a11y-tab-order-overlay';
    overlay.textContent = order;
    overlay.dataset.elementIndex = this.focusableElements.indexOf(element);
    overlay.dataset.elementId = this.getElementId(element);
    
    // Guardar referencia al elemento en el overlay
    overlay._elementRef = element;
    
    // Usar position: fixed para mejor precisión
    overlay.style.cssText = `
      position: fixed;
      width: 24px;
      height: 24px;
      background: #4a90e2;
      color: #fff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 400;
      pointer-events: none;
      z-index: 999999;
      box-sizing: border-box;
      display: none;
    `;
    
    // Actualizar posición inicial
    this.updateTabOrderOverlayPosition(overlay, element);
    
    return overlay;
  }
  
  /**
   * Genera un ID único para un elemento
   */
  getElementId(element) {
    if (element.id) return element.id;
    // Crear ID basado en posición si no tiene ID
    return `a11y-${this.focusableElements.indexOf(element)}`;
  }
  
  /**
   * Actualiza la posición de un overlay de elemento
   */
  updateOverlayPosition(overlay, element) {
    if (!element || !document.contains(element)) {
      overlay.style.display = 'none';
      return;
    }
    
    const rect = element.getBoundingClientRect();
    
    // Verificar si el elemento es visible
    if (rect.width === 0 && rect.height === 0) {
      overlay.style.display = 'none';
      return;
    }
    
    overlay.style.display = 'block';
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
  }
  
  /**
   * Actualiza la posición de un overlay de orden de tabulación
   */
  updateTabOrderOverlayPosition(overlay, element) {
    if (!element || !document.contains(element)) {
      overlay.style.display = 'none';
      return;
    }
    
    const rect = element.getBoundingClientRect();
    
    // Verificar si el elemento es visible
    if (rect.width === 0 && rect.height === 0) {
      overlay.style.display = 'none';
      return;
    }
    
    overlay.style.display = 'flex';
    overlay.style.top = `${rect.top - 8}px`;
    overlay.style.left = `${rect.left - 8}px`;
  }
  
  /**
   * Actualiza todas las posiciones de los overlays
   */
  updateAllOverlayPositions() {
    if (!this.isActive) return;
    
    // Actualizar overlays de elementos
    this.overlays.forEach((overlay, index) => {
      const element = overlay._elementRef;
      if (element) {
        this.updateOverlayPosition(overlay, element);
      }
    });
    
    // Actualizar overlays de orden de tabulación
    this.tabOrderOverlays.forEach((overlay) => {
      const element = overlay._elementRef;
      if (element) {
        this.updateTabOrderOverlayPosition(overlay, element);
      }
    });
    
    // Actualizar overlay de foco si existe
    if (this.focusOverlay && this.focusOverlay._elementRef) {
      const element = this.focusOverlay._elementRef;
      if (element && document.contains(element)) {
        const rect = element.getBoundingClientRect();
        this.focusOverlay.style.top = `${rect.top}px`;
        this.focusOverlay.style.left = `${rect.left}px`;
        this.focusOverlay.style.width = `${rect.width}px`;
        this.focusOverlay.style.height = `${rect.height}px`;
      }
    }
  }
  
  /**
   * Configura handlers para actualizar overlays en scroll y resize
   */
  setupUpdateHandlers() {
    // Handler para scroll inmediato (sin debounce para mejor respuesta)
    this.scrollHandler = () => {
      // Actualizar inmediatamente sin debounce para scroll
      this.updateAllOverlayPositions();
    };
    
    // Escuchar scroll en todos los niveles (capture phase)
    window.addEventListener('scroll', this.scrollHandler, true);
    document.addEventListener('scroll', this.scrollHandler, true);
    
    // Handler para resize con debounce ligero
    this.resizeHandler = () => {
      if (this.updateTimer) {
        clearTimeout(this.updateTimer);
      }
      this.updateTimer = setTimeout(() => {
        this.updateAllOverlayPositions();
      }, 10);
    };
    
    window.addEventListener('resize', this.resizeHandler);
    
    // Usar MutationObserver para detectar cambios en el DOM
    this.resizeObserver = new ResizeObserver(() => {
      this.updateAllOverlayPositions();
    });
    
    // Observar cambios en el body y todos los elementos con overlays
    this.resizeObserver.observe(document.body);
    
    // Observar cada elemento focusable para detectar cambios de tamaño/posición
    this.focusableElements.forEach(element => {
      try {
        this.resizeObserver.observe(element);
      } catch (e) {
        // Ignorar errores si el elemento no es observable
      }
    });
    
    // Escuchar eventos de foco para actualizar inmediatamente cuando hay scroll automático
    this.focusUpdateHandler = () => {
      // Pequeño delay para permitir que el scroll automático termine
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.updateAllOverlayPositions();
        });
      });
    };
    
    document.addEventListener('focusin', this.focusUpdateHandler, true);
    document.addEventListener('focus', this.focusUpdateHandler, true);
    
    // Usar requestAnimationFrame para actualizaciones continuas y suaves
    let lastUpdate = 0;
    const updateLoop = (timestamp) => {
      if (!this.isActive) return;
      
      // Actualizar cada frame (60fps) para mantener sincronización perfecta
      const delta = timestamp - lastUpdate;
      if (delta >= 16) {
        this.updateAllOverlayPositions();
        lastUpdate = timestamp;
      }
      
      requestAnimationFrame(updateLoop);
    };
    requestAnimationFrame(updateLoop);
  }
  
  /**
   * Remueve los handlers de actualización
   */
  removeUpdateHandlers() {
    if (this.scrollHandler) {
      window.removeEventListener('scroll', this.scrollHandler, true);
      document.removeEventListener('scroll', this.scrollHandler, true);
      this.scrollHandler = null;
    }
    
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    
    if (this.focusUpdateHandler) {
      document.removeEventListener('focusin', this.focusUpdateHandler, true);
      document.removeEventListener('focus', this.focusUpdateHandler, true);
      this.focusUpdateHandler = null;
    }
    
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  setupFocusHandlers() {
    this.handlers = {
      focusin: (e) => {
        if (this.settings.highlightFocus) {
          this.highlightFocus(e.target);
        }
        // Registrar en historial cuando un elemento recibe foco
        this.addToHistory(e.target);
        
        // Actualizar overlays inmediatamente cuando hay cambio de foco
        // Esto es importante porque el scroll automático puede ocurrir
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.updateAllOverlayPositions();
          });
        });
      },
      focusout: () => {
        if (this.settings.highlightFocus) {
          this.removeFocusHighlight();
        }
      }
    };

    document.addEventListener('focusin', this.handlers.focusin);
    document.addEventListener('focusout', this.handlers.focusout);
  }
  
  /**
   * Obtiene el nombre accesible de un elemento
   */
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
    const titleAttr = element.getAttribute?.('title');
    const visibleText = (element.innerText || element.textContent || '').trim();
    if (titleAttr && titleAttr.trim()) return titleAttr.trim();
    
    // 5) inputs: usar associated label
    if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
      const id = element.id;
      if (id) {
        const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        const labelText = label?.innerText?.trim() || label?.textContent?.trim();
        if (labelText) return labelText;
      }
      const labelAncestor = element.closest('label');
      const labelAncestorText = labelAncestor?.innerText?.trim() || labelAncestor?.textContent?.trim();
      if (labelAncestorText) return labelAncestorText;
    }
    
    // 6) fallback a texto visible del elemento
    if (visibleText && visibleText.length <= 50) return visibleText;
    if (visibleText && visibleText.length > 50) return visibleText.substring(0, 50) + '...';
    
    return '';
  }
  
  /**
   * Obtiene el tipo de elemento
   */
  getElementType(element) {
    if (!element) return 'elemento desconocido';
    
    const tag = element.tagName?.toLowerCase() || '';
    const type = element.type?.toLowerCase() || '';
    const role = element.getAttribute('role') || '';
    
    if (role) {
      const roleMap = {
        'button': 'botón',
        'link': 'enlace',
        'textbox': 'campo de texto',
        'checkbox': 'casilla',
        'radio': 'opción',
        'combobox': 'lista desplegable',
        'menuitem': 'elemento de menú',
        'tab': 'pestaña',
        'option': 'opción'
      };
      return roleMap[role] || role;
    }
    
    if (tag === 'input') {
      const typeMap = {
        'text': 'campo de texto',
        'email': 'campo de correo',
        'password': 'campo de contraseña',
        'search': 'buscador',
        'tel': 'campo de teléfono',
        'url': 'campo de URL',
        'number': 'campo numérico',
        'date': 'selector de fecha',
        'time': 'selector de hora',
        'checkbox': 'casilla',
        'radio': 'opción',
        'range': 'control deslizante',
        'file': 'selector de archivo',
        'submit': 'botón enviar',
        'reset': 'botón restablecer',
        'button': 'botón'
      };
      return typeMap[type] || 'campo de entrada';
    }
    
    const tagMap = {
      'a': 'enlace',
      'button': 'botón',
      'input': 'campo de entrada',
      'select': 'lista desplegable',
      'textarea': 'área de texto',
      'img': 'imagen',
      'svg': 'imagen'
    };
    
    return tagMap[tag] || tag || 'elemento';
  }
  
  /**
   * Obtiene el número de tabulación de un elemento
   */
  getTabOrder(element) {
    const index = this.focusableElements.indexOf(element);
    return index >= 0 ? index + 1 : null;
  }
  
  /**
   * Añade un elemento al historial de navegación
   */
  addToHistory(element) {
    if (!this.isActive) return;
    
    const tabOrder = this.getTabOrder(element);
    if (tabOrder === null) return;
    
    const accessibleName = this.getAccessibleName(element);
    const elementType = this.getElementType(element);
    
    // Normalizar el nombre
    const normalizedName = accessibleName.trim().replace(/\s+/g, ' ') || elementType || 'elemento';
    
    // Verificar si es el mismo elemento que el anterior para evitar duplicados
    if (this.lastNavigatedElement && 
        this.lastNavigatedElement.name === normalizedName && 
        this.lastNavigatedElement.type === elementType &&
        this.lastNavigatedElement.tabOrder === tabOrder) {
      return;
    }
    
    // Crear entrada del historial
    const historyEntry = {
      name: normalizedName,
      type: elementType,
      tabOrder: tabOrder,
      timestamp: Date.now()
    };
    
    // Guardar como último elemento navegado
    this.lastNavigatedElement = {
      name: normalizedName,
      type: elementType,
      tabOrder: tabOrder
    };
    
    // Agregar al inicio del array
    this.navigationHistory.unshift(historyEntry);
    
    // Limitar el tamaño del historial
    if (this.navigationHistory.length > this.MAX_HISTORY_ITEMS) {
      this.navigationHistory = this.navigationHistory.slice(0, this.MAX_HISTORY_ITEMS);
    }
    
    // Notificar al sidebar
    this.notifyHistoryUpdate();
    
    console.log(`VisualNav History: Agregado - Tab ${tabOrder}: ${normalizedName} → ${elementType}`);
  }
  
  /**
   * Notifica al sidebar sobre cambios en el historial
   */
  notifyHistoryUpdate() {
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    
    try {
      chrome.runtime.sendMessage({
        action: 'updateVisualNavHistory',
        history: this.navigationHistory
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }

  removeFocusHandlers() {
    if (this.handlers) {
      document.removeEventListener('focusin', this.handlers.focusin);
      document.removeEventListener('focusout', this.handlers.focusout);
    }
  }

  highlightFocus(element) {
    this.removeFocusHighlight();
    
    if (!element || !document.contains(element)) return;
    
    const rect = element.getBoundingClientRect();
    this.focusOverlay = document.createElement('div');
    this.focusOverlay.className = 'a11y-focus-overlay';
    this.focusOverlay._elementRef = element; // Guardar referencia
    
    // Usar position: fixed para mejor precisión
    this.focusOverlay.style.cssText = `
      position: fixed;
      top: ${rect.top}px;
      left: ${rect.left}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      border: 3px solid #ff9800;
      background: rgba(255, 152, 0, 0.2);
      pointer-events: none;
      z-index: 1000000;
      box-sizing: border-box;
      animation: a11y-pulse 1s ease-in-out infinite;
    `;

    // Agregar animación CSS si no existe
    if (!document.getElementById('a11y-animations')) {
      const style = document.createElement('style');
      style.id = 'a11y-animations';
      style.textContent = `
        @keyframes a11y-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(this.focusOverlay);
  }

  removeFocusHighlight() {
    if (this.focusOverlay && this.focusOverlay.parentNode) {
      this.focusOverlay.parentNode.removeChild(this.focusOverlay);
      this.focusOverlay = null;
    }
  }

  removeOverlays() {
    this.overlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.overlays = [];

    this.tabOrderOverlays.forEach(overlay => {
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.tabOrderOverlays = [];

    this.removeFocusHighlight();
    
    // Remover estilos de animación si existen
    const animationStyle = document.getElementById('a11y-animations');
    if (animationStyle && animationStyle.parentNode) {
      animationStyle.parentNode.removeChild(animationStyle);
    }
  }

  setupFocusHighlight() {
    // Se activa cuando hay un evento focusin
  }
}
