# A11yGo - Extensión de Accesibilidad Web

Extensión de Chrome para mejorar la accesibilidad web y facilitar el testeo de accesibilidad para QA.

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
- **ARIA**: Valida atributos ARIA correctos
- **Contraste**: Verifica ratios de contraste WCAG AA/AAA
- **Imágenes**: Verifica presencia de atributos alt
- **Headers**: Valida estructura jerárquica de encabezados
- **Landmarks**: Detecta landmarks ARIA
- **Formularios**: Valida labels asociados
- **Enlaces**: Verifica texto descriptivo
- **Keyboard**: Verifica si elementos son focusables

### 📊 Reportes de Problemas
- Panel de resultados con lista de problemas encontrados
- Categorización por severidad (Error, Advertencia, Info)
- Detalles técnicos de cada problema
- Navegación directa a elementos problemáticos
- Exportación de reporte en formato JSON

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
├── manifest.json          # Configuración de la extensión
├── popup.html/js/css      # Interfaz del popup
├── sidebar.html/js/css    # Panel lateral
├── content.js             # Script de contenido
├── background.js          # Service worker
├── utils/                 # Módulos de utilidades
│   ├── i18n.js           # Sistema de internacionalización
│   ├── text-reader.js    # Lector de texto
│   ├── keyboard-nav.js   # Navegación por teclado
│   ├── visual-nav.js     # Navegación visual
│   └── a11y-checker.js   # Motor de validación
└── icons/                 # Iconos de la extensión
```

## Desarrollo

La extensión está construida con:
- JavaScript vanilla (sin frameworks)
- Web Speech API
- Chrome Extension Manifest V3
- CSS moderno

## Licencia

MIT License
