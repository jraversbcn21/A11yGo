// Motor de validación de accesibilidad

export class A11yChecker {
  constructor() {
    this.results = [];
    this.isActive = false;
  }

  activate() {
    if (this.isActive) return;
    this.isActive = true;
    this.setupEscapeHandler();
    console.log('A11yChecker: Activado');
  }

  deactivate() {
    if (!this.isActive) return;
    this.isActive = false;
    this.removeEscapeHandler();
    console.log('A11yChecker: Desactivado');
  }

  setupEscapeHandler() {
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        console.log('A11yChecker: ✓✓✓ Escape presionada - Desactivando validación ✓✓✓');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        this.deactivate();
        // Notificar al content script que se desactivó
        this.notifyDeactivation();
      }
    };
    
    document.addEventListener('keydown', this.escapeHandler, true);
    console.log('A11yChecker: Handler de Escape configurado');
  }

  removeEscapeHandler() {
    if (this.escapeHandler) {
      document.removeEventListener('keydown', this.escapeHandler, true);
      this.escapeHandler = null;
      console.log('A11yChecker: Handler de Escape removido');
    }
  }

  notifyDeactivation() {
    if (!document || !document.body) return;
    if (!window.chrome || !chrome.runtime || !chrome.runtime.id) return;
    try {
      chrome.runtime.sendMessage({
        action: 'a11yCheckDeactivated'
      }, () => {
        void chrome.runtime?.lastError;
      });
    } catch (_) {}
  }

  async check() {
    this.results = [];
    
    console.log('A11yChecker: Iniciando validación...');
    
    try {
      // Ejecutar todas las validaciones de forma síncrona
      this.checkImages();
      console.log('A11yChecker: ✓ Imágenes validadas');
      
      this.checkContrast();
      console.log('A11yChecker: ✓ Contraste validado');
      
      this.checkFormLabels();
      console.log('A11yChecker: ✓ Formularios validados');
      
      this.checkHeadings();
      console.log('A11yChecker: ✓ Encabezados validados');
      
      this.checkLandmarks();
      console.log('A11yChecker: ✓ Landmarks validados');
      
      this.checkLinks();
      console.log('A11yChecker: ✓ Enlaces validados');
      
      this.checkARIA();
      console.log('A11yChecker: ✓ ARIA validado');
      
      this.checkKeyboardAccess();
      console.log('A11yChecker: ✓ Accesibilidad de teclado validada');
      
      this.checkTabOrder();
      console.log('A11yChecker: ✓ Orden de tabulación validado');

      console.log(`A11yChecker: Validación completada. Total de problemas: ${this.results.length}`);
      console.log('A11yChecker: Desglose - Errores:', this.results.filter(r => r.severity === 'error').length, 
                  'Advertencias:', this.results.filter(r => r.severity === 'warning').length,
                  'Info:', this.results.filter(r => r.severity === 'info').length);
      
      return this.results;
    } catch (error) {
      console.error('A11yChecker: Error durante validación:', error);
      return this.results; // Devolver lo que se haya recopilado hasta ahora
    }
  }

  checkImages() {
    try {
      const images = document.querySelectorAll('img');
      console.log(`A11yChecker: Verificando ${images.length} imágenes`);
      
      images.forEach(img => {
        try {
          const alt = img.getAttribute('alt');
          const ariaLabel = img.getAttribute('aria-label');
          const role = img.getAttribute('role');
          
          if (alt === null && !ariaLabel && role !== 'presentation' && role !== 'none') {
            this.addResult('error', 'noAltText', 'Imagen sin texto alternativo', img);
          } else if (alt === '' && img.getAttribute('src')) {
            this.addResult('warning', 'emptyAltText', 'Imagen con alt vacío (debe tener descripción o role="presentation")', img);
          }
        } catch (e) {
          // Silenciar errores de imágenes individuales
        }
      });
    } catch (error) {
      console.error('A11yChecker: Error en checkImages:', error);
    }
  }

  checkContrast() {
    const textElements = this.getTextElements();
    
    console.log(`A11yChecker: Verificando contraste en ${textElements.length} elementos`);
    
    // Limitar el número de elementos a verificar para evitar que se cuelgue
    const maxElements = 100;
    const elementsToCheck = textElements.slice(0, maxElements);
    
    if (textElements.length > maxElements) {
      console.warn(`A11yChecker: Limitando verificación de contraste a ${maxElements} elementos de ${textElements.length}`);
    }
    
    elementsToCheck.forEach((element, index) => {
      try {
        const style = window.getComputedStyle(element);
        const bgColor = this.getBackgroundColor(element);
        const textColor = style.color;
        
        const contrast = this.calculateContrast(textColor, bgColor);
        
        if (contrast < 4.5) {
          const fontSize = parseFloat(style.fontSize);
          const fontWeight = parseInt(style.fontWeight) || 400;
          const isLarge = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);
          
          const minContrast = isLarge ? 3.0 : 4.5;
          
          if (contrast < minContrast) {
            this.addResult('error', 'lowContrast',
              `Contraste bajo: ${contrast.toFixed(2)}:1 (mínimo requerido: ${minContrast}:1)`,
              element);
          } else if (contrast < 4.5 && isLarge) {
            this.addResult('warning', 'lowContrast',
              `Contraste bajo para texto grande: ${contrast.toFixed(2)}:1 (recomendado: 4.5:1)`,
              element);
          }
        }
      } catch (error) {
        console.warn(`A11yChecker: Error al verificar contraste del elemento ${index}:`, error);
      }
    });
    
    console.log(`A11yChecker: Contraste verificado en ${elementsToCheck.length} elementos`);
  }

  checkFormLabels() {
    try {
      const inputs = document.querySelectorAll('input, select, textarea');
      console.log(`A11yChecker: Verificando ${inputs.length} campos de formulario`);
      
      inputs.forEach(input => {
        try {
          if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') {
            return;
          }

          const id = input.id;
          const ariaLabel = input.getAttribute('aria-label');
          const ariaLabelledBy = input.getAttribute('aria-labelledby');
          const placeholder = input.getAttribute('placeholder');
          const title = input.getAttribute('title');
          
          let hasLabel = false;
          
          if (ariaLabel || ariaLabelledBy) {
            hasLabel = true;
          } else if (id) {
            try {
              const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
              if (label) {
                hasLabel = true;
              }
            } catch (e) {
              // Error al escapar ID, ignorar
            }
          }
          
          if (!hasLabel) {
            const parentLabel = input.closest('label');
            if (parentLabel) {
              hasLabel = true;
            }
          }
          
          if (!hasLabel && !placeholder && !title) {
            this.addResult('error', 'missingLabel', 'Campo de formulario sin etiqueta asociada', input);
          } else if (!hasLabel && placeholder) {
            this.addResult('warning', 'placeholderAsLabel', 'Usar placeholder como etiqueta puede causar problemas de accesibilidad', input);
          }
        } catch (e) {
          // Silenciar errores de inputs individuales
        }
      });
    } catch (error) {
      console.error('A11yChecker: Error en checkFormLabels:', error);
    }
  }

  checkHeadings() {
    try {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
        .filter(h => {
          try {
            const style = window.getComputedStyle(h);
            return style.display !== 'none' && style.visibility !== 'hidden';
          } catch (e) {
            return false;
          }
        });

      console.log(`A11yChecker: Verificando ${headings.length} encabezados`);

      if (headings.length === 0) {
        this.addResult('warning', 'noHeadings', 'Página sin encabezados estructurados');
        return;
      }

      let previousLevel = 0;
      headings.forEach((heading, index) => {
        try {
          const level = parseInt(heading.tagName.substring(1));

          if (index === 0) {
            if (level !== 1) {
              this.addResult('warning', 'noH1', 'Primer encabezado no es h1', heading);
            }
            // No verificar orden para el primer encabezado (no hay encabezado previo real)
            previousLevel = level;
            return;
          }

          if (level > previousLevel + 1) {
            this.addResult('error', 'invalidHeadingOrder',
              `Orden de encabezados inválido: h${previousLevel} -> h${level}`, heading);
          }

          previousLevel = level;
        } catch (e) {
          // Silenciar errores de encabezados individuales
        }
      });
    } catch (error) {
      console.error('A11yChecker: Error en checkHeadings:', error);
    }
  }

  checkLandmarks() {
    try {
      const landmarks = [
        'main',
        'nav',
        'header',
        'footer',
        'aside',
        'article',
        'section',
        '[role="main"]',
        '[role="navigation"]',
        '[role="banner"]',
        '[role="contentinfo"]',
        '[role="complementary"]',
        '[role="article"]'
      ];

      const foundLandmarks = landmarks.some(selector => {
        try {
          return document.querySelector(selector);
        } catch (e) {
          return false;
        }
      });

      if (!foundLandmarks) {
        this.addResult('info', 'missingLandmark', 'Considera agregar landmarks ARIA para mejorar la navegación');
      }

      // Verificar múltiples mains
      const mains = document.querySelectorAll('main, [role="main"]');
      if (mains.length > 1) {
        this.addResult('error', 'multipleMains', 'Múltiples elementos main encontrados', mains[1]);
      }
      
      console.log(`A11yChecker: Landmarks verificados (encontrados: ${foundLandmarks})`);
    } catch (error) {
      console.error('A11yChecker: Error en checkLandmarks:', error);
    }
  }

  checkLinks() {
    try {
      const links = document.querySelectorAll('a[href]');
      console.log(`A11yChecker: Verificando ${links.length} enlaces`);
      
      links.forEach(link => {
        try {
          const text = link.textContent?.trim() || '';
          const ariaLabel = link.getAttribute('aria-label');
          const ariaLabelledBy = link.getAttribute('aria-labelledby');
          const img = link.querySelector('img');
          
          if (!text && !ariaLabel && !ariaLabelledBy && !img) {
            this.addResult('error', 'emptyLink', 'Enlace sin texto descriptivo', link);
          } else if (text.length > 0 && text.length < 3 && !ariaLabel && !img) {
            this.addResult('warning', 'shortLinkText', 'Texto de enlace muy corto, puede ser difícil de entender', link);
          } else if (text.match(/^(click|here|read more|more|link|aquí|leer más|más)$/i)) {
            this.addResult('warning', 'genericLinkText', 'Texto de enlace genérico, proporciona contexto', link);
          }
        } catch (e) {
          // Silenciar errores de enlaces individuales
        }
      });
    } catch (error) {
      console.error('A11yChecker: Error en checkLinks:', error);
    }
  }

  checkARIA() {
    try {
      console.log('A11yChecker: Iniciando checkARIA...');
      
      // Verificar elementos con role pero sin label
      const elementsWithRole = document.querySelectorAll('[role]');
      console.log(`A11yChecker: Verificando ${elementsWithRole.length} elementos con role`);
      
      let roleCount = 0;
      elementsWithRole.forEach(element => {
        try {
          const role = element.getAttribute('role');
          const ariaLabel = element.getAttribute('aria-label');
          const ariaLabelledBy = element.getAttribute('aria-labelledby');
          const text = element.textContent?.trim() || '';
          
          const interactiveRoles = ['button', 'link', 'menuitem', 'tab', 'option'];
          
          if (interactiveRoles.includes(role) && !ariaLabel && !ariaLabelledBy && !text) {
            this.addResult('error', 'missingAriaLabel', 
              `Elemento con role="${role}" sin etiqueta`, element);
          }
          roleCount++;
        } catch (e) {
          // Silenciar errores de elementos individuales
        }
      });
      
      console.log(`A11yChecker: Procesados ${roleCount} elementos con role`);

      // Verificar ARIA inválidos - Limitar para evitar bloqueos
      console.log('A11yChecker: Verificando atributos ARIA inválidos...');
      
      const elementsWithAria = document.querySelectorAll(
        '[aria-hidden], [aria-expanded], [aria-selected], [aria-checked], [aria-readonly], [aria-required], [aria-label], [aria-labelledby]'
      );
      
      console.log(`A11yChecker: Verificando ${elementsWithAria.length} elementos con atributos ARIA`);
      
      let ariaCount = 0;
      elementsWithAria.forEach(element => {
        try {
          const attributes = Array.from(element.attributes || [])
            .filter(attr => attr.name.startsWith('aria-'));
          
          attributes.forEach(attr => {
            try {
              const value = attr.value;
              
              // Verificar valores booleanos
              if (attr.name.match(/^(aria-hidden|aria-expanded|aria-selected|aria-checked|aria-readonly|aria-required)$/)) {
                if (value !== 'true' && value !== 'false') {
                  this.addResult('error', 'invalidAria', 
                    `Atributo ${attr.name} debe ser "true" o "false"`, element);
                }
              }
              ariaCount++;
            } catch (e) {
              // Silenciar errores de atributos individuales
            }
          });
        } catch (e) {
          // Silenciar errores de elementos individuales
        }
      });
      
      console.log(`A11yChecker: Procesados ${ariaCount} atributos ARIA`);
    } catch (error) {
      console.error('A11yChecker: Error en checkARIA:', error);
    }
  }

  checkKeyboardAccess() {
    try {
      const interactiveElements = document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex], [role="button"], [role="link"], [role="menuitem"], [role="tab"]'
      );
      
      interactiveElements.forEach(element => {
        try {
          const tabindex = element.getAttribute('tabindex');
          const style = window.getComputedStyle(element);
          const disabled = element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
          
          if (tabindex === '-1' && !disabled && style.display !== 'none') {
            const role = element.getAttribute('role');
            if (role === 'button' || role === 'link') {
              this.addResult('error', 'notFocusable', 
                `Elemento interactivo no accesible por teclado`, element);
            }
          }
        } catch (e) {
          // Silenciar errores de elementos individuales
        }
      });
    } catch (error) {
      console.error('A11yChecker: Error en checkKeyboardAccess:', error);
    }
  }

  checkTabOrder() {
    try {
      console.log('A11yChecker: Iniciando validación de orden de tabulación...');
      
      // Obtener todos los elementos focusables
      const selectors = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]',
        '[contenteditable="true"]'
      ].join(', ');
      
      const allElements = Array.from(document.querySelectorAll(selectors));
      const focusableElements = allElements.filter(el => {
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex === '-1') return false;
        
        const style = window.getComputedStyle(el);
        return style.display !== 'none' && 
               style.visibility !== 'hidden' && 
               style.opacity !== '0' &&
               !el.hasAttribute('disabled') &&
               el.getAttribute('aria-hidden') !== 'true';
      });
      
      // Analizar tabindex
      const positiveTabIndex = [];
      const tabIndexMap = new Map();
      
      focusableElements.forEach(element => {
        const tabIndexAttr = element.getAttribute('tabindex');
        if (tabIndexAttr !== null) {
          const parsed = parseInt(tabIndexAttr, 10);
          if (!isNaN(parsed) && parsed > 0) {
            positiveTabIndex.push(parsed);
            if (!tabIndexMap.has(parsed)) {
              tabIndexMap.set(parsed, []);
            }
            tabIndexMap.get(parsed).push(element);
          }
        }
      });
      
      // Verificar elementos con tabindex positivo duplicado
      tabIndexMap.forEach((elements, tabIndex) => {
        if (elements.length > 1) {
          elements.forEach(element => {
            this.addResult('warning', 'duplicateTabIndex', 
              `Múltiples elementos con tabindex="${tabIndex}" pueden causar orden impredecible`, element);
          });
        }
      });
      
      // Verificar saltos en el orden de tabindex positivo
      if (positiveTabIndex.length > 0) {
        const sorted = [...new Set(positiveTabIndex)].sort((a, b) => a - b);
        const maxTabIndex = Math.max(...sorted);
        
        // Detectar saltos grandes (puede indicar problemas)
        for (let i = 0; i < sorted.length - 1; i++) {
          const gap = sorted[i + 1] - sorted[i];
          if (gap > 10) {
            const elements = tabIndexMap.get(sorted[i + 1]);
            if (elements && elements.length > 0) {
              this.addResult('info', 'tabIndexGap', 
                `Salto grande en tabindex: ${sorted[i]} → ${sorted[i + 1]}. Considera usar valores consecutivos`, 
                elements[0]);
            }
          }
        }
        
        // Advertencia sobre uso excesivo de tabindex positivo
        if (positiveTabIndex.length > 10) {
          this.addResult('warning', 'excessiveTabIndex', 
            `Uso excesivo de tabindex positivo (${positiveTabIndex.length} elementos). Considera reestructurar el DOM en su lugar`);
        }
      }
      
      // Verificar si hay elementos con tabindex positivo mezclados con naturales
      // Esto se detecta verificando si hay elementos naturales antes de elementos con tabindex positivo
      if (positiveTabIndex.length > 0) {
        const firstPositiveTabIndex = Math.min(...positiveTabIndex);
        const elementsWithPositiveTabIndex = focusableElements.filter(el => {
          const tabIndexAttr = el.getAttribute('tabindex');
          if (tabIndexAttr === null) return false;
          const parsed = parseInt(tabIndexAttr, 10);
          return !isNaN(parsed) && parsed > 0 && parsed === firstPositiveTabIndex;
        });
        
        if (elementsWithPositiveTabIndex.length > 0) {
          const firstPositiveElement = elementsWithPositiveTabIndex[0];
          const domPosition = this.getDOMPosition(firstPositiveElement);
          
          // Verificar si hay elementos naturales antes de este
          const naturalElementsBefore = focusableElements.filter(el => {
            const tabIndexAttr = el.getAttribute('tabindex');
            const parsed = tabIndexAttr === null ? null : parseInt(tabIndexAttr, 10);
            const isNatural = tabIndexAttr === null || parsed === 0 || parsed === null;
            if (!isNatural) return false;
            
            const elDomPosition = this.getDOMPosition(el);
            return elDomPosition < domPosition;
          });
          
          if (naturalElementsBefore.length > 0) {
            this.addResult('warning', 'mixedTabOrder', 
              `Elementos con tabindex positivo (${firstPositiveTabIndex}) aparecen después de elementos naturales en el DOM. Esto puede causar confusión en el orden de tabulación`, 
              firstPositiveElement);
          }
        }
      }
      
      console.log(`A11yChecker: Validación de orden de tabulación completada. Elementos focusables: ${focusableElements.length}, con tabindex positivo: ${positiveTabIndex.length}`);
    } catch (error) {
      console.error('A11yChecker: Error en checkTabOrder:', error);
    }
  }
  
  /**
   * Calcula la posición de un elemento en el DOM para orden natural
   */
  getDOMPosition(element) {
    let position = 0;
    let sibling = element;
    
    // Contar elementos anteriores en el árbol
    while (sibling) {
      sibling = sibling.previousElementSibling;
      position++;
    }
    
    // Agregar posición de ancestros
    let parent = element.parentElement;
    while (parent && parent !== document.body) {
      let parentSibling = parent;
      while (parentSibling) {
        parentSibling = parentSibling.previousElementSibling;
        position += 1000; // Multiplicador para mantener orden
      }
      parent = parent.parentElement;
    }
    
    return position;
  }

  getTextElements() {
    const textElements = [];
    const processed = new Set();
    
    // Usar selectores específicos en lugar de TreeWalker para mejor rendimiento
    const selectors = 'p, h1, h2, h3, h4, h5, h6, a, button, span, div, li, td, th, label, legend';
    
    try {
      const elements = document.querySelectorAll(selectors);
      
      elements.forEach(el => {
        if (processed.has(el)) return;
        
        const text = el.textContent?.trim();
        if (!text || text.length === 0) return;
        
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;
        } catch (e) {
          return;
        }
        
        const tag = el.tagName?.toLowerCase() || '';
        if (['script', 'style', 'noscript'].includes(tag)) return;
        
        textElements.push(el);
        processed.add(el);
      });
    } catch (error) {
      console.error('A11yChecker: Error al obtener elementos de texto:', error);
    }

    console.log(`A11yChecker: Encontrados ${textElements.length} elementos de texto`);
    return textElements;
  }

  getBackgroundColor(element) {
    let el = element;
    let bgColor = null;
    
    while (el && el !== document.body) {
      const style = window.getComputedStyle(el);
      const bg = style.backgroundColor;
      
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        bgColor = bg;
        break;
      }
      
      el = el.parentElement;
    }
    
    if (!bgColor) {
      bgColor = window.getComputedStyle(document.body).backgroundColor;
    }
    
    if (!bgColor || bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
      bgColor = 'rgb(255, 255, 255)'; // Default white
    }
    
    return bgColor;
  }

  rgbToLuminance(r, g, b) {
    const [rs, gs, bs] = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  }

  parseColor(color) {
    if (color.startsWith('rgb')) {
      const matches = color.match(/\d+/g);
      return matches ? matches.map(Number) : [255, 255, 255];
    } else if (color.startsWith('#')) {
      const hex = color.substring(1);
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return [r, g, b];
    }
    return [255, 255, 255];
  }

  calculateContrast(color1, color2) {
    const rgb1 = this.parseColor(color1);
    const rgb2 = this.parseColor(color2);
    
    const lum1 = this.rgbToLuminance(rgb1[0], rgb1[1], rgb1[2]);
    const lum2 = this.rgbToLuminance(rgb2[0], rgb2[1], rgb2[2]);
    
    const lighter = Math.max(lum1, lum2);
    const darker = Math.min(lum1, lum2);
    
    return (lighter + 0.05) / (darker + 0.05);
  }

  addResult(severity, code, description, element = null) {
    const result = {
      severity,
      code,
      title: this.getTitle(code),
      description,
      element: element ? this.getElementSelector(element) : null,
      selector: element ? this.getElementSelector(element) : null
    };
    
    this.results.push(result);
  }

  getTitle(code) {
    const titles = {
      noAltText: 'Imagen sin texto alternativo',
      emptyAltText: 'Alt vacío',
      lowContrast: 'Contraste bajo',
      missingLabel: 'Formulario sin etiqueta',
      placeholderAsLabel: 'Placeholder como etiqueta',
      noHeadings: 'Sin encabezados',
      noH1: 'Sin h1',
      invalidHeadingOrder: 'Orden de encabezados inválido',
      missingLandmark: 'Falta landmark',
      multipleMains: 'Múltiples elementos main',
      emptyLink: 'Enlace sin texto',
      shortLinkText: 'Texto de enlace corto',
      genericLinkText: 'Texto de enlace genérico',
      missingAriaLabel: 'Falta etiqueta ARIA',
      invalidAria: 'ARIA inválido',
      notFocusable: 'No accesible por teclado',
      duplicateTabIndex: 'Tabindex duplicado',
      tabIndexGap: 'Salto en tabindex',
      excessiveTabIndex: 'Uso excesivo de tabindex',
      mixedTabOrder: 'Orden de tabulación mezclado'
    };
    
    return titles[code] || code;
  }

  getElementSelector(element) {
    try {
      // Si tiene ID, es el selector más específico
      if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
        return `#${CSS.escape(element.id)}`;
      }

      // Construir path completo desde el elemento hasta un ancestro con ID o body
      const path = [];
      let el = element;

      while (el && el !== document.documentElement) {
        // Si encontramos un ancestro con ID, usarlo como ancla y parar
        if (el.id && /^[a-zA-Z][\w-]*$/.test(el.id)) {
          path.unshift(`#${CSS.escape(el.id)}`);
          break;
        }

        const tag = el.tagName.toLowerCase();
        const parent = el.parentElement;

        if (parent) {
          // Contar cuántos hermanos del mismo tag hay — usar nth-of-type para ser específico
          const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === el.tagName);
          if (sameTagSiblings.length > 1) {
            const idx = sameTagSiblings.indexOf(el) + 1;
            path.unshift(`${tag}:nth-of-type(${idx})`);
          } else {
            path.unshift(tag);
          }
        } else {
          path.unshift(tag);
        }

        el = el.parentElement;

        // Limitar profundidad para no generar selectores extremadamente largos
        if (path.length >= 6) break;
      }

      const selector = path.join(' > ');

      // Verificar que el selector realmente apunta al elemento correcto
      try {
        if (document.querySelector(selector) === element) {
          return selector;
        }
      } catch (_) {}

      // Fallback: usar posición absoluta en el documento
      const tag = element.tagName.toLowerCase();
      if (!element.parentElement) return tag;
      const allOfTag = Array.from(document.getElementsByTagName(element.tagName));
      const idx = allOfTag.indexOf(element) + 1;
      return `${tag}:nth-of-type(${idx})`;
    } catch (e) {
      return element.tagName?.toLowerCase() || '*';
    }
  }
}
