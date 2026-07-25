# Aviso de contraste no verificable por color no soportado — Diseño

**Fecha:** 2026-07-25
**Estado:** Aprobado
**Ámbito:** `utils/a11y-checker.js`, `utils/i18n.js`, `tests/a11y-checker.test.js`

## Problema

El check de contraste (`checkContrast`) omite **en silencio** los elementos cuyo color de
texto o de fondo está en un formato de color moderno que `parseColor` no reconoce
(`oklch`, `oklab`, `lab`, `lch`, `color()`). El usuario no recibe ninguna señal de que
ese elemento no se evaluó.

### Contexto técnico relevante

`window.getComputedStyle(el).color` **normaliza a `rgb()`/`rgba()`** los colores que caen
dentro del gamut sRGB, aunque el autor los escriba como `oklch(...)`. Por tanto, la mayoría
de colores oklch de un design system estándar (Tailwind v4, etc.) llegan como `rgb()` y
`parseColor` ya los maneja. Los que **sí** se cuelan como `oklch`/`lab`/`color()` son los de
**gamut amplio** (P3, fuera de sRGB), que el navegador preserva en el valor computado. Para
esos, cualquier conversión a sRGB implicaría *clamping* con pérdida — por eso el alcance es
**solo aviso**, sin matemática de conversión de color.

### Puntos de omisión silenciosa (hoy)

1. **Fondo sólido / color de texto** (`a11y-checker.js:220`): `calculateContrast` devuelve
   `null` si texto o fondo no son parseables → `return` sin avisar.
2. **Gradiente sin ningún stop parseable** (`:203`): `worstContrast === Infinity` → `return`
   sin avisar.
3. **Gradiente con todos los stops en formato moderno** (`getBackgroundInfo`):
   `parseGradientColors` devuelve `[]`; como el código hace
   `if (colors.length > 0) return { type: 'gradient' }`, **no** entra en la rama de gradiente
   y termina comparando el texto contra un **fondo equivocado** (el del padre o blanco por
   defecto). Esto no es solo silencio: produce un **ratio potencialmente incorrecto**.

## Decisiones de diseño

- **Alcance:** solo aviso (warning). No se implementa parsing de oklch/lab.
- **Granularidad:** un warning **por elemento** afectado, clickable con highlight (consistente
  con el patrón existente `bgImageContrast`). `checkContrast` ya limita a 100 elementos, así
  que el ruido está acotado.
- **Cobertura:** ambas rutas — color/fondo sólido **y** gradientes con stops no soportados.
- **Dedup:** máximo un `unsupportedColor` por elemento (cada elemento hace `return` tras el
  primer aviso).

## Componentes

Todo ocurre dentro de la categoría `contrast` existente (sin nueva config de categoría).

### a) `getBackgroundInfo` — nuevo tipo `unsupported`

Cuando hay `gradientMatch` pero `parseGradientColors` devuelve `[]` (todos los stops en
formato moderno), devolver `{ type: 'unsupported' }` en lugar de continuar al fallback
erróneo.

### b) Helper `describeUnsupportedColor(color)`

Devuelve el nombre del formato no soportado (`'oklch'`, `'oklab'`, `'lab'`, `'lch'`,
`'color()'`) o `null` si el color es parseable por `parseColor`. Se usa para construir un
mensaje preciso y para filtrar el color de texto al inicio del check.

Criterio: `null` si `parseColor(color)` no es `null`; en caso contrario, identificar el
prefijo de función de color moderno; si no se reconoce, devolver un genérico (p. ej.
`'no soportado'`).

### c) `checkContrast` — tres puntos de aviso

Emiten `addResult('warning', 'unsupportedColor', <descripción>, element)`:

1. **Inicio del `try` por elemento:** si `describeUnsupportedColor(textColor)` da un formato
   → warning y `return` (no se procesa más ese elemento). Filtrar el texto primero evita que
   el aviso de fondo se confunda con el de texto y elimina la posibilidad de que el punto del
   gradiente `worstContrast === Infinity` se dispare por texto no soportado.
2. **Nueva rama `bgInfo.type === 'unsupported'`:** warning y `return`.
3. **Rama sólida:** sustituir `if (contrast === null) return;` por: si `contrast === null`,
   avisar (el fondo era el no soportado, ya que el texto se filtró antes) y `return`.

Con el texto filtrado al inicio y los stops filtrados en `getBackgroundInfo`, cada uno de los
tres puntos tiene una causa única y clara, sin doble aviso.

## Mensaje e i18n

- **Código de resultado:** `unsupportedColor`, severidad `warning`.
- **`getTitle`:** `unsupportedColor: 'Contraste no verificable'`.
- **`i18n.js`** (sección Reportes, es y en):
  - es: `unsupportedColor: 'Contraste no verificable (color en formato no soportado)'`
  - en: `unsupportedColor: 'Contrast not verifiable (unsupported color format)'`
- **Descripción** (hardcodeada en español, siguiendo la convención existente del validador
  donde `description` va en español y solo `title` sale de `i18n`):
  `Contraste no verificable: color en formato ${formato} (oklch/lab/color() no soportado)`,
  con `${formato}` de `describeUnsupportedColor`.

## Testing

En `tests/a11y-checker.test.js` (donde ya viven los tests de `parseColor`/`calculateContrast`),
siguiendo la convención TDD del proyecto (test antes de tocar el motor):

1. **`describeUnsupportedColor`:**
   - `'oklch(0.7 0.15 30)'` → `'oklch'`
   - `'lab(50% 40 59.5)'` → `'lab'`
   - `'lch(52.2% 72.2 50)'` → `'lch'`
   - `'color(display-p3 1 0 0)'` → `'color()'`
   - `'rgb(0,0,0)'` → `null`
   - `'#fff'` → `null`
2. **`getBackgroundInfo`** con gradiente de stops `oklch` → `{ type: 'unsupported' }`.
3. **Integración `checkContrast`** (mockeando `window.getComputedStyle` para inyectar
   `color`/`backgroundColor`/`backgroundImage`, patrón ya usado en el archivo de tests):
   - texto en `oklch` → un `unsupportedColor`.
   - fondo sólido en `lab` → un `unsupportedColor`.
   - texto **y** fondo no soportados → un solo `unsupportedColor` (dedup por elemento).

Matiz jsdom: no calcula estilos reales; los tests mockean `window.getComputedStyle`.

## Constraints globales

- Node >= 22; `npm run lint` en 0 errores/0 warnings antes de cada commit; `npm test` en verde.
- Comentarios y strings de UI en español; código en inglés.
- Logging vía `utils/logger.js`; catch sin uso nombrado `_`.
- Tests antes de tocar `a11y-checker.js` (TDD).

## Fuera de alcance

- Parsing/conversión real de oklch/lab/color() a sRGB (posible mejora futura).
- Iframes (mejora pendiente #3, independiente).
