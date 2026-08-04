> # ✅ DOCUMENTO HISTÓRICO — RESUELTO Y ARCHIVADO
>
> **Las 30 incidencias de este plan se corrigieron en julio de 2026, en 4 fases.** El documento se
> conserva por su valor de contexto —explica *por qué* el código tiene la forma que tiene— pero
> **ya no describe trabajo pendiente**. No lo uses como lista de tareas.
>
> - Resumen de las correcciones: sección «Correcciones realizadas» de [`CLAUDE.md`](../../CLAUDE.md).
> - Trabajo realmente pendiente: [`docs/pendientes-produccion.md`](../pendientes-produccion.md).
>
> Las referencias a archivos y líneas de aquí abajo son de **julio de 2026** y muchas han quedado
> desfasadas: desde entonces se añadieron el traversal de shadow DOM, la auditoría de iframes y
> 252 tests. Verifica contra el código actual antes de fiarte de cualquier cita.
>
> *Archivado el 4 de agosto de 2026 (antes en la raíz del repo como `BUGFIX_PLAN.md`).*

---

# Plan de arreglo — Bug hunt A11yGo (2026-07-10)

Resultado de una revisión con 4 agentes en paralelo (motor de validación, herramientas
interactivas, mensajería/ciclo de vida, sidebar/i18n/build) + verificación manual de cada
hallazgo contra el código. Todos los items de este documento fueron confirmados leyendo el
archivo y línea citados — no son sospechas sin verificar.

Cómo usar este documento: cada fase es un lote de commits razonable. Antes de empezar una
fase, releer los archivos citados (el código puede haber cambiado desde el bug hunt). Añadir
un test en `tests/` para cada fix del motor de validación (`a11y-checker.js`, `dom-utils.js`)
antes de tocar el código — el proyecto ya usa Vitest.

---

## Fase 1 — Ciclo de vida y desactivación (prioridad máxima)

Estos bugs están entrelazados: todos parten de que `notifyDeactivation()` en los módulos usa
`chrome.runtime.sendMessage`, que **nunca vuelve al propio content script** que lo envió (solo
llega a páginas de la extensión, como el sidebar). Por eso `activeFunctions` en `content.js`
queda desincronizado del estado real tras cualquier Escape.

1. **[ALTA] No se puede reactivar una herramienta tras Escape; el indicador del popup queda encendido para siempre.**
   `content.js:120-135` (handlers `*Deactivated` inalcanzables) + `text-reader.js` / `keyboard-nav.js` / `visual-nav.js` / `a11y-checker.js` (`notifyDeactivation()`).
   Fix: los módulos son instanciados directamente por `content.js`, así que en vez de mensajería
   usar un callback directo, p. ej. `module.onDeactivate = () => { activeFunctions.delete(fn); chrome.storage.local.set({activePanel:'default'}); }`
   asignado al instanciar cada módulo en `content.js`. Mantener el `chrome.runtime.sendMessage`
   solo para notificar al sidebar (eso sí funciona, es un contexto distinto).

2. **[ALTA] El TTS sigue hablando después de desactivar el lector.**
   `text-reader.js:643-934`. `read()` solo comprueba `this.isActive` en la línea 644; hay 5
   puntos `await` después (líneas ~678, ~707-708, ~720, ~885, ~928) sin re-chequeo antes de
   `speak()` (línea 934).
   Fix: añadir `if (!this.isActive) return;` inmediatamente después de cada `await` relevante,
   y antes de la llamada final a `speak()`.
   Relacionado: el retry de `text-reader.js:896-919` (`setTimeout` de 100ms que llama
   `speak(this.utterance)`) tampoco comprueba `isActive` ni se cancela en `deactivate()` —
   guardar el id del timer en la instancia y hacer `clearTimeout` en `deactivate()`.

3. **[ALTA] KeyboardNav deja `tabindex="0"` permanente en la página bajo prueba.**
   `keyboard-nav.js:331-351`. El "Método 2" de `focusNext`/`focusPrevious` solo restaura el
   tabindex original si el `focus()` falla; si tiene éxito, el atributo inyectado queda para
   siempre — enmascarando justo el defecto de accesibilidad que el QA está buscando.
   Fix: registrar cada tabindex inyectado en un `Map(elemento → valorOriginal | null)` a nivel
   de instancia, y restaurar todos en `deactivate()` (no solo cuando falla el focus).
   Nota menor asociada: el check vía `requestAnimationFrame` (líneas 321-325) asigna
   `focused = true` en un callback que corre después de que la función ya continuó — no tiene
   efecto real, se puede eliminar.

4. **[ALTA] La activación responde `success: true` aunque haya fallado.**
   `content.js:91-97` + `139-175` (`activateFunction`) + `177-199` (`activateFunctionDirectly`).
   `modulesReadyPromise` nunca rechaza (su `catch` interno en la IIFE solo pone
   `modulesReady = false`), así que el `await` en `activateFunction` siempre resuelve y
   `sendResponse({success:true})` se envía aunque el módulo sea `null`.
   Fix: que `activateFunctionDirectly` devuelva `false`/lance cuando `!modulesReady` o el
   módulo es null, y que `activateFunction` propague ese fallo hasta el `sendResponse` del
   listener `onMessage` (`content.js:91-97`) para que el popup pueda mostrar un error real
   en vez de cerrarse silenciosamente.

**Verificación de fase 1**: cargar la extensión sin empaquetar, activar cada herramienta,
pulsar Escape, reactivar desde el popup — debe funcionar en el segundo intento. Inspeccionar
el DOM con devtools tras usar KeyboardNav para confirmar que no quedan `tabindex="0"` inyectados.

---

## Fase 2 — Corrección del motor de validación (falsos positivos/negativos)

5. **[ALTA] `parseColor` ignora alpha y falla con sintaxis de color moderna.**
   `a11y-checker.js:798-809`.
   - `color.match(/\d+/g)` descarta el canal alpha de `rgba()` → `rgba(0,0,0,0.3)` sobre blanco
     (contraste real ~2.3:1, incumple AA) se calcula como negro opaco → 21:1 → no se reporta.
   - Cualquier color que no empiece por `rgb`/`#` (p. ej. `oklch(...)`, `lab(...)`,
     `color(srgb ...)`, que Chrome preserva en `getComputedStyle` en algunos casos) cae al
     fallback `[255,255,255]` → contraste falso de 1:1 → error `lowContrast` masivo y erróneo.
   Fix: parsear alpha de `rgba()`/`hsla()` y componerlo sobre el color de fondo detectado
   (fórmula estándar de alpha compositing); para hex soportar también 3/4/8 dígitos
   (`#fff`, `#fff0`, `#ffffffcc`); para sintaxis no reconocida, **omitir el elemento** del
   check en lugar de asumir blanco (evita el falso positivo masivo).
   Añadir tests en `tests/a11y-checker.test.js` para `rgba` con alpha parcial, hex de 3/4
   dígitos, y una función de color no soportada (debe no arrojar y no reportar).

6. **[ALTA] `getDOMPosition` produce orden incoherente → falsos positivos/negativos en `mixedTabOrder`.**
   `a11y-checker.js:624-646` (usado en 594, 603).
   Suma `+1000` por cada hermano previo de cada ancestro sin ponderar profundidad; posiciones
   de elementos a distinta profundidad no son comparables entre sí.
   Fix: eliminar `getDOMPosition` por completo y usar `compareDOMOrder` de
   `utils/dom-utils.js` (ya existe, usa `compareDocumentPosition`, ya tiene tests en
   `tests/dom-utils.test.js`). Cambiar la comparación de `elDomPosition < domPosition` a
   `compareDOMOrder(el, firstPositiveElement) < 0`.

7. **[MEDIA] Falsos positivos puntuales del checker:**
   - `alt=""` con `role="presentation"` genera warning (`emptyAltText`) contradiciendo el
     propio mensaje del check — `alt=""` es la técnica WCAG H67 correcta para decorativas.
     `a11y-checker.js:139-141`. Fix: excluir cuando `role === 'presentation' || role === 'none'`.
   - `aria-checked="mixed"` (válido por spec ARIA, checkbox tri-estado) se marca como
     `invalidAria`. `a11y-checker.js:450-454`. Fix: para `aria-checked` aceptar también
     `"mixed"`; para `aria-expanded`/`aria-selected` aceptar `"undefined"`.
   - El regex de enlaces genéricos no detecta "click here" (caso más común) ni "haz clic
     aquí"/"clic aquí" — está anclado a palabras sueltas, no frases.
     `a11y-checker.js:388`. Fix: ampliar el patrón para cubrir frases compuestas.
   - `checkFormLabels` exige label en `input type="image"` (nombre real viene de `alt`) y
     `type="reset"` (nombre por defecto/`value`). `a11y-checker.js:236-238`. Fix: excluir
     ambos tipos junto a `hidden`/`submit`/`button`.

8. **[MEDIA] `getAccessibleName` con precedencia contraria a la spec accname.**
   `dom-utils.js:82-108`. Evalúa `aria-label` antes que `aria-labelledby` (orden invertido) y
   `title` antes que label asociado/contenido de texto (debería ser el último recurso).
   Fix: reordenar a labelledby → label asociado → aria-label → contenido de texto → title →
   alt de imagen descendiente, siguiendo https://www.w3.org/TR/accname-1.2/.
   Ojo: `dom-utils.js` ya tiene tests (`tests/dom-utils.test.js`) — actualizarlos junto con el fix.

9. **[MEDIA] Fallback de `getElementSelector` usa índice global como `:nth-of-type`.**
   `a11y-checker.js:917-921`. `:nth-of-type` cuenta entre **hermanos**, pero el fallback usa
   `document.getElementsByTagName(...)` (todo el documento) como índice → selector que
   apunta a otro elemento, y el highlight del sidebar marca el elemento equivocado.
   Fix: cuando se llega al fallback, construir el índice contando solo entre
   `element.parentElement.children` del mismo tag (igual que ya hace el camino principal en
   líneas 889-893, pero sin el límite de profundidad de 6).

10. **[BAJA] Hex de 3 dígitos en gradientes produce `NaN`.**
    `a11y-checker.js:802-807` vs `extractColorFromStop` (línea 746, acepta `{3,8}` dígitos).
    `parseColor('#fff')` da `g=15, b=NaN`. En la práctica es difícil de disparar porque
    `getComputedStyle` normaliza a `rgb()`, pero conviene cerrar el caso junto con el fix de
    la tarea 5 (mismo parser).

**Verificación de fase 2**: correr `npm test` tras cada fix (25 tests existentes no deben
romperse) + los tests nuevos añadidos. Probar manualmente contraste con `rgba()` con alpha,
con una hoja de estilos que use `oklch()`, y orden de tabulación mixto en una página de prueba.

---

## Fase 3 — Mensajería y sidebar

11. **[ALTA] Un fallo de la validación se reporta como "sin problemas de accesibilidad".**
    `sidebar.js:198-202` + `250-255`. El `catch` de `runA11yCheck()` llama `updateResults([])`,
    que renderiza el mensaje de éxito. Fix: en el catch, mostrar un mensaje de error distinto
    (nueva clave i18n, p. ej. `checkFailedError`) en vez de reusar el estado "0 resultados".

12. **[ALTA] `activeTabId` obsoleto: highlights y toggles de VisualNav van a la pestaña equivocada.**
    `sidebar.js:6, 152-160, 178`. Se asigna solo en `runA11yCheck()` y nunca se invalida.
    Fix: eliminar la variable y consultar siempre `chrome.tabs.query({active:true, currentWindow:true})`
    en `sendToContent`, o suscribirse a `chrome.tabs.onActivated`/`onRemoved` para mantenerla
    sincronizada si se prefiere cachear por rendimiento.

13. **[MEDIA] Carrera multi-frame en `runA11yCheck` y en `highlightElement`.**
    `content.js:106-113, 117-119, 292-295`. Con `all_frames: true`, el primer frame en
    responder gana; los iframes responden `[]` casi instantáneamente. `highlightElement`
    tampoco tiene el guard `window !== window.top` que sí tienen `activate` y `runA11yCheck`.
    Fix: en `sidebar.js`, enviar ambos mensajes con `{frameId: 0}` en las opciones de
    `chrome.tabs.sendMessage(tabId, message, {frameId: 0}, callback)` para dirigirlos solo al
    frame principal; añadir el guard `window.top` en `highlightElement` como defensa adicional.

14. **[MEDIA] `background.js` no responde nunca pese a prometer respuesta asíncrona.**
    `background.js:9-25`. `return true` incondicional sin llamar `sendResponse` →
    "message port closed" en cada `sendMessage` del sidebar (velocidad, play/pause/stop).
    Fix: devolver `true` solo en la rama que de verdad responderá, o llamar
    `sendResponse({success:true})` tras el relay. Revisar también `background.js:12-16`
    (`chrome.tabs.sendMessage` sin callback — añadir uno que consuma `chrome.runtime.lastError`).

15. **[MEDIA] Sidebar no filtra mensajes por pestaña/ventana de origen.**
    `sidebar.js:90-117`. Con dos ventanas abiertas, actividad de una pestaña contamina el
    sidebar de la otra. Fix: comparar `sender.tab.id` contra la pestaña que el sidebar
    considera activa antes de aplicar `updateResults`/`updateFocus`/etc.

16. **[BAJA] Handler `chrome.action.onClicked` inalcanzable.**
    `background.js:28-30` vs `manifest.json:17` (`default_popup` definido → el evento nunca
    dispara). Fix: eliminar el listener muerto, o quitar `default_popup` si se quiere que el
    clic en el icono abra el sidebar directamente (decisión de producto, preguntar antes).

17. **[BAJA] `executeScript` sin `await` dentro de su propio `try/catch`.**
    `background.js:45-48`. Fix: añadir `await` a la llamada.

18. **[BAJA] Clave i18n `notSupportedPage` no existe.**
    `popup.js:107` vs `utils/i18n.js`. El fallback `|| '...'` es inalcanzable porque `i18n.t()`
    devuelve la clave literal (truthy) cuando no la encuentra. Fix: añadir la clave a
    `utils/i18n.js` en `es` y `en`.

---

## Fase 4 — Pulido (resto de medias/bajas, no bloqueantes)

19. **Overlays huérfanos de VisualNav.** `visual-nav.js:93-98, 40`. `updateSetting()` no
    comprueba `isActive`; tras Escape, tocar un checkbox del sidebar recrea overlays sin vía
    de limpieza. Fix: `updateSetting()` debe ser no-op si `!this.isActive`.

20. **Bucles rAF acumulables.** `visual-nav.js:460-474`. `updateLoop` no guarda su id de
    `requestAnimationFrame`; deactivate→activate rápido puede dejar bucles duplicados
    corriendo a 60fps. Fix: guardar el id en la instancia y cancelarlo en `deactivate()`.

21. **Highlight duplicador de texto.** `text-reader.js:1036-1050, 1063-1082`. El fallback de
    `highlightText` cuando `range.surroundContents()` falla inserta un `<mark>` con una
    *copia* del texto (el original permanece), y `removeHighlight()` consolida el duplicado
    como texto permanente. Fix: no clonar texto — usar un overlay posicionado con
    `getBoundingClientRect()` en vez de manipular el DOM de la página, o al menos eliminar
    el nodo de texto original junto con insertar el `<mark>`.

22. **Polling de voces sin condición de parada.** `text-reader.js:62-92, 596-607`. Bucle de
    100ms indefinido si el navegador nunca expone voces; además pisa
    `speechSynthesis.onvoiceschanged` de la página host sin restaurarlo. Fix: limitar
    reintentos (p. ej. 20 intentos / 2s total) y guardar/restaurar el handler previo si existía.

23. **`read()` no reentrante.** `text-reader.js:780, 934`. `this.utterance` compartido entre
    llamadas concurrentes puede causar doble lectura al tabular rápido. Fix: usar un token de
    invocación (`this.readToken++`) y comprobar que sigue siendo el vigente antes de `speak()`.

24. **Detección de idioma muerta.** `text-reader.js:29-46, 563-567`. `detectPageLanguage()`
    siempre devuelve un string por defecto `es-ES`, dejando inalcanzable el fallback por
    contenido; además se calcula una sola vez en el constructor y no se actualiza en SPAs
    que cambian `document.documentElement.lang`. Fix: recalcular en cada `read()` en vez de
    cachear en el constructor, y solo aplicar el default cuando no hay `lang` ni meta tag.

25. **CSV injection.** `sidebar.js:573-580`. Prefijos `=`,`+`,`-`,`@` en campos con texto de
    la página (controlado por terceros) se ejecutan como fórmula al abrir en Excel. Fix:
    prefijar con `'` (o espacio) cualquier celda cuyo primer carácter sea uno de esos.
    De paso añadir BOM UTF-8 (`﻿`) al Blob para que Excel en Windows no corrompa acentos.

26. **Dedup del historial del lector rota.** `sidebar.js:463-492`. `lastTextReaderElement` se
    escribe pero nunca se compara (a diferencia de `addToNavigationHistory`, que sí lo hace).
    Fix: replicar la misma comprobación de duplicado antes de `unshift`.

27. **Sincronización de idioma/debug vía storage.** `sidebar.js` no escucha
    `chrome.storage.onChanged`; `logger.js:9-17` resuelve `debugEnabled` de forma async sin
    listener, así que activar el flag no afecta a contextos ya cargados. Fix: añadir
    `chrome.storage.onChanged.addListener` en ambos para reaccionar a cambios en caliente.

28. **Strings de UI hardcodeados en español.** `sidebar.js:185, 253, 376, 432, 505`
    ("Analizando página...", "No se encontraron problemas...", estados vacíos de
    historiales). Fix: mover a claves `data-i18n` / `i18n.t()` como el resto de la UI.

29. **MutationObserver de KeyboardNav no cancela su debounce.** `keyboard-nav.js:203-250`.
    `updateTimeout` es una variable de closure que `removeMutationObserver()` no limpia, y el
    callback no comprueba `isActive`. Fix: guardar el timeout a nivel de instancia y hacer
    `clearTimeout` en `removeMutationObserver()`.

30. **Doble activación en cadena.** `content.js:47-56, 146-162`. Pulsar dos funciones antes
    de que carguen los módulos puede ejecutar activaciones duplicadas. Fix: revisar tras la
    Fase 1 (puede resolverse solo al arreglar el flujo de `activateFunction`); si persiste,
    deduplicar `pendingActivations` por valor único ya se hace — el problema real es que la
    continuación del `await` en `activateFunction` puede ejecutarse además del drenaje.

---

## Orden recomendado de ejecución

1. Fase 1 (ciclo de vida) — es lo que un QA nota en los primeros 5 minutos de uso.
2. Tarea 5 y 6 de Fase 2 (parseColor + getDOMPosition) — falsos positivos/negativos que
   destruyen la confianza en el validador, que es la feature principal de la extensión.
3. Resto de Fase 2, luego Fase 3, luego Fase 4.

Cada fase = PR/commit separado. Ejecutar `npm run lint && npm test` antes de dar cualquier
fase por cerrada.
