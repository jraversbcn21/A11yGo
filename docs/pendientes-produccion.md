# Pendientes antes de subir a producción (Chrome Web Store)

**Última actualización:** 7 de agosto de 2026
**Estado general:** funcional y probado en lo trabajado recientemente; **no listo para publicar todavía**.
El único bloqueante duro (política de privacidad) ya está resuelto; quedan assets de tienda y
recomendaciones de calidad.

Leyenda: `[x]` hecho · `[ ]` pendiente · **(BLOQUEANTE)** impide el envío a la Web Store ·
**(CALIDAD)** recomendado antes de publicar · **(MENOR)** deuda no bloqueante.

---

## 1. Bloqueantes de la Chrome Web Store

- [x] **Política de privacidad** — `PRIVACY.md` (es/en), veraz y basada en auditoría del código.
- [ ] **(BLOQUEANTE) Publicar la política en una URL pública.** Google exige una URL en la ficha.
  Opciones sin coste:
  - Rápida: `https://github.com/jraversbcn21/A11yGo/blob/master/PRIVACY.md`
  - Pulida: activar GitHub Pages y servir `PRIVACY.md`.
- [ ] **(BLOQUEANTE) Assets de la ficha de tienda:**
  - [ ] Al menos **1 captura de pantalla 1280×800** (o 640×400) de la extensión en uso. Ideal: 3-5
        mostrando lector, navegación, validación y panel de resultados. *(Requiere capturas reales;
        las hace el humano.)*
  - [x] **Descripción de tienda** (título + descripción corta + descripción detallada) — redactada
        en es/en en [`ficha-web-store.md`](./ficha-web-store.md), con longitudes verificadas contra
        los límites de la tienda. Falta **pegarla en el formulario**.
  - [ ] **(BLOQUEANTE) Verificar si la ficha en inglés exige `_locales/`.** El proyecto usa un i18n
        propio (`utils/i18n.js`), no el mecanismo de Chrome: no hay `_locales/` ni `default_locale`.
        Si el panel de desarrollador no deja añadir la ficha en inglés sin ellos, hay que crear
        `_locales/{es,en}/messages.json` con `appName`/`appDescription`, añadir `default_locale` al
        manifiesto y regenerar el ZIP. Detalle en `ficha-web-store.md`.
  - [ ] *(Opcional)* Imagen promocional (440×280) e ícono de marquesina.
- [ ] **(BLOQUEANTE) Justificación de permisos** en el formulario de envío. El texto ya está
      redactado en la tabla de `PRIVACY.md` → copiar en el formulario para `<all_urls>`, `scripting`,
      `storage`, `sidePanel`, `webNavigation`, `activeTab`.
- [ ] **(BLOQUEANTE) Cuenta de desarrollador de Chrome Web Store** (tarifa única de 5 USD si aún no
      se tiene).
- [ ] **(BLOQUEANTE) Generar el paquete** con `npm run package` (build minificado + ZIP) y subir ese
      ZIP. Recordar regenerar tras cualquier cambio de código.

## 2. Calidad y riesgo (recomendado antes de publicar)

- [ ] **(CALIDAD) Pasada de humo manual en sitios reales — EN PROGRESO (07/08).** Guion completo y
      estado detallado en [`verificacion-manual.md`](./verificacion-manual.md). Avance:
      **github.com completo** (4/4 herramientas ✅). **Bershka sin validar:** la sesión del 07/08 se
      hizo con el content script huérfano (H3), así que sus observaciones **no son fiables** y hay
      que repetirla entera con la pestaña recargada. De ella sí salieron tres hallazgos válidos
      confirmados leyendo código (H3, H4 y H5). Pendientes: `bershka.com/es` (repetir), `aevi.org.es`
      (sin iniciar), `bershka.com/sa` como candidato RTL (sin iniciar, sin confirmar que sirva
      layout RTL). Ningún sitio de esta ronda cubre el perfil "DOM grande"; considerar añadir uno.
- [ ] **(CALIDAD) Regresión keyboardNav vía fixture — sin ejecutar.** El off-by-one (fix 30/07,
      commit `94486d8`) se verificó indirectamente en la pasada de humo de github.com (foco inicial
      y Shift+Tab correctos), pero **falta la pasada dirigida** con el fixture rotulado
      (`test-fixtures/manual-keyboard-test.html`, bloque 1 de `verificacion-manual.md`) que cubre
      además los 5 casos de exclusión y el salto de elemento eliminado.
- [ ] **(CALIDAD) Verificación manual pendiente del scroll en iframe (cambio C) — sin ejecutar.**
      Confirmar en navegador que el overlay de highlight se reposiciona al hacer scroll **dentro**
      de un iframe same-origin. Bloque 2 de `verificacion-manual.md`, fixture ya preparado con
      relleno para tener scroll interno (`test-fixtures/manual-a11y-test-iframe.html`).
- [ ] **(CALIDAD) Regresión del validador shadow DOM/iframes vía fixture — sin ejecutar.** Bloque 3
      de `verificacion-manual.md`; ya se verificó end-to-end el 25/07 pero conviene repasarlo tras
      los cambios en `content.js` (30/07 en adelante).
- [x] **(CALIDAD) Hallazgo H1 — conteo de focusables inflado en `keyboard-nav.js`.** Corregido el
      07/08 con TDD: nuevo helper compartido `hasHiddenAncestor()` en `utils/dom-utils.js` (recorre
      ancestros buscando `display:none`, `visibility:hidden` o `aria-hidden="true"`), usado en el
      filtro de `updateFocusableElements()`. `visual-nav.js` refactorizado para usar el mismo helper
      (antes duplicaba el recorrido a mano). 6 tests nuevos (5 del helper + 1 de integración).
      **Pendiente re-verificar en github.com** (mega-menú "Enterprise") en la próxima pasada manual.
- [x] **(CALIDAD) Hallazgo H2 — `logger.warn`/`logger.error` ignoran el flag de debug.** Corregido
      el 07/08 en dos pasos. El primer intento silenció `warn()` **y** `error()`, y fue un error de
      criterio: esa misma tarde, con `error()` mudo, el contexto invalidado (H3) no dejó rastro en
      consola y costó horas de diagnóstico. **Decisión final:** `log()` y `warn()` respetan el flag;
      **`error()` nunca se silencia**. 7 tests en `tests/logger.test.js`.
- [x] **(CALIDAD) Hallazgo H3 — el contexto de extensión invalidado fallaba en silencio.** Al
      recargar la extensión con una página abierta, su content script queda huérfano y toda llamada
      `chrome.*` lanza; el lector seguía hablando (Web Speech API no depende de la extensión)
      mientras el panel no recibía nada y no se registraba ni un log. Corregido el 07/08:
      `isExtensionContextValid()` + `reportInvalidContext()` en `content.js`, con aviso `role="alert"`
      mostrado una sola vez en el frame principal y texto vía `i18n.t('contextInvalidated')`.
      4 tests en `tests/content.test.js`. Detalle en `verificacion-manual.md` § H3.
- [x] **(CALIDAD) Hallazgo H4 — el resaltado amarillo del lector se salta elementos.** Los elementos
      se leían bien pero solo algunos se resaltaban: `highlightText()` buscaba la cadena completa
      dentro de **un único nodo de texto**, mientras que la lectura la construye concatenando varios
      hijos, así que en marcado anidado (React) no encontraba nunca coincidencia. Además resaltaba la
      primera aparición de **toda la página**, no la del elemento leído. Corregido el 07/08:
      `highlightText(text, element)` busca solo dentro del elemento y, si el texto está repartido
      entre nodos, resalta el elemento entero (`highlightWholeElement()`); `removeHighlight()`
      restaura el estilo original. `read(text, element)` propaga el elemento hasta el `onstart`.
      5 tests en `tests/text-reader.test.js`.
- [x] **(CALIDAD) Hallazgo H5 — el lector provocaba una violación de accesibilidad.**
      `makeContentElementsFocusable()` inyectaba `tabindex` en elementos dentro de contenedores
      `aria-hidden` (las slides fuera de pantalla del carrusel de Bershka) y luego los enfocaba;
      Chrome bloquea el `aria-hidden` porque un elemento con foco no puede ocultarse a lectores de
      pantalla, y avisa en consola. Misma familia que H1, en un tercer sitio con implementación
      propia. Corregido el 07/08 reutilizando `hasHiddenAncestor()` + comprobación de
      `aria-hidden="true"` en el propio elemento. 3 tests en `tests/text-reader.test.js`.
- [x] **(CALIDAD) Detección proactiva del contexto invalidado.** El aviso de H3 solo saltaba cuando
      algo intentaba usar la API, y leer con el hover no envía mensajes ni escribe en storage — una
      usuaria leyendo con el ratón nunca se habría enterado. Añadido `startContextWatch()`
      (comprobación cada 5 s mientras hay una herramienta activa). 1 test en `tests/content.test.js`.
- [x] **(CALIDAD) Tests para `content.js`** — 25 tests (30/07): routing de mensajes, exclusión
      mutua, callbacks `onDeactivate`, comandos del lector, `runA11yCheck`, highlight (overlay,
      auto-remove 12s, reemplazo), handler `focusin` y contexto de extensión inválido. Ver
      `tests/content.test.js`, `tests/content-failure.test.js` y `tests/stubs/a11y-modules.js`.
- [x] **(CALIDAD) Tests para `text-reader.js`** — 75 tests (30/07): detección de idioma,
      `formatTextForSpeech`, normalización anti-deletreo, `getAccessibleName`/`getElementType`,
      deduplicación, reentrancia de `read()` (`readToken`), reintento de voces, focusables
      temporales, hover/selección y highlight. Ver `tests/text-reader.test.js`.

> Los números de tests de las entradas siguientes son los del día en que se escribieron; el recuento
> actual por módulo está en la [tabla de cobertura](#cobertura-de-tests-actual-contexto).

## 3. Deuda menor (no bloquea, anotada para no perderla)

- [x] **(MENOR) Tests para `keyboard-nav.js` y `visual-nav.js`** — 43 tests (30/07). El test de
      activación destapó y corrigió un off-by-one real: al activar la navegación por teclado se
      enfocaba el 2º elemento del orden de tabulación (y Shift+Tab inicial iba al penúltimo).
- [x] **(MENOR) CI** — `.github/workflows/ci.yml` (30/07): `npm ci` + lint + tests + build en
      Node 22, en cada push y pull request a `master`.
- [x] **(MENOR) Revisar `BUGFIX_PLAN.md`** — archivado el 04/08 en
      [`archive/bugfix-plan-2026-07.md`](./archive/bugfix-plan-2026-07.md) con un aviso de documento
      histórico resuelto. Referencias actualizadas en `CLAUDE.md`.
- [x] **(MENOR) Subir las actions del CI a v5** — `actions/checkout@v5` y `actions/setup-node@v5`
      (04/08). Elimina el aviso de deprecación de Node 20 en los runners.

---

## Cobertura de tests actual (contexto)

Líneas y número de tests verificados contra el repo el 07/08 (commit `60b2c8f`).

| Módulo | Líneas | Tests | Cobertura |
|---|---:|---:|---|
| `utils/text-reader.js` | 1969 | 82 | ✅ lógica pura, DOM y async con mocks de speechSynthesis |
| `utils/a11y-checker.js` | 1052 | 40 | ✅ motor de validación |
| `utils/keyboard-nav.js` | 835 | 23 | ✅ navegación, orden WCAG, tabindex inyectado |
| `utils/visual-nav.js` | 767 | 21 | ✅ overlays, filtrado, historial |
| `content.js` | 713 | 30 | ✅ orquestador: mensajería, activación, highlight, contexto invalidado |
| `utils/dom-utils.js` | 361 | 74 | ✅ DOM, shadow DOM, iframes, visibilidad de ancestros |
| `utils/i18n.js` | 192 | — | ❌ sin tests propios |
| `utils/logger.js` | 46 | 7 | ✅ log/warn respetan el flag; error() siempre imprime |
| `sidebar.js` | 641 | — | ❌ sin tests propios |
| `popup.js` | 174 | — | ❌ sin tests propios |
| `background.js` | 61 | — | ❌ sin tests propios |

Los 74 de `dom-utils.js` se reparten entre `dom-utils.test.js` (21), `shadow-dom.test.js` (43) e
`iframe.test.js` (10); los 30 de `content.js`, entre `content.test.js` (26) y
`content-failure.test.js` (4).

**Total: 277 tests.** Los módulos con lógica están cubiertos; `sidebar.js`, `popup.js`,
`background.js` e `i18n.js` no tienen tests propios — es la deuda de cobertura que queda.

## Lo que sí está listo

- Las 3 mejoras de robustez (shadow DOM, colores modernos oklch/lab, iframes same-origin)
  implementadas, probadas y **verificadas end-to-end en navegador real**.
- **277 tests unitarios** — todos los módulos con lógica cubiertos. El proceso destapó y corrigió
  bugs reales: un off-by-one en la activación de keyboardNav (30/07) y los cinco hallazgos de las
  pasadas manuales (07/08).
- **Hallazgos H1 a H5 corregidos** (07/08) con TDD: visibilidad de ancestros al filtrar focusables
  (helper `hasHiddenAncestor()` compartido por los tres módulos), logger con `error()` siempre
  visible, detección del contexto de extensión invalidado con aviso en página, resaltado del lector
  acotado al elemento leído, y el lector ya no hace focusables elementos dentro de `aria-hidden`.
- **CI en GitHub Actions** (`.github/workflows/ci.yml`): npm ci + lint + tests + build en cada
  push/PR a master. Primera ejecución verde el 30/07 (tras sincronizar `package-lock.json`).
- Lint en 0 errores / 0 warnings; convenciones consistentes.
- Alcance WCAG documentado con honestidad (15/78 criterios, ~19%).
- Sin llamadas de red propias, sin analítica, sin telemetría (auditado).
- Exportación CSV con sanitización anti-inyección.
- Política de privacidad completa (es/en).
- **Verificado en navegador real (04/08):** las 4 herramientas funcionan correctamente en
  github.com (CSP estricta) — historial, Escape limpio, overlays con posicionamiento exacto,
  validación rápida. Detalle completo en [`verificacion-manual.md`](./verificacion-manual.md).

## Para retomar la próxima sesión

Estado al cerrar el 07/08: **código y tests al día** (277 en verde, lint 0/0, CI verde, todo
commiteado y pusheado). Lo que queda es **verificación manual y trámites de tienda** — no hay
ninguna corrección de código pendiente.

**Antes de tocar nada:** recarga la extensión y **después la pestaña con Ctrl+Shift+R**, y comprueba
el paso 0.4 del guion (que salgan logs `TextReader:` en consola). Sin eso, cualquier observación es
papel mojado — así se perdió la sesión del 07/08.

1. **Re-verificar en navegador los cinco arreglos** (todos son de código ya escrito y testeado; solo
   falta confirmarlos en Chrome). Detalle de qué mirar en cada uno en `verificacion-manual.md`
   § Hallazgos:
   - **H1** en github.com: el contador "Elementos navegables" ya no debe contar los enlaces del
     mega-menú "Enterprise" cerrado, ni salir la cascada de reintentos en consola.
   - **H3** en cualquier sitio: recargar la extensión sin recargar la pestaña debe hacer aparecer el
     aviso rojo **solo, sin tocar nada, en menos de 5 s**. *(Ya confirmado el 07/08 — repetir solo
     si se toca `content.js`.)*
   - **H4** en Bershka: todos los elementos que se leen deben quedar resaltados, y el amarillo
     siempre sobre el elemento bajo el cursor. *(Ya confirmado el 07/08.)*
   - **H5** en Bershka: el aviso `Blocked aria-hidden…` no debe reaparecer.
2. **Repetir la pasada de humo de Bershka entera** — la del 07/08 está anulada (corrió sobre una
   pestaña huérfana). Las 4 herramientas, con el guion del bloque 4.
3. **Completar `aevi.org.es`** y decidir el sitio RTL: confirmar primero si `bershka.com/sa` sirve
   layout en árabe; si no, usar `ar.wikipedia.org`.
4. **Ejecutar los bloques 1-3 del guion** (regresiones vía fixture en `localhost:8080`). Siguen sin
   tocarse desde que se escribieron: cubren el off-by-one de keyboardNav, el scroll dentro de
   iframes y el validador de shadow DOM/iframes.
5. **Trámites de la Web Store** (sección 1): capturas, URL pública de la política, cuenta de
   desarrollador, justificación de permisos y `npm run package`. Es lo único que bloquea publicar.

### Deuda conocida que no bloquea

- `sidebar.js`, `popup.js`, `background.js` e `i18n.js` no tienen tests propios.
- Observación abierta del bloque 1 del guion: el filtro excluye por **presencia** del atributo
  `aria-hidden`, no por su valor, así que un `aria-hidden="false"` queda excluido aunque signifique
  «no oculto». Decidir si merece la pena comparar el valor.
- La build de `dist/` es del 30/07 y está **obsoleta**: hay que regenerarla con `npm run package`
  antes de subir nada a la tienda.
