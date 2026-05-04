# A11yGo - Extensión de Accesibilidad Web para Chrome

## Descripción
Extensión de Chrome (Manifest V3) orientada a QA testers para evaluar y mejorar la accesibilidad web. Proporciona 4 herramientas principales: lector de texto, navegación por teclado, navegación visual y validación automática WCAG.

## Stack Tecnológico
- JavaScript vanilla (sin frameworks ni bundlers)
- Chrome Extension Manifest V3
- Web Speech API (text-to-speech)
- CSS moderno
- Arquitectura: popup → content script → sidebar (side panel)

## Estructura del Proyecto
```
manifest.json          - Configuración de la extensión (MV3)
popup.html/js/css      - Menú principal (selector de función + idioma)
sidebar.html/js/css    - Panel lateral con controles y resultados
content.js             - Orquestador: carga módulos, gestiona activación/desactivación
background.js          - Service worker: routing de mensajes, reinyección en SPAs
utils/
  i18n.js              - Internacionalización (es/en)
  text-reader.js       - Lector TTS con detección de idioma y navegación de contenido
  keyboard-nav.js      - Navegación Tab/Shift+Tab con orden WCAG correcto
  visual-nav.js        - Overlays visuales de elementos focusables y orden de tabulación
  a11y-checker.js      - Motor de validación (imágenes, contraste, forms, headings, ARIA, etc.)
icons/                 - Iconos en 16/48/128px (PNG + SVG)
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

## Desarrollo
1. Cargar como extensión sin empaquetar en `chrome://extensions/`
2. Activar modo desarrollador
3. No requiere build step - JS vanilla directo

## Testing
No hay framework de tests configurado. Se prueba manualmente cargando la extensión.
