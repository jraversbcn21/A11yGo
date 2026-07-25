# Aviso de contraste no verificable por color no soportado — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El check de contraste avisa (warning `unsupportedColor`) en vez de omitir en silencio cuando el color de texto, el fondo sólido o los stops de un gradiente están en un formato de color moderno no soportado (`oklch`/`oklab`/`lab`/`lch`/`color()`).

**Architecture:** Un helper puro `describeUnsupportedColor` clasifica el formato; `getBackgroundInfo` gana un tipo `unsupported` para gradientes cuyos stops no se pueden extraer; `checkContrast` emite el warning en tres puntos hoy silenciosos (texto, gradiente sin stops usables, fondo sólido), con un máximo de un aviso por elemento.

**Tech Stack:** JavaScript vanilla (ES modules), Chrome Extension MV3, Vitest + jsdom, ESLint 9.

**Spec:** `docs/superpowers/specs/2026-07-25-colores-modernos-contraste-design.md`

## Global Constraints

- Node >= 22 (declarado en `engines`); ejecutar con nvm-windows si hace falta.
- `npm run lint` debe quedar en **0 errores y 0 warnings** antes de cada commit.
- `npm test` en verde antes de cada commit (72 tests existentes + los nuevos).
- Comentarios y strings de UI en español; código (nombres de funciones/variables) en inglés.
- `description` de resultados va hardcodeada en español (convención existente); solo `title` sale de `i18n`.
- Todo logging pasa por `utils/logger.js` — nunca `console.log` directo.
- Parámetro de catch sin uso se nombra `_`.
- Convención del proyecto: tests **antes** de tocar `a11y-checker.js` (TDD).
- Los tests corren con jsdom, que **no calcula estilos reales**: mockear `window.getComputedStyle` donde la lógica dependa de estilos computados. No usar `style` inline con `oklch`/`lab` (jsdom rechaza esos valores al parsear CSS).

---

### Task 1: Helper `describeUnsupportedColor`

**Files:**
- Modify: `utils/a11y-checker.js` (añadir método nuevo junto a `parseColor`, ~línea 815)
- Modify: `tests/a11y-checker.test.js` (añadir `describe` dentro del bloque existente)

**Interfaces:**
- Consumes: `parseColor(color)` existente (devuelve `null` para formatos no reconocidos).
- Produces: `describeUnsupportedColor(color)` → `string | null`. Devuelve `null` si el color es
  parseable (soportado) o si no es una cadena no vacía; en caso contrario, el nombre del formato:
  `'oklch'`, `'oklab'`, `'lab'`, `'lch'`, `'color()'`, o `'no soportado'` como genérico.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir dentro del `describe('A11yChecker - color utilities', ...)` de `tests/a11y-checker.test.js`, tras el `describe('parseColor', ...)`:

```js
  describe('describeUnsupportedColor', () => {
    it('devuelve null para colores parseables (rgb/hex/hsl)', () => {
      expect(checker.describeUnsupportedColor('rgb(0, 0, 0)')).toBeNull();
      expect(checker.describeUnsupportedColor('#fff')).toBeNull();
      expect(checker.describeUnsupportedColor('hsla(200, 50%, 50%, 0.3)')).toBeNull();
    });

    it('identifica oklch', () => {
      expect(checker.describeUnsupportedColor('oklch(0.7 0.15 30)')).toBe('oklch');
    });

    it('identifica oklab', () => {
      expect(checker.describeUnsupportedColor('oklab(0.7 0.1 0.1)')).toBe('oklab');
    });

    it('identifica lab', () => {
      expect(checker.describeUnsupportedColor('lab(50% 40 59.5)')).toBe('lab');
    });

    it('identifica lch', () => {
      expect(checker.describeUnsupportedColor('lch(52.2% 72.2 50)')).toBe('lch');
    });

    it('identifica color()', () => {
      expect(checker.describeUnsupportedColor('color(display-p3 1 0 0)')).toBe('color()');
    });

    it('devuelve null para entradas no describibles (null/undefined/vacío)', () => {
      expect(checker.describeUnsupportedColor(null)).toBeNull();
      expect(checker.describeUnsupportedColor(undefined)).toBeNull();
      expect(checker.describeUnsupportedColor('')).toBeNull();
    });
  });
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: FAIL — `describeUnsupportedColor is not a function`.

- [ ] **Step 3: Implementación**

En `utils/a11y-checker.js`, añadir el método justo **después** de `parseColor(color) { ... }` (antes de `calculateContrast`):

```js
  // Clasifica un color no soportado por parseColor. Devuelve el nombre del formato
  // ('oklch', 'oklab', 'lab', 'lch', 'color()') o null si el color es parseable/no describible.
  describeUnsupportedColor(color) {
    if (!color || typeof color !== 'string') return null;
    if (this.parseColor(color) !== null) return null;

    const lower = color.trim().toLowerCase();
    if (lower.startsWith('oklch')) return 'oklch';
    if (lower.startsWith('oklab')) return 'oklab';
    if (lower.startsWith('lab')) return 'lab';
    if (lower.startsWith('lch')) return 'lch';
    if (lower.startsWith('color(')) return 'color()';
    return 'no soportado';
  }
```

Nota de orden: `oklch`/`oklab` se comprueban antes que `lch`/`lab`; ninguna de esas cadenas
empieza por `lch`/`lab`, así que el orden es seguro aunque redundante en la comprobación.

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + suite completa + commit**

```bash
npm run lint && npm test
git add utils/a11y-checker.js tests/a11y-checker.test.js
git commit -m "feat: helper describeUnsupportedColor clasifica formatos de color modernos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 2: `getBackgroundInfo` devuelve `unsupported` para gradientes sin colores extraíbles

**Files:**
- Modify: `utils/a11y-checker.js:716-722` (bloque `gradientMatch` dentro de `getBackgroundInfo`)
- Modify: `tests/a11y-checker.test.js` (añadir `describe('getBackgroundInfo', ...)`)

**Interfaces:**
- Consumes: `parseGradientColors` existente.
- Produces: `getBackgroundInfo(element)` devuelve `{ type: 'unsupported' }` cuando detecta un
  gradiente pero `parseGradientColors` no extrae ningún color (todos los stops en formato moderno),
  en vez de caer al fallback de `backgroundColor` (que compararía contra un fondo equivocado).

- [ ] **Step 1: Escribir el test que falla**

Añadir a `tests/a11y-checker.test.js`, como nuevo `describe` **dentro** del bloque
`describe('A11yChecker - color utilities', ...)` (usa el `checker` del `beforeEach`).
El helper `stubComputedStyle` debe declararse como función **directamente dentro del
`describe` externo** (`'A11yChecker - color utilities'`), al mismo nivel que los `describe`
internos — así queda en scope para Task 3 (las function declarations se hoistean). No anidarlo
dentro de `describe('getBackgroundInfo', ...)`:

```js
  // Reemplaza window.getComputedStyle por un stub con defaults; fn(el) sobreescribe campos.
  function stubComputedStyle(fn) {
    const orig = window.getComputedStyle;
    window.getComputedStyle = (el) => ({
      color: 'rgb(0, 0, 0)',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      backgroundImage: 'none',
      fontSize: '16px',
      fontWeight: '400',
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      ...fn(el)
    });
    return () => { window.getComputedStyle = orig; };
  }

  describe('getBackgroundInfo', () => {
    it('devuelve type unsupported para gradiente con stops en oklch', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const restore = stubComputedStyle(node =>
        node === el
          ? { backgroundImage: 'linear-gradient(90deg, oklch(0.7 0.15 30), oklch(0.6 0.2 250))' }
          : {}
      );

      expect(checker.getBackgroundInfo(el)).toEqual({ type: 'unsupported' });

      restore();
      el.remove();
    });

    it('sigue devolviendo gradient para stops rgb/hex', () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      const restore = stubComputedStyle(node =>
        node === el
          ? { backgroundImage: 'linear-gradient(90deg, rgb(0,0,0), #ffffff)' }
          : {}
      );

      const info = checker.getBackgroundInfo(el);
      expect(info.type).toBe('gradient');
      expect(info.colors.length).toBeGreaterThan(0);

      restore();
      el.remove();
    });
  });
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: FAIL — el primer test recibe `{ type: 'solid', color: 'rgb(255, 255, 255)' }` (fallback) en vez de `{ type: 'unsupported' }`. El segundo ya pasa.

- [ ] **Step 3: Implementación**

En `utils/a11y-checker.js`, dentro de `getBackgroundInfo`, reemplazar el bloque `gradientMatch`:

```js
        const gradientMatch = bgImage.match(/(linear|radial|conic)-gradient\((.+)\)/);
        if (gradientMatch) {
          const colors = this.parseGradientColors(gradientMatch[2]);
          if (colors.length > 0) {
            return { type: 'gradient', colors };
          }
        }
```

por:

```js
        const gradientMatch = bgImage.match(/(linear|radial|conic)-gradient\((.+)\)/);
        if (gradientMatch) {
          const colors = this.parseGradientColors(gradientMatch[2]);
          if (colors.length > 0) {
            return { type: 'gradient', colors };
          }
          // Gradiente detectado pero sin colores extraíbles (stops en oklch/lab/color()):
          // no caer al fallback de backgroundColor, que compararía contra un fondo equivocado.
          return { type: 'unsupported' };
        }
```

- [ ] **Step 4: Verificar que pasan**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: PASS.

- [ ] **Step 5: Lint + suite completa + commit**

```bash
npm run lint && npm test
git add utils/a11y-checker.js tests/a11y-checker.test.js
git commit -m "feat: getBackgroundInfo señala gradientes con stops en formato no soportado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 3: `checkContrast` emite `unsupportedColor` + i18n + título

**Files:**
- Modify: `utils/a11y-checker.js` — `checkContrast` (texto ~línea 180, tras la rama `image` ~línea 188, rama sólida ~línea 220) y `getTitle` (objeto `titles`)
- Modify: `utils/i18n.js` (clave `unsupportedColor` en `es` y `en`, sección Reportes)
- Modify: `tests/a11y-checker.test.js` (añadir `describe('checkContrast - colores no soportados', ...)`)

**Interfaces:**
- Consumes: `describeUnsupportedColor` (Task 1), `getBackgroundInfo` con tipo `unsupported` (Task 2), `getTextElements`, `calculateContrast`, `addResult`, `getTitle` existentes.
- Produces: al ejecutar `checkContrast`, cada elemento cuyo texto/fondo/gradiente esté en formato no soportado añade **un** resultado `{ severity: 'warning', code: 'unsupportedColor' }`. `getTitle('unsupportedColor')` → `'Contraste no verificable'`. `i18n.t('unsupportedColor')` definido en es/en.

- [ ] **Step 1: Escribir los tests que fallan**

Añadir a `tests/a11y-checker.test.js`, dentro de `describe('A11yChecker - color utilities', ...)`
(reutiliza `checker` y el helper `stubComputedStyle` definido en Task 2):

```js
  describe('checkContrast - colores no soportados', () => {
    function addParagraph(text = 'Hola mundo') {
      const p = document.createElement('p');
      p.textContent = text;
      document.body.appendChild(p);
      return p;
    }

    it('emite unsupportedColor cuando el color de texto está en oklch', () => {
      const p = addParagraph();
      const restore = stubComputedStyle(el => (el === p ? { color: 'oklch(0.7 0.15 30)' } : {}));

      checker.checkContrast();
      restore();

      const hits = checker.results.filter(r => r.code === 'unsupportedColor');
      expect(hits.length).toBe(1);
      expect(hits[0].severity).toBe('warning');
      p.remove();
    });

    it('emite unsupportedColor cuando el fondo sólido está en lab', () => {
      const p = addParagraph();
      const restore = stubComputedStyle(el =>
        el === p ? { color: 'rgb(0, 0, 0)', backgroundColor: 'lab(50% 40 59.5)' } : {}
      );

      checker.checkContrast();
      restore();

      expect(checker.results.filter(r => r.code === 'unsupportedColor').length).toBe(1);
      p.remove();
    });

    it('emite unsupportedColor cuando el fondo es un gradiente sin stops usables', () => {
      const p = addParagraph();
      const restore = stubComputedStyle(el =>
        el === p
          ? { color: 'rgb(0, 0, 0)', backgroundImage: 'linear-gradient(90deg, oklch(0.7 0.15 30), lab(50% 40 60))' }
          : {}
      );

      checker.checkContrast();
      restore();

      expect(checker.results.filter(r => r.code === 'unsupportedColor').length).toBe(1);
      p.remove();
    });

    it('emite un solo unsupportedColor cuando texto y fondo son no soportados', () => {
      const p = addParagraph();
      const restore = stubComputedStyle(el =>
        el === p ? { color: 'oklch(0.7 0.15 30)', backgroundColor: 'lab(50% 40 59.5)' } : {}
      );

      checker.checkContrast();
      restore();

      expect(checker.results.filter(r => r.code === 'unsupportedColor').length).toBe(1);
      p.remove();
    });

    it('no emite unsupportedColor para colores rgb normales', () => {
      const p = addParagraph();
      const restore = stubComputedStyle(el =>
        el === p ? { color: 'rgb(0, 0, 0)', backgroundColor: 'rgb(255, 255, 255)' } : {}
      );

      checker.checkContrast();
      restore();

      expect(checker.results.filter(r => r.code === 'unsupportedColor').length).toBe(0);
      p.remove();
    });
  });

  describe('getTitle - unsupportedColor', () => {
    it('devuelve el título de contraste no verificable', () => {
      expect(checker.getTitle('unsupportedColor')).toBe('Contraste no verificable');
    });
  });
```

- [ ] **Step 2: Verificar que fallan**

Run: `npm test -- tests/a11y-checker.test.js`
Expected: FAIL — los primeros tres/cuatro casos dan 0 resultados `unsupportedColor` (hoy se omiten en silencio); `getTitle` devuelve `'unsupportedColor'` (fallback al code) en vez del título.

- [ ] **Step 3: Implementación**

**3a.** En `checkContrast`, tras `const textColor = style.color;` (~línea 180) y **antes** de `const bgInfo = this.getBackgroundInfo(element);`, insertar el filtro de texto:

```js
        const unsupportedText = this.describeUnsupportedColor(textColor);
        if (unsupportedText) {
          this.addResult('warning', 'unsupportedColor',
            `Contraste no verificable: color de texto en formato ${unsupportedText} (oklch/lab/color() no soportado)`,
            element);
          return;
        }
```

**3b.** Tras la rama `if (bgInfo.type === 'image') { ... }` (~línea 188), añadir la rama de fondo no soportado:

```js
        if (bgInfo.type === 'unsupported') {
          this.addResult('warning', 'unsupportedColor',
            'Contraste no verificable: fondo con gradiente en formato de color no soportado (oklch/lab/color())',
            element);
          return;
        }
```

**3c.** En la rama sólida, reemplazar (~línea 220):

```js
        const bgColor = bgInfo.color;
        const contrast = this.calculateContrast(textColor, bgColor);

        if (contrast === null) return;
```

por:

```js
        const bgColor = bgInfo.color;
        const contrast = this.calculateContrast(textColor, bgColor);

        if (contrast === null) {
          const unsupportedBg = this.describeUnsupportedColor(bgColor);
          this.addResult('warning', 'unsupportedColor',
            `Contraste no verificable: color de fondo en formato ${unsupportedBg || 'no soportado'} (oklch/lab/color() no soportado)`,
            element);
          return;
        }
```

Nota: en este punto `textColor` ya está garantizado como parseable (filtrado en 3a), así que
`contrast === null` implica que el fondo era el no soportado. El `worstContrast === Infinity`
de la rama de gradiente queda como guard defensivo inalcanzable (los stops usables siempre
parsean); dejarlo tal cual.

**3d.** En `getTitle`, añadir al objeto `titles` (junto a `bgImageContrast`):

```js
      unsupportedColor: 'Contraste no verificable',
```

**3e.** En `utils/i18n.js`, sección `// Reportes` del idioma `es`, tras `invalidAria: ...`:

```js
    unsupportedColor: 'Contraste no verificable (color en formato no soportado)',
```

Y en la sección `// Reports` del idioma `en`, tras `invalidAria: ...`:

```js
    unsupportedColor: 'Contrast not verifiable (unsupported color format)',
```

(Recordar añadir la coma al final de la línea `invalidAria` anterior en ambos idiomas.)

- [ ] **Step 4: Verificar que pasan**

Run: `npm test`
Expected: PASS — nuevos tests de `checkContrast`/`getTitle` y los 72 existentes sin regresión.

- [ ] **Step 5: Lint + commit**

```bash
npm run lint
git add utils/a11y-checker.js utils/i18n.js tests/a11y-checker.test.js
git commit -m "feat: checkContrast avisa (unsupportedColor) en vez de omitir colores modernos

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```

---

### Task 4: Documentación (CLAUDE.md)

**Files:**
- Modify: `CLAUDE.md` (Convenciones)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: documentación actualizada.

- [ ] **Step 1: Actualizar CLAUDE.md**

En la sección **Convenciones**, localizar el bullet:

```
- Contraste sobre gradientes: valida contra cada color stop (worst-case); sobre imágenes de fondo emite warning
```

y añadir justo después:

```
- Colores modernos no soportados (`oklch`/`oklab`/`lab`/`lch`/`color()`) emiten warning `unsupportedColor` en vez de omitirse en silencio; `describeUnsupportedColor` clasifica el formato y `getBackgroundInfo` marca gradientes con stops no extraíbles como `{ type: 'unsupported' }`
```

- [ ] **Step 2: Verificación final completa**

```bash
npm run lint && npm test
```

Expected: lint 0/0; todos los tests PASS (72 existentes + ~14 nuevos).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documentar aviso de contraste por color moderno no soportado

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01VRtQbmGeKr7wDYw8cXf3sZ"
```
