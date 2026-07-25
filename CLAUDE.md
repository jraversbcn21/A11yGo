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
  logger.js            - Logger condicional (debug silenciado en producción)
  i18n.js              - Internacionalización (es/en)
  text-reader.js       - Lector TTS con detección de idioma y navegación de contenido
  keyboard-nav.js      - Navegación Tab/Shift+Tab con orden WCAG correcto
  visual-nav.js        - Overlays visuales de elementos focusables y orden de tabulación
  a11y-checker.js      - Motor de validación (imágenes, contraste, gradientes, forms, headings, ARIA, etc.)
tests/
  setup.js             - Mocks de Chrome API y CSS.escape para jsdom
  dom-utils.test.js    - Tests de calculateTabOrder, compareDOMOrder, getAccessibleName
  a11y-checker.test.js - Tests de parseColor, rgbToLuminance, calculateContrast
  shadow-dom.test.js   - Tests de traversal shadow DOM, selectores >>> y heurística de shadow cerrado
  iframe.test.js       - Tests de collectFrameContexts, selectores ::iframe:: y auditoría por-documento
test-fixtures/         - Páginas HTML para verificación manual en navegador (shadow DOM + iframes); ver test-fixtures/README.md
icons/                 - Iconos en 16/48/128px (PNG + SVG)
package.json           - Scripts: test, build, lint, package
eslint.config.js       - ESLint flat config para Chrome extensions
vitest.config.js       - Configuración Vitest con jsdom
build.js               - Script esbuild: minifica JS → dist/ (--package genera ZIP para Web Store)
.gitignore             - Excluye node_modules, dist, *.zip, *.crx, *.pem, .claude/
LICENSE                - Licencia MIT
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
5. `npm test` — ejecutar tests unitarios (25 tests)
6. `npm run build` — generar dist/ minificado para producción
7. `npm run package` — build + generar ZIP listo para Chrome Web Store

## Testing
- Framework: Vitest con jsdom
- 30+ tests unitarios cubriendo funciones puras críticas (parseColor, calculateContrast, rgbToLuminance, calculateTabOrder, compareDOMOrder, getAccessibleName)
- Mocks de Chrome API en `tests/setup.js`
- Ejecutar: `npm test` o `npm run test:watch` (requiere Node 22+)
- Antes de tocar `a11y-checker.js` o `dom-utils.js`, añadir un test en `tests/` que reproduzca el bug

## Correcciones realizadas (Jul 2026)

Bug hunt con 4 revisores en paralelo + verificación manual de cada hallazgo contra el código.
Las 30 incidencias documentadas en **[`BUGFIX_PLAN.md`](./BUGFIX_PLAN.md)** fueron resueltas en
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
