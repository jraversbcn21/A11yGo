# Fixtures de verificación manual

Páginas HTML para verificar **en un navegador real** lo que los tests unitarios (jsdom) no
pueden cubrir: el traversal y el **highlight** (posicionamiento del overlay) del validador sobre
**shadow DOM** e **iframes same-origin**, más la detección de contenido cross-origin.

## Archivos

- `manual-a11y-test.html` — página principal con 4 tarjetas (A baseline, B shadow DOM, C iframe
  same-origin, D iframe cross-origin). Cada tarjeta indica su resultado esperado.
- `manual-a11y-test-iframe.html` — contenido del iframe de la tarjeta C (mismo origen), con su
  propio `<h1>`, una imagen sin `alt`, y un shadow host anidado con otra imagen sin `alt` (caso
  combinado ` ::iframe:: … >>> `). Cargado como archivo estático → sin carreras.

## Cómo usar

1. **Carga la extensión desde la raíz del repo**, NO desde `dist/`. `dist/` es una build de
   producción congelada (`npm run build`); si la cargas, verás código antiguo. En
   `chrome://extensions/` → modo desarrollador → «Cargar descomprimida» → carpeta raíz del repo.
2. **Sirve el repo por HTTP** (no `file://`):
   ```bash
   npx http-server -p 8080 -c-1
   ```
   Chrome trata cada URL `file:` como un **origen único (opaco)**, así que los iframes no cargan
   sobre `file://`. Hay que servir por `http://localhost`.
3. Abre `http://localhost:8080/test-fixtures/manual-a11y-test.html`.
4. Ejecuta **Validar Accesibilidad** desde el popup de A11yGo.
5. Tras cualquier cambio en los fixtures, recarga con **Ctrl+Shift+R** (recarga dura; un `F5`
   normal puede servir la caché).

## Reporte esperado (limpio)

**4 errores, 1 advertencia, 1 info** — exactamente las señales intencionadas:

| Severidad | Elemento | Caso |
|---|---|---|
| info | Iframe de origen cruzado (1) | D — aviso cross-origin |
| error | `#top-img` | A — baseline top |
| error | `#shadow-host-b >>> div > img` | B — traversal shadow DOM |
| warning | `#shadow-host-b >>> div > input` | B — form dentro del shadow |
| error | `#frame-same ::iframe:: #iframe-img` | C — traversal iframe |
| error | `#frame-same ::iframe:: #iframe-shadow-host >>> img` | C — shadow dentro de iframe |

## Verificación del highlight (lo que jsdom no puede)

Haz **click** en cada resultado del panel lateral y confirma que el overlay pulse cae sobre el
elemento correcto. Los dos casos clave:

- `#shadow-host-b >>> div > img` → overlay sobre la imagen morada **dentro del shadow root**.
- `#frame-same ::iframe:: #iframe-shadow-host >>> img` → overlay sobre la imagen roja **dentro del
  iframe y dentro de un shadow** (composición de offset shadow + iframe, el caso más exigente).
