# Pendientes antes de subir a producción (Chrome Web Store)

**Última actualización:** 30 de julio de 2026
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
  - [ ] **Descripción de tienda** (título + descripción corta + descripción detallada). *(Se puede
        redactar a partir del README; pendiente de escribir.)*
  - [ ] *(Opcional)* Imagen promocional (440×280) e ícono de marquesina.
- [ ] **(BLOQUEANTE) Justificación de permisos** en el formulario de envío. El texto ya está
      redactado en la tabla de `PRIVACY.md` → copiar en el formulario para `<all_urls>`, `scripting`,
      `storage`, `sidePanel`, `webNavigation`, `activeTab`.
- [ ] **(BLOQUEANTE) Cuenta de desarrollador de Chrome Web Store** (tarifa única de 5 USD si aún no
      se tiene).
- [ ] **(BLOQUEANTE) Generar el paquete** con `npm run package` (build minificado + ZIP) y subir ese
      ZIP. Recordar regenerar tras cualquier cambio de código.

## 2. Calidad y riesgo (recomendado antes de publicar)

- [ ] **(CALIDAD) Pasada de humo manual en 3-4 sitios reales diversos**, no solo el fixture
      sintético: una SPA (React/Vue), una página con CSP estricta, una en RTL (árabe/hebreo), y una
      con DOM grande. Verificar que las 4 herramientas funcionan y que la validación no rompe ni
      cuelga.
- [ ] **(CALIDAD) Verificación manual pendiente del scroll en iframe (cambio C):** confirmar en
      navegador que el overlay de highlight se reposiciona al hacer scroll **dentro** de un iframe
      same-origin. `content.js` no tiene tests unitarios; usar `test-fixtures/manual-a11y-test.html`.
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
- [ ] **(MENOR) Revisar `BUGFIX_PLAN.md`**: es un documento histórico de julio; valorar archivarlo o
      marcarlo como resuelto para que no confunda a futuros lectores.

---

## Cobertura de tests actual (contexto)

| Módulo | Líneas | Tests |
|---|---:|---|
| `utils/a11y-checker.js` | 1052 | ✅ cubierto (motor de validación) |
| `utils/dom-utils.js` | 340 | ✅ cubierto (DOM, shadow, iframes) |
| `utils/text-reader.js` | 1914 | ✅ cubierto (lógica pura, DOM y async con mocks de speechSynthesis) |
| `utils/keyboard-nav.js` | 832 | ✅ cubierto (navegación, orden WCAG, tabindex inyectado) |
| `utils/visual-nav.js` | 774 | ✅ cubierto (overlays, filtrado, historial) |
| `content.js` | 608 | ✅ cubierto (orquestador: mensajería, activación, highlight) |
| `utils/i18n.js` / `logger.js` | 234 | parcial / trivial |

**Total: 252 tests** — todos los módulos principales tienen cobertura.

## Lo que sí está listo

- Las 3 mejoras de robustez (shadow DOM, colores modernos oklch/lab, iframes same-origin)
  implementadas, probadas (109 tests) y **verificadas end-to-end en navegador real**.
- Lint en 0 errores / 0 warnings; convenciones consistentes.
- Alcance WCAG documentado con honestidad (15/78 criterios, ~19%).
- Sin llamadas de red propias, sin analítica, sin telemetría (auditado).
- Exportación CSV con sanitización anti-inyección.
- Política de privacidad completa (es/en).
