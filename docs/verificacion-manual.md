# Guion de verificación manual en navegador

**Propósito:** cubrir lo que los tests unitarios **no pueden** cubrir. Los 277 tests corren sobre
jsdom, que no calcula layout, no pinta overlays, no ejecuta la Web Speech API ni carga iframes
reales. Todo lo de este documento requiere un Chrome de verdad y una persona mirando.

**Tiempo estimado:** ~60 min · **Última actualización:** 7 de agosto de 2026

Marca cada paso en la [hoja de resultados](#hoja-de-resultados) del final.

> ## Estado de la pasada en curso (sesión 07/08/2026)
>
> **Los bloques 1, 2 y 3 (regresiones vía fixture) siguen sin ejecutar** — no se ha tocado
> `localhost:8080` en ninguna sesión todavía. El estado por sitio del bloque 4 está en la
> [hoja de resultados](#bloque-4-humo) del final, que es la única fuente de verdad.
>
> **Por qué se anuló Bershka.** Toda la sesión del 07/08 corrió sobre una pestaña cuyo content
> script había quedado huérfano tras recargar la extensión (ver el aviso del bloque 0 y el
> hallazgo H3). Con el contexto invalidado no había logs, el historial no se actualizaba y el
> lector seguía hablando, así que **ninguna observación de esa sesión es fiable** y hay que
> repetirla entera. Sí son válidos los dos hallazgos que salieron de ella (H3 y H4), porque
> ambos se confirmaron leyendo el código, no observando el navegador.
>
> **Para retomar:** empezar Bershka de cero. Recargar la extensión, **recargar la pestaña con
> Ctrl+Shift+R**, y confirmar que el debug está activo (deben salir logs `TextReader:` en consola
> al leer algo) **antes** de dar por buena ninguna observación. Los errores de consola
> `HeroCarousel.motion.tsx` y `useVideo.ts` son bugs propios del bundle de Bershka, ya
> confirmados ajenos a A11yGo; los avisos de precarga de fuentes `ABCWhyte-*.woff2`, también.

| Bloque | Qué verifica | Tiempo |
|---|---|---:|
| [0. Preparación](#0-preparación) | Entorno correcto | 5 min |
| [1. Regresión keyboardNav](#1-regresión-keyboardnav-off-by-one) | Fix del off-by-one (commit `94486d8`) | 10 min |
| [2. Regresión scroll en iframe](#2-regresión-scroll-dentro-de-un-iframe) | Reposicionado del overlay (cambio C) | 5 min |
| [3. Validador shadow/iframe](#3-regresión-del-validador-shadow-dom--iframes) | Que no se rompió al tocar `content.js` | 10 min |
| [4. Pasada de humo](#4-pasada-de-humo-en-sitios-reales) | Las 4 herramientas en la web real | 30 min |

---

## 0. Preparación

| # | Acción | Resultado esperado |
|---|---|---|
| 0.1 | En `chrome://extensions/`, activa **modo desarrollador** y pulsa **Cargar descomprimida** apuntando a la **raíz del repo** | La extensión aparece cargada, sin errores en rojo |
| 0.2 | Arranca un servidor local desde la raíz del repo: `npx http-server -p 8080 -c-1` | Sirve en `http://localhost:8080` |
| 0.3 | Abre la consola de la extensión y activa el debug: `chrome.storage.local.set({ a11yGoDebug: true })` | Los `log()` y `warn()` de `logger.js` dejan de estar silenciados (`error()` se ve siempre, con o sin flag) |
| 0.4 | **Comprueba que el debug llegó:** activa el Lector y lee algo; en la consola de la **página**, con el filtro en `TextReader`, deben salir varias líneas | Si no sale ninguna, el flag no ha llegado al content script: casi siempre es una pestaña huérfana → **Ctrl+Shift+R** y repite |

> **No cargues `dist/`.** Es una build minificada y **congelada** (`npm run build`); si la cargas
> estarás verificando código antiguo y las regresiones no aparecerán.

> **No uses `file://`.** Chrome trata cada URL `file:` como un **origen único (opaco)**, así que
> los iframes no cargan y los bloques 2 y 3 son imposibles de verificar.

> ### ⚠️ Recargar la extensión obliga a recargar TODAS las pestañas abiertas
>
> Tras cualquier cambio en el código o en los fixtures, recarga la extensión en
> `chrome://extensions/` **y después cada pestaña** con **Ctrl+Shift+R** (recarga dura).
>
> No es una recomendación de higiene: al recargar la extensión, las pestañas que ya tenían el
> content script inyectado quedan **huérfanas** (*"Extension context invalidated"*). A partir de ahí
> toda llamada `chrome.*` lanza, pero **el lector sigue hablando** porque la Web Speech API es del
> navegador y no de la extensión. El resultado es una extensión que aparenta funcionar mientras el
> panel no recibe nada y no se registra ni un log. Se perdió una sesión entera (07/08) por esto.
>
> Desde el 07/08 la extensión lo detecta y muestra un aviso rojo en la página; si lo ves, recarga.

---

## 1. Regresión keyboardNav (off-by-one)

**Contexto.** Hasta el commit `94486d8`, al activar la navegación por teclado el foco caía en el
**segundo** elemento del orden de tabulación en vez del primero, y el primer Shift+Tab iba al
penúltimo en vez de al último. El fix está en `utils/keyboard-nav.js:42-50` (`focusFirstElement()`
pone `currentIndex = -1` y delega en `focusNext()`, que avanza a 0). **Falta confirmarlo en
navegador.**

**Fixture:** `http://localhost:8080/test-fixtures/manual-keyboard-test.html`

La página rotula cada control con su posición esperada (`TAB 1` … `TAB 10`). Los tres primeros
tienen `tabindex` positivo y están **desordenados en el DOM** a propósito (DOM: 2→1→3; tabulación
correcta: 1→2→3).

| # | Acción | Resultado esperado |
|---|---|---|
| 1.1 | Abre el fixture y activa **Navegación por teclado** desde el popup | El punto azul de función activa aparece en el botón del popup |
| 1.2 | **Mira dónde cayó el foco** (contorno rosa) | **TAB 1** — el botón con `tabindex="1"`. ⚠️ Si cae en **TAB 2**, el off-by-one **sigue vivo** |
| 1.3 | Pulsa **Tab** nueve veces | Recorrido exacto: TAB 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 |
| 1.4 | Pulsa **Tab** una vez más | Vuelve a **TAB 1** (wrap-around) |
| 1.5 | Pulsa **Escape**, reactiva la herramienta y pulsa **Shift+Tab** como **primera** tecla | Va a **TAB 10**, el último. ⚠️ Si va a TAB 9, el off-by-one sigue vivo en el sentido inverso |
| 1.6 | Recorre el ciclo completo vigilando el bloque 3 del fixture | El foco **nunca** se detiene en los 5 excluidos: `tabindex="-1"`, `disabled`, `display:none`, `visibility:hidden`, `opacity:0` |
| 1.7 | Con el foco en TAB 10, pulsa **Enter** | El enlace TAB 4 se elimina del DOM y el botón cambia de texto |
| 1.8 | Sigue tabulando un ciclo completo | El recorrido salta TAB 4 (ahora 9 focusables). Verifica que el `MutationObserver` recalculó |
| 1.9 | Pulsa **Escape** | La herramienta se desactiva, desaparecen resaltados y tooltip, y el punto azul del popup se apaga |

### Observación adicional (no es aprobado/fallo)

El bloque 4 del fixture tiene un botón con `aria-hidden="false"`. El filtro actual
(`utils/keyboard-nav.js:117`) excluye por `!el.hasAttribute('aria-hidden')` — por la **presencia**
del atributo, no por su valor — así que ese botón debería quedar **excluido** pese a que
`aria-hidden="false"` significa «no oculto».

**Anota lo que observes.** Si queda excluido, coincide con el código actual y conviene abrir una
incidencia para comparar el valor en vez de la presencia. No bloquea la publicación.

> **Sobre la restauración de `tabindex`:** `keyboard-nav.js` solo inyecta `tabindex="0"` como
> **fallback**, cuando `element.focus()` nativo falla (líneas 344-352 y 490-498). En este fixture
> todos los controles son focusables de forma nativa, así que **la inyección no se disparará** y
> aquí no hay nada que comprobar. Este camino se ejercita en el bloque 4, sobre sitios reales.

---

## 2. Regresión: scroll dentro de un iframe

**Contexto.** El cambio C (commit `da1b30d`) hizo que el overlay del highlight se reposicione
cuando el scroll ocurre **dentro** de un iframe same-origin, no solo en la página anfitriona. Los
eventos de scroll no cruzan fronteras entre documentos, así que `content.js:495-508` se suscribe
además a las ventanas de los iframes contenedores. **`content.js` no tiene test para esto.**

**Fixture:** `http://localhost:8080/test-fixtures/manual-a11y-test.html` (tarjeta **C**)

El iframe se ha rellenado con texto inerte precisamente para que tenga **scroll interno propio**;
sin ese relleno este bloque no se puede verificar.

| # | Acción | Resultado esperado |
|---|---|---|
| 2.1 | Ejecuta **Validar Accesibilidad** desde el popup | Aparecen los resultados en el panel lateral |
| 2.2 | Haz click en el resultado `#frame-same ::iframe:: #iframe-img` | La página baja hasta el iframe y el overlay pulse cae **exactamente** sobre la imagen azul, dentro del iframe |
| 2.3 | **Sin tocar nada más**, haz scroll **dentro del iframe** (rueda con el cursor sobre él) | ⭐ El overlay **acompaña** a la imagen mientras se mueve. Si se queda anclado, el cambio C está roto |
| 2.4 | Haz scroll en la **página anfitriona** (cursor fuera del iframe) | El overlay sigue acompañando al elemento |
| 2.5 | Repite 2.2-2.3 con `#frame-same ::iframe:: #iframe-shadow-host >>> img` | Igual sobre la imagen roja. **Es el caso más exigente**: compone el offset del shadow y el del iframe a la vez |
| 2.6 | Espera ~12 s sin tocar nada | El overlay se auto-elimina |

---

## 3. Regresión del validador (shadow DOM + iframes)

Esto ya se verificó end-to-end el 25/07, pero desde entonces **se ha tocado `content.js`**, así que
merece una pasada rápida de regresión.

**No dupliques el procedimiento:** sigue **[`test-fixtures/README.md`](../test-fixtures/README.md)**,
que tiene la tabla completa de resultados esperados.

| # | Acción | Resultado esperado |
|---|---|---|
| 3.1 | Valida `manual-a11y-test.html` y compara con la tabla del README | Exactamente **4 errores, 1 advertencia, 1 info** |
| 3.2 | Click en `#shadow-host-b >>> div > img` | Overlay sobre la imagen morada **dentro del shadow root** |
| 3.3 | Comprueba la tarjeta D | Un `info` de `crossOriginIframe` con el recuento; su contenido no se audita |
| 3.4 | Confirma que **no** aparece `invalidHeadingOrder` | El `<h1>` del iframe convive con el de la página sin falso positivo (evaluación por-documento) |

---

## 4. Pasada de humo en sitios reales

El fixture es sintético y benévolo. Esto mide si la extensión aguanta la web real: DOM enormes,
CSP estrictas, routing de cliente y RTL.

**En los cuatro sitios, prueba las 4 herramientas** (Lector, Navegación por teclado, Navegación
visual, Validar Accesibilidad) y aplica estos criterios:

- ✅ **Pasa:** la herramienta se activa, hace su trabajo y **Escape** la desactiva limpiamente.
- ❌ **Falla:** la pestaña se cuelga (>10 s sin responder), la página se rompe visualmente, hay
  errores en consola, o Escape no desactiva.

### Sitios propuestos

Actualizado el 04/08 con los sitios realmente usados (elegidos por la usuaria en vez de la
sugerencia original). Sirven igual de bien y cubren los mismos perfiles, salvo el DOM grande, que
no está cubierto por ninguno de los cuatro — considera añadir un quinto sitio si quieres esa señal.

| Perfil | Sitio | Qué estresa |
|---|---|---|
| **CSP estricta** | [github.com](https://github.com) | Que la inyección de estilos y overlays no la bloquee la Content Security Policy. Vigila la consola por violaciones de CSP |
| **E-commerce / JS pesado** | [bershka.com/es/h-woman.html](https://www.bershka.com/es/h-woman.html) | Framework React con carrusel/vídeo propios, muchas imágenes, filtros dinámicos. Ojo: el sitio tiene bugs propios en consola (`HeroCarousel.motion.tsx`, `useVideo.ts`) — confirmado que no son de A11yGo |
| **Baseline / español** | [aevi.org.es](https://aevi.org.es) | Sitio de una asociación de accesibilidad — referencia de comparación, contenido en español para el Lector |
| **RTL (candidato)** | [bershka.com/sa/h-woman.html](https://www.bershka.com/sa/h-woman.html) | Misma tienda en la región de Arabia Saudí — **sin confirmar todavía si sirve el layout en árabe/RTL**; si no lo hace, usa `ar.wikipedia.org` como alternativa segura |

*(Alternativas descartadas esta ronda, útiles si hace falta DOM grande o SPA con routing de
cliente: [react.dev](https://react.dev), un artículo largo de
[en.wikipedia.org](https://en.wikipedia.org/wiki/World_War_II).)*

### Comprobaciones transversales

| # | Acción | Resultado esperado |
|---|---|---|
| 4.1 | En cada sitio, activa cada herramienta y desactívala con **Escape** | Activación y desactivación limpias, sin residuos visuales |
| 4.2 | En el DOM grande, cronometra **Validar Accesibilidad** | Termina en un tiempo razonable sin congelar la pestaña |
| 4.3 | Tras usar **Navegación por teclado** en un sitio real y salir con Escape, inspecciona el DOM en DevTools | No queda ningún `tabindex` inyectado que no estuviera antes (aquí **sí** se ejercita el fallback de inyección) |
| 4.4 | Prueba el **Lector** en el sitio RTL y en uno en inglés | Detecta el idioma correcto y no deletrea palabras |
| 4.5 | Activa una herramienta y luego otra sin desactivar la primera | **Exclusión mutua:** la primera se desactiva sola; nunca hay dos activas a la vez |
| 4.6 | Con una herramienta activa, navega a otra ruta en la SPA | La herramienta sigue operativa (o se reinyecta) sin dejar la página en estado roto |
| 4.7 | Revisa la consola de la página y la del service worker en los 4 sitios | Sin excepciones no capturadas |

---

## Hallazgos registrados (no bloqueantes)

H1 y H2 salieron de la pasada por github.com (04/08); H3, H4 y H5, de la pasada por Bershka (07/08).
**Los cinco quedan corregidos con TDD** (25 tests nuevos, suite en 277). Todos necesitan
re-verificación en navegador. Se conserva la evidencia original de repro.

### H1. El filtro de focusables no comprueba visibilidad de ancestros — ✅ CORREGIDO (07/08)

`utils/keyboard-nav.js:112-117` (`updateFocusableElements`) solo mira `display`/`visibility`/
`opacity` del **propio elemento** vía `getComputedStyle`. Si un elemento está dentro de un
contenedor ancestro oculto (p. ej. un menú desplegable cerrado), su computed style individual
sigue siendo "visible" — `getComputedStyle` no propaga el `display:none` de un ancestro — así que
pasa el filtro y se cuenta como navegable, pero el navegador se niega a enfocarlo.

**Repro:** en github.com, con Navegación por teclado activa, tabular hasta los enlaces del mega-menú
"Enterprise" (cerrado). Consola:
```
KeyboardNav: ✗ enlace (índice 12) no se pudo enfocar. Razón: foco capturado por otro elemento (enlace)
KeyboardNav: focus() llamado pero activeElement es: 
KeyboardNav: enfoque con tabindex falló, activeElement es: 
```
en cadena para varios índices consecutivos (el bloque de enlaces del menú cerrado).

**Impacto:** el contador "Elementos navegables" del panel queda inflado (en github.com marcó 134,
probablemente por encima del real). El recorrido **no se atasca** — el bucle de reintento
(`attempts++`) salta el elemento y sigue — pero es ruido y un dato incorrecto en el panel.

**Fix aplicado (07/08):** helper compartido `hasHiddenAncestor()` en `utils/dom-utils.js` — recorre
los ancestros hasta `body` buscando `display:none`, `visibility:hidden` o `aria-hidden="true"` —
añadido al filtro de `updateFocusableElements()`. Se descartaron las alternativas anotadas:
`offsetParent` falla con `position: fixed` (y siempre es `null` en jsdom, lo que impedía testearlo)
y `checkVisibility()` no está en jsdom. `visual-nav.js` ya hacía este recorrido a mano; ahora usa
el mismo helper. Tests: 5 del helper (`tests/dom-utils.test.js`) + 1 de integración
(`tests/keyboard-nav.test.js`). **Re-verificar en github.com:** el contador de navegables no debe
incluir los enlaces del mega-menú "Enterprise" cerrado ni aparecer los reintentos en consola.

### H2. `logger.warn`/`logger.error` no respetan el flag de debug — ✅ CORREGIDO (07/08)

`utils/logger.js:28-33`:
```js
warn(...args) { console.warn(...args); },
error(...args) { console.error(...args); },
```
A diferencia de `log()`, no comprueban `debugEnabled`. Los warnings de H1 (y cualquier otro
`logger.warn`/`logger.error` del código) se imprimen **siempre**, incluso con
`a11yGoDebug` desactivado — es decir, cualquier usuaria real con la consola abierta los vería en
producción, no solo quien active el modo debug.

**Nota:** puede ser intencional (mantener warnings/errores siempre visibles es una práctica común),
pero conviene decidirlo explícitamente en vez de que sea un efecto colateral no documentado.

**Fix aplicado (07/08), corregido el mismo día:** el primer intento silenció `warn()` **y**
`error()`. Fue un error de criterio y se pagó caro esa misma tarde: con `error()` mudo, el
contexto invalidado (H3, abajo) no dejó ni un rastro en consola y costó horas de diagnóstico.
**Decisión final:** `log()` y `warn()` respetan el flag; **`error()` nunca se silencia**, porque un
fallo real debe ser diagnosticable sin activar el debug. Tests en `tests/logger.test.js` (7).

### H3. El contexto de extensión invalidado fallaba en silencio — ✅ CORREGIDO (07/08)

Cuando se recarga la extensión con una página ya abierta, su content script queda huérfano y toda
llamada `chrome.*` lanza `Extension context invalidated`. Antes del arreglo eso no producía ninguna
señal: `logger.js` se traga la excepción en su `try/catch` (línea 9-22) y `debugEnabled` se queda en
`false` para siempre, `safeSendMessage` hacía `return` mudo, y **el lector seguía leyendo en voz
alta** porque la Web Speech API no depende de la extensión. Diagnóstico resultante: "lee bien pero
no aparece nada en ningún sitio", sin una sola pista en consola.

**Repro:** abrir cualquier página con A11yGo activo → recargar la extensión en `chrome://extensions/`
→ volver a la pestaña sin recargarla. En la consola, `chrome.storage.local.get(...)` lanza
`Uncaught Error: Extension context invalidated`.

**Fix aplicado:** `isExtensionContextValid()` + `reportInvalidContext()` en `content.js`.
`safeSendMessage` y el nuevo `safeStorageSet` lo comprueban antes de cada llamada y, al fallar,
registran un `logger.error` y pintan **una sola vez** un aviso `role="alert"`
(`#a11ygo-context-invalidated`, solo en el frame principal) que pide recargar la página. El texto
sale de `i18n.t('contextInvalidated')`; `content.js` carga i18n junto al resto de módulos, con el
contexto todavía válido, para poder traducirlo cuando ya no queden APIs. 4 tests en
`tests/content.test.js`.

### H4. El resaltado amarillo se salta elementos — ✅ CORREGIDO (07/08)

Al pasar el hover, unos elementos se resaltan en amarillo y otros no, **aunque todos se leen bien**.
Reproducido en Bershka (07/08). No es aleatorio: depende de cómo esté partido el texto en el DOM.

Para **leer**, `getTextFromElement()` (`utils/text-reader.js:548-557`) concatena el texto de los
hijos separándolos con un espacio: de `<a><span>Manga</span><span>Larga</span></a>` saca
`"Manga Larga"`. Para **resaltar**, `highlightText()` (`utils/text-reader.js:1044-1047`) recorre los
nodos de texto buscando uno que contenga esa cadena **entera dentro de un único nodo**:

```js
if (nodeText && nodeText.includes(text)) {
```

Ahí no hay ningún nodo con `"Manga Larga"` — hay uno con `"Manga"` y otro con `"Larga"` — así que no
encuentra nada y no resalta, mientras la lectura funciona igual. En marcado plano (github.com)
coincide casi siempre; en React con `<span>` anidados (Bershka) falla constantemente.

**Segundo defecto en la misma función:** busca desde `document.body` y resalta **la primera
coincidencia de toda la página**, no la del elemento que se está leyendo. Si la misma etiqueta
aparece en un menú visible y en otro oculto, puede pintar el amarillo en el elemento equivocado.
Tampoco atraviesa shadow DOM ni iframes.

**Fix aplicado (07/08):** `highlightText(text, element)` acota la búsqueda al elemento que se está
leyendo y, cuando el texto no cabe en ningún nodo suelto, resalta el elemento completo con
`highlightWholeElement()`; `removeHighlight()` restaura el `style` original. El elemento viaja desde
el hover hasta el `onstart` del utterance vía `read(text, element)` → `this.currentReadElement`.
5 tests en `tests/text-reader.test.js`. **Re-verificar en Bershka:** todos los elementos que se leen
deben quedar resaltados, y el amarillo debe caer siempre sobre el elemento bajo el cursor.

### H5. El lector provocaba una violación de accesibilidad — ✅ CORREGIDO (07/08)

Encontrado en Bershka (07/08) a partir de este aviso de Chrome:

```
Blocked aria-hidden on an element because its descendant retained focus.
Element with focus: <h2 class="cms-slide-overlay__slide-title ... textreader-focusable">
Ancestor with aria-hidden: <div class="swiper-slide swiper-slide-prev">
```

`textreader-focusable` es la clase que pone `makeContentElementsFocusable()`. El lector inyectaba
`tabindex` en un `<h2>` que vivía dentro de una slide del carrusel marcada `aria-hidden="true"` (la
diapositiva anterior, fuera de pantalla) y luego lo enfocaba. Chrome bloquea el `aria-hidden` porque
un elemento con foco no puede ocultarse a los lectores de pantalla. Es decir: **la herramienta de
accesibilidad provocaba el problema de accesibilidad**.

Misma familia que H1 — el filtro de `text-reader.js:299-301` solo miraba `display`/`visibility`/
`opacity` del propio elemento, sin comprobar ancestros ni `aria-hidden` — pero en un tercer sitio,
porque el lector tiene su propia implementación separada de la de `keyboard-nav`/`visual-nav`.

**Fix aplicado:** reutilizar `hasHiddenAncestor()` en ese filtro, más la comprobación de
`aria-hidden="true"` en el propio elemento. 3 tests en `tests/text-reader.test.js`.
**Re-verificar en Bershka:** el aviso `Blocked aria-hidden…` no debe volver a aparecer.

---

## Hoja de resultados

Fecha: ____________  Versión/commit: ____________  Chrome: ____________

### Bloques 1-3 (regresiones)

| Paso | Resultado | Observaciones |
|---|:---:|---|
| 1.2 Foco inicial en **TAB 1** ⭐ | ☐ ✅ ☐ ❌ | |
| 1.3 Recorrido 2→10 | ☐ ✅ ☐ ❌ | |
| 1.4 Wrap-around a TAB 1 | ☐ ✅ ☐ ❌ | |
| 1.5 Shift+Tab inicial → **TAB 10** ⭐ | ☐ ✅ ☐ ❌ | |
| 1.6 Excluidos nunca reciben foco | ☐ ✅ ☐ ❌ | |
| 1.8 Salta el elemento eliminado | ☐ ✅ ☐ ❌ | |
| 1.9 Escape desactiva limpiamente | ☐ ✅ ☐ ❌ | |
| Observación `aria-hidden="false"` | ☐ excluido ☐ focusable | |
| 2.3 Overlay sigue al scroll **en** el iframe ⭐ | ☐ ✅ ☐ ❌ | |
| 2.5 Caso combinado iframe + shadow ⭐ | ☐ ✅ ☐ ❌ | |
| 2.6 Auto-eliminación a los 12 s | ☐ ✅ ☐ ❌ | |
| 3.1 Reporte 4 / 1 / 1 | ☐ ✅ ☐ ❌ | |
| 3.2 Overlay en shadow root | ☐ ✅ ☐ ❌ | |
| 3.3 Aviso cross-origin | ☐ ✅ ☐ ❌ | |
| 3.4 Sin `invalidHeadingOrder` falso | ☐ ✅ ☐ ❌ | |

### Bloque 4 (humo)

| Sitio | Lector | Teclado | Visual | Validador | Observaciones |
|---|:---:|:---:|:---:|:---:|---|
| github.com (CSP) | ✅ | ✅ | ✅ | ✅ | 04/08. Sin errores propios de consola. Validador: 6 errores/8 advertencias/1 info, rápido, overlays exactos. De aquí salieron H1 y H2 |
| bershka.com/es (e-commerce) | ❌ | ☐ | ☐ | ☐ | **Anulada (07/08): pestaña huérfana, repetir de cero.** De aquí salieron H3, H4 y H5, válidos por confirmarse en código. Los errores `HeroCarousel.motion.tsx` / `useVideo.ts` y los avisos de precarga `ABCWhyte-*.woff2` son de Bershka, no nuestros |
| aevi.org.es (baseline es) | ☐ | ☐ | ☐ | ☐ | No iniciado |
| bershka.com/sa (RTL candidato) | ☐ | ☐ | ☐ | ☐ | No iniciado — confirmar primero si el sitio sirve layout RTL real |

Tiempo de validación en github.com: rápido, no cronometrado con precisión (percibido como pocos
segundos). Ningún sitio de esta ronda cubre el perfil "DOM grande" — usa
`en.wikipedia.org/wiki/World_War_II` si quieres esa señal.

### Re-verificación de los hallazgos corregidos

| Hallazgo | Qué confirmar | Resultado |
|---|---|---|
| H1 | En github.com, el contador de navegables no incluye el mega-menú "Enterprise" cerrado ni salen reintentos en consola | ☐ ✅ ☐ ❌ |
| H2 | Con el debug apagado, un `logger.error` sigue viéndose en consola | ☐ ✅ ☐ ❌ |
| H3 | Recargar la extensión sin recargar la pestaña saca el aviso rojo solo, en menos de 5 s | ✅ **07/08** |
| H4 | Todos los elementos leídos quedan resaltados, y el amarillo cae sobre el elemento del cursor | ✅ **07/08** |
| H5 | En Bershka no reaparece `Blocked aria-hidden…` en consola | ☐ ✅ ☐ ❌ |

---

## Si algo falla

1. **Anótalo con precisión**: sitio, herramienta, pasos, lo esperado y lo observado. Captura la
   consola.
2. **Escribe primero un test que reproduzca el fallo** en `tests/` y solo después toca el código
   (convención del proyecto para `a11y-checker.js` y `dom-utils.js`; aplícala también al resto).
3. Si el fallo es de **layout u overlay**, probablemente no sea reproducible en jsdom: documenta el
   caso en el fixture correspondiente para no perderlo.
4. Tras corregir: `npm run lint` (0/0) y `npm test` en verde antes de commitear.

## Cuando todo pase

Marca como completadas en [`pendientes-produccion.md`](./pendientes-produccion.md) las entradas de
**(CALIDAD)** de la sección 2 que queden abiertas (las de regresiones vía fixture y la pasada de
humo) y adjunta esta hoja rellena al commit de cierre.
