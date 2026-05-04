// Sistema de internacionalización

const translations = {
  es: {
    // General
    selectFunction: 'Selecciona una función',
    selectFunctionInfo: 'Usa el popup de la extensión para activar una función',
    noActiveTab: 'No hay pestaña activa',
    activationError: 'Error al activar función',
    sidebarError: 'Error al abrir panel lateral',
    
    // Funciones
    textReader: 'Lector de Texto',
    keyboardNav: 'Navegación por Teclado',
    visualNav: 'Navegación Visual',
    a11yCheck: 'Validar Accesibilidad',
    openSidebar: 'Abrir Panel',
    
    // Estados de activación
    textReaderActivated: 'Lector de texto activado',
    keyboardNavActivated: 'Navegación por teclado activada',
    visualNavActivated: 'Navegación visual activada',
    a11yCheckActivated: 'Validación de accesibilidad activada',
    
    // Lector de texto
    speed: 'Velocidad:',
    play: 'Reproducir',
    pause: 'Pausar',
    stop: 'Detener',
    textReaderInfo: 'Selecciona texto en la página para leerlo o navega con Tab',
    
    // Navegación por teclado
    keyboardNavInfo: 'Usa Tab para navegar entre elementos',
    focusableElements: 'Elementos navegables:',
    currentFocus: 'Foco actual:',
    navigationHistory: 'Historial de Navegación',
    
    // Navegación visual
    showFocusables: 'Mostrar elementos navegables',
    showTabOrder: 'Mostrar orden de tabulación',
    highlightFocus: 'Resaltar foco',
    
    // Validación
    runCheck: 'Ejecutar Validación',
    clearResults: 'Limpiar Resultados',
    exportReport: 'Exportar Reporte',
    errors: 'Errores:',
    warnings: 'Advertencias:',
    info: 'Información:',
    
    // Reportes
    noAltText: 'Imagen sin texto alternativo',
    lowContrast: 'Contraste bajo',
    missingLabel: 'Formulario sin etiqueta',
    missingAriaLabel: 'Elemento sin etiqueta ARIA',
    invalidHeadingOrder: 'Orden de encabezados inválido',
    missingLandmark: 'Falta landmark ARIA',
    emptyLink: 'Enlace sin texto',
    notFocusable: 'Elemento no accesible por teclado',
    missingRole: 'Falta atributo ARIA role',
    invalidAria: 'Atributo ARIA inválido'
  },
  en: {
    // General
    selectFunction: 'Select a function',
    selectFunctionInfo: 'Use the extension popup to activate a function',
    noActiveTab: 'No active tab',
    activationError: 'Error activating function',
    sidebarError: 'Error opening sidebar',
    
    // Functions
    textReader: 'Text Reader',
    keyboardNav: 'Keyboard Navigation',
    visualNav: 'Visual Navigation',
    a11yCheck: 'Validate Accessibility',
    openSidebar: 'Open Panel',
    
    // Activation states
    textReaderActivated: 'Text reader activated',
    keyboardNavActivated: 'Keyboard navigation activated',
    visualNavActivated: 'Visual navigation activated',
    a11yCheckActivated: 'Accessibility validation activated',
    
    // Text reader
    speed: 'Speed:',
    play: 'Play',
    pause: 'Pause',
    stop: 'Stop',
    textReaderInfo: 'Select text on the page to read it or navigate with Tab',
    
    // Keyboard navigation
    keyboardNavInfo: 'Use Tab to navigate between elements',
    focusableElements: 'Focusable elements:',
    currentFocus: 'Current focus:',
    navigationHistory: 'Navigation History',
    
    // Visual navigation
    showFocusables: 'Show focusable elements',
    showTabOrder: 'Show tab order',
    highlightFocus: 'Highlight focus',
    
    // Validation
    runCheck: 'Run Validation',
    clearResults: 'Clear Results',
    exportReport: 'Export Report',
    errors: 'Errors:',
    warnings: 'Warnings:',
    info: 'Information:',
    
    // Reports
    noAltText: 'Image without alt text',
    lowContrast: 'Low contrast',
    missingLabel: 'Form without label',
    missingAriaLabel: 'Element without ARIA label',
    invalidHeadingOrder: 'Invalid heading order',
    missingLandmark: 'Missing ARIA landmark',
    emptyLink: 'Link without text',
    notFocusable: 'Element not keyboard accessible',
    missingRole: 'Missing ARIA role attribute',
    invalidAria: 'Invalid ARIA attribute'
  }
};

let currentLang = 'es';

export const i18n = {
  async init(lang = 'es') {
    currentLang = lang in translations ? lang : 'es';
  },

  t(key) {
    return translations[currentLang][key] || translations.es[key] || key;
  },

  getLanguage() {
    return currentLang;
  }
};
