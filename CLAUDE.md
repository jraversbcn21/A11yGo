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
  dom-utils.js         - Funciones compartidas: calculateTabOrder, compareDOMOrder, getAccessibleName
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
icons/                 - Iconos en 16/48/128px (PNG + SVG)
package.json           - Scripts: test, build, lint, package
eslint.config.js       - ESLint flat config para Chrome extensions
vitest.config.js       - Configuración Vitest con jsdom
build.js               - Script esbuild: minifica JS → dist/ (--package genera ZIP para Web Store)
.gitignore             - Excluye node_modules, dist, *.zip, *.crx, *.pem, .claude/
LICENSE                - Licencia MIT
```

## Arquitectura de Comunicación
- **Popup → Content**: `chrome.tabs.sendMessage` para activar funciones
- **Content → Sidebar**: `chrome.runtime.sendMessage` para actualizar UI (historial, resultados)
- **Background**: Relay de mensajes + reinyección de content.js en navegaciones SPA
- **Desactivación**: Cada módulo escucha Escape y notifica al content script
- **Highlight de errores**: Click en resultado del sidebar → scroll + overlay animado (pulse) sobre el elemento en la página, con badge de severidad (12s auto-remove)
- **Historiales**: Sidebar mantiene historiales independientes por herramienta (textReader, keyboardNav, visualNav) con deduplicación y límite de 20 entradas

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
- Exportación de reportes en 3 formatos: JSON, CSV y HTML
- Contraste sobre gradientes: valida contra cada color stop (worst-case); sobre imágenes de fondo emite warning

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
3. `npm install` para dependencias de desarrollo
4. `npm run lint` — ejecutar ESLint
5. `npm test` — ejecutar tests unitarios (25 tests)
6. `npm run build` — generar dist/ minificado para producción
7. `npm run package` — build + generar ZIP listo para Chrome Web Store

## Testing
- Framework: Vitest con jsdom
- 25 tests unitarios cubriendo funciones puras críticas
- Mocks de Chrome API en `tests/setup.js`
- Ejecutar: `npm test` o `npm run test:watch`
