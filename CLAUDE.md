# A11yGo - Extensión de Accesibilidad Web para Chrome

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
```

## Arquitectura de Comunicación
- **Popup → Content**: `chrome.tabs.sendMessage` para activar funciones
- **Content → Sidebar**: `chrome.runtime.sendMessage` para actualizar UI (historial, resultados)
- **Background**: Relay de mensajes + reinyección de content.js en navegaciones SPA
- **Desactivación**: Cada módulo escucha Escape y notifica al content script

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
