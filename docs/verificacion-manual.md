# Guion de verificación manual en navegador

**Propósito:** cubrir lo que los tests unitarios **no pueden** cubrir. Los 252 tests corren sobre
jsdom, que no calcula layout, no pinta overlays, no ejecuta la Web Speech API ni carga iframes
reales. Todo lo de este documento requiere un Chrome de verdad y una persona mirando.

**Tiempo estimado:** ~60 min · **Última actualización:** 4 de agosto de 2026

Marca cada paso en la [hoja de resultados](#hoja-de-resultados) del final.

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
| 0.3 | Abre la consola de la extensión y activa el debug: `chrome.storage.local.set({ a11yGoDebug: true })` | Los logs de `logger.js` dejan de estar silenciados |

> **No cargues `dist/`.** Es una build minificada y **congelada** (`npm run build`); si la cargas
> estarás verificando código antiguo y las regresiones no aparecerán.

> **No uses `file://`.** Chrome trata cada URL `file:` como un **origen único (opaco)**, así que
> los iframes no cargan y los bloques 2 y 3 son imposibles de verificar.

> Tras cualquier cambio en el código o en los fixtures, recarga la extensión en
> `chrome://extensions/` **y** la página con **Ctrl+Shift+R** (recarga dura).

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

| Perfil | Sitio | Qué estresa |
|---|---|---|
| **SPA con routing de cliente** | [react.dev](https://react.dev) | La reinyección de `content.js` en navegaciones SPA (`background.js` + `webNavigation`). **Navega entre secciones con la herramienta activa** y confirma que sigue funcionando tras cambiar de ruta |
| **CSP estricta** | [github.com](https://github.com) | Que la inyección de estilos y overlays no la bloquee la Content Security Policy. Vigila la consola por violaciones de CSP |
| **RTL** | [ar.wikipedia.org](https://ar.wikipedia.org) | Posicionamiento de overlays y tooltips en dirección derecha-a-izquierda; el orden de tabulación en RTL |
| **DOM grande** | Un artículo largo de [en.wikipedia.org](https://en.wikipedia.org/wiki/World_War_II) | Rendimiento del validador y de la navegación visual con miles de nodos. **Cronometra la validación** |

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
| react.dev (SPA) | ☐ | ☐ | ☐ | ☐ | |
| github.com (CSP) | ☐ | ☐ | ☐ | ☐ | |
| ar.wikipedia.org (RTL) | ☐ | ☐ | ☐ | ☐ | |
| en.wikipedia.org (DOM grande) | ☐ | ☐ | ☐ | ☐ | |

Tiempo de validación en el DOM grande: ________ s

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

Marca como completadas en [`pendientes-produccion.md`](./pendientes-produccion.md) las dos entradas
de **(CALIDAD)** de la sección 2 y adjunta esta hoja rellena al commit de cierre.
