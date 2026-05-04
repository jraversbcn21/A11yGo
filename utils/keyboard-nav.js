// Sistema de navegación por teclado

export class KeyboardNav {
  constructor() {
    this.isActive = false;
    this.focusableElements = [];
    this.currentIndex = -1;
    this.handlers = {};
    this.tooltip = null;
    this.tooltipTimer = null;
    this.mutationObserver = null;
  }

  activate() {
    console.log('KeyboardNav: activate() llamado');
    console.log('KeyboardNav: this.isActive =', this.isActive);
    
    if (this.isActive) {
      console.log('KeyboardNav: Ya está activo, evitando reactivación');
      return;
    }
    
    console.log('KeyboardNav: ✓✓✓ Activando navegación por teclado ✓✓✓');
    this.isActive = true;
    this.updateFocusableElements();
    console.log(`KeyboardNav: Encontrados ${this.focusableElements.length} elementos focusables`);
    this.setupKeyboardHandlers();
    this.setupFocusHandlers();
    this.setupMutationObserver();
    
    // Enfocar el primer elemento focusable al activar
    this.focusFirstElement();
    
    // Enviar información inicial al panel
    this.updateFocusInfo();
  }

  focusFirstElement() {
    if (this.focusableElements.length > 0) {
      // Resetear el índice al inicio
      this.currentIndex = -1;
      console.log('KeyboardNav: Enfocando el primer elemento al activar');
      // Usar focusNext para enfocar el primer elemento
      this.focusNext();
    }
  }

  deactivate() {
    if (!this.isActive) return;
    
    console.log('KeyboardNav: Desactivando navegación por teclado');
    this.isActive = false;
    this.removeKeyboardHandlers();
    this.removeFocusHandlers();
    this.removeMutationObserver();
    this.removeHighlights();
    this.removeTooltip();
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

  updateFocusableElements() {
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]',
      '[contenteditable="true"]',
      '[role="button"]',
      '[role="link"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '[role="option"]'
    ].join(', ');

    const allElements = Array.from(document.querySelectorAll(selectors));
    const elements = allElements.filter(el => {
      // Excluir elementos con tabindex="-1" del orden de tabulación
      const tabIndex = el.getAttribute('tabindex');
      if (tabIndex === '-1') {
        return false;
      }
      
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && 
             style.visibility !== 'hidden' && 
             style.opacity !== '0' &&
             !el.hasAttribute('disabled') &&
             !el.hasAttribute('aria-hidden');
    });

    // Ordenar según el orden real de tabulación
    this.focusableElements = this.calculateTabOrder(elements);
    console.log(`KeyboardNav: Actualizados ${this.focusableElements.length} elementos focusables (de ${allElements.length} encontrados)`);
    console.log(`KeyboardNav: Orden de tabulación calculado correctamente`);
  }

  setupKeyboardHandlers() {
    this.handlers.keydown = (e) => {
      // Solo procesar si estamos activos
      if (!this.isActive) {
        console.log('KeyboardNav: Handler ejecutado pero no está activo');
        return;
      }
      
      console.log(`KeyboardNav: Tecla detectada: ${e.key}, Shift: ${e.shiftKey}, Target:`, e.target);
      
      // Escape para salir del modo de navegación
      if (e.key === 'Escape') {
        console.log('KeyboardNav: ✓✓✓ Escape presionada - Desactivando navegación por teclado ✓✓✓');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.deactivate();
        // Notificar al content script que se desactivó
        this.notifyDeactivation();
        return;
      }
      
      if (e.key === 'Tab' && !e.shiftKey) {
        console.log('KeyboardNav: ✓✓✓ Tab presionada (adelante) - INTERCEPTADO ✓✓✓');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.focusNext();
      } else if (e.key === 'Tab' && e.shiftKey) {
        console.log('KeyboardNav: ✓✓✓ Shift+Tab presionada (atrás) - INTERCEPTADO ✓✓✓');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.focusPrevious();
      }
    };

    // Usar capture: true para interceptar antes que otros handlers
    document.addEventListener('keydown', this.handlers.keydown, true);
    console.log('KeyboardNav: ✓✓✓ Handlers de teclado configurados con capture ✓✓✓');
  }

  setupFocusHandlers() {
    let lastFocusedElement = null; // Para evitar actualizaciones redundantes
    
    this.handlers.focusin = () => {
      const activeElement = document.activeElement;
      
      // Evitar procesar el mismo elemento múltiples veces
      if (lastFocusedElement === activeElement) {
        return;
      }
      
      lastFocusedElement = activeElement;
      const newIndex = this.focusableElements.indexOf(activeElement);
      
      // Solo actualizar si el elemento está en nuestra lista y es diferente
      if (newIndex !== -1 && newIndex !== this.currentIndex) {
        const elementType = this.getElementType(activeElement);
        console.log(`KeyboardNav: Focus cambiado externamente a ${elementType} (índice ${newIndex})`, activeElement);
        this.currentIndex = newIndex;
        this.updateFocusInfo();
      } else if (newIndex === -1 && activeElement !== document.body) {
        // Si el elemento no está en la lista, puede ser que se haya actualizado
        const elementType = this.getElementType(activeElement);
        console.log(`KeyboardNav: Focus en ${elementType} que no está en la lista, actualizando lista...`, activeElement);
        this.updateFocusableElements();
        // Intentar encontrar el elemento después de actualizar
        const updatedIndex = this.focusableElements.indexOf(activeElement);
        if (updatedIndex !== -1 && updatedIndex !== this.currentIndex) {
          this.currentIndex = updatedIndex;
          this.updateFocusInfo();
        }
      }
    };

    document.addEventListener('focusin', this.handlers.focusin);
    console.log('KeyboardNav: Handlers de foco configurados');
  }

  removeKeyboardHandlers() {
    if (this.handlers.keydown) {
      document.removeEventListener('keydown', this.handlers.keydown, true);
      console.log('KeyboardNav: Handlers de teclado removidos');
    }
  }

  removeFocusHandlers() {
    if (this.handlers.focusin) {
      document.removeEventListener('focusin', this.handlers.focusin);
    }
  }

  setupMutationObserver() {
    // Observar cambios en el DOM para actualizar elementos focusables
    let updateTimeout = null;
    
    this.mutationObserver = new MutationObserver(() => {
      if (!this.isActive) return;
      
      // Debounce: esperar 500ms antes de actualizar para evitar actualizaciones demasiado frecuentes
      if (updateTimeout) {
        clearTimeout(updateTimeout);
      }
      
      updateTimeout = setTimeout(() => {
        const previousCount = this.focusableElements.length;
        const previousIndex = this.currentIndex;
        const previousElement = this.focusableElements[previousIndex];
        
        this.updateFocusableElements();
        
        if (this.focusableElements.length !== previousCount) {
          console.log(`KeyboardNav: Cambios detectados en el DOM, elementos cambió de ${previousCount} a ${this.focusableElements.length}`);
        }
        
        // Intentar mantener el índice si el elemento sigue existiendo
        if (previousElement && document.contains(previousElement)) {
          const newIndex = this.focusableElements.indexOf(previousElement);
          if (newIndex !== -1 && newIndex !== previousIndex) {
            this.currentIndex = newIndex;
            console.log(`KeyboardNav: Índice actualizado de ${previousIndex} a ${newIndex} (mismo elemento)`);
          }
        }
      }, 500);
    });

    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden', 'disabled', 'tabindex', 'aria-hidden']
    });
    console.log('KeyboardNav: MutationObserver configurado con debounce');
  }

  removeMutationObserver() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = null;
      console.log('KeyboardNav: MutationObserver removido');
    }
  }

  focusNext() {
    if (this.focusableElements.length === 0) {
      console.warn('KeyboardNav: No hay elementos focusables disponibles');
      this.updateFocusableElements();
      return;
    }
    
    console.log(`KeyboardNav: Navegando hacia adelante desde índice ${this.currentIndex}`);
    
    // Asegurar que el índice sea válido
    if (this.currentIndex < 0) {
      this.currentIndex = 0;
      console.log('KeyboardNav: Índice reseteado a 0');
    } else if (this.currentIndex < this.focusableElements.length) {
      const currentElement = this.focusableElements[this.currentIndex];
      if (currentElement) {
        console.log(`KeyboardNav: Elemento actual: ${this.getElementType(currentElement)} (índice ${this.currentIndex})`);
      }
    }
    
    const startIndex = this.currentIndex;
    let attempts = 0;
    const maxAttempts = this.focusableElements.length;
    
    // Intentar encontrar el siguiente elemento válido
    while (attempts < maxAttempts) {
      this.currentIndex = (this.currentIndex + 1) % this.focusableElements.length;
      const element = this.focusableElements[this.currentIndex];
      
      console.log(`KeyboardNav: Intentando índice ${this.currentIndex} (intento ${attempts + 1}/${maxAttempts}) - Tipo: ${this.getElementType(element)}`);
      
      // Verificar que el elemento existe y está en el DOM
      if (!element || !document.contains(element)) {
        console.warn(`KeyboardNav: Elemento ${this.currentIndex} no válido (tipo: ${this.getElementType(element)}), saltando`);
        attempts++;
        continue;
      }
      
      // Verificar visibilidad
      try {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          console.log(`KeyboardNav: Elemento ${this.currentIndex} está oculto (tipo: ${this.getElementType(element)}), saltando`);
          attempts++;
          continue;
        }
      } catch (e) {
        console.warn(`KeyboardNav: Error al verificar estilo de elemento ${this.currentIndex} (tipo: ${this.getElementType(element)}):`, e);
        attempts++;
        continue;
      }
      
      // Intentar enfocar el elemento
      try {
        const elementType = this.getElementType(element);
        console.log(`KeyboardNav: Enfocando ${elementType} en índice ${this.currentIndex}`, element);
        
        // Intentar múltiples métodos de enfoque
        let focused = false;
        
        // Método 1: focus() normal
        try {
          element.focus();
          // Verificar inmediatamente y también después de un frame
          if (document.activeElement === element) {
            focused = true;
          } else {
            console.warn(`KeyboardNav: focus() llamado pero activeElement es:`, document.activeElement);
            // Verificar después de un frame por si el navegador necesita tiempo
            requestAnimationFrame(() => {
              if (document.activeElement === element) {
                focused = true;
              }
            });
          }
        } catch (e) {
          console.warn(`KeyboardNav: focus() falló:`, e);
        }
        
        // Método 2: Si no funcionó, intentar con tabindex temporal
        if (!focused) {
          try {
            const originalTabIndex = element.getAttribute('tabindex');
            element.setAttribute('tabindex', '0');
            element.focus();
            if (document.activeElement === element) {
              focused = true;
            } else {
              // Restaurar tabindex original si no funcionó
              if (originalTabIndex !== null) {
                element.setAttribute('tabindex', originalTabIndex);
              } else {
                element.removeAttribute('tabindex');
              }
              console.warn(`KeyboardNav: enfoque con tabindex falló, activeElement es:`, document.activeElement);
            }
          } catch (e) {
            console.warn(`KeyboardNav: enfoque con tabindex falló:`, e);
          }
        }
        
        // Si el enfoque fue exitoso, salir
        if (focused && document.activeElement === element) {
          console.log(`KeyboardNav: ✓✓✓ ${elementType} (índice ${this.currentIndex}) enfocado exitosamente ✓✓✓`);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.showTooltip(element);
          this.updateFocusInfo(); // Actualizar info después de enfocar
          return; // ¡Éxito! Salir de la función
        } else {
          // Log detallado de por qué no se pudo enfocar
          const activeElement = document.activeElement;
          const reason = activeElement === element ? 'elemento ya está enfocado' : 
                         activeElement === document.body ? 'foco devuelto al body' :
                         activeElement !== null ? `foco capturado por otro elemento (${this.getElementType(activeElement)})` :
                         'focus() no tuvo efecto';
          console.warn(`KeyboardNav: ✗ ${elementType} (índice ${this.currentIndex}) no se pudo enfocar. Razón: ${reason}`);
          
          // Verificar atributos que pueden impedir el enfoque
          const tabIndex = element.getAttribute('tabindex');
          const disabled = element.hasAttribute('disabled');
          const ariaHidden = element.getAttribute('aria-hidden');
          if (tabIndex === '-1') {
            console.warn(`KeyboardNav: Elemento tiene tabindex="-1"`);
          }
          if (disabled) {
            console.warn(`KeyboardNav: Elemento está deshabilitado`);
          }
          if (ariaHidden === 'true') {
            console.warn(`KeyboardNav: Elemento tiene aria-hidden="true"`);
          }
        }
      } catch (e) {
        const elementType = this.getElementType(element);
        console.error(`KeyboardNav: Error al enfocar ${elementType} (índice ${this.currentIndex}):`, e);
      }
      
      attempts++;
    }
    
    // Si llegamos aquí, no se pudo enfocar ningún elemento
    console.error(`KeyboardNav: ✗ No se encontró ningún elemento válido después de ${maxAttempts} intentos`);
    console.log(`KeyboardNav: Recargando lista de elementos focusables...`);
    this.updateFocusableElements();
    
    // Si la lista cambió, intentar de nuevo con el siguiente índice
    if (this.focusableElements.length > 0 && this.currentIndex !== startIndex) {
      console.log(`KeyboardNav: Reintentando con lista actualizada...`);
      this.focusNext();
    }
  }

  focusPrevious() {
    if (this.focusableElements.length === 0) {
      console.warn('KeyboardNav: No hay elementos focusables disponibles');
      this.updateFocusableElements();
      return;
    }
    
    console.log(`KeyboardNav: Navegando hacia atrás desde índice ${this.currentIndex}`);
    
    // Asegurar que el índice sea válido
    if (this.currentIndex < 0) {
      this.currentIndex = this.focusableElements.length - 1;
      console.log(`KeyboardNav: Índice reseteado a ${this.currentIndex}`);
    } else if (this.currentIndex < this.focusableElements.length) {
      const currentElement = this.focusableElements[this.currentIndex];
      if (currentElement) {
        console.log(`KeyboardNav: Elemento actual: ${this.getElementType(currentElement)} (índice ${this.currentIndex})`);
      }
    }
    
    const startIndex = this.currentIndex;
    let attempts = 0;
    const maxAttempts = this.focusableElements.length;
    
    // Intentar encontrar el elemento anterior válido
    while (attempts < maxAttempts) {
      this.currentIndex = this.currentIndex <= 0 
        ? this.focusableElements.length - 1 
        : this.currentIndex - 1;
      const element = this.focusableElements[this.currentIndex];
      
      console.log(`KeyboardNav: Intentando índice ${this.currentIndex} (intento ${attempts + 1}/${maxAttempts}) - Tipo: ${this.getElementType(element)}`);
      
      // Verificar que el elemento existe y está en el DOM
      if (!element || !document.contains(element)) {
        console.warn(`KeyboardNav: Elemento ${this.currentIndex} no válido (tipo: ${this.getElementType(element)}), saltando`);
        attempts++;
        continue;
      }
      
      // Verificar visibilidad
      try {
        const style = window.getComputedStyle(element);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          console.log(`KeyboardNav: Elemento ${this.currentIndex} está oculto (tipo: ${this.getElementType(element)}), saltando`);
          attempts++;
          continue;
        }
      } catch (e) {
        console.warn(`KeyboardNav: Error al verificar estilo de elemento ${this.currentIndex} (tipo: ${this.getElementType(element)}):`, e);
        attempts++;
        continue;
      }
      
      // Intentar enfocar el elemento
      try {
        const elementType = this.getElementType(element);
        console.log(`KeyboardNav: Enfocando ${elementType} en índice ${this.currentIndex}`, element);
        
        // Intentar múltiples métodos de enfoque
        let focused = false;
        
        // Método 1: focus() normal
        try {
          element.focus();
          // Verificar inmediatamente y también después de un frame
          if (document.activeElement === element) {
            focused = true;
          } else {
            console.warn(`KeyboardNav: focus() llamado pero activeElement es:`, document.activeElement);
            // Verificar después de un frame por si el navegador necesita tiempo
            requestAnimationFrame(() => {
              if (document.activeElement === element) {
                focused = true;
              }
            });
          }
        } catch (e) {
          console.warn(`KeyboardNav: focus() falló:`, e);
        }
        
        // Método 2: Si no funcionó, intentar con tabindex temporal
        if (!focused) {
          try {
            const originalTabIndex = element.getAttribute('tabindex');
            element.setAttribute('tabindex', '0');
            element.focus();
            if (document.activeElement === element) {
              focused = true;
            } else {
              // Restaurar tabindex original si no funcionó
              if (originalTabIndex !== null) {
                element.setAttribute('tabindex', originalTabIndex);
              } else {
                element.removeAttribute('tabindex');
              }
              console.warn(`KeyboardNav: enfoque con tabindex falló, activeElement es:`, document.activeElement);
            }
          } catch (e) {
            console.warn(`KeyboardNav: enfoque con tabindex falló:`, e);
          }
        }
        
        // Si el enfoque fue exitoso, salir
        if (focused && document.activeElement === element) {
          console.log(`KeyboardNav: ✓✓✓ ${elementType} (índice ${this.currentIndex}) enfocado exitosamente ✓✓✓`);
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          this.showTooltip(element);
          this.updateFocusInfo(); // Actualizar info después de enfocar
          return; // ¡Éxito! Salir de la función
        } else {
          // Log detallado de por qué no se pudo enfocar
          const activeElement = document.activeElement;
          const reason = activeElement === element ? 'elemento ya está enfocado' : 
                         activeElement === document.body ? 'foco devuelto al body' :
                         activeElement !== null ? `foco capturado por otro elemento (${this.getElementType(activeElement)})` :
                         'focus() no tuvo efecto';
          console.warn(`KeyboardNav: ✗ ${elementType} (índice ${this.currentIndex}) no se pudo enfocar. Razón: ${reason}`);
          
          // Verificar atributos que pueden impedir el enfoque
          const tabIndex = element.getAttribute('tabindex');
          const disabled = element.hasAttribute('disabled');
          const ariaHidden = element.getAttribute('aria-hidden');
          if (tabIndex === '-1') {
            console.warn(`KeyboardNav: Elemento tiene tabindex="-1"`);
          }
          if (disabled) {
            console.warn(`KeyboardNav: Elemento está deshabilitado`);
          }
          if (ariaHidden === 'true') {
            console.warn(`KeyboardNav: Elemento tiene aria-hidden="true"`);
          }
        }
      } catch (e) {
        const elementType = this.getElementType(element);
        console.error(`KeyboardNav: Error al enfocar ${elementType} (índice ${this.currentIndex}):`, e);
      }
      
      attempts++;
    }
    
    // Si llegamos aquí, no se pudo enfocar ningún elemento
    console.error(`KeyboardNav: ✗ No se encontró ningún elemento válido después de ${maxAttempts} intentos`);
    console.log(`KeyboardNav: Recargando lista de elementos focusables...`);
    this.updateFocusableElements();
    
    // Si la lista cambió, intentar de nuevo con el índice anterior
    if (this.focusableElements.length > 0 && this.currentIndex !== startIndex) {
      console.log(`KeyboardNav: Reintentando con lista actualizada...`);
      this.focusPrevious();
    }
  }

  removeHighlights() {
    // Los highlights se manejan en visual-nav
  }

  showTooltip(element) {
    // Limpiar tooltip anterior si existe
    this.removeTooltip();

    const elementType = this.getElementType(element);
    if (!elementType) return;

    // Crear tooltip
    this.tooltip = document.createElement('div');
    this.tooltip.className = 'a11y-keyboard-tooltip';
    this.tooltip.textContent = elementType;
    this.tooltip.style.cssText = `
      position: fixed;
      background: #333;
      color: #fff;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 1000001;
      pointer-events: none;
      white-space: nowrap;
      max-width: 300px;
      overflow: hidden;
      text-overflow: ellipsis;
      visibility: hidden;
      left: -9999px;
      top: -9999px;
    `;

    document.body.appendChild(this.tooltip);
    
    // Calcular posición - colocar al lado del elemento, no encima
    const rect = element.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;
    const spacing = 10; // Espacio entre el elemento y el tooltip
    
    // Calcular posición horizontal
    let left = rect.right + spacing; // Intentar a la derecha primero
    let top = rect.top + (rect.height / 2) - (tooltipHeight / 2); // Centrar verticalmente
    
    // Si no hay espacio a la derecha, colocar a la izquierda
    if (left + tooltipWidth > window.innerWidth) {
      left = rect.left - tooltipWidth - spacing;
    }
    
    // Si tampoco cabe a la izquierda, posicionar arriba o abajo
    if (left < 0) {
      left = rect.left + (rect.width / 2) - (tooltipWidth / 2); // Centrar horizontalmente
      // Intentar arriba primero
      if (rect.top - tooltipHeight - spacing > 0) {
        top = rect.top - tooltipHeight - spacing;
      } else {
        // Si no cabe arriba, poner abajo
        top = rect.bottom + spacing;
      }
    }
    
    // Asegurar que el tooltip no se salga de la pantalla
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));
    top = Math.max(10, Math.min(top, window.innerHeight - tooltipHeight - 10));
    
    this.tooltip.style.left = left + 'px';
    this.tooltip.style.top = top + 'px';
    this.tooltip.style.bottom = 'auto'; // Remover bottom para usar top
    this.tooltip.style.visibility = 'visible'; // Hacer visible ahora que está posicionado

    // Auto-ocultar después de 2 segundos
    this.tooltipTimer = setTimeout(() => {
      this.removeTooltip();
    }, 2000);
  }

  removeTooltip() {
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
      this.tooltip = null;
    }
    if (this.tooltipTimer) {
      clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
  }

  // Extrae el nombre accesible de un elemento (similar a text-reader.js)
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
    }

    // 6) fallback a texto visible del elemento (limitar longitud)
    if (visibleText && visibleText.length <= 50) return visibleText;
    if (visibleText && visibleText.length > 50) return visibleText.substring(0, 50) + '...';

    // 7) fallback a alt de imagen descendiente
    const imgChild = element.querySelector?.('img[alt]');
    if (imgChild?.getAttribute('alt')) return imgChild.getAttribute('alt').trim();

    return '';
  }

  getFocusInfo() {
    const element = this.currentIndex >= 0 ? this.focusableElements[this.currentIndex] : null;
    const accessibleName = element ? this.getAccessibleName(element) : '';
    const elementType = element ? this.getElementType(element) : '';
    
    // Calcular el orden real de tabulación (1-indexed para mostrar al usuario)
    const tabOrder = this.currentIndex >= 0 ? this.currentIndex + 1 : null;
    
    return {
      total: this.focusableElements.length,
      current: tabOrder !== null ? tabOrder : '-',
      element: this.currentIndex >= 0 
        ? this.getElementDescription(element)
        : '-',
      // Nueva información para el historial
      accessibleName: accessibleName || elementType || 'elemento',
      elementType: elementType,
      tabOrder: tabOrder // Orden de tabulación correcto
    };
  }

  getElementType(element) {
    if (!element) return 'elemento desconocido';
    
    const tag = element.tagName?.toLowerCase() || '';
    const type = element.type?.toLowerCase() || '';
    const role = element.getAttribute('role') || '';
    
    // Priorizar role sobre tag
    if (role) {
      return this.getRoleDescription(role);
    }
    
    // Para inputs, usar el tipo específico
    if (tag === 'input') {
      return this.getInputTypeDescription(type);
    }
    
    // Para imágenes con alt o role="img"
    if ((tag === 'img' || tag === 'svg') || role === 'img') {
      return 'imagen';
    }
    
    // Para otros elementos, usar el tag
    return this.getTagDescription(tag) || tag || 'elemento';
  }

  getElementDescription(element) {
    // Prioridad: aria-label > text > alt > type + tag > aria-labelledby > id
    const ariaLabel = element.getAttribute('aria-label')?.trim();
    if (ariaLabel) return ariaLabel;

    const text = element.textContent?.trim();
    if (text && text.length > 0 && text.length < 50) return text;

    const alt = element.getAttribute('alt')?.trim();
    if (alt) return alt;

    // Para inputs, incluir el tipo
    const tag = element.tagName.toLowerCase();
    const type = element.type?.toLowerCase() || '';
    const role = element.getAttribute('role') || '';
    
    let typeDescription = '';
    if (tag === 'input') {
      typeDescription = this.getInputTypeDescription(type);
    } else if (role) {
      typeDescription = this.getRoleDescription(role);
    } else if (tag) {
      typeDescription = this.getTagDescription(tag);
    }

    const ariaLabelledBy = element.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelElement = document.getElementById(ariaLabelledBy);
      const labelText = labelElement?.textContent?.trim();
      if (labelText) return `${typeDescription}${typeDescription ? ': ' : ''}${labelText}`;
    }

    const id = element.id?.trim();
    const name = element.name?.trim();

    if (id || name) {
      return `${typeDescription}${typeDescription ? ': ' : ''}${id || name}`;
    }

    return typeDescription || tag || 'elemento';
  }

  getInputTypeDescription(type) {
    const types = {
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
    return types[type] || 'campo de entrada';
  }

  getRoleDescription(role) {
    const roles = {
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
    return roles[role] || role;
  }

  getTagDescription(tag) {
    const tags = {
      'a': 'enlace',
      'button': 'botón',
      'input': 'campo de entrada',
      'select': 'lista desplegable',
      'textarea': 'área de texto',
      'img': 'imagen',
      'svg': 'imagen',
      'h1': 'título',
      'h2': 'título',
      'h3': 'título',
      'h4': 'título',
      'h5': 'título',
      'h6': 'título',
      'label': 'etiqueta',
      'summary': 'resumen',
      'details': 'detalles'
    };
    return tags[tag] || tag || 'elemento';
  }

  updateFocusInfo() {
    const info = this.getFocusInfo();
    // Envío seguro: validar contexto y que el documento siga activo
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({
        action: 'updateFocus',
        data: info
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }

  notifyDeactivation() {
    // Notificar que la navegación por teclado se ha desactivado
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({
        action: 'keyboardNavDeactivated'
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }
}
