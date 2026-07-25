# Auditoría de iframes same-origin — Diseño

**Fecha:** 2026-07-25
**Estado:** Aprobado
**Ámbito:** `utils/dom-utils.js`, `utils/a11y-checker.js`, `utils/i18n.js`, `content.js`, `tests/`

## Problema

El validador de accesibilidad solo analiza el frame principal. El contenido embebido en
`<iframe>` (pagos, chats, vídeos, widgets) no se audita. `content.js` está inyectado en todos
los frames (`all_frames: true`) pero guards deliberados `window !== window.top` confinan toda la
acción al top (`content.js:109`, `:140`, `:267`), y el validador usa `deepQuerySelectorAll`
(document + shadow roots), que **no cruza** a documentos de iframe.

## Decisiones de diseño (aprobadas)

1. **Alcance:** auditar iframes **same-origin** (accesibles vía `contentDocument`, incluidos
   `srcdoc`/`about:blank`); los **cross-origin** (o sandbox de origen opaco) generan un aviso
   `info` con recuento (patrón `closedShadow`). No se audita contenido cross-origin.
2. **Ejecución por-documento:** el validador corre completo y aislado sobre cada documento
   accesible. Cada iframe evalúa su propia jerarquía de encabezados, su propio `main` y sus
   landmarks — sin falsos positivos por fusión de documentos.
3. **Highlight frame-aware completo:** el click en un resultado dentro de un iframe resuelve el
   elemento cruzando a `contentDocument`, compone el offset del iframe y dibuja el overlay en el
   top.
4. **Centralizado en el top:** todo se ejecuta en el frame principal. Los guards
   `window !== window.top` se quedan intactos; **sin cambios** en mensajería, `background.js`,
   `popup.js` ni `manifest.json`. Los `content.js` de subframes siguen pasivos.
5. **Cap de contraste global:** `maxElements = 100` pasa a ser un acumulado global entre
   documentos (contador de instancia), no 100 por iframe.

## Arquitectura

### Recolección de contextos (`utils/dom-utils.js`)

- **`collectFrameContexts(rootDoc = document, framePath = [])`** → `{ contexts, crossOriginCount }`.
  - `contexts`: array de `{ doc, framePath }`, empezando por `{ rootDoc, framePath }`.
  - Busca iframes con `deepQuerySelectorAll('iframe', collectShadowRoots(rootDoc), rootDoc)`
    (encuentra también los de dentro de shadow roots).
  - Por cada iframe: `let d; try { d = iframe.contentDocument; } catch (_) { d = null; }`.
    Si `d` → recursa con `framePath` = `[...framePath, iframe]` y concatena contextos +
    `crossOriginCount`. Si `d` es `null` → `crossOriginCount++`.
- **`deepQuerySelectorAll(selector, roots = null, baseDoc = document)`** — gana un tercer
  parámetro `baseDoc` (retrocompatible: llamadores actuales `(sel, roots)` no cambian).
  Internamente consulta `baseDoc.querySelectorAll(selector)` en vez del `document` global;
  `roots = roots || collectShadowRoots(baseDoc)`.

### Refactor del checker (`utils/a11y-checker.js`)

- **`getStyle(el)`** = `(el.ownerDocument?.defaultView || window).getComputedStyle(el)`. Sustituye
  **todas** las llamadas `window.getComputedStyle(...)` en los checks (`checkContrast`,
  `getTextElements`, `checkHeadings`, `checkKeyboardAccess`, `checkTabOrder`, `getBackgroundInfo`).
  Necesario: `getComputedStyle` debe invocarse sobre la ventana dueña del elemento (la del iframe).
- **`check(categories)`**:
  1. `this.results = []`.
  2. `const { contexts, crossOriginCount } = collectFrameContexts(document);`
  3. Si `crossOriginCount > 0` → `addResult('info', 'crossOriginIframe', ...)` una vez.
  4. Por cada `ctx` de `contexts`: fija `this._currentDoc = ctx.doc`, `this._framePath =
     ctx.framePath`, `this._shadowRoots = collectShadowRoots(ctx.doc)`; ejecuta
     `detectClosedShadowComponents()` + los checks habilitados (scoped a ese doc).
  5. `finally`: resetea `this._currentDoc`, `this._framePath`, `this._shadowRoots` a `null`.
  6. `this._contrastBudget = 100` inicializado en `check()` (antes del bucle de contextos).
     `checkContrast` procesa como mucho `this._contrastBudget` elementos de su documento y resta
     los procesados: `const elementsToCheck = textElements.slice(0, this._contrastBudget);
     this._contrastBudget -= elementsToCheck.length;`. Así el tope de 100 es acumulado entre todos
     los documentos. Reseteado a `null` en el `finally` junto a los demás campos de instancia.
- **Los 9 checks + `getTextElements`**: `deepQuerySelectorAll(sel, this._shadowRoots)` →
  `deepQuerySelectorAll(sel, this._shadowRoots, this._currentDoc)`. Referencias a
  `document`/`document.body`/`document.documentElement` (en `getBackgroundInfo`, `getTextElements`,
  `checkLandmarks`) → `this._currentDoc` o `el.ownerDocument`.
- **`getBackgroundInfo(element)`**: tope del `while` en `element.ownerDocument.documentElement`;
  fallback de body en `element.ownerDocument.body`; estilos vía `getStyle`.

### Selectores frame-aware

- **Delimitador de frame:** ` ::iframe:: ` (distinto del ` >>> ` de shadow). Un selector puede
  combinar ambos: `#cont ::iframe:: #host >>> button`.
- **`getElementSelector(element)`** (a11y-checker.js): genera el selector shadow-aware dentro de
  `element.ownerDocument` (ownerDocument para el tope y la verificación `root.querySelector`). Si
  el documento es de un iframe, antepone recursivamente por `element.ownerDocument.defaultView
  .frameElement`: `getElementSelector(frameElement) + ' ::iframe:: ' + selectorInterno`, hasta el
  top.
- **`resolveDeepSelector(selector)`** (dom-utils.js): se generaliza — divide primero por
  ` ::iframe:: ` (saltos de frame). Resuelve cada segmento (shadow-aware, con la lógica ` >>> `
  actual) en el documento contexto para obtener el `<iframe>`, desciende a `iframe.contentDocument`
  (null-guard → `null`), y en el último segmento resuelve el elemento. Compatible hacia atrás con
  selectores sin ` ::iframe:: `.

### Highlight (`content.js`)

- `highlightElement` resuelve el elemento (posiblemente en un `contentDocument`).
- **Coordenadas compuestas:** recorre la cadena `element.ownerDocument.defaultView.frameElement`
  acumulando `getBoundingClientRect()` de cada iframe contenedor; suma al rect del elemento para
  posicionar el overlay en el top. Exacto a un nivel de anidamiento; best-effort documentado para
  iframes anidados (caso raro).
- Scroll del elemento dentro de su iframe + scroll de la página al iframe contenedor. El handler de
  reposición-en-scroll recalcula las coordenadas compuestas y se suscribe también al scroll de la(s)
  ventana(s) de iframe. Se mantiene el guard `window.top` y `element.isConnected` (composed-aware).
- `content.js` no tiene tests unitarios (convención): esta parte se valida **manualmente**.

## Mensaje e i18n

- **Código:** `crossOriginIframe`, severidad `info`.
- **`getTitle`:** `crossOriginIframe: 'Iframe de origen cruzado'`.
- **Descripción** (hardcodeada en español): `${n} iframe(s) de origen cruzado no pudieron auditarse
  (contenido cross-origin)`.
- **`i18n.js`** (sección Reportes, es/en):
  - es: `crossOriginIframe: 'Iframe de origen cruzado no auditable'`
  - en: `crossOriginIframe: 'Cross-origin iframe not auditable'`

## Testing

Nuevo `tests/iframe.test.js` (jsdom soporta iframes same-origin vía `srcdoc`/`contentDocument`):

1. **`collectFrameContexts`**: sin iframes → `[{doc: document, framePath: []}]`, `crossOriginCount`
   0. Con un iframe `srcdoc` same-origin → 2 contextos, `framePath` del segundo = `[iframe]`.
   Iframe anidado → 3 contextos. Iframe con `contentDocument` mockeado a `null` → `crossOriginCount`
   1.
2. **`deepQuerySelectorAll(sel, roots, baseDoc)`**: consulta el `baseDoc` dado en vez del global.
3. **`getElementSelector` frame-aware**: elemento dentro de un iframe `srcdoc` → selector con
   ` ::iframe:: `, resoluble ida y vuelta con `resolveDeepSelector`. Caso combinado con shadow
   dentro del iframe.
4. **`resolveDeepSelector`**: resuelve rutas con ` ::iframe:: `; `null` si el iframe no es accesible
   (mock `contentDocument = null`).
5. **Integración `A11yChecker.check`**: iframe `srcdoc` con `<img>` sin alt → un `noAltText`;
   encabezados independientes por documento (`<h1>` en top + `<h1>` en iframe **no** disparan
   `invalidHeadingOrder`); aviso `crossOriginIframe` con iframe inaccesible mockeado.

Los tests de estilos (contraste/visibilidad) que dependan de `getComputedStyle`/`getStyle` en
iframes se mockean como en la mejora #2. `getBoundingClientRect` sigue a 0 en jsdom → el highlight
se valida manualmente.

## Constraints globales

- Node >= 22; `npm run lint` en 0/0; `npm test` en verde (87 existentes + nuevos).
- Comentarios y strings de UI en español; código en inglés. `description` hardcodeada en español;
  solo `title` sale de `i18n`.
- Logging vía `utils/logger.js`; catch sin uso nombrado `_`.
- Tests antes de tocar `a11y-checker.js`/`dom-utils.js` (TDD).

## Fuera de alcance

- Auditar iframes **cross-origin** (requeriría content script por-frame + mensajería/dedup +
  highlight cross-frame frágil; descartado en brainstorming).
- Cambios en guards, mensajería, `background.js`, `popup.js`, `manifest.json`.
- Offset exacto para iframes anidados de 2+ niveles (best-effort).

## Verificación manual (humano en el bucle)

1. Cargar la extensión sin empaquetar apuntando a la raíz del repo.
2. Página con un iframe same-origin (o `srcdoc`) que contenga un problema (p. ej. `<img>` sin alt).
3. "Validar Accesibilidad" → el problema del iframe aparece en el sidebar.
4. Click en el resultado → scroll + overlay pulse sobre el elemento dentro del iframe, posicionado
   correctamente.
5. Página con un iframe cross-origin (p. ej. un embed de YouTube) → aparece el aviso
   `crossOriginIframe` con el recuento.
