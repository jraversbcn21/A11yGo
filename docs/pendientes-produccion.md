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

- [ ] **(CALIDAD) Pasada de humo manual en sitios reales — EN PROGRESO (04/08).** Guion completo y
      estado detallado en [`verificacion-manual.md`](./verificacion-manual.md). Avance:
      **github.com completo** (4/4 herramientas ✅, 2 hallazgos no bloqueantes anotados debajo).
      Pendientes: `bershka.com/es` (Lector propuesto, sin confirmar), `aevi.org.es` (sin iniciar),
      `bershka.com/sa` como candidato RTL (sin iniciar, sin confirmar que sirva layout RTL). Ningún
      sitio de esta ronda cubre el perfil "DOM grande"; considerar añadir uno.
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
      el 07/08: ambos comprueban ahora `debugEnabled` igual que `log()` — con debug desactivado la
      consola de la página queda limpia para usuarias reales. Decisión explícita: se prioriza
      consola limpia en producción; para diagnosticar, activar `a11yGoDebug`. 7 tests nuevos en
      `tests/logger.test.js`.
- [x] **(CALIDAD) Tests para `content.js`** — 25 tests (30/07): routing de mensajes, exclusión
      mutua, callbacks `onDeactivate`, comandos del lector, `runA11yCheck`, highlight (overlay,
      auto-remove 12s, reemplazo), handler `focusin` y contexto de extensión inválido. Ver
      `tests/content.test.js`, `tests/content-failure.test.js` y `tests/stubs/a11y-modules.js`.
- [x] **(CALIDAD) Tests para `text-reader.js`** — 75 tests (30/07): detección de idioma,
      `formatTextForSpeech`, normalización anti-deletreo, `getAccessibleName`/`getElementType`,
      deduplicación, reentrancia de `read()` (`readToken`), reintento de voces, focusables
      temporales, hover/selección y highlight. Ver `tests/text-reader.test.js`.

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

| Módulo | Líneas | Tests |
|---|---:|---|
| `utils/a11y-checker.js` | 1052 | ✅ cubierto (motor de validación) |
| `utils/dom-utils.js` | 361 | ✅ cubierto (DOM, shadow, iframes, visibilidad de ancestros) |
| `utils/text-reader.js` | 1914 | ✅ cubierto (lógica pura, DOM y async con mocks de speechSynthesis) |
| `utils/keyboard-nav.js` | 835 | ✅ cubierto (navegación, orden WCAG, tabindex inyectado) |
| `utils/visual-nav.js` | 774 | ✅ cubierto (overlays, filtrado, historial) |
| `content.js` | 608 | ✅ cubierto (orquestador: mensajería, activación, highlight) |
| `utils/logger.js` | 44 | ✅ cubierto (log/warn/error respetan el flag de debug) |
| `utils/i18n.js` | 190 | parcial |

**Total: 265 tests** — todos los módulos principales tienen cobertura.

## Lo que sí está listo

- Las 3 mejoras de robustez (shadow DOM, colores modernos oklch/lab, iframes same-origin)
  implementadas, probadas y **verificadas end-to-end en navegador real**.
- **265 tests unitarios** — los 7 módulos principales con cobertura (sesión del 30/07: content.js,
  text-reader.js, keyboard-nav.js y visual-nav.js; sesión del 07/08: logger.js y
  hasHiddenAncestor). El proceso destapó y corrigió un off-by-one real en la activación de
  keyboardNav.
- **Hallazgos H1 y H2 de la pasada de humo corregidos** (07/08) con TDD: filtro de focusables con
  visibilidad de ancestros (helper compartido con visual-nav) y logger silencioso sin flag de debug.
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

1. **Siguiente paso exacto:** confirmar el resultado de "Lector de Texto" en
   `bershka.com/es/h-woman.html` (guion en `verificacion-manual.md`, sección "Estado de la pasada
   en curso"), luego seguir con Teclado/Visual/Validador en el mismo sitio.
2. Completar `aevi.org.es` y `bershka.com/sa` (confirmar primero si este último sirve layout RTL).
3. Ejecutar los bloques 1-3 del guion (regresiones vía fixture en `localhost:8080`), que quedaron
   sin tocar esta sesión.
4. ~~Decidir qué hacer con los hallazgos H1 y H2~~ — **corregidos el 07/08** (ver entradas de
   calidad arriba). En la próxima pasada manual por github.com, re-verificar que el contador de
   navegables ya no cuenta los enlaces del mega-menú cerrado y que la consola queda limpia sin
   el flag de debug.
