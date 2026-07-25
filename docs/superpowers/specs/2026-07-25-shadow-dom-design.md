# Soporte de Shadow DOM en el validador de accesibilidad

**Fecha:** 2026-07-25
**Estado:** Aprobado (diseño validado con el usuario en sesión de brainstorming)

## Problema

El motor de validación (`utils/a11y-checker.js`) consulta el DOM con `document.querySelectorAll`,
que no penetra shadow roots. En páginas construidas con web components (Lit, Stencil, design
systems encapsulados), todo el contenido dentro de shadow DOM queda invisible al análisis **sin
ningún aviso al usuario**: la auditoría parece completa pero no lo es.

Además, aunque se traversara, el flujo de highlight se rompería: `getElementSelector()` genera
selectores CSS que `content.js` resuelve con `document.querySelector()`, y un selector CSS no
puede cruzar una frontera de shadow.

## Alcance

**Incluido:** solo el validador (`a11y-checker.js`) y sus dependencias (`dom-utils.js`,
`content.js` para el highlight, `i18n.js` para las cadenas nuevas).

**Excluido (explícito):**
- `keyboard-nav.js`, `visual-nav.js` y `text-reader.js` siguen sin ver shadow DOM (iteración futura).
- Shadow roots cerrados: no se pueden analizar técnicamente; solo se detectan (heurística) y se avisa.
- Iframes: sin cambios (limitación separada, ver memoria de mejoras pendientes).

## Decisiones de diseño

1. **Enfoque:** utilidad de consulta profunda compartida (`deepQuerySelectorAll`) en vez de
   reescribir los checks con un recorrido único (TreeWalker). Diff mínimo y mecánico por check;
   el rendimiento de recorridos múltiples es irrelevante en páginas reales.
2. **Shadow cerrado:** un único resultado `info` con el recuento de componentes posiblemente
   opacos. Coherente con la filosofía de "no omitir en silencio".
3. **Delimitador de selectores cross-shadow:** ` >>> ` (combinador shadow-piercing histórico,
   reconocible para QA por Playwright; no puede aparecer en un selector CSS válido).

## Componentes

### `utils/dom-utils.js` (nuevas utilidades + 2 modificaciones)

| Función | Tipo | Descripción |
|---|---|---|
| `collectShadowRoots(root = document)` | nueva | Recorre recursivamente y devuelve los shadow roots **abiertos** en orden de documento (host antes que su contenido). Límite de profundidad defensivo: 20 niveles. |
| `deepQuerySelectorAll(selector, roots?)` | nueva | `querySelectorAll` en documento + cada shadow root, resultados concatenados en array (orden compuesto aproximado: documento primero, luego cada root en orden de host). Acepta lista de roots pre-calculada para evitar re-recorridos. |
| `resolveDeepSelector(selector)` | nueva | Resuelve un selector con segmentos ` >>> ` saltando de host en host: `document.querySelector(seg0)` → `.shadowRoot.querySelector(seg1)` → … Devuelve el elemento o `null` si algún salto falla. |
| `compareDOMOrder(a, b)` | modificada | Shadow-aware: si `a` y `b` están en roots distintos, sube por la cadena de hosts (`getRootNode().host`) hasta el ancestro común y compara ahí. Si uno es host (directo o indirecto) del otro, el host precede. Comportamiento actual intacto para elementos del mismo root. |
| `getAccessibleName(element)` | modificada | `aria-labelledby` y `label[for]` se resuelven contra `element.getRootNode()` (Document o ShadowRoot, ambos tienen `getElementById`) en vez de `document`. |

### `utils/a11y-checker.js`

- `check()` recolecta los shadow roots **una sola vez** al inicio (`this._shadowRoots =
  collectShadowRoots()`) y los descarta al final (el DOM cambia entre validaciones).
- Los 9 checks cambian `document.querySelectorAll(x)` por
  `deepQuerySelectorAll(x, this._shadowRoots)` — un cambio de línea por punto de consulta
  (~10 puntos). El check de landmarks que usa `document.querySelector(sel)` para existencia
  pasa a comprobar `deepQuerySelectorAll(sel, roots).length > 0`.
- `checkFormLabels`: la búsqueda `label[for="id"]` se hace dentro del root del input
  (`input.getRootNode()`), no en `document`.
- `getElementSelector(element)`: genera selectores por segmentos separados por ` >>> `.
  Cada segmento usa la lógica actual (ID como ancla, `nth-of-type`, profundidad máx. 6) pero
  **acotada al root del elemento**: la caminata para en el ShadowRoot y la verificación usa
  `root.querySelector()`. Si el root es un shadow root, se antepone recursivamente el selector
  del host + ` >>> `. Elementos del documento principal: formato sin cambios (compatibilidad
  total con reportes JSON/CSV/HTML existentes).
- **Aviso de shadow cerrado:** tras recolectar roots, detectar custom elements posiblemente
  opacos con esta heurística: tag con guion + sin `shadowRoot` accesible + sin hijos elemento
  en el DOM ligero + tamaño renderizado > 0. Si hay ≥1, emitir **un único resultado** con
  `severity: 'info'` y el recuento. No ligado a ninguna de las 9 categorías (se emite siempre
  que se detecte). El texto refleja la incertidumbre ("posiblemente").

### `content.js`

- `highlightElement()`: sustituye `document.querySelector(selector)` por
  `resolveDeepSelector(selector)` (importada de `dom-utils.js`). Salto fallido → camino
  existente de "elemento no encontrado" con warning. El overlay usa `getBoundingClientRect()`,
  que ya devuelve coordenadas del layout compuesto: scroll, pulse y badge sin cambios.

### `utils/i18n.js`

- Nueva cadena (es/en): aviso de shadow cerrado con recuento, p. ej.
  `closedShadowInfo`: "N componente(s) con shadow DOM cerrado detectados — su contenido no
  pudo ser auditado" / "N component(s) with closed shadow DOM detected — their content could
  not be audited".

## Flujo de datos

1. `check()` → `collectShadowRoots()` (1 recorrido) → cada check consulta con
   `deepQuerySelectorAll(sel, roots)`.
2. Resultado con elemento en shadow → `getElementSelector()` produce
   `host-selector >>> inner-selector`.
3. Click en el sidebar → mensaje `highlightElement` con ese selector → `content.js` →
   `resolveDeepSelector()` → overlay sobre el elemento.

## Manejo de errores

- Patrón defensivo del código existente: `try/catch` con fallback seguro, null-safe.
- `collectShadowRoots`: si algo lanza, devuelve lo recopilado hasta ese punto.
- `resolveDeepSelector`: `null` en cualquier fallo; el caller ya lo maneja.
- `compareDOMOrder` sin ancestro común (no debería ocurrir): fallback visual existente
  (`getBoundingClientRect`).
- El `try/catch` global de `check()` se mantiene: ningún check nuevo rompe la validación.

## Rendimiento

- 1 recorrido de recolección por validación (antes: 0; coste equivalente a un check más).
- Sin web components: `collectShadowRoots` → `[]`, `deepQuerySelectorAll` degrada al
  comportamiento plano actual.
- Sin caché entre validaciones (el DOM muta).

## Testing

Convención del proyecto: tests **antes** de tocar `a11y-checker.js` o `dom-utils.js`.

Nuevo `tests/shadow-dom.test.js` (jsdom soporta `attachShadow`):

- `collectShadowRoots`: roots anidados; ignora cerrados; respeta límite de profundidad.
- `deepQuerySelectorAll`: encuentra en roots anidados; orden documento-primero; roots `[]` =
  comportamiento plano.
- `compareDOMOrder`: cross-root ordenado por posición de hosts; host precede a su contenido;
  sin regresión en casos del mismo root (tests existentes).
- `getAccessibleName`: `aria-labelledby` y `label[for]` dentro del shadow root.
- `resolveDeepSelector`: rutas ` >>> ` de 2-3 niveles; `null` en saltos rotos.
- Heurística de shadow cerrado: jsdom no calcula layout → mockear `getBoundingClientRect`
  del elemento en el test.

Criterio de salida: los 40 tests existentes + los nuevos en verde; `npm run lint` en 0/0.
