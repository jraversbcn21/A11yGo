/**
 * Utilidades compartidas de DOM para A11yGo
 * Extraído de keyboard-nav.js y visual-nav.js para evitar duplicación
 */

/**
 * Devuelve la cadena de hosts de un nodo hacia el documento:
 * [nodo, host1, host2, ...] donde cada host es el del shadow root anterior.
 */
function getHostChain(node) {
  const chain = [node];
  let root = node.getRootNode ? node.getRootNode() : document;
  while (root && root.host) {
    chain.push(root.host);
    root = root.host.getRootNode();
  }
  return chain;
}

/**
 * Compara el orden de dos elementos en el DOM usando compareDocumentPosition.
 * Shadow-aware: si están en roots distintos, compara por la cadena de hosts
 * en el ancestro común; un host precede a su contenido shadow.
 */
export function compareDOMOrder(a, b) {
  if (a === b) return 0;

  let x = a;
  let y = b;

  const rootA = a.getRootNode ? a.getRootNode() : document;
  const rootB = b.getRootNode ? b.getRootNode() : document;

  if (rootA !== rootB) {
    const chainA = getHostChain(a);
    const chainB = getHostChain(b);
    let i = chainA.length - 1;
    let j = chainB.length - 1;

    // Descartar el prefijo común desde el extremo del documento
    while (i >= 0 && j >= 0 && chainA[i] === chainB[j]) {
      i--;
      j--;
    }

    // Cadena agotada: un elemento es host (ancestro) del otro → el host precede
    if (i < 0) return -1;
    if (j < 0) return 1;

    x = chainA[i];
    y = chainB[j];

    // Si los representantes tampoco comparten root (no debería pasar),
    // comparar los originales con el fallback visual de abajo
    const rx = x.getRootNode ? x.getRootNode() : document;
    const ry = y.getRootNode ? y.getRootNode() : document;
    if (rx !== ry) {
      x = a;
      y = b;
    }
  }

  const position = x.compareDocumentPosition(y);

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

  const rootNode = element.getRootNode ? element.getRootNode() : document;

  // 1) aria-labelledby (highest priority per accname 1.2 spec)
  const labelledBy = element.getAttribute?.('aria-labelledby');
  if (labelledBy) {
    const acc = labelledBy
      .split(/\s+/)
      .map(id => (rootNode.getElementById ? rootNode.getElementById(id) : document.getElementById(id)))
      .filter(Boolean)
      .map(n => n.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ')
      .trim();
    if (acc) return acc;
  }

  // 2) Associated label for form controls
  if (element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA') {
    const id = element.id;
    if (id) {
      const label = rootNode.querySelector(`label[for="${CSS.escape(id)}"]`);
      const labelText = label?.innerText?.trim() || label?.textContent?.trim();
      if (labelText) return labelText;
    }
    const labelAncestor = element.closest('label');
    const labelAncestorText = labelAncestor?.innerText?.trim() || labelAncestor?.textContent?.trim();
    if (labelAncestorText) return labelAncestorText;
  }

  // 3) aria-label
  const ariaLabel = element.getAttribute?.('aria-label');
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  // 4) Images: alt attribute
  if (element.tagName === 'IMG') {
    const alt = element.getAttribute('alt');
    if (alt && alt.trim()) return alt.trim();
  }

  // 5) Visible text content
  const visibleText = (element.innerText || element.textContent || '').trim();
  if (visibleText && visibleText.length <= 50) return visibleText;
  if (visibleText && visibleText.length > 50) return visibleText.substring(0, 50) + '...';

  // 6) title attribute (last resort per accname 1.2)
  const titleAttr = element.getAttribute?.('title');
  if (titleAttr && titleAttr.trim()) return titleAttr.trim();

  // 7) Descendant img alt as final fallback
  const imgChild = element.querySelector?.('img[alt]');
  if (imgChild?.getAttribute('alt')) return imgChild.getAttribute('alt').trim();

  return '';
}

/**
 * Comprueba si algún ancestro oculta al elemento (display:none,
 * visibility:hidden o aria-hidden="true"). Necesario porque getComputedStyle
 * sobre el propio elemento no refleja el display:none de un contenedor.
 */
export function hasHiddenAncestor(element) {
  const doc = element.ownerDocument;
  const win = doc?.defaultView || window;
  let parent = element.parentElement;
  while (parent && parent !== doc.body) {
    const style = win.getComputedStyle(parent);
    if (style.display === 'none' ||
        style.visibility === 'hidden' ||
        parent.getAttribute('aria-hidden') === 'true') {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

/**
 * Recolecta recursivamente los shadow roots abiertos del árbol,
 * en orden de documento (host antes que su contenido).
 * Límite de profundidad defensivo para árboles patológicos.
 */
export function collectShadowRoots(root = document, maxDepth = 20) {
  const roots = [];

  const visit = (node, depth) => {
    if (depth >= maxDepth) return;
    let elements;
    try {
      elements = node.querySelectorAll('*');
    } catch (_) {
      return;
    }
    for (const el of elements) {
      if (el.shadowRoot) {
        roots.push(el.shadowRoot);
        visit(el.shadowRoot, depth + 1);
      }
    }
  };

  try {
    visit(root, 0);
  } catch (_) {
    // Devolver lo recopilado hasta el fallo
  }

  return roots;
}

/**
 * querySelectorAll que penetra shadow roots abiertos.
 * Devuelve array (no NodeList): documento base primero, luego cada shadow root.
 * `roots` permite pasar una lista pre-calculada y evitar re-recorridos.
 * `baseDoc` especifica el documento a consultar (por defecto: el global).
 */
export function deepQuerySelectorAll(selector, roots = null, baseDoc = document) {
  // Un valor explícito null (no undefined) evita el default de parámetro:
  // caemos al document global para no lanzar ni devolver vacío.
  baseDoc = baseDoc || document;
  const shadowRoots = roots || collectShadowRoots(baseDoc);
  const results = [];

  try {
    results.push(...baseDoc.querySelectorAll(selector));
  } catch (_) {
    return results;
  }

  for (const root of shadowRoots) {
    try {
      results.push(...root.querySelectorAll(selector));
    } catch (_) {
      // Root inválido o selector no soportado en este contexto: continuar
    }
  }

  return results;
}

/**
 * Resuelve un selector que puede cruzar fronteras de shadow DOM ( >>> ) y de
 * iframe same-origin ( ::iframe:: ). Devuelve el elemento o null si algún salto falla.
 */
export function resolveDeepSelector(selector) {
  if (!selector || typeof selector !== 'string') return null;

  // Resuelve un selector shadow-aware ( >>> ) dentro de un contexto (Document/ShadowRoot)
  const resolveInContext = (sel, startContext) => {
    const segments = sel.split(' >>> ');
    let context = startContext;
    let element = null;
    for (const segment of segments) {
      if (!context || typeof context.querySelector !== 'function') return null;
      try {
        element = context.querySelector(segment);
      } catch (_) {
        return null;
      }
      if (!element) return null;
      context = element.shadowRoot;
    }
    return element;
  };

  const frameSegments = selector.split(' ::iframe:: ');
  let doc = document;
  let element = null;

  for (let i = 0; i < frameSegments.length; i++) {
    element = resolveInContext(frameSegments[i], doc);
    if (!element) return null;

    // Si no es el último segmento, el elemento resuelto debe ser un iframe: descender
    if (i < frameSegments.length - 1) {
      let childDoc = null;
      try {
        childDoc = element.contentDocument;
      } catch (_) {
        childDoc = null;
      }
      if (!childDoc) return null;
      doc = childDoc;
    }
  }

  return element;
}

/**
 * Enumera los documentos accesibles (same-origin) a partir de un documento raíz,
 * recorriendo iframes (incluidos los que viven dentro de shadow roots) de forma
 * recursiva. Devuelve la lista de contextos { doc, framePath } y el recuento de
 * iframes no auditables (cross-origin o de origen opaco: contentDocument inaccesible).
 */
export function collectFrameContexts(rootDoc = document, framePath = [], depth = 0) {
  // Límite de profundidad defensivo para árboles de iframes patológicos
  // (mismo criterio que collectShadowRoots): no recursar más allá.
  if (depth >= 20) {
    return { contexts: [{ doc: rootDoc, framePath }], crossOriginCount: 0 };
  }

  const contexts = [{ doc: rootDoc, framePath }];
  let crossOriginCount = 0;

  let iframes;
  try {
    iframes = deepQuerySelectorAll('iframe', collectShadowRoots(rootDoc), rootDoc);
  } catch (_) {
    return { contexts, crossOriginCount };
  }

  for (const iframe of iframes) {
    let childDoc = null;
    try {
      childDoc = iframe.contentDocument;
    } catch (_) {
      childDoc = null;
    }

    if (childDoc) {
      const sub = collectFrameContexts(childDoc, [...framePath, iframe], depth + 1);
      contexts.push(...sub.contexts);
      crossOriginCount += sub.crossOriginCount;
    } else {
      crossOriginCount++;
    }
  }

  return { contexts, crossOriginCount };
}
