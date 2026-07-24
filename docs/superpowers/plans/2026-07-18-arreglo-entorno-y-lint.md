# Plan de arreglo — Entorno de tests y ESLint (2026-07-18)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el proyecto con `npm test` funcionando y `npm run lint` en 0 errores / 0 warnings, documentando el requisito de Node 22+.

**Architecture:** No hay cambios de comportamiento — son arreglos de entorno (versión de Node), configuración de ESLint (`eslint.config.js`) y limpieza mecánica de variables no usadas. La única red de seguridad necesaria es la suite existente de Vitest (30+ tests), que debe pasar íntegra tras cada fase.

**Tech Stack:** Node 22 LTS, Vitest 4 + jsdom, ESLint 9 (flat config), esbuild.

## Contexto — cómo se detectó

En la sesión del 2026-07-18 (tras cerrar las 4 fases de `BUGFIX_PLAN.md`) se verificó el estado del proyecto y aparecieron dos problemas nuevos, **no** cubiertos por aquel plan:

1. **`npm test` no arranca.** El Node instalado es v18.20.6 y Vitest 4 (vía rolldown) usa `styleText` de `node:util`, que no existe en Node 18:
   ```
   SyntaxError: The requested module 'node:util' does not provide an export named 'styleText'
   ```
   CLAUDE.md ya dice "requiere Node 22+", pero el entorno no lo cumple y `package.json` no lo declara en `engines`.

2. **`npm run lint` → 7 errores + 50 warnings** (57 problemas). Los errores:
   - `build.js` (6): `process` y `Buffer` no definidos — el flat config solo declara globals de navegador; `build.js` es un script Node.
   - `tests/a11y-checker.test.js:7` (1): `beforeEach` no definido — el test lo usa sin importarlo (funciona en runtime por `globals: true` en `vitest.config.js`, pero ESLint no lo sabe; `tests/dom-utils.test.js` sí importa todo explícitamente).

   Los 50 warnings son todos `no-unused-vars`: parámetros `catch (e)` / `catch (_)` sin usar, parámetros `index`/`response` de callbacks, y 2 variables muertas (`maxTabIndex`, `ariaLabel`).

## Global Constraints

- Node **>= 22** (LTS) obligatorio para Vitest 4 — sin él la Fase 0 bloquea todo lo demás.
- Convenciones de CLAUDE.md: comentarios en español, código en inglés; todo logging vía `utils/logger.js`; antes de tocar `a11y-checker.js` o `dom-utils.js` con cambios de comportamiento, añadir test — **este plan no cambia comportamiento**, solo borra código muerto y renombra parámetros, así que la verificación es: suite completa en verde tras cada tarea.
- Cada fase = commit separado. `npm run lint && npm test` antes de cerrar cualquier fase.
- **Los números de línea de este documento provienen del lint del 2026-07-18.** Tras cada lote de ediciones, re-ejecutar `npm run lint` y usar SU salida como fuente de verdad (las líneas se desplazan).

## Requisitos previos (antes de empezar la sesión)

| Requisito | Cómo comprobarlo | Cómo resolverlo si falta |
|---|---|---|
| Node 22 LTS o superior | `node --version` → debe mostrar `v22.x` o más | Windows: `winget install OpenJS.NodeJS.LTS` o instalar [nvm-windows](https://github.com/coreybutler/nvm-windows) y `nvm install 22 && nvm use 22`. Cerrar y reabrir la terminal después. |
| Dependencias reinstaladas con el Node nuevo | `npm test` arranca sin `SyntaxError` | `rm -rf node_modules package-lock.json && npm install` (los binarios nativos de rolldown/esbuild pueden quedar ligados a la versión vieja) |
| Working tree limpio en `master` | `git status` → `nothing to commit` | Commitear o stashear lo pendiente antes de empezar |

---

## Fase 0 — Entorno de tests (bloqueante)

### Task 1: Instalar Node 22 y establecer baseline de tests

**Files:**
- Modify: `package.json` (añadir `engines`)

**Interfaces:**
- Produces: suite de tests ejecutable — todas las fases posteriores dependen de `npm test` como verificación.

- [ ] **Step 1: Verificar/instalar Node 22**

Run: `node --version`
Expected: `v22.x.y` (o superior). Si muestra `v18.x`, instalar Node 22 según la tabla de requisitos y reabrir la terminal antes de continuar.

- [ ] **Step 2: Reinstalar dependencias con el Node nuevo**

```bash
rm -rf node_modules package-lock.json
npm install
```

Expected: instalación sin errores. (Necesario porque los binarios de rolldown quedaron instalados bajo Node 18.)

- [ ] **Step 3: Ejecutar la suite y guardar el baseline**

Run: `npm test`
Expected: PASS — 30+ tests en verde, 0 fallos. Si algún test falla aquí, **detenerse**: es un problema preexistente que hay que diagnosticar (con superpowers:systematic-debugging) antes de seguir, porque el resto del plan usa esta suite como red de seguridad.

- [ ] **Step 4: Declarar el requisito en package.json**

En `package.json`, añadir el campo `engines` después de `"license"`:

```json
{
  "name": "a11ygo-ext",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "description": "Chrome extension for web accessibility testing",
  "license": "MIT",
  "engines": {
    "node": ">=22"
  },
  ...
}
```

- [ ] **Step 5: Verificar que nada se rompió**

Run: `npm test`
Expected: PASS, mismo número de tests que el baseline.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: declarar requisito Node >=22 en engines"
```

---

## Fase 1 — Errores de ESLint (7 errores, bloquean el lint)

### Task 2: Globals de Node para build.js

**Files:**
- Modify: `eslint.config.js` (añadir bloque para `build.js`)

**Interfaces:**
- Consumes: paquete `globals` ya instalado (devDependency, ya importado en línea 1 del config).
- Produces: `npm run lint` sin los 6 errores `no-undef` de `build.js`.

- [ ] **Step 1: Confirmar los errores actuales**

Run: `npm run lint 2>&1 | grep -A7 "build.js"`
Expected: 6 errores — `'process' is not defined` (línea 7) y `'Buffer' is not defined` (líneas 69, 96, 98, 115, 146).

- [ ] **Step 2: Añadir bloque de config para build.js**

En `eslint.config.js`, insertar un bloque nuevo entre el bloque de `content.js` (líneas 35-40) y el de `ignores` (líneas 41-43):

```js
  {
    files: ["content.js"],
    languageOptions: {
      sourceType: "script"
    }
  },
  {
    files: ["build.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    ignores: ["node_modules/", "dist/"]
  }
```

(El primer y último bloque ya existen — lo nuevo es solo el bloque central de `build.js`.)

- [ ] **Step 3: Verificar que los 6 errores desaparecen**

Run: `npm run lint 2>&1 | grep -c "error"`
Expected: `1` (solo queda el error de `beforeEach` en el test, que arregla la Task 3).

### Task 3: Import explícito de beforeEach en el test

**Files:**
- Modify: `tests/a11y-checker.test.js:1`

**Interfaces:**
- Consumes: export `beforeEach` de `vitest`.
- Produces: `npm run lint` con 0 errores.

- [ ] **Step 1: Confirmar el error actual**

Run: `npm run lint 2>&1 | grep "beforeEach"`
Expected: `7:3  error  'beforeEach' is not defined  no-undef`

- [ ] **Step 2: Añadir beforeEach al import**

En `tests/a11y-checker.test.js`, línea 1, cambiar:

```js
import { describe, it, expect } from 'vitest';
```

por:

```js
import { describe, it, expect, beforeEach } from 'vitest';
```

(Es el mismo patrón de import explícito que ya usa `tests/dom-utils.test.js`. No tocar `globals: true` de `vitest.config.js` — otros tests pueden depender de él.)

- [ ] **Step 3: Verificar lint sin errores y tests en verde**

Run: `npm run lint 2>&1 | tail -1 && npm test`
Expected: lint muestra `✖ 50 problems (0 errors, 50 warnings)`; tests PASS.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.js tests/a11y-checker.test.js
git commit -m "fix: eliminar errores no-undef de ESLint (globals Node en build.js, import beforeEach)"
```

---

## Fase 2 — Warnings de ESLint (50 warnings `no-unused-vars`)

Tres orígenes distintos, tres tareas:

| Origen | Cuántos | Arreglo |
|---|---|---|
| `catch (_)` — la regla no ignora parámetros de catch aunque se llamen `_` | ~12 | `caughtErrorsIgnorePattern: "^_"` en la config (Task 4) |
| `catch (e)` con `e` sin usar | ~26 | Renombrar a `catch (_)` (Task 4) |
| Parámetros de callback y variables muertas | 10 | Eliminar parámetro / línea muerta (Task 5) |

### Task 4: Parámetros de catch no usados

**Files:**
- Modify: `eslint.config.js:18` (regla `no-unused-vars`)
- Modify: `background.js`, `sidebar.js`, `utils/a11y-checker.js`, `utils/keyboard-nav.js`, `utils/logger.js`, `utils/text-reader.js`, `utils/visual-nav.js` (renombres `catch (e)` → `catch (_)`)

**Interfaces:**
- Produces: convención del proyecto — parámetro de catch no usado se llama `_` y ESLint lo ignora.

- [ ] **Step 1: Ampliar la regla en eslint.config.js**

Cambiar la línea 18:

```js
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
```

por:

```js
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
```

- [ ] **Step 2: Verificar cuántos warnings caen solo con la config**

Run: `npm run lint 2>&1 | tail -1`
Expected: bajan ~12 warnings (todos los `'_' is defined but never used` de catch). Anotar la lista restante — es la lista de trabajo del paso siguiente.

- [ ] **Step 3: Renombrar cada `catch (e)` sin uso a `catch (_)`**

Lista de sitios según el lint del 2026-07-18 (verificar contra el lint actual del Step 2, las líneas pueden variar):

- `background.js:45`
- `sidebar.js:28`
- `utils/a11y-checker.js:144, 263, 280, 296, 328, 358, 398, 430, 468, 472, 502, 648, 941`
- `utils/keyboard-nav.js:75`
- `utils/logger.js:20, 40`
- `utils/text-reader.js:179, 366, 390, 704, 746, 872, 906, 957, 1066`
- `utils/visual-nav.js:452`

En cada sitio, el cambio es idéntico:

```js
    } catch (e) {
```

pasa a:

```js
    } catch (_) {
```

**Ojo:** solo renombrar los sitios que el lint marca. Hay otros `catch (e)` en el código que SÍ usan `e` — no tocarlos. No usar sed masivo; editar sitio a sitio guiándose por la salida del lint.

- [ ] **Step 4: Verificar**

Run: `npm run lint 2>&1 | tail -1 && npm test`
Expected: quedan exactamente 10 warnings (los de la Task 5); tests PASS.

- [ ] **Step 5: Commit**

```bash
git add eslint.config.js background.js sidebar.js utils/
git commit -m "chore: renombrar catch(e) sin uso a catch(_) y configurar caughtErrorsIgnorePattern"
```

### Task 5: Parámetros de callback sin usar y variables muertas

**Files:**
- Modify: `sidebar.js:177, 284, 407, 463, 538`
- Modify: `utils/a11y-checker.js:570`
- Modify: `utils/text-reader.js:533, 1345`
- Modify: `utils/visual-nav.js:386`

**Interfaces:**
- Produces: `npm run lint` → 0 problems.

- [ ] **Step 1: Eliminar parámetros `index` no usados en forEach (5 sitios)**

En `sidebar.js:284`:
```js
  results.forEach((result, index) => {
```
pasa a:
```js
  results.forEach((result) => {
```

En `sidebar.js:407`:
```js
  navigationHistory.forEach((entry, index) => {
```
pasa a:
```js
  navigationHistory.forEach((entry) => {
```

En `sidebar.js:463`:
```js
  visualNavHistory.forEach((entry, index) => {
```
pasa a:
```js
  visualNavHistory.forEach((entry) => {
```

En `sidebar.js:538`:
```js
  textReaderHistory.forEach((entry, index) => {
```
pasa a:
```js
  textReaderHistory.forEach((entry) => {
```

En `utils/visual-nav.js:386`:
```js
    this.overlays.forEach((overlay, index) => {
```
pasa a:
```js
    this.overlays.forEach((overlay) => {
```

- [ ] **Step 2: Eliminar el parámetro `response` no usado en sidebar.js:177**

```js
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, (response) => {
```
pasa a:
```js
    chrome.tabs.sendMessage(tabId, message, { frameId: 0 }, () => {
```

(El callback solo consume `chrome.runtime.lastError`; el parámetro no se usa.)

- [ ] **Step 3: Renombrar el parámetro de evento no usado en text-reader.js:533**

```js
  handleHoverMouseOut(e) {
```
pasa a:
```js
  handleHoverMouseOut(_e) {
```

(Renombrar, no eliminar — deja documentado que es un handler de evento.)

- [ ] **Step 4: Eliminar la variable muerta `maxTabIndex` en a11y-checker.js:570**

Contexto actual (líneas 568-571):
```js
      if (positiveTabIndex.length > 0) {
        const sorted = [...new Set(positiveTabIndex)].sort((a, b) => a - b);
        const maxTabIndex = Math.max(...sorted);
```

Eliminar solo la línea `const maxTabIndex = Math.max(...sorted);` — verificado con grep el 2026-07-18: es la única aparición de `maxTabIndex` en el archivo.

- [ ] **Step 5: Eliminar la variable muerta `ariaLabel` en text-reader.js:1345**

Contexto actual (dentro de `getElementType`, líneas 1343-1346):
```js
    const role = element.getAttribute?.('role')?.toLowerCase() || '';
    const type = element.getAttribute?.('type')?.toLowerCase() || '';
    const ariaLabel = element.getAttribute?.('aria-label');
    const ariaLevel = element.getAttribute?.('aria-level');
```

Eliminar solo la línea de `ariaLabel`. **Ojo:** hay otro `ariaLabel` en el mismo archivo (líneas ~1252 y ~1319, en otra función) que SÍ se usa — no tocar ese; el muerto es únicamente el de `getElementType`.

- [ ] **Step 6: Verificar lint limpio y tests en verde**

Run: `npm run lint && npm test`
Expected: lint sin salida de problemas (exit 0, 0 errors / 0 warnings); tests PASS con el mismo recuento del baseline.

- [ ] **Step 7: Commit**

```bash
git add sidebar.js utils/a11y-checker.js utils/text-reader.js utils/visual-nav.js
git commit -m "chore: eliminar variables y parametros sin uso (lint limpio)"
```

---

## Fase 3 — Verificación final y documentación

### Task 6: Verificación integral y actualización de CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (sección Desarrollo/Testing)

**Interfaces:**
- Consumes: todas las tareas anteriores completadas.

- [ ] **Step 1: Verificación completa** (usar superpowers:verification-before-completion)

```bash
npm run lint && npm test && npm run build
```

Expected: lint 0 problemas, tests PASS, build genera `dist/` sin errores. Pegar la salida real en el resumen de cierre — no afirmar éxito sin evidencia.

- [ ] **Step 2: Actualizar CLAUDE.md**

En la sección **Desarrollo**, cambiar el punto 3:

```markdown
3. `npm install` para dependencias de desarrollo
```

por:

```markdown
3. `npm install` para dependencias de desarrollo (requiere Node 22+, declarado en `engines`)
```

Y en la sección **Convenciones**, añadir al final:

```markdown
- Parámetro de catch sin uso se nombra `_` (ESLint lo ignora vía `caughtErrorsIgnorePattern`)
- `npm run lint` debe quedar en 0 errores y 0 warnings antes de cualquier commit
```

- [ ] **Step 3: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: documentar requisito Node 22+ y convencion de lint limpio"
```

- [ ] **Step 4: Cierre de rama** — si el trabajo se hizo en rama aparte, usar superpowers:finishing-a-development-branch para decidir merge/PR.

---

## Orden y dependencias

```
Fase 0 (Node 22 + baseline)  ← bloqueante, sin esto no hay verificación fiable
   └─ Fase 1 (errores lint)   ← independiente del código de la extensión, bajo riesgo
        └─ Fase 2 (warnings)  ← toca código fuente; requiere suite en verde de Fase 0
             └─ Fase 3 (verificación + docs)
```

Riesgo global: **bajo**. Ningún cambio altera lógica; los dos únicos borrados de código (`maxTabIndex`, `ariaLabel`) están verificados como muertos con grep. La suite de Vitest tras cada tarea es la red de seguridad.
