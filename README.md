# A11yGo - Extensión de Accesibilidad Web

Extensión de Chrome (Manifest V3) para mejorar la accesibilidad web y facilitar el testeo de accesibilidad para QA testers.

## Características

### 🎙️ Lector de Texto
- Usa Web Speech API del navegador
- Detección automática de idioma (español/inglés)
- Selección automática de voz según idioma detectado
- Control de velocidad de lectura
- Resaltado visual del texto que se lee

### ⌨️ Navegación por Teclado
- Modo de navegación visual que muestra elementos focusables
- Contador de orden de tabulación
- Información en tiempo real del elemento con foco
- Navegación mejorada con Tab/Shift+Tab

### 👁️ Navegación Visual
- Muestra todos los elementos navegables con outline visual
- Indicadores numéricos del orden de tabulación
- Resaltado del elemento con foco actual
- Controles para activar/desactivar características

### 🔍 Validación Automática de Accesibilidad
- **ARIA**: Valida atributos ARIA correctos y nombres accesibles
- **Contraste**: Verifica ratios de contraste WCAG AA/AAA, incluye gradientes e imágenes de fondo
- **Imágenes**: Verifica presencia de atributos alt
- **Headers**: Valida estructura jerárquica de encabezados
- **Landmarks**: Detecta landmarks ARIA (main, nav, header, footer)
- **Formularios**: Valida labels asociados y anti-patrón placeholder-as-label
- **Enlaces**: Verifica texto descriptivo y detecta texto genérico
- **Keyboard**: Verifica si elementos son focusables
- **Tab Order**: Detecta tabindex duplicados, saltos y orden incorrecto

### 📊 Reportes de Problemas
- Panel de resultados con lista de problemas encontrados
- Categorización por severidad (Error, Advertencia, Info)
- Detalles técnicos de cada problema
- Navegación directa a elementos problemáticos con highlight animado
- Exportación de reportes en JSON, CSV y HTML
- Categorías de validación configurables

### 🌐 Multilingüe
- Interfaz en español e inglés
- Detección automática del idioma del navegador
- Selector manual de idioma

## Instalación

1. Clona o descarga este repositorio
2. Abre Chrome y ve a `chrome://extensions/`
3. Activa el "Modo de desarrollador" (Developer mode)
4. Haz clic en "Cargar extensión sin empaquetar" (Load unpacked)
5. Selecciona la carpeta del proyecto

## Uso

1. Haz clic en el icono de la extensión en la barra de herramientas
2. Selecciona la función que deseas usar:
   - **Lector de Texto**: Selecciona texto en la página y se leerá automáticamente
   - **Navegación por Teclado**: Activa el modo de navegación mejorado
   - **Navegación Visual**: Muestra visualmente los elementos navegables
   - **Validar Accesibilidad**: Ejecuta la validación automática
3. El panel lateral se abrirá automáticamente con los controles y resultados

## Requisitos

- Chrome 114 o superior (para soporte de sidePanel)
- Permisos de acceso a páginas web activas

## Estructura del Proyecto

```
A11yGo-ext/
├── manifest.json          # Configuración de la extensión (MV3)
├── popup.html/js/css      # Interfaz del popup
├── sidebar.html/js/css    # Panel lateral
├── content.js             # Script de contenido (orquestador)
├── background.js          # Service worker (module)
├── utils/                 # Módulos de utilidades
│   ├── dom-utils.js       # Funciones compartidas (tab order, nombres accesibles)
│   ├── logger.js          # Logger condicional
│   ├── i18n.js            # Sistema de internacionalización
│   ├── text-reader.js     # Lector de texto TTS
│   ├── keyboard-nav.js    # Navegación por teclado
│   ├── visual-nav.js      # Navegación visual
│   └── a11y-checker.js    # Motor de validación WCAG
├── tests/                 # Tests unitarios
│   ├── setup.js           # Mocks de Chrome API
│   ├── dom-utils.test.js  # Tests de utilidades DOM
│   └── a11y-checker.test.js # Tests de validación
├── icons/                 # Iconos (16/48/128px, PNG + SVG)
├── build.js               # Script de build (esbuild)
├── eslint.config.js       # ESLint flat config
├── vitest.config.js       # Configuración Vitest
└── LICENSE                # MIT License
```

## Desarrollo

La extensión está construida con:
- JavaScript vanilla (ES modules, sin frameworks)
- Web Speech API (text-to-speech)
- Chrome Extension Manifest V3
- CSS moderno

### Comandos

```bash
npm install          # Instalar dependencias
npm run lint         # Ejecutar ESLint
npm test             # Ejecutar tests unitarios (25 tests)
npm run build        # Generar dist/ minificado
npm run package      # Build + ZIP para Chrome Web Store
```

## Licencia

MIT — ver [LICENSE](LICENSE)
