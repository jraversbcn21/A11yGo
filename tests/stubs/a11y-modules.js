/**
 * Stubs de los módulos de herramientas para testear content.js de forma aislada.
 *
 * content.js carga sus módulos con import(chrome.runtime.getURL(...)); los tests
 * redirigen getURL a este archivo para los 4 módulos pesados. Cada instancia se
 * registra en globalThis.__a11yGoStubs y anota sus llamadas en `calls`, sin
 * depender de vitest (este archivo se importa fuera del transform de tests).
 *
 * Config opcional vía globalThis.__a11yGoStubConfig:
 *   checkResults  — resultados que devuelve A11yChecker.check()
 *   checkError    — si es true, check() lanza
 *   focusResult   — objeto que resuelve TextReader.readElementOnFocus()
 */

function registry() {
  globalThis.__a11yGoStubs = globalThis.__a11yGoStubs || {};
  return globalThis.__a11yGoStubs;
}

function config() {
  return globalThis.__a11yGoStubConfig || {};
}

class StubBase {
  constructor(kind) {
    this.kind = kind;
    this.isActive = false;
    this.calls = [];
    this.onDeactivate = null;
    registry()[kind] = this;
  }
  record(method, args = []) {
    this.calls.push({ method, args });
  }
  count(method) {
    return this.calls.filter(c => c.method === method).length;
  }
  activate() {
    this.isActive = true;
    this.record('activate');
  }
  deactivate() {
    this.isActive = false;
    this.record('deactivate');
  }
}

export class TextReader extends StubBase {
  constructor() {
    super('textReader');
  }
  play() { this.record('play'); }
  pause() { this.record('pause'); }
  stop() { this.record('stop'); }
  setSpeed(speed) { this.record('setSpeed', [speed]); }
  readElementOnFocus(element) {
    this.record('readElementOnFocus', [element]);
    const result = config().focusResult !== undefined
      ? config().focusResult
      : { read: true, name: 'Nombre accesible', type: 'botón' };
    return Promise.resolve(result);
  }
}

export class KeyboardNav extends StubBase {
  constructor() {
    super('keyboardNav');
  }
  getFocusInfo() {
    this.record('getFocusInfo');
    return { tag: 'BUTTON', name: 'Aceptar' };
  }
}

export class VisualNav extends StubBase {
  constructor() {
    super('visualNav');
  }
  updateSetting(setting, value) {
    this.record('updateSetting', [setting, value]);
  }
}

export class A11yChecker extends StubBase {
  constructor() {
    super('a11yChecker');
  }
  async check(categories) {
    this.record('check', [categories]);
    if (config().checkError) throw new Error('fallo simulado del checker');
    return config().checkResults || [];
  }
}
