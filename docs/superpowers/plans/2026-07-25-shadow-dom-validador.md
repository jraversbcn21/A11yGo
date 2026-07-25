# Soporte de Shadow DOM en el validador — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El validador de accesibilidad (`a11y-checker.js`) analiza contenido dentro de shadow roots abiertos, el highlight funciona para elementos en shadow DOM, y se avisa cuando hay componentes con shadow cerrado no auditables.

**Architecture:** Utilidades de consulta profunda compartidas en `utils/dom-utils.js` (`collectShadowRoots`, `deepQuerySelectorAll`, `resolveDeepSelector`); los 9 checks del validador cambian sus consultas planas por consultas profundas con roots cacheados por validación. Los selectores cross-shadow usan segmentos separados por ` >>> `, que `content.js` resuelve saltando de host en host.

**Tech Stack:** JavaScript vanilla (ES modules), Chrome Extension MV3, Vitest + jsdom, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-07-25-shadow-dom-design.md`

## Global Constraints

- Node >= 22 (declarado en `engines`); ejecutar con nvm-windows si hace falta.
- `npm run lint` debe quedar en **0 errores y 0 warnings** antes de cada commit.
- `npm test` en verde antes de cada commit (40 tests existentes + los nuevos).
- Comentarios y strings de UI en español; código (nombres de funciones/variables) en inglés.
- Todo logging pasa por `utils/logger.js` — nunca `console.log` directo.
- Parámetro de catch sin uso se nombra `_`.
- Convención del proyecto: tests **antes** de tocar `a11y-checker.js` o `dom-utils.js` (TDD).
- Los tests corren con jsdom (soporta `attachShadow`); jsdom **no calcula layout** — mockear `getBoundingClientRect` donde la lógica dependa de tamaño renderizado.
- Delimitador de selectores cross-shadow: la cadena exacta ` >>> ` (espacio, tres `>`, espacio).

---

### Task 1: `collectShadowRoots` y `deepQuerySelectorAll` en dom-utils

**Files:**
- Modify: `utils/dom-utils.js` (añadir al final del archivo)
- Create: `tests/shadow-dom.test.js`

**Interfaces:**
- Consumes: nada nuevo.
- Produces:
  - `collectShadowRoots(root = document, maxDepth = 20)` → `ShadowRoot[]` (solo abiertos, orden de documento, host antes que su contenido).
  - `deepQuerySelectorAll(selector, roots = null)` → `Element[]` (documento primero, luego cada shadow root; si `roots` es null los recolecta internamente).

- [ ] **Step 1: Escribir los tests que fallan**

Crear `tests/shadow-dom.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { collectShadowRoots, deepQuerySelectorAll } from '../utils/dom-utils.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

// Helper: crea un host con shadow root y lo añade al padre
function makeShadowHost(parent, mode = 'open') {
  const host = document.createElement('div');
  parent.appendChild(host);
  const root = host.attachShadow({ mode });
  return { host, root };
}

describe('collectShadowRoots', () => {
  it('devuelve array vacío sin shadow roots', () => {
    document.body.innerHTML = '<div><p>texto</p></div>';
    expect(collectShadowRoots()).toEqual([]);
  });

  it('encuentra shadow roots anidados en orden (host antes que su contenido)', () => {
    const outer = makeShadowHost(document.body);
    const inner = makeShadowHost(outer.root);
    const roots = collectShadowRoots();
    expect(roots).toEqual([outer.root, inner.root]);
  });

  it('ignora shadow roots cerrados', () => {
    makeShadowHost(document.body, 'closed');
    expect(collectShadowRoots()).toEqual([]);
  });

  it('respeta el límite de profundidad', () => {
    let parent = document.body;
    for (let i = 0; i < 25; i++) {
      const host = document.createElement('div');
      parent.appendChild(host);
      parent = host.attachShadow({ mode: 'open' });
    }
    const roots = collectShadowRoots();
    expect(roots.length).toBe(20);
  });
});

describe('deepQuerySelectorAll', () => {
  it('sin shadow roots equivale a querySelectorAll plano', () => {
    document.body.innerHTML = '<button>a</button><button>b</button>';
    const result = deepQuerySelectorAll('button');
    expect(result.length).toBe(2);
    expect(result[0].textContent).toBe('a');
  });

  it('encuentra elementos dentro de shadow roots anidados, documento primero', () => {
    const docBtn = document.createElement('button');
    docBtn.textContent = 'doc';
    document.body.appendChild(docBtn);
    const outer = makeShadowHost(document.body);
    outer.root.innerHTML = '<button>outer</button>';
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<button>inner</button>';

    const result = deepQuerySelectorAll('button');
    expect(result.map(b => b.textContent)).toEqual(['doc', 'outer', 'inner']);
  });

  it('acepta lista de roots pre-calculada', () => {
    const outer = makeShadowHost(document.body);
    outer.root.innerHTML = '<button>outer</button>';
    const roots = collectShadowRoots();
    const result = deepQuerySelectorAll('button', roots);
    expect(result.length).toBe(1);
  });

  it('selector inválido devuelve array vacío sin lanzar', () => {
    expect(deepQuerySelectorAll(':::invalido:::')).toEqual([]);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — `collectShadowRoots` no exportada (SyntaxError o undefined).

- [ ] **Step 3: Implementación mínima**

Añadir al final de `utils/dom-utils.js`:

```js
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
 * Devuelve array (no NodeList): documento primero, luego cada shadow root.
 * `roots` permite pasar una lista pre-calculada y evitar re-recorridos.
 */
export function deepQuerySelectorAll(selector, roots = null) {
  const shadowRoots = roots || collectShadowRoots();
  const results = [];

  try {
    results.push(...document.querySelectorAll(selector));
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
```

Nota sobre el límite: `visit(node, depth)` con guard `depth >= maxDepth` produce exactamente 20 roots en una cadena de 25 anidados (se desciende hasta profundidad 19, que empuja el root número 20).

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Lint + suite completa + commit**

```bash
npm run lint && npm test
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: collectShadowRoots y deepQuerySelectorAll en dom-utils

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 2: `resolveDeepSelector` en dom-utils

**Files:**
- Modify: `utils/dom-utils.js` (añadir al final)
- Modify: `tests/shadow-dom.test.js` (añadir describe)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `resolveDeepSelector(selector)` → `Element | null`. Acepta selectores con segmentos separados por ` >>> `; resuelve `document.querySelector(seg0)` → `.shadowRoot.querySelector(seg1)` → … Devuelve `null` si cualquier salto falla.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js` (import: añadir `resolveDeepSelector` al import de dom-utils):

```js
describe('resolveDeepSelector', () => {
  it('selector sin >>> equivale a document.querySelector', () => {
    document.body.innerHTML = '<button id="btn">a</button>';
    expect(resolveDeepSelector('#btn')).toBe(document.getElementById('btn'));
  });

  it('resuelve una ruta de dos niveles', () => {
    const { host, root } = makeShadowHost(document.body);
    host.id = 'host';
    root.innerHTML = '<button>dentro</button>';
    const el = resolveDeepSelector('#host >>> button');
    expect(el).toBe(root.querySelector('button'));
  });

  it('resuelve una ruta de tres niveles', () => {
    const outer = makeShadowHost(document.body);
    outer.host.id = 'outer';
    const inner = makeShadowHost(outer.root);
    inner.host.classList.add('inner');
    inner.root.innerHTML = '<span class="target">x</span>';
    const el = resolveDeepSelector('#outer >>> .inner >>> .target');
    expect(el).toBe(inner.root.querySelector('.target'));
  });

  it('devuelve null si un salto no existe', () => {
    expect(resolveDeepSelector('#no-existe >>> button')).toBeNull();
  });

  it('devuelve null si el host intermedio no tiene shadow root abierto', () => {
    document.body.innerHTML = '<div id="plain"></div>';
    expect(resolveDeepSelector('#plain >>> button')).toBeNull();
  });

  it('devuelve null para entradas inválidas', () => {
    expect(resolveDeepSelector('')).toBeNull();
    expect(resolveDeepSelector(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — `resolveDeepSelector` no exportada.

- [ ] **Step 3: Implementación mínima**

Añadir al final de `utils/dom-utils.js`:

```js
/**
 * Resuelve un selector con segmentos ` >>> ` (fronteras de shadow DOM)
 * saltando de host en host. Devuelve el elemento o null si algún salto falla.
 */
export function resolveDeepSelector(selector) {
  if (!selector || typeof selector !== 'string') return null;

  const segments = selector.split(' >>> ');
  let context = document;
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
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + suite completa + commit**

```bash
npm run lint && npm test
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: resolveDeepSelector para selectores cross-shadow ( >>> )

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 3: `compareDOMOrder` shadow-aware

**Files:**
- Modify: `utils/dom-utils.js:9-32` (función `compareDOMOrder`)
- Modify: `tests/shadow-dom.test.js` (añadir describe)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `compareDOMOrder(a, b)` → number. Comportamiento actual intacto para elementos del mismo root; para roots distintos compara por la cadena de hosts en el ancestro común; si uno es host (directo o indirecto) del otro, el host precede.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js` (import: añadir `compareDOMOrder`):

```js
describe('compareDOMOrder con shadow DOM', () => {
  it('mantiene el comportamiento para elementos del mismo root', () => {
    document.body.innerHTML = '<p id="a"></p><p id="b"></p>';
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    expect(compareDOMOrder(a, b)).toBeLessThan(0);
    expect(compareDOMOrder(b, a)).toBeGreaterThan(0);
  });

  it('ordena elementos de shadow roots distintos por la posición de sus hosts', () => {
    const first = makeShadowHost(document.body);
    first.root.innerHTML = '<span>1</span>';
    const second = makeShadowHost(document.body);
    second.root.innerHTML = '<span>2</span>';
    const a = first.root.querySelector('span');
    const b = second.root.querySelector('span');
    expect(compareDOMOrder(a, b)).toBeLessThan(0);
    expect(compareDOMOrder(b, a)).toBeGreaterThan(0);
  });

  it('el host precede a su propio contenido shadow', () => {
    const { host, root } = makeShadowHost(document.body);
    root.innerHTML = '<span>dentro</span>';
    const inner = root.querySelector('span');
    expect(compareDOMOrder(host, inner)).toBeLessThan(0);
    expect(compareDOMOrder(inner, host)).toBeGreaterThan(0);
  });

  it('ordena entre elemento del documento y elemento en shadow', () => {
    const before = document.createElement('p');
    document.body.appendChild(before);
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<span>s</span>';
    const shadowEl = root.querySelector('span');
    expect(compareDOMOrder(before, shadowEl)).toBeLessThan(0);
    expect(compareDOMOrder(shadowEl, before)).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — los casos cross-root caen hoy en el fallback visual (jsdom devuelve rects a 0 → resultado 0, no <0/>0). El caso "mismo root" pasa.

- [ ] **Step 3: Implementación**

Reemplazar `compareDOMOrder` completa en `utils/dom-utils.js` por:

```js
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
```

- [ ] **Step 4: Verificar que pasan (incluida la suite existente de dom-utils)**

Run: `npm test`
Expected: PASS — los nuevos tests y los 40 existentes (calculateTabOrder y compareDOMOrder actuales sin regresión).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: compareDOMOrder shadow-aware (comparación por cadena de hosts)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 4: `getAccessibleName` resuelve referencias en su root

**Files:**
- Modify: `utils/dom-utils.js` (función `getAccessibleName`, líneas ~78-132 actuales)
- Modify: `tests/shadow-dom.test.js` (añadir describe)

**Interfaces:**
- Consumes: nada de tareas previas.
- Produces: `getAccessibleName(element)` sin cambio de firma; `aria-labelledby` y `label[for]` se resuelven contra `element.getRootNode()` (Document o ShadowRoot) en vez de `document`.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js` (import: añadir `getAccessibleName`):

```js
describe('getAccessibleName dentro de shadow DOM', () => {
  it('resuelve aria-labelledby dentro del shadow root', () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<span id="lbl">Nombre interno</span><input aria-labelledby="lbl">';
    const input = root.querySelector('input');
    expect(getAccessibleName(input)).toBe('Nombre interno');
  });

  it('resuelve label[for] dentro del shadow root', () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<label for="campo">Etiqueta interna</label><input id="campo">';
    const input = root.querySelector('input');
    expect(getAccessibleName(input)).toBe('Etiqueta interna');
  });

  it('sigue funcionando para elementos del documento principal', () => {
    document.body.innerHTML = '<label for="x">Doc label</label><input id="x">';
    expect(getAccessibleName(document.getElementById('x'))).toBe('Doc label');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — los dos primeros devuelven `''` (hoy busca en `document`). El tercero pasa.

- [ ] **Step 3: Implementación**

En `getAccessibleName`, tras la línea `if (!element) return '';` añadir:

```js
  const rootNode = element.getRootNode ? element.getRootNode() : document;
```

Cambiar en el bloque de `aria-labelledby`:

```js
      .map(id => (rootNode.getElementById ? rootNode.getElementById(id) : document.getElementById(id)))
```

(antes: `.map(id => document.getElementById(id))`)

Cambiar en el bloque de label asociado:

```js
      const label = rootNode.querySelector(`label[for="${CSS.escape(id)}"]`);
```

(antes: `const label = document.querySelector(...)`)

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — nuevos tests y los existentes de getAccessibleName sin regresión.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "fix: getAccessibleName resuelve aria-labelledby y label[for] en su root

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 5: El validador consulta con `deepQuerySelectorAll`

**Files:**
- Modify: `utils/a11y-checker.js` (import, constructor, `check()`, 9 checks, `getTextElements`)
- Modify: `tests/shadow-dom.test.js` (añadir describe de integración)

**Interfaces:**
- Consumes: `collectShadowRoots()`, `deepQuerySelectorAll(selector, roots)` de Task 1.
- Produces: `A11yChecker.check(categories)` detecta problemas dentro de shadow roots abiertos. `this._shadowRoots` (ShadowRoot[] | null) cacheado durante la validación y limpiado en `finally`.

- [ ] **Step 1: Escribir el test de integración que falla**

Añadir a `tests/shadow-dom.test.js`. El import va **al inicio del archivo**, junto a los existentes:

```js
import { A11yChecker } from '../utils/a11y-checker.js';
```

Y al final del archivo, los tests:

```js
// Categorías: solo la indicada activa
function onlyCategory(cat) {
  const all = ['images', 'contrast', 'forms', 'headings', 'landmarks', 'links', 'aria', 'keyboard', 'tabOrder'];
  const categories = {};
  for (const c of all) categories[c] = c === cat;
  return categories;
}

describe('A11yChecker con shadow DOM', () => {
  it('detecta imagen sin alt dentro de un shadow root', async () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<img src="foto.png">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const noAlt = results.filter(r => r.code === 'noAltText');
    expect(noAlt.length).toBe(1);
  });

  it('detecta enlace vacío dentro de shadow roots anidados', async () => {
    const outer = makeShadowHost(document.body);
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<a href="/x"></a>';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('links'));

    expect(results.some(r => r.code === 'emptyLink')).toBe(true);
  });

  it('encuentra label[for] dentro del mismo shadow root (sin falso positivo)', async () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<label for="c1">Nombre</label><input id="c1" type="text">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('forms'));

    expect(results.some(r => r.code === 'missingLabel')).toBe(false);
  });

  it('limpia _shadowRoots al terminar', async () => {
    const checker = new A11yChecker();
    await checker.check(onlyCategory('images'));
    expect(checker._shadowRoots).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — el validador no ve dentro de shadow roots (0 resultados donde se esperan, o `missingLabel` como falso positivo en el tercero).

- [ ] **Step 3: Implementación**

En `utils/a11y-checker.js`:

**3a.** Línea 3, ampliar el import:

```js
import { compareDOMOrder, collectShadowRoots, deepQuerySelectorAll } from './dom-utils.js';
```

**3b.** En el constructor, añadir:

```js
    this._shadowRoots = null;
```

**3c.** En `check()`, justo después de `logger.log('A11yChecker: Iniciando validación...');` y dentro del `try`, añadir al inicio:

```js
      this._shadowRoots = collectShadowRoots();
      if (this._shadowRoots.length > 0) {
        logger.log(`A11yChecker: ${this._shadowRoots.length} shadow root(s) abiertos detectados`);
      }
```

Y convertir el `try/catch` de `check()` en `try/catch/finally`, añadiendo tras el bloque `catch`:

```js
    } finally {
      // El DOM cambia entre validaciones: no cachear roots entre ejecuciones
      this._shadowRoots = null;
    }
```

**3d.** Sustituir las consultas planas (una línea cada una):

| Línea actual | Antes | Después |
|---|---|---|
| 130 (`checkImages`) | `document.querySelectorAll('img')` | `deepQuerySelectorAll('img', this._shadowRoots)` |
| 238 (`checkFormLabels`) | `document.querySelectorAll('input, select, textarea')` | `deepQuerySelectorAll('input, select, textarea', this._shadowRoots)` |
| 259 (`checkFormLabels`, label[for]) | `document.querySelector(\`label[for="${CSS.escape(id)}"]\`)` | `input.getRootNode().querySelector(\`label[for="${CSS.escape(id)}"]\`)` |
| 291 (`checkHeadings`) | `Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))` | `deepQuerySelectorAll('h1, h2, h3, h4, h5, h6', this._shadowRoots)` |
| 355-361 (`checkLandmarks`, existencia) | `landmarks.some(selector => { try { return document.querySelector(selector); } catch (_) { return false; } })` | `landmarks.some(selector => { try { return deepQuerySelectorAll(selector, this._shadowRoots).length > 0; } catch (_) { return false; } })` |
| 368 (`checkLandmarks`, mains) | `document.querySelectorAll('main, [role="main"]')` | `deepQuerySelectorAll('main, [role="main"]', this._shadowRoots)` |
| 381 (`checkLinks`) | `document.querySelectorAll('a[href]')` | `deepQuerySelectorAll('a[href]', this._shadowRoots)` |
| 412 (`checkARIA`, roles) | `document.querySelectorAll('[role]')` | `deepQuerySelectorAll('[role]', this._shadowRoots)` |
| 440 (`checkARIA`, atributos) | `document.querySelectorAll('[aria-hidden], …')` | `deepQuerySelectorAll('[aria-hidden], …', this._shadowRoots)` (mismo selector largo, sin cambios) |
| 485 (`checkKeyboardAccess`) | `document.querySelectorAll('a, button, …')` | `deepQuerySelectorAll('a, button, …', this._shadowRoots)` (mismo selector) |
| 526 (`checkTabOrder`) | `Array.from(document.querySelectorAll(selectors))` | `deepQuerySelectorAll(selectors, this._shadowRoots)` |
| 636 (`getTextElements`) | `document.querySelectorAll(selectors)` | `deepQuerySelectorAll(selectors, this._shadowRoots)` |

Notas:
- `deepQuerySelectorAll` devuelve array: quitar los `Array.from(...)` envolventes en 291, 526 (el resultado ya es array). Los `.forEach` sobre NodeList siguen funcionando sobre array sin cambios.
- En 291 la cadena `.filter(...)` posterior se mantiene igual.
- En 370 (`mains[1]`) el acceso por índice funciona igual sobre array.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — integración shadow + los tests existentes de a11y-checker (parseColor etc.) sin regresión.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js tests/shadow-dom.test.js
git commit -m "feat: el validador traversa shadow DOM abierto (deepQuerySelectorAll)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 6: `getElementSelector` genera selectores ` >>> `

**Files:**
- Modify: `utils/a11y-checker.js:885-943` (función `getElementSelector`)
- Modify: `tests/shadow-dom.test.js` (añadir tests)

**Interfaces:**
- Consumes: `resolveDeepSelector` (Task 2) — solo en tests, para verificar ida y vuelta.
- Produces: `getElementSelector(element)` → string. Para elementos del documento: formato actual sin cambios. Para elementos en shadow: `selectorDelHost >>> selectorInterno` (recursivo por cada frontera). Método auxiliar nuevo `getSelectorInRoot(element, root)` → string.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js`:

```js
describe('getElementSelector con shadow DOM', () => {
  it('elementos del documento mantienen el formato actual (sin >>>)', () => {
    document.body.innerHTML = '<div><button id="btn">x</button></div>';
    const checker = new A11yChecker();
    const sel = checker.getElementSelector(document.getElementById('btn'));
    expect(sel).toBe('#btn');
    expect(sel).not.toContain('>>>');
  });

  it('elemento en shadow produce selector con >>> resoluble con resolveDeepSelector', () => {
    const { host, root } = makeShadowHost(document.body);
    host.id = 'mi-host';
    root.innerHTML = '<div><button>dentro</button></div>';
    const target = root.querySelector('button');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel).toContain(' >>> ');
    expect(resolveDeepSelector(sel)).toBe(target);
  });

  it('shadow anidado produce dos separadores y resuelve al elemento', () => {
    const outer = makeShadowHost(document.body);
    outer.host.id = 'outer-host';
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<span>profundo</span>';
    const target = inner.root.querySelector('span');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel.split(' >>> ').length).toBe(3);
    expect(resolveDeepSelector(sel)).toBe(target);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — hoy el selector generado para elementos en shadow no contiene ` >>> ` y no resuelve.

- [ ] **Step 3: Implementación**

Reemplazar `getElementSelector` completa en `utils/a11y-checker.js` por:

```js
  getElementSelector(element) {
    try {
      const root = element.getRootNode ? element.getRootNode() : document;
      const segment = this.getSelectorInRoot(element, root);

      // Si el elemento vive en un shadow root, anteponer el selector del host
      if (root && root.host) {
        return `${this.getElementSelector(root.host)} >>> ${segment}`;
      }

      return segment;
    } catch (_) {
      return element.tagName?.toLowerCase() || '*';
    }
  }

  // Genera un selector válido DENTRO del root dado (Document o ShadowRoot)
  getSelectorInRoot(element, root) {
    // Si tiene ID, es el selector más específico
    if (element.id && /^[a-zA-Z][\w-]*$/.test(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }

    // Construir path desde el elemento hasta un ancestro con ID o el límite del root
    const path = [];
    let el = element;

    while (el && el !== document.documentElement && el !== root) {
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

    // Verificar que el selector realmente apunta al elemento correcto dentro del root
    try {
      if (root.querySelector(selector) === element) {
        return selector;
      }
    } catch (_) {}

    // Fallback: usar posición entre hermanos del mismo tag
    const tag = element.tagName.toLowerCase();
    if (!element.parentElement) return tag;
    const siblingsOfTag = Array.from(element.parentElement.children).filter(c => c.tagName === element.tagName);
    const idx = siblingsOfTag.indexOf(element) + 1;
    return `${tag}:nth-of-type(${idx})`;
  }
```

Notas:
- Dentro de un shadow root, el elemento de nivel superior tiene `parentElement === null` (su padre es el propio ShadowRoot): el bucle termina de forma natural y el path queda relativo al root.
- La verificación usa `root.querySelector` (antes `document.querySelector`), válida para ambos contextos.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — incluidos los tests de integración de Task 5 (sus resultados ahora llevan selectores ` >>> ` internamente, sin afectar las aserciones).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js tests/shadow-dom.test.js
git commit -m "feat: getElementSelector genera selectores cross-shadow con >>>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 7: Aviso de shadow DOM cerrado (heurística)

**Files:**
- Modify: `utils/a11y-checker.js` (método nuevo + llamada en `check()` + entrada en `getTitle`)
- Modify: `utils/i18n.js` (clave `closedShadow` en es y en)
- Modify: `tests/shadow-dom.test.js` (añadir tests)

**Interfaces:**
- Consumes: `deepQuerySelectorAll` (Task 1), `this._shadowRoots` (Task 5).
- Produces: método `detectClosedShadowComponents()` que añade como máximo **un** resultado `{ severity: 'info', code: 'closedShadow' }` con el recuento en la descripción. Se ejecuta siempre (no ligado a categorías).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js`:

```js
// Mock de tamaño renderizado (jsdom no calcula layout)
function mockSize(el, width = 100, height = 40) {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0
  });
}

describe('detección de shadow DOM cerrado (heurística)', () => {
  it('emite un único resultado info con el recuento', async () => {
    const w1 = document.createElement('my-widget');
    mockSize(w1);
    document.body.appendChild(w1);
    const w2 = document.createElement('other-widget');
    mockSize(w2);
    document.body.appendChild(w2);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const closed = results.filter(r => r.code === 'closedShadow');
    expect(closed.length).toBe(1);
    expect(closed[0].severity).toBe('info');
    expect(closed[0].description).toContain('2');
  });

  it('no se emite para custom elements con shadow root abierto', async () => {
    const host = document.createElement('open-widget');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' });
    mockSize(host);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });

  it('no se emite para custom elements con hijos en el DOM ligero', async () => {
    const el = document.createElement('light-widget');
    el.innerHTML = '<p>contenido visible</p>';
    mockSize(el);
    document.body.appendChild(el);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });

  it('no se emite para elementos sin tamaño renderizado', async () => {
    const el = document.createElement('empty-widget');
    document.body.appendChild(el); // jsdom: rect a 0 por defecto

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — `closedShadow` nunca aparece en los resultados.

- [ ] **Step 3: Implementación**

**3a.** En `utils/a11y-checker.js`, añadir el método (junto a los otros checks, después de `checkTabOrder`):

```js
  // Heurística: custom elements que probablemente ocultan un shadow root cerrado.
  // No hay API para distinguir "shadow cerrado" de "sin shadow"; se aproxima con:
  // tag con guion + sin shadowRoot accesible + sin hijos en el DOM ligero + tamaño renderizado > 0.
  detectClosedShadowComponents() {
    try {
      const candidates = deepQuerySelectorAll('*', this._shadowRoots).filter(el => {
        try {
          if (!el.tagName || !el.tagName.includes('-')) return false;
          if (el.shadowRoot) return false;
          if (el.childElementCount > 0) return false;
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        } catch (_) {
          return false;
        }
      });

      if (candidates.length > 0) {
        this.addResult('info', 'closedShadow',
          `${candidates.length} componente(s) posiblemente con shadow DOM cerrado — su contenido no pudo ser auditado`);
      }
    } catch (error) {
      logger.error('A11yChecker: Error en detectClosedShadowComponents:', error);
    }
  }
```

**3b.** En `check()`, llamar justo después del bloque que asigna `this._shadowRoots` (Task 5, paso 3c):

```js
      this.detectClosedShadowComponents();
```

**3c.** En `getTitle`, añadir al objeto `titles`:

```js
      closedShadow: 'Shadow DOM cerrado',
```

**3d.** En `utils/i18n.js`, sección `// Reportes` del idioma `es`, añadir:

```js
    closedShadow: 'Shadow DOM cerrado',
```

Y en la sección equivalente del idioma `en`:

```js
    closedShadow: 'Closed shadow DOM',
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS (todos).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js utils/i18n.js tests/shadow-dom.test.js
git commit -m "feat: aviso informativo de componentes con shadow DOM cerrado

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

---

### Task 8: Highlight shadow-aware en content.js

**Files:**
- Modify: `content.js` (carga de módulos ~línea 30-35, `highlightElement` ~línea 395-464)

**Interfaces:**
- Consumes: `resolveDeepSelector` (Task 2), importada dinámicamente.
- Produces: `highlightElement(selector, severity)` resuelve selectores con ` >>> ` y funciona con elementos dentro de shadow roots.

Sin tests unitarios (content.js no se testea — convención actual); la verificación es lint + suite + manual.

- [ ] **Step 1: Importar `resolveDeepSelector` en la carga de módulos**

En `content.js`, junto a las declaraciones `let textReader = null;` etc. (~línea 9-13), añadir:

```js
  let resolveDeepSelector = null;
```

En el bloque de carga dinámica (tras `const { A11yChecker } = await import(...)`, ~línea 35), añadir:

```js
      const domUtilsModule = await import(chrome.runtime.getURL('utils/dom-utils.js'));
      resolveDeepSelector = domUtilsModule.resolveDeepSelector;
```

- [ ] **Step 2: Resolver el selector con soporte shadow**

En `highlightElement`, reemplazar:

```js
      const element = document.querySelector(selector);
```

por:

```js
      const element = resolveDeepSelector
        ? resolveDeepSelector(selector)
        : document.querySelector(selector);
```

- [ ] **Step 3: Sustituir `document.contains` por `isConnected`**

`document.contains(element)` devuelve `false` para elementos dentro de shadow DOM (no cruza fronteras), lo que impediría crear el overlay. `element.isConnected` sí es composed-aware. Reemplazar las **3** ocurrencias dentro de `highlightElement`:

- En `restoreHidden` (~línea 421): `if (document.contains(element)) {` → `if (element.isConnected) {`
- En el `setTimeout` (~línea 435): `if (!document.contains(element)) return;` → `if (!element.isConnected) return;`
- En `currentScrollHandler` (~línea 442): `if (!currentErrorOverlay || !document.contains(element)) return;` → `if (!currentErrorOverlay || !element.isConnected) return;`

- [ ] **Step 4: Verificar que `utils/dom-utils.js` es importable desde el content script**

Run: `grep -n "web_accessible_resources" -A 10 manifest.json`
Expected: el patrón de recursos accesibles cubre `utils/dom-utils.js` (ya lo cubre hoy: `keyboard-nav.js` lo importa como módulo ES en cadena). Si no estuviera cubierto, añadirlo a la lista.

- [ ] **Step 5: Lint + suite + commit**

```bash
npm run lint && npm test
git add content.js
git commit -m "feat: highlight resuelve selectores cross-shadow y usa isConnected

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```

- [ ] **Step 6: Verificación manual (humano en el bucle)**

1. Cargar la extensión sin empaquetar (`chrome://extensions/`, modo desarrollador) apuntando a la raíz del repo.
2. Abrir una página con web components (p. ej. cualquier página que use Lit; o crear un HTML local con `attachShadow` que contenga un `<img>` sin alt dentro del shadow).
3. Ejecutar "Validar Accesibilidad" → el problema del shadow aparece en el sidebar.
4. Click en el resultado → la página hace scroll y el overlay pulse aparece sobre el elemento dentro del shadow root.

---

### Task 9: Documentación (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md` (secciones Estructura, Convenciones, Testing)

**Interfaces:**
- Consumes: todo lo anterior (documenta el resultado final).
- Produces: documentación actualizada.

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección **Estructura del Proyecto**, actualizar la línea de `dom-utils.js`:

```
  dom-utils.js         - Funciones compartidas: calculateTabOrder, compareDOMOrder, getAccessibleName, deepQuerySelectorAll (shadow DOM), resolveDeepSelector
```

En **Convenciones**, añadir estos bullets:

```
- El validador traversa shadow DOM **abierto**: `check()` recolecta roots una vez (`collectShadowRoots`) y los checks consultan con `deepQuerySelectorAll`
- Selectores cross-shadow usan segmentos ` >>> ` (generados por `getElementSelector`, resueltos por `resolveDeepSelector` en el highlight)
- Shadow roots cerrados no son analizables: se emite un único resultado `info` (`closedShadow`) con recuento heurístico
```

En **Testing**, actualizar la lista de archivos añadiendo:

```
  shadow-dom.test.js   - Tests de traversal shadow DOM, selectores >>> y heurística de shadow cerrado
```

- [ ] **Step 2: Verificación final completa**

```bash
npm run lint && npm test
```

Expected: lint 0/0; todos los tests PASS (40 existentes + ~20 nuevos).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documentar soporte de shadow DOM en el validador

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01PDvyWdgSqT9UQNNnMGCLSA"
```
