# A11yGo - Extensión de Accesibilidad Web para Chrome

## Licencia
MIT — ver [LICENSE](LICENSE)

## Descripción
Extensión de Chrome (Manifest V3) orientada a QA testers para evaluar y mejorar la accesibilidad web. Proporciona 4 herramientas principales: lector de texto, navegación por teclado, navegación visual y validación automática WCAG.

## Stack Tecnológico
- JavaScript vanilla (ES modules)
- Chrome Extension Manifest V3
- Web Speech API (text-to-speech)
- CSS moderno
- Arquitectura: popup → content script → sidebar (side panel)
- Vitest + jsdom (testing)
- esbuild (minificación)
- ESLint 9 (linting)

## Estructura del Proyecto
```
manifest.json          - Configuración de la extensión (MV3)
popup.html/js/css      - Menú principal (selector de función + idioma + indicador de función activa)
sidebar.html/js/css    - Panel lateral con controles, resultados, config de categorías y exportación
content.js             - Orquestador: carga módulos, gestiona activación/desactivación
background.js          - Service worker (type: module): routing de mensajes, reinyección en SPAs
utils/
  dom-utils.js         - Funciones compartidas: calculateTabOrder, compareDOMOrder, getAccessibleName, deepQuerySelectorAll (shadow DOM + baseDoc), resolveDeepSelector ( >>> shadow, ::iframe:: frames), collectFrameContexts
  logger.js            - Logger condicional (log/warn silenciados sin flag de debug; error() siempre visible)
  i18n.js              - Internacionalización (es/en)
  text-reader.js       - Lector TTS con detección de idioma y navegación de contenido
  keyboard-nav.js      - Navegación Tab/Shift+Tab con orden WCAG correcto
  visual-nav.js        - Overlays visuales de elementos focusables y orden de tabulación
  a11y-checker.js      - Motor de validación (imágenes, contraste, gradientes, forms, headings, ARIA, etc.)
tests/
  setup.js             - Mocks de Chrome API y CSS.escape para jsdom
  dom-utils.test.js    - Tests de calculateTabOrder, compareDOMOrder, getAccessibleName, hasHiddenAncestor
  a11y-checker.test.js - Tests de parseColor, rgbToLuminance, calculateContrast
  shadow-dom.test.js   - Tests de traversal shadow DOM, selectores >>> y heurística de shadow cerrado
  iframe.test.js       - Tests de collectFrameContexts, selectores ::iframe:: y auditoría por-documento
  content.test.js      - Tests del orquestador: routing de mensajes, exclusión mutua, highlight, focusin
  content-failure.test.js - Tests de content.js con contexto de extensión inválido
  text-reader.test.js  - Tests del lector TTS: idioma, formateo, nombres accesibles, deduplicación, readToken
  keyboard-nav.test.js - Tests de navegación Tab/Shift+Tab: orden WCAG, saltos, tabindex inyectado, tooltip
  visual-nav.test.js   - Tests de overlays visuales: filtrado de focusables, orden numérico, historial
  logger.test.js       - Tests del logger condicional: log/warn respetan el flag, error() siempre imprime
  stubs/a11y-modules.js - Stubs de los 4 módulos de herramientas (registran llamadas sin depender de vitest)
test-fixtures/         - Páginas HTML para verificación manual en navegador (shadow DOM + iframes); ver test-fixtures/README.md
.github/workflows/     - CI: lint + tests + build en cada push y PR a master (ci.yml)
icons/                 - Iconos en 16/48/128px (PNG + SVG)
package.json           - Scripts: test, build, lint, package
eslint.config.js       - ESLint flat config para Chrome extensions
vitest.config.js       - Configuración Vitest con jsdom
build.js               - Script esbuild: minifica JS → dist/ (--package genera ZIP para Web Store)
.gitignore             - Excluye node_modules, dist, *.zip, *.crx, *.pem, .claude/
LICENSE                - Licencia MIT
PRIVACY.md             - Política de privacidad (es/en) para la Chrome Web Store; contacto sidmaierlabs@gmail.com
```

## Arquitectura de Comunicación
- **Popup → Content**: `chrome.tabs.sendMessage` para activar funciones; el popup recibe `success: true/false` y muestra error en fallos reales
- **Content → Sidebar**: `chrome.runtime.sendMessage` para actualizar UI (historial, resultados)
- **Background**: Relay de mensajes (con `sendResponse` explícito) + reinyección de content.js en navegaciones SPA (`await` en `executeScript`)
- **Desactivación**: Cada módulo escucha Escape → llama `this.onDeactivate()` (callback asignado por content.js al instanciar) + notifica al sidebar vía `runtime.sendMessage`. Los callbacks limpian `activeFunctions` y resetean `activePanel` en storage.
- **Highlight de errores**: Click en resultado del sidebar → scroll + overlay animado (pulse) sobre el elemento en la página, con badge de severidad (12s auto-remove). Enviado con `frameId: 0` y guard `window.top`.
- **Historiales**: Sidebar mantiene historiales independientes por herramienta (textReader, keyboardNav, visualNav) con deduplicación y límite de 20 entradas. Filtra mensajes por `sender.tab.id` para evitar contaminación entre pestañas.

## Permisos
activeTab, scripting, storage, sidePanel, webNavigation + host_permissions: <all_urls>

## Convenciones
- Idioma del código: comentarios y UI en español, código en inglés
- Cada módulo es una clase ES6 exportada con métodos `activate()` / `deactivate()`
- Prevención de múltiples inyecciones via `window.a11yGoContentScriptLoaded`
- Sistema de deduplicación en TextReader para evitar lecturas redundantes
- Orden de tabulación calculado según spec WCAG (tabindex positivo → DOM order)
- Funciones compartidas (DOM utilities) van en `utils/dom-utils.js`
- Todo logging pasa por `utils/logger.js` — nunca usar console.log directamente
- Debug se activa con: `chrome.storage.local.set({ a11yGoDebug: true })`
- `logger.error()` **nunca** se silencia: un fallo real debe ser diagnosticable sin activar el debug. `log()` y `warn()` sí dependen del flag
- Contexto de extensión invalidado (la extensión se recarga con la página abierta): `safeSendMessage`/`safeStorageSet` en `content.js` lo detectan vía `isExtensionContextValid()` y muestran **una sola vez** un aviso `role="alert"` (`#a11ygo-context-invalidated`, solo en el frame principal) con el texto `i18n.t('contextInvalidated')`. Sin él la extensión falla en silencio: el lector sigue hablando (Web Speech API no depende de la extensión) mientras el panel deja de recibir datos
- La detección anterior es además **proactiva**: `startContextWatch()` comprueba el contexto cada 5 s mientras hay una herramienta activa (`stopContextWatch()` en `deactivateAll`). Hace falta porque leer con el hover no envía mensajes ni escribe en storage, así que una detección puramente reactiva nunca saltaría
- Ningún módulo debe inyectar `tabindex` en elementos con ancestros ocultos o `aria-hidden`: al enfocarlos Chrome bloquea el `aria-hidden` y avisa en consola (una herramienta de accesibilidad provocando una violación). `keyboard-nav.js`, `visual-nav.js` y `makeContentElementsFocusable()` de `text-reader.js` usan todos `hasHiddenAncestor()`
- El resaltado del lector (`highlightText(text, element)`) busca **solo dentro del elemento leído**, no en todo el documento; si el texto está repartido entre varios nodos (marcado anidado) resalta el elemento entero vía `highlightWholeElement()` en vez de no resaltar nada. `read(text, element)` propaga el elemento hasta el `onstart` del utterance
- `content.js` carga `i18n` junto al resto de módulos —con el contexto todavía válido— para poder traducir ese aviso cuando ya no queden APIs disponibles
- Popup muestra indicador visual (punto azul) en el botón de la función activa
- Categorías de validación (9) configurables y persistentes en `chrome.storage.local`
- Exportación de reportes en 3 formatos: JSON, CSV (con BOM UTF-8 y sanitización anti-inyección) y HTML
- Contraste sobre gradientes: valida contra cada color stop (worst-case); sobre imágenes de fondo emite warning
- Colores modernos no soportados (`oklch`/`oklab`/`lab`/`lch`/`color()`) emiten warning `unsupportedColor` en vez de omitirse en silencio; `describeUnsupportedColor` clasifica el formato y `getBackgroundInfo` marca gradientes con stops no extraíbles como `{ type: 'unsupported' }`
- Ciclo de vida de módulos usa `onDeactivate` callbacks (asignados por content.js) en vez de mensajería circular
- `getAccessibleName` sigue precedencia [accname 1.2](https://www.w3.org/TR/accname-1.2/): labelledby → label → aria-label → alt → texto → title
- `parseColor` retorna `null` para formatos no reconocidos (el caller omite el elemento) y compone alpha sobre fondo
- `read()` del TTS usa token de invocación (`readToken`) para prevenir carreras entre llamadas concurrentes
- `storage.onChanged` mantiene debug y lenguaje sincronizados en caliente en sidebar y logger
- Toda cadena visible al usuario usa `i18n.t()` — sin strings hardcodeados
- Parámetro de catch sin uso se nombra `_` (ESLint lo ignora vía `caughtErrorsIgnorePattern`)
- `npm run lint` debe quedar en 0 errores y 0 warnings antes de cualquier commit
- El validador traversa shadow DOM **abierto**: `check()` recolecta roots una vez (`collectShadowRoots`) y los checks consultan con `deepQuerySelectorAll`
- Selectores cross-shadow usan segmentos ` >>> ` (generados por `getElementSelector`, resueltos por `resolveDeepSelector` en el highlight)
- Shadow roots cerrados no son analizables: se emite un único resultado `info` (`closedShadow`) con recuento heurístico
- El validador audita iframes **same-origin**: `check()` corre por-documento (`collectFrameContexts` enumera `contentDocument` accesibles); cada documento evalúa su propia estructura (encabezados/landmarks) sin falsos positivos
- Iframes **cross-origin** no son auditables: se emite un único resultado `info` (`crossOriginIframe`) con recuento
- Selectores cross-frame usan ` ::iframe:: ` (además del ` >>> ` de shadow); el highlight compone el offset de los iframes contenedores
- Estilos computados se obtienen con `getStyle(el)` (ventana dueña del elemento), no `window.getComputedStyle`, para funcionar en iframes

## Storage Keys (`chrome.storage.local`)
- `language` — Idioma de la interfaz (`es` | `en`)
- `activePanel` — Función activa actual (`textReader` | `keyboardNav` | `visualNav` | `a11yCheck` | `default`)
- `a11yCheckCategories` — Objeto con 9 categorías habilitadas/deshabilitadas
- `a11yGoDebug` — Activa logging de debug (`true` | `false`)
- `textReaderSpeed` — Velocidad del lector TTS (0.5–2.0)

## Cobertura WCAG 2.1

Referencia: https://www.w3.org/TR/WCAG21/ (78 criterios: 30 A, 20 AA, 28 AAA)

A11yGo cubre **15 criterios** (9 A + 4 AA + 2 AAA ≈ 19%) combinando validación automática y testing manual asistido.

### Principio 1: Perceptible

| Criterio | Nivel | Herramienta |
|---|---|---|
| 1.1.1 Non-text Content | A | `checkImages()` detecta img sin alt/aria-label. TextReader lee nombres accesibles |
| 1.3.1 Info and Relationships | A | `checkHeadings()`, `checkLandmarks()`, `checkARIA()`, `checkFormLabels()` validan estructura semántica |
| 1.3.2 Meaningful Sequence | A | `checkTabOrder()` detecta tabindex duplicados, saltos y mezcla positivo/natural |
| 1.4.3 Contrast (Minimum) | AA | `checkContrast()` calcula ratio 4.5:1 / 3:1 (texto grande), incluye gradientes y warning en imágenes de fondo |
| 1.4.6 Contrast (Enhanced) | AAA | Reporta ratios exactos para evaluar cumplimiento de 7:1 |

### Principio 2: Operable

| Criterio | Nivel | Herramienta |
|---|---|---|
| 2.1.1 Keyboard | A | `checkKeyboardAccess()` detecta elementos con tabindex="-1". KeyboardNav permite verificación manual |
| 2.4.1 Bypass Blocks | A | `checkLandmarks()` verifica presencia de main, nav, header, footer y roles ARIA |
| 2.4.3 Focus Order | A | `checkTabOrder()` valida orden lógico. VisualNav muestra orden numérico superpuesto |
| 2.4.4 Link Purpose (In Context) | A | `checkLinks()` detecta enlaces vacíos, texto genérico ("click here", "leer más") y texto corto |
| 2.4.6 Headings and Labels | AA | `checkHeadings()` valida jerarquía h1→h6. `checkFormLabels()` verifica asociación label-input |
| 2.4.7 Focus Visible | AA | KeyboardNav y VisualNav resaltan visualmente el elemento con foco |
| 2.4.9 Link Purpose (Link Only) | AAA | Detección de texto genérico en enlaces |

### Principio 3: Comprensible

| Criterio | Nivel | Herramienta |
|---|---|---|
| 3.1.1 Language of Page | A | TextReader detecta idioma de la página para TTS |
| 3.3.2 Labels or Instructions | A | `checkFormLabels()` detecta inputs sin label y anti-patrón placeholder-as-label |

### Principio 4: Robusto

| Criterio | Nivel | Herramienta |
|---|---|---|
| 4.1.2 Name, Role, Value | A | `checkARIA()` verifica nombres accesibles en roles interactivos y valores ARIA válidos |

### Criterios no cubiertos

Los 63 criterios restantes requieren juicio humano (multimedia 1.2.x, timing 2.2.x, contexto semántico 3.2.x) o análisis de comportamiento dinámico (pointer gestures 2.5.x, reflow 1.4.10). Esto es comparable a herramientas profesionales como axe-core o Lighthouse que cubren ~30-40% de WCAG automáticamente.

## Desarrollo
1. Cargar como extensión sin empaquetar en `chrome://extensions/`
2. Activar modo desarrollador
3. `npm install` para dependencias de desarrollo (requiere Node 22+, declarado en `engines`)
4. `npm run lint` — ejecutar ESLint
5. `npm test` — ejecutar tests unitarios (277 tests)
6. `npm run build` — generar dist/ minificado para producción
7. `npm run package` — build + generar ZIP listo para Chrome Web Store

## Testing
- Framework: Vitest con jsdom
- **277 tests unitarios** — todos los módulos principales cubiertos: motor de validación (parseColor, calculateContrast, rgbToLuminance, describeUnsupportedColor), utilidades DOM (calculateTabOrder, compareDOMOrder, getAccessibleName, hasHiddenAncestor), el logger condicional (`tests/logger.test.js`: log/warn respetan el flag, error() siempre imprime), traversal de shadow DOM (deepQuerySelectorAll, resolveDeepSelector, selectores >>>), auditoría de iframes (collectFrameContexts, selectores ::iframe::, checks por-documento), el orquestador `content.js` (routing de mensajes, exclusión mutua, callbacks onDeactivate, highlight con timers, handler focusin, contexto inválido), el lector `text-reader.js` (detección de idioma, formatTextForSpeech, normalización anti-deletreo, getAccessibleName/getElementType, deduplicación, reentrancia de read() vía readToken, reintento de voces), `keyboard-nav.js` (orden WCAG, navegación Tab/Shift+Tab con wrap-around, saltos de ocultos/eliminados, inyección y restauración de tabindex, tooltip, MutationObserver con debounce) y `visual-nav.js` (filtrado de contenedores no interactivos, overlays y orden numérico, highlight de foco, historial con dedup y límite de 20)
- `content.js` se testea cargándolo como script de efectos: `chrome.runtime.getURL` se redirige a `tests/stubs/a11y-modules.js` (stubs de los 4 módulos) y a logger/dom-utils reales; el listener de mensajes se captura del mock de `chrome.runtime.onMessage`
- `text-reader.js` se testea con `speechSynthesis`/`SpeechSynthesisUtterance` mockeados y fake timers para la lógica async (readToken, timer de reintento de voces, hover de 500ms)
- `keyboard-nav.js` y `visual-nav.js` se testean stubbeando lo que jsdom no implementa (`getBoundingClientRect`, `scrollIntoView`, `ResizeObserver`, `requestAnimationFrame`); el foco real de jsdom valida la navegación completa
- Mocks de Chrome API en `tests/setup.js`
- Ejecutar: `npm test` o `npm run test:watch` (requiere Node 22+)
- Antes de tocar `a11y-checker.js` o `dom-utils.js`, añadir un test en `tests/` que reproduzca el bug

## Correcciones realizadas (Jul 2026)

Bug hunt con 4 revisores en paralelo + verificación manual de cada hallazgo contra el código.
Las 30 incidencias documentadas en **[`docs/archive/bugfix-plan-2026-07.md`](./docs/archive/bugfix-plan-2026-07.md)**
(archivado; documento histórico, no lista de tareas) fueron resueltas en
4 fases. Resumen de las correcciones clave:

### Ciclo de vida (Fase 1)
- `onDeactivate` callbacks asignados por `content.js` — los módulos ya no dependen de `runtime.sendMessage` para notificar su propia desactivación
- TTS verifica `isActive` tras cada `await`; timer de reintento cancelado en `deactivate()`
- KeyboardNav trackea tabindex inyectados en `Map` y los restaura en `deactivate()`
- `activateFunctionDirectly` devuelve boolean; popup recibe `success: false` en fallos reales

### Motor de validación (Fase 2)
- `parseColor`: soporta alpha de `rgba()`/`hsla()`, hex 3/4/8 dígitos, retorna `null` para `oklch`/`lab`/`color()`
- `calculateContrast`: compone alpha del foreground sobre el background; null-safe
- `getDOMPosition` reemplazado por `compareDOMOrder` de `dom-utils.js`
- Falsos positivos corregidos: `alt=""` con `role=presentation`, `aria-checked="mixed"`, enlaces genéricos, `input type=image/reset`
- `getAccessibleName` reordenado según spec accname 1.2
- `getElementSelector`: `:nth-of-type` calcula índice entre hermanos, no global

### Mensajería y sidebar (Fase 3)
- Fallo de validación muestra mensaje de error (`checkFailedError`) en vez de "sin problemas"
- `activeTabId` eliminado — `sendToContent` consulta siempre `chrome.tabs.query`
- Mensajes a content script usan `{frameId: 0}`; `highlightElement` con guard `window.top`
- `background.js` llama `sendResponse` tras relay; `onClicked` inalcanzable eliminado
- Sidebar filtra mensajes por `sender.tab.id` contra pestaña activa
- `i18n.notSupportedPage` y `i18n.checkFailedError` añadidas

### Pulido (Fase 4)
- VisualNav: `updateSetting` no-op si inactivo; rAF ID guardado y cancelado
- TextReader: highlight sin duplicar texto; polling de voces limitado (20 intentos) + restaurar handler previo
- `read()` reentrante vía `readToken`; idioma recalculado por lectura (no cacheado)
- CSV: prefijo `'` en celdas con `=+-@\t\r` + BOM `\uFEFF`
- Historial lector con dedup funcional; `storage.onChanged` en sidebar y logger
- Strings de UI migrados a `i18n.t()`; MutationObserver debounce cancelado correctamente

## Hallazgos de las pasadas manuales en navegador (Ago 2026)

Cinco bugs que **ningún test unitario podía destapar**: salieron de usar la extensión en sitios
reales (github.com el 04/08, bershka.com el 07/08). Todos corregidos con TDD y documentados con su
reproducción en [`docs/verificacion-manual.md`](./docs/verificacion-manual.md) § Hallazgos.

| # | Problema | Corrección |
|---|---|---|
| H1 | El filtro de focusables no miraba los ancestros: contaba como navegables elementos dentro de menús desplegables cerrados | Helper compartido `hasHiddenAncestor()` en `dom-utils.js`, usado por `keyboard-nav`, `visual-nav` y `text-reader` |
| H2 | `warn()`/`error()` ignoraban el flag de debug | `log()` y `warn()` lo respetan; **`error()` nunca se silencia** |
| H3 | Con el contexto de extensión invalidado, A11yGo fallaba en silencio absoluto | `isExtensionContextValid()` + aviso en página, con vigilancia proactiva cada 5 s |
| H4 | El resaltado del lector se saltaba elementos con el texto repartido entre varios nodos | `highlightText(text, element)` acotado al elemento leído, con resaltado del elemento completo como fallback |
| H5 | El lector inyectaba `tabindex` dentro de contenedores `aria-hidden` y Chrome bloqueaba el `aria-hidden` | `hasHiddenAncestor()` también en `makeContentElementsFocusable()` |

**Lección operativa que costó una sesión entera:** recargar la extensión deja huérfanos los content
scripts de las pestañas ya abiertas. A partir de ahí toda llamada `chrome.*` lanza, pero el lector
sigue hablando porque la Web Speech API no depende de la extensión — la extensión aparenta
funcionar mientras no registra nada. **Tras recargar la extensión, recargar siempre las pestañas.**
