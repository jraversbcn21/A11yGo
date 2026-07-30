// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { VisualNav } from '../utils/visual-nav.js';

/**
 * Tests de visual-nav.js (overlays de elementos focusables y orden de tabulación).
 *
 * jsdom no implementa ResizeObserver, requestAnimationFrame ni layout: se stubean
 * a nivel de archivo. getBoundingClientRect devuelve una caja fija visible salvo
 * que un test la sobreescriba por elemento.
 */

let nav;

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value() {
      return { top: 10, left: 10, width: 100, height: 20, right: 110, bottom: 30, x: 10, y: 10 };
    }
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
  chrome.runtime.sendMessage.mockClear();
  nav = new VisualNav();
});

afterEach(() => {
  nav.deactivate();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('updateFocusableElements', () => {
  it('excluye contenedores genéricos salvo que tengan interacción explícita', () => {
    document.body.innerHTML = `
      <button id="btn">Botón</button>
      <div id="plain" tabindex="0">Contenedor con tabindex 0</div>
      <div id="positive" tabindex="1">Contenedor con tabindex positivo</div>
      <div id="rolebtn" role="button" tabindex="0">Div botón</div>
      <div id="editable" contenteditable="true" tabindex="0">Editable</div>
      <span id="span" tabindex="0">Span suelto</span>
    `;
    nav.updateFocusableElements();

    const ids = nav.focusableElements.map(el => el.id);
    expect(ids).toContain('btn');
    expect(ids).toContain('positive');
    expect(ids).toContain('rolebtn');
    expect(ids).toContain('editable');
    expect(ids).not.toContain('plain');
    expect(ids).not.toContain('span');
  });

  it('excluye elementos sin dimensiones y dentro de contenedores ocultos', () => {
    document.body.innerHTML = `
      <button id="visible">Visible</button>
      <button id="sinCaja">Sin caja</button>
      <div style="display: none"><button id="enOculto">Dentro de oculto</button></div>
    `;
    document.getElementById('sinCaja').getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 });
    nav.updateFocusableElements();

    expect(nav.focusableElements.map(el => el.id)).toEqual(['visible']);
  });

  it('excluye aria-disabled y tabindex -1', () => {
    document.body.innerHTML = `
      <button id="ok">Ok</button>
      <button id="ariaDis" aria-disabled="true">Deshabilitado ARIA</button>
      <button id="negativo" tabindex="-1">Fuera de tab</button>
    `;
    nav.updateFocusableElements();
    expect(nav.focusableElements.map(el => el.id)).toEqual(['ok']);
  });
});

describe('activación y overlays', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <a id="a1" href="#">Enlace</a>
      <button id="b1">Botón</button>
      <input id="i1" type="text">
    `;
  });

  it('activate crea un overlay y un número de orden por elemento focusable', () => {
    nav.activate();

    expect(nav.isActive).toBe(true);
    expect(document.querySelectorAll('.a11y-visual-overlay').length).toBe(3);
    const orden = Array.from(document.querySelectorAll('.a11y-tab-order-overlay'))
      .map(el => el.textContent);
    expect(orden).toEqual(['1', '2', '3']);
  });

  it('los números reflejan el orden de tabulación, no el orden DOM', () => {
    document.body.innerHTML = `
      <button id="natural">Natural</button>
      <button id="prioritario" tabindex="1">Prioritario</button>
    `;
    nav.activate();

    const overlays = document.querySelectorAll('.a11y-tab-order-overlay');
    expect(overlays[0].textContent).toBe('1');
    expect(overlays[0]._elementRef.id).toBe('prioritario');
    expect(overlays[1]._elementRef.id).toBe('natural');
  });

  it('deactivate elimina todos los overlays y limpia el historial', () => {
    nav.activate();
    nav.addToHistory(document.getElementById('b1'));
    nav.deactivate();

    expect(document.querySelectorAll('.a11y-visual-overlay').length).toBe(0);
    expect(document.querySelectorAll('.a11y-tab-order-overlay').length).toBe(0);
    expect(nav.navigationHistory).toEqual([]);
  });

  it('reactivar es un no-op (no duplica overlays)', () => {
    nav.activate();
    nav.activate();
    expect(document.querySelectorAll('.a11y-visual-overlay').length).toBe(3);
  });
});

describe('updateSetting', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button>Uno</button><button>Dos</button>';
  });

  it('desactivar showFocusables elimina los recuadros pero mantiene los números', () => {
    nav.activate();
    nav.updateSetting('showFocusables', false);

    expect(document.querySelectorAll('.a11y-visual-overlay').length).toBe(0);
    expect(document.querySelectorAll('.a11y-tab-order-overlay').length).toBe(2);
  });

  it('desactivar showTabOrder elimina los números', () => {
    nav.activate();
    nav.updateSetting('showTabOrder', false);
    expect(document.querySelectorAll('.a11y-tab-order-overlay').length).toBe(0);
  });

  it('con el módulo inactivo es un no-op', () => {
    nav.updateSetting('showFocusables', false);
    expect(nav.settings.showFocusables).toBe(true);
  });

  it('ignora ajustes desconocidos', () => {
    nav.activate();
    nav.updateSetting('noExiste', false);
    expect(nav.settings).toEqual({
      showFocusables: true,
      showTabOrder: true,
      highlightFocus: true
    });
  });
});

describe('highlight de foco', () => {
  it('focusin crea el overlay de foco y focusout lo elimina', () => {
    document.body.innerHTML = '<button id="b1">Uno</button>';
    nav.activate();

    const button = document.getElementById('b1');
    button.focus();
    expect(document.querySelector('.a11y-focus-overlay')).not.toBeNull();
    expect(document.querySelector('.a11y-focus-overlay')._elementRef).toBe(button);

    button.blur();
    expect(document.querySelector('.a11y-focus-overlay')).toBeNull();
  });

  it('con highlightFocus desactivado no crea overlay de foco', () => {
    document.body.innerHTML = '<button id="b1">Uno</button>';
    nav.activate();
    nav.updateSetting('highlightFocus', false);

    document.getElementById('b1').focus();
    expect(document.querySelector('.a11y-focus-overlay')).toBeNull();
  });
});

describe('historial de navegación', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="b1">Aceptar</button><button id="b2">Cancelar</button>';
    nav.activate();
    chrome.runtime.sendMessage.mockClear();
  });

  function historyMessages() {
    return chrome.runtime.sendMessage.mock.calls
      .map(c => c[0])
      .filter(p => p && p.action === 'updateVisualNavHistory');
  }

  it('registra nombre, tipo y orden de tabulación del elemento enfocado', () => {
    nav.addToHistory(document.getElementById('b2'));

    expect(nav.navigationHistory[0]).toMatchObject({
      name: 'Cancelar',
      type: 'botón',
      tabOrder: 2
    });
    expect(historyMessages().at(-1).history.length).toBe(1);
  });

  it('no duplica el mismo elemento enfocado consecutivamente', () => {
    const b1 = document.getElementById('b1');
    nav.addToHistory(b1);
    nav.addToHistory(b1);
    expect(nav.navigationHistory.length).toBe(1);
  });

  it('ignora elementos fuera de la lista de focusables', () => {
    const extraneo = document.createElement('p');
    document.body.appendChild(extraneo);
    nav.addToHistory(extraneo);
    expect(nav.navigationHistory.length).toBe(0);
  });

  it('limita el historial a 20 entradas', () => {
    const b1 = document.getElementById('b1');
    const b2 = document.getElementById('b2');
    for (let i = 0; i < 13; i++) {
      nav.addToHistory(b1);
      nav.addToHistory(b2);
    }
    expect(nav.navigationHistory.length).toBe(nav.MAX_HISTORY_ITEMS);
  });

  it('el más reciente queda al inicio del historial', () => {
    nav.addToHistory(document.getElementById('b1'));
    nav.addToHistory(document.getElementById('b2'));
    expect(nav.navigationHistory[0].name).toBe('Cancelar');
    expect(nav.navigationHistory[1].name).toBe('Aceptar');
  });
});

describe('posicionamiento de overlays', () => {
  it('oculta el overlay si su elemento pierde las dimensiones', () => {
    document.body.innerHTML = '<button id="b1">Uno</button>';
    nav.activate();

    const overlay = document.querySelector('.a11y-visual-overlay');
    expect(overlay.style.display).toBe('block');

    document.getElementById('b1').getBoundingClientRect = () =>
      ({ top: 0, left: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0 });
    nav.updateAllOverlayPositions();
    expect(overlay.style.display).toBe('none');
  });

  it('oculta el overlay si su elemento sale del DOM', () => {
    document.body.innerHTML = '<button id="b1">Uno</button>';
    nav.activate();

    const overlay = document.querySelector('.a11y-visual-overlay');
    document.getElementById('b1').remove();
    nav.updateAllOverlayPositions();
    expect(overlay.style.display).toBe('none');
  });
});

describe('Escape', () => {
  it('desactiva el modo visual y dispara onDeactivate', () => {
    document.body.innerHTML = '<button>Uno</button>';
    const onDeactivate = vi.fn();
    nav.onDeactivate = onDeactivate;
    nav.activate();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(nav.isActive).toBe(false);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('.a11y-visual-overlay').length).toBe(0);
  });
});
