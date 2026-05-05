/**
 * Utilidades compartidas de DOM para A11yGo
 * Extraído de keyboard-nav.js y visual-nav.js para evitar duplicación
 */

/**
 * Compara el orden de dos elementos en el DOM usando compareDocumentPosition
 */
export function compareDOMOrder(a, b) {
  if (a === b) return 0;

  const position = a.compareDocumentPosition(b);

  if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
    return -1;
  }

  if (position & Node.DOCUMENT_POSITION_PRECEDING) {
    return 1;
  }

  // Fallback: comparar por posición visual (top, luego left)
  const rectA = a.getBoundingClientRect();
  const rectB = b.getBoundingClientRect();

  const topDiff = rectA.top - rectB.top;
  if (Math.abs(topDiff) > 5) {
    return topDiff;
  }

  return rectA.left - rectB.left;
}

/**
 * Calcula el orden real de tabulación según WCAG:
 * 1. Elementos con tabindex positivo (1, 2, 3...) van primero, ordenados ascendente
 * 2. Elementos con tabindex="0" o sin tabindex van después, en orden DOM
 * 3. Elementos con tabindex="-1" se excluyen del orden de tabulación
 */
export function calculateTabOrder(elements) {
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

  const positiveTabIndex = elementsWithTabIndex.filter(e => e.tabIndex !== null && e.tabIndex > 0);
  const zeroOrNullTabIndex = elementsWithTabIndex.filter(e => e.tabIndex === null || e.tabIndex === 0);

  positiveTabIndex.sort((a, b) => {
    if (a.tabIndex !== b.tabIndex) {
      return a.tabIndex - b.tabIndex;
    }
    return compareDOMOrder(a.element, b.element);
  });

  zeroOrNullTabIndex.sort((a, b) => compareDOMOrder(a.element, b.element));

  const ordered = [...positiveTabIndex, ...zeroOrNullTabIndex];

  return ordered.map(e => e.element);
}

/**
 * Obtiene el nombre accesible de un elemento siguiendo la jerarquía WCAG
 */
export function getAccessibleName(element) {
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

  // 4) title attribute
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

  // 7) fallback a alt de imagen descendiente
  const imgChild = element.querySelector?.('img[alt]');
  if (imgChild?.getAttribute('alt')) return imgChild.getAttribute('alt').trim();

  return '';
}
