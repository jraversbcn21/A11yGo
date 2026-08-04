# Ficha de la Chrome Web Store

Textos listos para copiar en el formulario de publicación. **Última actualización:** 4 de agosto de 2026

> **Copia los bloques de código tal cual.** La descripción detallada de la Web Store es **texto
> plano**: no interpreta Markdown. Por eso los bloques usan `•`, mayúsculas y saltos de línea en
> lugar de `#` y `**`. Si pegas Markdown, se verá literalmente con los asteriscos.

## Campos y límites

| Campo | Límite | De dónde sale |
|---|---:|---|
| Título | 45 caracteres | Campo `name` del `manifest.json` |
| Descripción corta | 132 caracteres | Campo `description` del `manifest.json` |
| Descripción detallada | 16 000 caracteres | Se escribe en el panel de desarrollador |

Título y descripción corta **se leen del manifiesto**, así que cambiarlos implica regenerar el ZIP
con `npm run package`. Los valores actuales (26 y 108 caracteres) ya caben; abajo propongo mejoras.

---

## Español

### Título

Actual en el manifiesto (26 caracteres), correcto tal cual:

```
A11yGo - Accesibilidad Web
```

Alternativa si prefieres que el nicho se vea desde el listado (34 caracteres):

```
A11yGo - Accesibilidad web para QA
```

### Descripción corta

Actual (108 caracteres). Funciona, pero enumera funciones en vez de vender el resultado:

```
Herramienta de accesibilidad web con lector de texto, navegación por teclado y validación automática para QA
```

Propuesta (120 caracteres) — encabeza con la acción y añade la exportación, que es lo que distingue a la herramienta en el flujo de QA:

```
Audita la accesibilidad de cualquier web: validación WCAG, orden de tabulación, lector de voz y exportación de reportes.
```

### Descripción detallada

```
A11yGo es una herramienta de accesibilidad web pensada para QA testers y desarrolladores. Combina validación automática con testing manual asistido, para que puedas auditar una página sin salir del navegador.

CUATRO HERRAMIENTAS EN UNA

• Validación automática WCAG
Analiza la página y reporta problemas en 9 categorías configurables: imágenes sin texto alternativo, contraste insuficiente, encabezados mal jerarquizados, landmarks ausentes, formularios sin etiqueta, enlaces poco descriptivos, atributos ARIA incorrectos, elementos no accesibles por teclado y orden de tabulación defectuoso.

• Navegación por teclado
Recorre la página con Tab y Shift+Tab siguiendo el orden real de tabulación que define la especificación WCAG, con información en vivo del elemento enfocado. Sirve para detectar trampas de foco y saltos de orden que ninguna validación automática puede encontrar sola.

• Navegación visual
Superpone el contorno de todos los elementos focusables y los numera en su orden de tabulación. De un vistazo ves si el recorrido del teclado sigue el orden visual de la página.

• Lector de texto
Lee la página en voz alta con la síntesis de voz del navegador, detectando el idioma automáticamente y resaltando lo que va leyendo. Con control de velocidad.

REPORTES QUE PUEDES USAR

Los resultados aparecen en el panel lateral, clasificados por severidad (error, advertencia, información) y con el detalle técnico de cada problema. Al hacer clic en un resultado, la página se desplaza al elemento y lo resalta con un marcador animado.

Exporta el informe completo en JSON, CSV o HTML para adjuntarlo a un ticket o compartirlo con el equipo.

ANÁLISIS QUE LLEGA DONDE OTRAS NO

• Shadow DOM abierto: los componentes web se analizan por dentro, no se saltan.
• Iframes del mismo origen: cada documento se evalúa por separado, sin falsos positivos por convivencia de encabezados.
• Contraste sobre gradientes: se valida contra cada parada de color, quedándose con el peor caso.
• Formatos de color modernos (oklch, lab, color()): en vez de omitirlos en silencio, avisa de que no puede evaluarlos.

QUÉ CUBRE Y QUÉ NO

A11yGo cubre 15 de los 78 criterios de las WCAG 2.1 (aproximadamente un 19%). Es una cifra deliberadamente publicada: ninguna herramienta automática cubre las WCAG completas, y las de referencia del sector rondan el 30-40%.

Los criterios restantes exigen juicio humano (subtítulos y multimedia, límites de tiempo, cambios de contexto) o análisis de comportamiento dinámico. Por eso A11yGo incluye herramientas de testing manual asistido junto a la validación automática: la máquina encuentra lo mecánico y tú evalúas el resto.

Trátala como lo que es: un acelerador de auditorías, no un sello de conformidad.

PRIVACIDAD

A11yGo se ejecuta enteramente en tu navegador. No recopila, transmite ni comparte datos personales. No incluye analítica, publicidad ni telemetría, y no hace ninguna llamada de red propia. Tus preferencias (idioma, velocidad de lectura, categorías activas) se guardan solo en tu equipo.

REQUISITOS

Chrome 114 o superior (necesario para el panel lateral).

CÓDIGO ABIERTO

Publicada bajo licencia MIT. El código es auditable y las contribuciones son bienvenidas.
```

---

## English

### Title

```
A11yGo - Web Accessibility
```

Niche-forward alternative (33 characters):

```
A11yGo - Web Accessibility for QA
```

### Short description

(105 characters)

```
Audit any site's accessibility: WCAG validation, tab order, text-to-speech reader and exportable reports.
```

### Detailed description

```
A11yGo is a web accessibility tool built for QA testers and developers. It combines automated validation with assisted manual testing, so you can audit a page without leaving the browser.

FOUR TOOLS IN ONE

• Automated WCAG validation
Scans the page and reports issues across 9 configurable categories: images without alternative text, insufficient contrast, badly nested headings, missing landmarks, unlabeled form fields, non-descriptive links, invalid ARIA attributes, keyboard-inaccessible elements and broken tab order.

• Keyboard navigation
Walk the page with Tab and Shift+Tab following the real tab order defined by the WCAG specification, with live information about the focused element. It surfaces focus traps and ordering jumps that no automated check can find on its own.

• Visual navigation
Outlines every focusable element and numbers it in tab order. One glance tells you whether the keyboard path follows the page's visual order.

• Text reader
Reads the page aloud using the browser's speech synthesis, detecting the language automatically and highlighting what it reads. Includes speed control.

REPORTS YOU CAN ACTUALLY USE

Results appear in the side panel, grouped by severity (error, warning, info) with the technical detail of each issue. Click a result and the page scrolls to the element and marks it with an animated highlight.

Export the full report as JSON, CSV or HTML to attach to a ticket or share with your team.

ANALYSIS THAT REACHES FURTHER

• Open Shadow DOM: web components are analyzed inside, not skipped.
• Same-origin iframes: each document is evaluated separately, with no false positives from coexisting headings.
• Contrast over gradients: validated against every color stop, keeping the worst case.
• Modern color formats (oklch, lab, color()): instead of skipping them silently, it warns that it cannot evaluate them.

WHAT IT COVERS AND WHAT IT DOESN'T

A11yGo covers 15 of the 78 WCAG 2.1 success criteria (roughly 19%). That number is published on purpose: no automated tool covers WCAG in full, and the industry reference tools sit around 30-40%.

The remaining criteria require human judgment (captions and multimedia, timing limits, changes of context) or dynamic behavior analysis. That is why A11yGo ships assisted manual testing tools alongside the automated validation: the machine finds the mechanical issues and you evaluate the rest.

Treat it for what it is: an audit accelerator, not a conformance stamp.

PRIVACY

A11yGo runs entirely in your browser. It does not collect, transmit or share personal data. It contains no analytics, advertising or telemetry, and makes no network calls of its own. Your preferences (language, reading speed, enabled categories) are stored only on your device.

REQUIREMENTS

Chrome 114 or later (required for the side panel).

OPEN SOURCE

Released under the MIT license. The code is auditable and contributions are welcome.
```

---

## Justificación de permisos

Cópialo en el formulario de envío. Texto tomado de [`PRIVACY.md`](../PRIVACY.md), que es la fuente
de verdad; si cambias uno, cambia el otro.

| Permiso | Justificación |
|---|---|
| `activeTab` | Actuar sobre la pestaña activa cuando el usuario abre la extensión. |
| `scripting` | Inyectar el script de análisis en la página para evaluar su accesibilidad. |
| `storage` | Guardar las preferencias del usuario localmente (idioma, velocidad de lectura, categorías activas). |
| `sidePanel` | Mostrar resultados y controles en el panel lateral. |
| `webNavigation` | Reinyectar el script tras navegaciones en aplicaciones de página única (SPA). |
| `host_permissions: <all_urls>` | Una herramienta de accesibilidad debe poder analizar **cualquier** página que el usuario quiera auditar. No se usa para recopilar datos. |

**Uso de código remoto:** ninguno. Todo el código va empaquetado; no se descarga ni evalúa código en
tiempo de ejecución. Responde «No» a esa pregunta del formulario.

## Metadatos sugeridos

- **Categoría:** Herramientas para desarrolladores *(alternativa: Accesibilidad, si buscas alcance
  más allá del público técnico)*
- **Idioma principal:** Español
- **URL de política de privacidad:** pendiente de publicar — ver
  [`pendientes-produccion.md`](./pendientes-produccion.md)

---

## Antes de enviar: dos cosas que faltan

### 1. La ficha bilingüe puede requerir `_locales/`

El proyecto usa un sistema de i18n **propio** (`utils/i18n.js`), no el mecanismo `_locales/` de
Chrome: no existe la carpeta `_locales/` ni el campo `default_locale` en el manifiesto. La interfaz
se traduce perfectamente, pero **Chrome no sabe que la extensión es bilingüe**.

Consecuencia práctica: el título y la descripción corta que muestre la tienda saldrán del manifiesto
en español para todo el mundo. **Verifica en el panel de desarrollador** si te deja añadir una ficha
en inglés directamente; si te lo exige, hay que añadir `_locales/es/messages.json` y
`_locales/en/messages.json` con `appName`/`appDescription`, más `default_locale` en el manifiesto, y
regenerar el ZIP.

No lo doy por hecho en un sentido ni en otro porque no lo he verificado contra el panel real. Es un
cambio pequeño si hace falta.

### 2. Capturas de pantalla

Siguen pendientes (1280×800 o 640×400). Sugerencia de las cuatro que mejor cuentan la historia,
una por herramienta:

1. Panel de resultados con problemas clasificados por severidad **y** un elemento resaltado en la
   página — es la captura que mejor explica el producto; ponla primera.
2. Navegación visual con los contornos numerados sobre una página real.
3. Navegación por teclado con la información en vivo del elemento enfocado.
4. Configuración de categorías o el diálogo de exportación, para mostrar que el reporte es
   accionable.
