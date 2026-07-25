# Auditoría de iframes same-origin — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El validador audita el contenido de iframes same-origin (ejecutándose por-documento sobre cada `contentDocument` accesible), genera selectores/highlight frame-aware, y avisa (`info`/`crossOriginIframe`) de los iframes cross-origin no auditables.

**Architecture:** Todo corre en el frame principal (guards `window !== window.top` intactos). `collectFrameContexts` (dom-utils) enumera los documentos accesibles; el checker corre completo y aislado por documento con `this._currentDoc`; los selectores cruzan frames con el delimitador ` ::iframe:: `; el highlight compone offsets de iframe.

**Tech Stack:** JavaScript vanilla (ES modules), Chrome Extension MV3, Vitest + jsdom, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-07-25-iframes-design.md`

## Global Constraints

- Node >= 22; `npm run lint` en **0 errores y 0 warnings** antes de cada commit; `npm test` en verde (87 existentes + nuevos) antes de cada commit.
- Comentarios y strings de UI en español; código (identificadores) en inglés.
- `description` de resultados hardcodeada en español; solo `title` sale de `i18n`.
- Logging vía `utils/logger.js`; nunca `console.log`. Catch sin uso nombrado `_`.
- TDD: test que falla primero, luego implementación. Tests antes de tocar `a11y-checker.js`/`dom-utils.js`.
- jsdom no calcula layout (`getBoundingClientRect` → 0) ni simula cross-origin real; mockear donde haga falta. `content.js` no se testea (convención) — verificación manual.
- Delimitador de frame: la cadena exacta ` ::iframe:: ` (espacio, dos puntos, iframe, dos puntos, espacio).

---

### Task 1: `deepQuerySelectorAll` acepta `baseDoc`

**Files:**
- Modify: `utils/dom-utils.js:225-244` (función `deepQuerySelectorAll`)
- Modify: `tests/shadow-dom.test.js` (añadir `describe`)

**Interfaces:**
- Produces: `deepQuerySelectorAll(selector, roots = null, baseDoc = document)` → `Element[]`. Consulta `baseDoc.querySelectorAll(selector)` (antes el `document` global) y luego cada shadow root de `roots` (o `collectShadowRoots(baseDoc)` si `roots` es null). Retrocompatible: llamadores `(sel, roots)` no cambian de comportamiento cuando el documento base es el global.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/shadow-dom.test.js` un nuevo `describe` (el import de `deepQuerySelectorAll` ya existe al inicio del archivo):

```js
describe('deepQuerySelectorAll con baseDoc', () => {
  it('consulta el documento base dado en vez del global', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    idoc.body.innerHTML = '<button>dentro</button>';

    const result = deepQuerySelectorAll('button', null, idoc);
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe('dentro');

    iframe.remove();
  });

  it('sin baseDoc sigue consultando el document global', () => {
    document.body.innerHTML = '<button>global</button>';
    const result = deepQuerySelectorAll('button');
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe('global');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — el primer test encuentra 0 (hoy `deepQuerySelectorAll` ignora el 3er argumento y consulta el `document` global, donde no está el `<button>` del iframe).

- [ ] **Step 3: Implementación**

Reemplazar `deepQuerySelectorAll` en `utils/dom-utils.js` por:

```js
export function deepQuerySelectorAll(selector, roots = null, baseDoc = document) {
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
```

Actualizar el comentario JSDoc de la función para mencionar `baseDoc`.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — nuevos tests y los 87 existentes sin regresión.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: deepQuerySelectorAll acepta documento base (baseDoc)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 2: `collectFrameContexts` en dom-utils

**Files:**
- Modify: `utils/dom-utils.js` (añadir al final)
- Modify: `tests/shadow-dom.test.js` (añadir `describe`)

**Interfaces:**
- Consumes: `collectShadowRoots` y `deepQuerySelectorAll` (Task 1).
- Produces: `collectFrameContexts(rootDoc = document, framePath = [])` → `{ contexts, crossOriginCount }`. `contexts` es `[{ doc, framePath }]` empezando por `{ rootDoc, framePath }`; recursa por cada `<iframe>` accesible (buscados también dentro de shadow roots) con `framePath` extendido con ese iframe; `crossOriginCount` cuenta los iframes cuyo `contentDocument` no es accesible (null / excepción).

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js` (añadir `collectFrameContexts` al import de `../utils/dom-utils.js` del inicio del archivo):

```js
describe('collectFrameContexts', () => {
  it('sin iframes devuelve solo el documento raíz', () => {
    document.body.innerHTML = '<p>hola</p>';
    const { contexts, crossOriginCount } = collectFrameContexts();
    expect(contexts.length).toBe(1);
    expect(contexts[0].doc).toBe(document);
    expect(contexts[0].framePath).toEqual([]);
    expect(crossOriginCount).toBe(0);
  });

  it('incluye el documento de un iframe same-origin con su framePath', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<span>dentro</span>';

    const { contexts, crossOriginCount } = collectFrameContexts();
    expect(contexts.length).toBe(2);
    expect(contexts[1].doc).toBe(iframe.contentDocument);
    expect(contexts[1].framePath).toEqual([iframe]);
    expect(crossOriginCount).toBe(0);

    iframe.remove();
  });

  it('recorre iframes anidados (3 contextos)', () => {
    const outer = document.createElement('iframe');
    document.body.appendChild(outer);
    const inner = outer.contentDocument.createElement('iframe');
    outer.contentDocument.body.appendChild(inner);

    const { contexts } = collectFrameContexts();
    expect(contexts.length).toBe(3);
    expect(contexts[2].framePath).toEqual([outer, inner]);

    outer.remove();
  });

  it('cuenta iframes no accesibles (contentDocument null) como cross-origin', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });

    const { contexts, crossOriginCount } = collectFrameContexts();
    expect(contexts.length).toBe(1);
    expect(crossOriginCount).toBe(1);

    iframe.remove();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — `collectFrameContexts is not a function`.

- [ ] **Step 3: Implementación**

Añadir al final de `utils/dom-utils.js`:

```js
/**
 * Enumera los documentos accesibles (same-origin) a partir de un documento raíz,
 * recorriendo iframes (incluidos los que viven dentro de shadow roots) de forma
 * recursiva. Devuelve la lista de contextos { doc, framePath } y el recuento de
 * iframes no auditables (cross-origin o de origen opaco: contentDocument inaccesible).
 */
export function collectFrameContexts(rootDoc = document, framePath = []) {
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
      const sub = collectFrameContexts(childDoc, [...framePath, iframe]);
      contexts.push(...sub.contexts);
      crossOriginCount += sub.crossOriginCount;
    } else {
      crossOriginCount++;
    }
  }

  return { contexts, crossOriginCount };
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: collectFrameContexts enumera documentos de iframes same-origin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 3: `resolveDeepSelector` cruza frames ( ::iframe:: )

**Files:**
- Modify: `utils/dom-utils.js:250-269` (función `resolveDeepSelector`)
- Modify: `tests/shadow-dom.test.js` (añadir `describe`)

**Interfaces:**
- Produces: `resolveDeepSelector(selector)` sin cambio de firma. Ahora divide primero por ` ::iframe:: ` (saltos de frame): resuelve cada segmento con la lógica ` >>> ` (shadow) actual dentro del documento contexto para obtener el `<iframe>`, desciende a `iframe.contentDocument` (null → `null`), y en el último segmento resuelve el elemento. Compatible hacia atrás con selectores sin ` ::iframe:: `.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/shadow-dom.test.js`:

```js
describe('resolveDeepSelector cruzando iframes', () => {
  it('resuelve un elemento dentro de un iframe same-origin', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'fr';
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<button id="b">x</button>';

    const el = resolveDeepSelector('#fr ::iframe:: #b');
    expect(el).toBe(iframe.contentDocument.getElementById('b'));

    iframe.remove();
  });

  it('devuelve null si el iframe no es accesible', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'fr2';
    document.body.appendChild(iframe);
    Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });

    expect(resolveDeepSelector('#fr2 ::iframe:: #b')).toBeNull();

    iframe.remove();
  });

  it('sigue resolviendo selectores sin ::iframe:: (retrocompatible)', () => {
    document.body.innerHTML = '<button id="plain">y</button>';
    expect(resolveDeepSelector('#plain')).toBe(document.getElementById('plain'));
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/shadow-dom.test.js`
Expected: FAIL — los dos primeros: hoy `resolveDeepSelector` no reconoce ` ::iframe:: ` y trata todo el string como un selector CSS dentro del top → `null` o error. El tercero pasa.

- [ ] **Step 3: Implementación**

Reemplazar `resolveDeepSelector` en `utils/dom-utils.js` por:

```js
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
```

- [ ] **Step 4: Verificar que pasan (incluida la suite de shadow existente)**

Run: `npm test`
Expected: PASS — nuevos tests, los tests shadow de `resolveDeepSelector` existentes sin regresión, y los 87 previos.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/dom-utils.js tests/shadow-dom.test.js
git commit -m "feat: resolveDeepSelector cruza iframes same-origin ( ::iframe:: )

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 4: Checker doc-agnóstico a nivel de elemento (`getStyle` + ownerDocument)

**Files:**
- Modify: `utils/a11y-checker.js` — nuevo método `getStyle`; sustituir 7 llamadas `window.getComputedStyle`; `getBackgroundInfo` y `getBackgroundColor` usan `ownerDocument`
- Modify: `tests/a11y-checker.test.js` (añadir un test de `getStyle`)

**Interfaces:**
- Produces: `getStyle(el)` → CSSStyleDeclaration de la ventana dueña del elemento (`el.ownerDocument.defaultView`), con fallback a `window`. `getBackgroundInfo`/`getBackgroundColor` operan sobre `element.ownerDocument` en vez del `document` global. Sin cambio de comportamiento para elementos del documento top.

Este es un refactor sin cambio funcional para el top: la red de seguridad es que los 87 tests existentes sigan verdes.

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/a11y-checker.test.js`, dentro del `describe('A11yChecker - color utilities', ...)`:

```js
  describe('getStyle', () => {
    it('usa la ventana dueña del elemento (defaultView del iframe)', () => {
      const iframe = document.createElement('iframe');
      document.body.appendChild(iframe);
      const idoc = iframe.contentDocument;
      idoc.body.innerHTML = '<p id="t">x</p>';
      const el = idoc.getElementById('t');

      const spy = idoc.defaultView.getComputedStyle;
      let called = false;
      idoc.defaultView.getComputedStyle = (...args) => { called = true; return spy.apply(idoc.defaultView, args); };

      checker.getStyle(el);
      expect(called).toBe(true);

      idoc.defaultView.getComputedStyle = spy;
      iframe.remove();
    });
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: FAIL — `checker.getStyle is not a function`.

- [ ] **Step 3: Implementación**

**3a.** Añadir el método `getStyle` en `utils/a11y-checker.js` (junto a los otros helpers, p. ej. justo antes de `getBackgroundInfo`):

```js
  // Obtiene los estilos computados usando la ventana dueña del elemento (necesario
  // para elementos dentro de iframes same-origin; getComputedStyle debe invocarse
  // sobre la ventana del documento del elemento).
  getStyle(el) {
    const view = el && el.ownerDocument && el.ownerDocument.defaultView;
    return (view || window).getComputedStyle(el);
  }
```

**3b.** Sustituir las **7** llamadas `window.getComputedStyle(<x>)` sobre un elemento por `this.getStyle(<x>)` en estos métodos (líneas actuales de referencia; el nombre de la variable-argumento debe respetarse tal cual está en cada sitio):
- `:179` (`checkContrast`): `const style = this.getStyle(element);`
- `:327` (`checkHeadings`): `const style = this.getStyle(h);`
- `:527` (`checkKeyboardAccess`): `const style = this.getStyle(element);`
- `:566` (`checkTabOrder`): `const style = this.getStyle(el);`
- `:706` (`getTextElements`): `const style = this.getStyle(el);`
- `:730` (`getBackgroundInfo`): `const style = this.getStyle(el);`
- `:812` (`getBackgroundColor`): `const style = this.getStyle(el);`

Verificar con `grep -n "window.getComputedStyle" utils/a11y-checker.js` que tras 3b/3c/3d no quede **ninguna** ocurrencia de `window.getComputedStyle` en el archivo.

Nota: hay además dos `window.getComputedStyle(document.body)` (en `getBackgroundInfo` `:758` y `getBackgroundColor` `:824`) — se tratan en 3c/3d.

**3c.** En `getBackgroundInfo`, cambiar los límites y el fallback a `element.ownerDocument`:
- `:729` `while (el && el !== document.documentElement) {` → `while (el && el !== element.ownerDocument.documentElement) {`
- `:758` `const bodyBg = window.getComputedStyle(document.body).backgroundColor;` → `const bodyBg = this.getStyle(element.ownerDocument.body).backgroundColor;`

**3d.** En `getBackgroundColor`, análogo:
- `:811` `while (el && el !== document.body) {` → `while (el && el !== element.ownerDocument.body) {`
- `:824` `bgColor = window.getComputedStyle(document.body).backgroundColor;` → `bgColor = this.getStyle(element.ownerDocument.body).backgroundColor;`

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — el nuevo test de `getStyle` y los 87 existentes (sin regresión: para elementos del top, `ownerDocument.defaultView` es `window`).

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js tests/a11y-checker.test.js
git commit -m "refactor: checker usa getStyle(ownerDocument) para soportar iframes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 5: `check()` corre por-documento

**Files:**
- Modify: `utils/a11y-checker.js` — constructor (`_currentDoc`/`_framePath`), `check()` (bucle de contextos), threading de `this._currentDoc` en todas las llamadas `deepQuerySelectorAll`, `checkContrast` (presupuesto global), `getSelectorInRoot` (ownerDocument)
- Modify: `tests/iframe.test.js` (nuevo archivo)

**Interfaces:**
- Consumes: `collectFrameContexts` (Task 2), `deepQuerySelectorAll(sel, roots, baseDoc)` (Task 1).
- Produces: `check(categories)` ejecuta los checks habilitados una vez por cada documento accesible (top + iframes same-origin), agregando resultados. `this._currentDoc` (Document actual), `this._framePath` (Element[] de iframes), `this._contrastBudget` (number) cacheados durante la validación y reseteados en `finally`. `collectFrameContexts` se llama una vez; `crossOriginCount` se calcula pero su emisión como resultado es de la Task 6.

- [ ] **Step 1: Escribir los tests de integración que fallan**

Crear `tests/iframe.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { A11yChecker } from '../utils/a11y-checker.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function onlyCategory(cat) {
  const all = ['images', 'contrast', 'forms', 'headings', 'landmarks', 'links', 'aria', 'keyboard', 'tabOrder'];
  const categories = {};
  for (const c of all) categories[c] = c === cat;
  return categories;
}

describe('A11yChecker audita iframes same-origin', () => {
  it('detecta imagen sin alt dentro de un iframe same-origin', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<img src="foto.png">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.filter(r => r.code === 'noAltText').length).toBe(1);

    iframe.remove();
  });

  it('evalúa encabezados por-documento (h1 en top y h1 en iframe no dan invalidHeadingOrder)', async () => {
    document.body.innerHTML = '<h1>Top</h1>';
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<h1>Iframe</h1>';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('headings'));

    expect(results.some(r => r.code === 'invalidHeadingOrder')).toBe(false);

    iframe.remove();
  });

  it('resetea el contexto de frame al terminar', async () => {
    const checker = new A11yChecker();
    await checker.check(onlyCategory('images'));
    expect(checker._currentDoc).toBeNull();
    expect(checker._framePath).toBeNull();
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/iframe.test.js`
Expected: FAIL — el validador no ve dentro del iframe (0 `noAltText`); `_currentDoc`/`_framePath` no existen (undefined, no null).

- [ ] **Step 3: Implementación**

**3a.** En el constructor, añadir junto a `this._shadowRoots = null;`:

```js
    this._currentDoc = null;
    this._framePath = null;
    this._contrastBudget = 0;
    this._crossOriginCount = 0;
```

**3b.** Reemplazar el cuerpo del `try` de `check()` (el bloque que hoy asigna `this._shadowRoots`, llama `detectClosedShadowComponents()` y ejecuta los `if (enabled(...))`) por un bucle sobre contextos. Sustituir desde la línea `this._shadowRoots = collectShadowRoots();` hasta el final del bloque `if (enabled('tabOrder')) { ... }` por:

```js
      const frameData = collectFrameContexts(document);
      const contexts = frameData.contexts;
      this._crossOriginCount = frameData.crossOriginCount;
      this._contrastBudget = 100;

      for (const ctx of contexts) {
        this._currentDoc = ctx.doc;
        this._framePath = ctx.framePath;
        this._shadowRoots = collectShadowRoots(ctx.doc);

        this.detectClosedShadowComponents();

        if (enabled('images')) this.checkImages();
        if (enabled('contrast')) this.checkContrast();
        if (enabled('forms')) this.checkFormLabels();
        if (enabled('headings')) this.checkHeadings();
        if (enabled('landmarks')) this.checkLandmarks();
        if (enabled('links')) this.checkLinks();
        if (enabled('aria')) this.checkARIA();
        if (enabled('keyboard')) this.checkKeyboardAccess();
        if (enabled('tabOrder')) this.checkTabOrder();
      }
      logger.log(`A11yChecker: Validación por-documento completada (${contexts.length} documento(s))`);
```

Conservar los `logger.log` de resumen finales y el `return this.results;`.

**3c.** En el `finally`, ampliar el reset:

```js
    } finally {
      // El DOM cambia entre validaciones: no cachear estado entre ejecuciones
      this._shadowRoots = null;
      this._currentDoc = null;
      this._framePath = null;
      this._contrastBudget = 0;
      this._crossOriginCount = 0;
    }
```

**3d.** Añadir `this._currentDoc` como tercer argumento a **todas** las llamadas `deepQuerySelectorAll(<sel>, this._shadowRoots)` del archivo. Son estas (verificar con `grep -n "deepQuerySelectorAll" utils/a11y-checker.js` que no quede ninguna sin el tercer argumento):
- `checkImages`: `deepQuerySelectorAll('img', this._shadowRoots, this._currentDoc)`
- `checkFormLabels`: `deepQuerySelectorAll('input, select, textarea', this._shadowRoots, this._currentDoc)`
- `checkHeadings`: `deepQuerySelectorAll('h1, h2, h3, h4, h5, h6', this._shadowRoots, this._currentDoc)`
- `checkLandmarks` (existencia, dentro del `.some`): `deepQuerySelectorAll(selector, this._shadowRoots, this._currentDoc)`
- `checkLandmarks` (mains): `deepQuerySelectorAll('main, [role="main"]', this._shadowRoots, this._currentDoc)`
- `checkLinks`: `deepQuerySelectorAll('a[href]', this._shadowRoots, this._currentDoc)`
- `checkARIA` (roles): `deepQuerySelectorAll('[role]', this._shadowRoots, this._currentDoc)`
- `checkARIA` (atributos): `deepQuerySelectorAll('[aria-hidden], [aria-expanded], [aria-selected], [aria-checked], [aria-readonly], [aria-required], [aria-label], [aria-labelledby]', this._shadowRoots, this._currentDoc)`
- `checkKeyboardAccess`: `deepQuerySelectorAll('a, button, input, select, textarea, [tabindex], [role="button"], [role="link"], [role="menuitem"], [role="tab"]', this._shadowRoots, this._currentDoc)`
- `checkTabOrder`: `deepQuerySelectorAll(selectors, this._shadowRoots, this._currentDoc)`
- `getTextElements`: `deepQuerySelectorAll(selectors, this._shadowRoots, this._currentDoc)`
- `detectClosedShadowComponents`: `deepQuerySelectorAll('*', this._shadowRoots, this._currentDoc)`

**3e.** En `checkContrast`, respetar el presupuesto global. Reemplazar (`:169-175`):

```js
    // Limitar el número de elementos a verificar para evitar que se cuelgue
    const maxElements = 100;
    const elementsToCheck = textElements.slice(0, maxElements);

    if (textElements.length > maxElements) {
      logger.warn(`A11yChecker: Limitando verificación de contraste a ${maxElements} elementos de ${textElements.length}`);
    }
```

por:

```js
    // Presupuesto global acumulado entre documentos (top + iframes)
    const elementsToCheck = textElements.slice(0, Math.max(0, this._contrastBudget));
    this._contrastBudget -= elementsToCheck.length;

    if (textElements.length > elementsToCheck.length) {
      logger.warn(`A11yChecker: Limitando verificación de contraste (presupuesto global agotado; ${elementsToCheck.length} de ${textElements.length} en este documento)`);
    }
```

**3f.** En `getSelectorInRoot`, cambiar el límite del `while` para usar el documento del elemento (`:993`):

```js
    while (el && el !== element.ownerDocument.documentElement && el !== root) {
```

(antes: `el !== document.documentElement`)

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — integración de iframes (`tests/iframe.test.js`), los tests shadow (`tests/shadow-dom.test.js`) y los de `a11y-checker.test.js` sin regresión.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js tests/iframe.test.js
git commit -m "feat: el validador corre por-documento sobre iframes same-origin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 6: `getElementSelector` frame-aware + aviso cross-origin

**Files:**
- Modify: `utils/a11y-checker.js` — `getElementSelector` (prefijo de frame), `check()` (emitir aviso), `getTitle` (título)
- Modify: `utils/i18n.js` (clave `crossOriginIframe` en es/en)
- Modify: `tests/iframe.test.js` (añadir tests)

**Interfaces:**
- Consumes: `resolveDeepSelector` con ` ::iframe:: ` (Task 3); `this._crossOriginCount` (Task 5).
- Produces: `getElementSelector(element)` antepone la cadena de iframes contenedores con ` ::iframe:: `. `check()` emite un único `{ severity: 'info', code: 'crossOriginIframe' }` si `this._crossOriginCount > 0`. `getTitle('crossOriginIframe')` y `i18n.t('crossOriginIframe')` definidos.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/iframe.test.js` (añadir `import { resolveDeepSelector } from '../utils/dom-utils.js';` al inicio):

```js
describe('getElementSelector y aviso cross-origin', () => {
  it('genera selector frame-aware resoluble para un elemento en iframe', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'fr';
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<div><button>x</button></div>';
    const target = iframe.contentDocument.querySelector('button');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel).toContain(' ::iframe:: ');
    expect(resolveDeepSelector(sel)).toBe(target);

    iframe.remove();
  });

  it('emite un aviso info crossOriginIframe con el recuento', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const notice = results.filter(r => r.code === 'crossOriginIframe');
    expect(notice.length).toBe(1);
    expect(notice[0].severity).toBe('info');
    expect(notice[0].description).toContain('1');

    iframe.remove();
  });

  it('getTitle devuelve el título de iframe cross-origin', () => {
    const checker = new A11yChecker();
    expect(checker.getTitle('crossOriginIframe')).toBe('Iframe de origen cruzado');
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/iframe.test.js`
Expected: FAIL — el selector no contiene ` ::iframe:: ` (y no resuelve); no aparece `crossOriginIframe`; `getTitle` devuelve el code.

- [ ] **Step 3: Implementación**

**3a.** Reemplazar `getElementSelector` en `utils/a11y-checker.js` por **dos** métodos. `getSelectorWithinDocument` construye el selector shadow-aware dentro del documento (la lógica que antes tenía `getElementSelector`, sin nada de frames); `getElementSelector` aplica el prefijo de frame **una sola vez** (evita el doble prefijo cuando el elemento está en un shadow root dentro de un iframe):

```js
  getElementSelector(element) {
    try {
      const inDoc = this.getSelectorWithinDocument(element);

      // Si el documento del elemento es el de un iframe, anteponer la ruta del frame una vez
      const view = element.ownerDocument && element.ownerDocument.defaultView;
      const frameEl = view && view.frameElement;
      if (frameEl) {
        return `${this.getElementSelector(frameEl)} ::iframe:: ${inDoc}`;
      }

      return inDoc;
    } catch (_) {
      return element.tagName?.toLowerCase() || '*';
    }
  }

  // Selector shadow-aware dentro del documento del elemento (sin cruzar iframes)
  getSelectorWithinDocument(element) {
    const root = element.getRootNode ? element.getRootNode() : document;
    const segment = this.getSelectorInRoot(element, root);

    // Si el elemento vive en un shadow root, anteponer el selector del host (mismo documento)
    if (root && root.host) {
      return `${this.getSelectorWithinDocument(root.host)} >>> ${segment}`;
    }

    return segment;
  }
```

Nota: la recursión de shadow usa `getSelectorWithinDocument` (sin frames), así que el prefijo ` ::iframe:: ` se añade exactamente una vez por frontera de iframe, incluso para elementos en shadow dentro de un iframe.

**3b.** En `check()`, tras calcular `this._crossOriginCount` y antes (o después) del bucle de contextos, emitir el aviso una vez:

```js
      if (this._crossOriginCount > 0) {
        this.addResult('info', 'crossOriginIframe',
          `${this._crossOriginCount} iframe(s) de origen cruzado no pudieron auditarse (contenido cross-origin)`);
      }
```

**3c.** En `getTitle`, añadir al objeto `titles`:

```js
      crossOriginIframe: 'Iframe de origen cruzado',
```

**3d.** En `utils/i18n.js`, sección Reportes de `es` (tras la última clave, añadiendo la coma correspondiente):

```js
    crossOriginIframe: 'Iframe de origen cruzado no auditable'
```

Y en la sección Reports de `en`:

```js
    crossOriginIframe: 'Cross-origin iframe not auditable'
```

(Asegurar que la clave previa lleva coma y el objeto queda válido; lint lo verifica.)

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — todos.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js utils/i18n.js tests/iframe.test.js
git commit -m "feat: selectores frame-aware y aviso de iframe cross-origin

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 7: Highlight frame-aware (content.js) + documentación

**Files:**
- Modify: `content.js` (`highlightElement` y su handler de scroll)
- Modify: `CLAUDE.md` (Convenciones + Estructura)

**Interfaces:**
- Consumes: `resolveDeepSelector` con ` ::iframe:: ` (Task 3, ya importado dinámicamente en content.js).
- Produces: `highlightElement(selector, severity)` posiciona el overlay correctamente para elementos dentro de iframes same-origin componiendo el offset de los iframes contenedores.

Sin tests unitarios (content.js no se testea — convención). Verificación: lint + suite (sin regresión) + manual.

- [ ] **Step 1: Helper de offset compuesto**

En `content.js`, dentro del IIFE (junto a otras funciones auxiliares del highlight, p. ej. antes de `highlightElement`), añadir:

```js
  // Suma el offset de los iframes contenedores (same-origin) hasta el top.
  // Exacto a un nivel de anidamiento; best-effort para iframes anidados.
  function getFrameOffset(element) {
    let offsetTop = 0;
    let offsetLeft = 0;
    let view = element.ownerDocument && element.ownerDocument.defaultView;
    while (view && view.frameElement) {
      try {
        const r = view.frameElement.getBoundingClientRect();
        offsetTop += r.top;
        offsetLeft += r.left;
      } catch (_) {
        break;
      }
      view = view.frameElement.ownerDocument && view.frameElement.ownerDocument.defaultView;
    }
    return { top: offsetTop, left: offsetLeft };
  }
```

- [ ] **Step 2: Componer coordenadas en el posicionamiento del overlay**

En `highlightElement`, el bloque que posiciona el overlay usa `element.getBoundingClientRect()` (rect en la ventana del elemento). Sumar el offset del frame. Localizar el `currentScrollHandler` (que hoy hace `const r = element.getBoundingClientRect();` y fija `top`/`left` con un `PAD`) y componer:

```js
          const r = element.getBoundingClientRect();
          const fo = getFrameOffset(element);
          const top = r.top + fo.top;
          const left = r.left + fo.left;
          const PAD = 6;
          currentErrorOverlay.style.top  = `${top - PAD}px`;
          currentErrorOverlay.style.left = `${left - PAD}px`;
          currentErrorOverlay.style.width  = `${Math.max(r.width + PAD * 2, 30)}px`;
          currentErrorOverlay.style.height = `${Math.max(r.height + PAD * 2, 30)}px`;
```

Aplicar la misma composición (`r + getFrameOffset(element)`) en cualquier otro punto de `highlightElement`/`buildOverlay` que posicione el overlay a partir de `getBoundingClientRect()` del elemento, para el posicionamiento inicial además del de scroll.

- [ ] **Step 3: Scroll del elemento dentro de su iframe**

El `element.scrollIntoView({ behavior: 'smooth', block: 'center' })` ya existente funciona dentro del iframe (desplaza el iframe internamente). Añadir además, cuando el elemento está en un iframe, un scroll de la página al iframe contenedor más externo. Tras el `scrollIntoView` del elemento:

```js
      try {
        const view = element.ownerDocument && element.ownerDocument.defaultView;
        if (view && view.frameElement) {
          view.frameElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } catch (_) {}
```

- [ ] **Step 4: Verificar sin regresión (lint + suite)**

Run: `npm run lint && npm test`
Expected: lint 0/0; 87 + nuevos tests PASS (content.js no añade tests, pero la suite no debe romperse).

- [ ] **Step 5: Actualizar CLAUDE.md**

En **Estructura del Proyecto**, actualizar la línea de `dom-utils.js`:

```
  dom-utils.js         - Funciones compartidas: calculateTabOrder, compareDOMOrder, getAccessibleName, deepQuerySelectorAll (shadow DOM + baseDoc), resolveDeepSelector ( >>> shadow, ::iframe:: frames), collectFrameContexts
```

En **Estructura del Proyecto** (sección tests), añadir:

```
  iframe.test.js       - Tests de collectFrameContexts, selectores ::iframe:: y auditoría por-documento
```

En **Convenciones**, añadir estos bullets:

```
- El validador audita iframes **same-origin**: `check()` corre por-documento (`collectFrameContexts` enumera `contentDocument` accesibles); cada documento evalúa su propia estructura (encabezados/landmarks) sin falsos positivos
- Iframes **cross-origin** no son auditables: se emite un único resultado `info` (`crossOriginIframe`) con recuento
- Selectores cross-frame usan ` ::iframe:: ` (además del ` >>> ` de shadow); el highlight compone el offset de los iframes contenedores
- Estilos computados se obtienen con `getStyle(el)` (ventana dueña del elemento), no `window.getComputedStyle`, para funcionar en iframes
```

- [ ] **Step 6: Commit**

```bash
git add content.js CLAUDE.md
git commit -m "feat: highlight frame-aware para iframes + docs de auditoría de iframes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

- [ ] **Step 7: Verificación manual (humano en el bucle)**

1. Cargar la extensión sin empaquetar (`chrome://extensions/`, modo desarrollador) en la raíz del repo.
2. Abrir una página con un iframe same-origin (o crear un HTML local con un `<iframe srcdoc="...">` que contenga un `<img>` sin alt).
3. "Validar Accesibilidad" → el problema del iframe aparece en el sidebar.
4. Click en el resultado → scroll + overlay pulse sobre el elemento dentro del iframe, bien posicionado.
5. Página con un iframe cross-origin (p. ej. embed de YouTube) → aparece el aviso `crossOriginIframe` con el recuento.
