# Política de Privacidad — A11yGo

**Última actualización:** 25 de julio de 2026
**Extensión:** A11yGo — Accesibilidad Web (Chrome, Manifest V3)
**Contacto:** sidmaierlabs@gmail.com

---

## Español

### Resumen

A11yGo es una herramienta de accesibilidad que se ejecuta **enteramente en tu navegador**. **No
recopilamos, transmitimos, vendemos ni compartimos ningún dato personal.** La extensión no realiza
ninguna llamada de red a servidores propios ni de terceros, no incluye analítica ni telemetría, y no
muestra publicidad.

### Qué datos maneja la extensión

Para cumplir su función, A11yGo accede al contenido de las páginas web que visitas **mientras usas
la herramienta**, con estos fines y **siempre de forma local**:

- **Análisis de accesibilidad:** lee la estructura del DOM de la página activa (y de sus iframes de
  mismo origen y shadow DOM abierto) para detectar problemas de accesibilidad. Este análisis ocurre
  en tu dispositivo; sus resultados no salen de él.
- **Lector de texto (TTS):** cuando activas el lector, el texto de la página se pasa a la
  **Web Speech API del navegador** (`speechSynthesis`). El procesamiento de voz lo realiza el motor
  de síntesis de tu navegador o sistema operativo; según la voz que elijas, ese motor puede
  procesarlo localmente o mediante los servicios de voz del propio navegador/SO. A11yGo no controla
  ni intermedia ese procesamiento y no envía ese texto a ningún servidor propio.
- **Navegación por teclado y visual:** operan sobre la página en memoria; no almacenan ni envían
  nada.

### Qué se almacena (y dónde)

A11yGo guarda **únicamente tus preferencias**, mediante `chrome.storage.local`, que reside **solo en
tu dispositivo** (no se sincroniza a la nube por parte de la extensión):

| Clave | Contenido |
|---|---|
| `language` | Idioma de la interfaz (`es` / `en`) |
| `activePanel` | Herramienta activa actual |
| `a11yCheckCategories` | Categorías de validación habilitadas |
| `a11yGoDebug` | Indicador de logging de depuración |
| `textReaderSpeed` | Velocidad del lector de texto |

No se almacena contenido de las páginas que visitas, ni historial de navegación, ni identificadores
personales.

### Informes exportados

Los informes de accesibilidad (JSON, CSV, HTML) se **generan localmente** y se guardan mediante la
descarga del navegador, bajo tu control. La extensión no los sube a ningún sitio.

### Permisos y su justificación

| Permiso | Por qué se necesita |
|---|---|
| `activeTab` | Actuar sobre la pestaña activa cuando abres la extensión |
| `scripting` | Inyectar el script de análisis en la página para evaluar su accesibilidad |
| `storage` | Guardar tus preferencias localmente (tabla anterior) |
| `sidePanel` | Mostrar resultados y controles en el panel lateral |
| `webNavigation` | Reinyectar el script tras navegaciones en aplicaciones de página única (SPA) |
| `host_permissions: <all_urls>` | Una herramienta de accesibilidad debe poder analizar **cualquier** página que quieras auditar; no se usa para recopilar datos |

### Conservación y eliminación de datos

Las preferencias permanecen en tu dispositivo hasta que **desinstalas la extensión** o **borras los
datos del navegador**. No hay datos en ningún servidor que eliminar, porque no se recopila ninguno.

### Menores

A11yGo es una herramienta de desarrollo/QA y no está dirigida a menores de edad. No recopila datos
de ninguna persona.

### Cambios en esta política

Si esta política cambia, se actualizará este documento con una nueva fecha de «Última
actualización». El uso continuado de la extensión tras un cambio implica la aceptación de la versión
actualizada.

### Contacto

Para cualquier duda sobre privacidad: **sidmaierlabs@gmail.com**

---

## English

### Summary

A11yGo is an accessibility tool that runs **entirely in your browser**. **We do not collect,
transmit, sell, or share any personal data.** The extension makes no network requests to our own or
third-party servers, includes no analytics or telemetry, and shows no advertising.

### What data the extension handles

To do its job, A11yGo accesses the content of the web pages you visit **while you are using the
tool**, for the following purposes and **always locally**:

- **Accessibility analysis:** it reads the active page's DOM (including its same-origin iframes and
  open shadow DOM) to detect accessibility issues. This analysis happens on your device; its results
  never leave it.
- **Text reader (TTS):** when you activate the reader, page text is passed to the browser's
  **Web Speech API** (`speechSynthesis`). Voice processing is performed by your browser's or
  operating system's synthesis engine; depending on the voice you choose, that engine may process it
  locally or via the browser/OS's own speech services. A11yGo neither controls nor mediates that
  processing and sends that text to no server of its own.
- **Keyboard and visual navigation:** operate on the in-memory page; they store and send nothing.

### What is stored (and where)

A11yGo stores **only your preferences**, via `chrome.storage.local`, which lives **only on your
device** (the extension does not sync it to the cloud):

| Key | Content |
|---|---|
| `language` | Interface language (`es` / `en`) |
| `activePanel` | Currently active tool |
| `a11yCheckCategories` | Enabled validation categories |
| `a11yGoDebug` | Debug logging flag |
| `textReaderSpeed` | Text reader speed |

No page content, browsing history, or personal identifiers are stored.

### Exported reports

Accessibility reports (JSON, CSV, HTML) are **generated locally** and saved via the browser's
download, under your control. The extension does not upload them anywhere.

### Permissions and their justification

| Permission | Why it is needed |
|---|---|
| `activeTab` | Act on the active tab when you open the extension |
| `scripting` | Inject the analysis script into the page to evaluate its accessibility |
| `storage` | Store your preferences locally (table above) |
| `sidePanel` | Show results and controls in the side panel |
| `webNavigation` | Re-inject the script after single-page-application (SPA) navigations |
| `host_permissions: <all_urls>` | An accessibility tool must be able to analyze **any** page you want to audit; it is not used to collect data |

### Data retention and deletion

Preferences remain on your device until you **uninstall the extension** or **clear your browser
data**. There is no server-side data to delete, because none is collected.

### Children

A11yGo is a development/QA tool and is not directed at children. It collects data from no one.

### Changes to this policy

If this policy changes, this document will be updated with a new "Last updated" date. Continued use
of the extension after a change constitutes acceptance of the updated version.

### Contact

For any privacy questions: **sidmaierlabs@gmail.com**
