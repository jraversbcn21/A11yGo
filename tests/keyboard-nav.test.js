// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { KeyboardNav } from '../utils/keyboard-nav.js';

/**
 * Tests de keyboard-nav.js (navegación Tab/Shift+Tab con orden WCAG).
 *
 * jsdom no implementa layout ni scrollIntoView: se stubean getBoundingClientRect
 * (caja fija visible) y scrollIntoView. El foco real de jsdom sí funciona sobre
 * elementos nativamente focusables, lo que permite probar la navegación completa
 * y la inyección/restauración de tabindex en elementos no focusables.
 */

let nav;

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    writable: true,
    value() {
      return { top: 10, left: 10, width: 100, height: 20, right: 110, bottom: 30, x: 10, y: 10 };
    }
  });
  HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  document.body.innerHTML = '';
  chrome.runtime.sendMessage.mockClear();
  nav = new KeyboardNav();
});

afterEach(() => {
  nav.deactivate();
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function pressKey(key, options = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { key, ...options }));
}

describe('updateFocusableElements', () => {
  it('recolecta elementos interactivos y excluye los no navegables', () => {
    document.body.innerHTML = `
      <a href="#">Enlace</a>
      <button>Botón</button>
      <input type="text">
      <button disabled>Deshabilitado</button>
      <a>Sin href</a>
      <button tabindex="-1">Excluido</button>
      <button aria-hidden="true">Oculto ARIA</button>
      <button style="display: none">Invisible</button>
    `;
    nav.updateFocusableElements();

    const tags = nav.focusableElements.map(el => el.textContent || el.tagName);
    expect(tags).toEqual(['Enlace', 'Botón', 'INPUT']);
  });

  it('excluye elementos dentro de contenedores ocultos por un ancestro (H1)', () => {
    document.body.innerHTML = `
      <button id="visible">Visible</button>
      <div style="display: none">
        <a href="#" id="menu-cerrado">Enlace en menú cerrado</a>
      </div>
      <div style="visibility: hidden">
        <button id="invisible">Botón en contenedor invisible</button>
      </div>
      <div aria-hidden="true">
        <button id="aria-oculto">Botón en aria-hidden</button>
      </div>
    `;
    nav.updateFocusableElements();

    expect(nav.focusableElements.map(el => el.id)).toEqual(['visible']);
  });

  it('ordena según la spec WCAG: tabindex positivo primero, luego orden DOM', () => {
    document.body.innerHTML = `
      <button id="natural">Natural</button>
      <button id="segundo" tabindex="2">Dos</button>
      <button id="primero" tabindex="1">Uno</button>
    `;
    nav.updateFocusableElements();

    expect(nav.focusableElements.map(el => el.id)).toEqual(['primero', 'segundo', 'natural']);
  });
});

describe('activación y navegación con Tab', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button id="b1">Uno</button>
      <button id="b2">Dos</button>
      <button id="b3">Tres</button>
    `;
  });

  it('activate enfoca el primer elemento del orden de tabulación', () => {
    nav.activate();
    expect(nav.isActive).toBe(true);
    expect(document.activeElement.id).toBe('b1');
    expect(nav.currentIndex).toBe(0);
  });

  it('reactivar es un no-op', () => {
    nav.activate();
    pressKey('Tab');
    nav.activate();
    // el índice no se resetea por la segunda activación
    expect(document.activeElement.id).toBe('b2');
  });

  it('Tab avanza al siguiente elemento y da la vuelta al llegar al final', () => {
    nav.activate();
    pressKey('Tab');
    expect(document.activeElement.id).toBe('b2');
    pressKey('Tab');
    expect(document.activeElement.id).toBe('b3');
    pressKey('Tab');
    expect(document.activeElement.id).toBe('b1');
  });

  it('Shift+Tab retrocede y da la vuelta hacia el final', () => {
    nav.activate();
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement.id).toBe('b3');
    pressKey('Tab', { shiftKey: true });
    expect(document.activeElement.id).toBe('b2');
  });

  it('intercepta Tab con preventDefault para anular la navegación nativa', () => {
    nav.activate();
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('la navegación salta elementos ocultados después de construir la lista', () => {
    nav.activate();
    document.getElementById('b2').style.display = 'none';
    pressKey('Tab');
    expect(document.activeElement.id).toBe('b3');
  });

  it('la navegación salta elementos eliminados del DOM', () => {
    nav.activate();
    document.getElementById('b2').remove();
    pressKey('Tab');
    expect(document.activeElement.id).toBe('b3');
  });

  it('con el módulo inactivo Tab no navega', () => {
    nav.updateFocusableElements();
    pressKey('Tab');
    expect(nav.currentIndex).toBe(-1);
  });
});

describe('inyección temporal de tabindex', () => {
  it('enfoca elementos con role interactivo inyectando tabindex y lo restaura al desactivar', () => {
    document.body.innerHTML = `
      <button id="b1">Uno</button>
      <div id="fake" role="button">Botón falso</div>
    `;
    nav.activate();
    pressKey('Tab');

    const fake = document.getElementById('fake');
    expect(document.activeElement).toBe(fake);
    expect(fake.getAttribute('tabindex')).toBe('0');
    expect(nav.injectedTabIndexes.has(fake)).toBe(true);

    nav.deactivate();
    expect(fake.hasAttribute('tabindex')).toBe(false);
    expect(nav.injectedTabIndexes.size).toBe(0);
  });
});

describe('Escape y desactivación', () => {
  it('Escape desactiva la navegación y dispara onDeactivate', () => {
    document.body.innerHTML = '<button>Uno</button>';
    const onDeactivate = vi.fn();
    nav.onDeactivate = onDeactivate;
    nav.activate();

    pressKey('Escape');

    expect(nav.isActive).toBe(false);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('deactivate desconecta los handlers de teclado', () => {
    document.body.innerHTML = '<button id="b1">Uno</button><button id="b2">Dos</button>';
    nav.activate();
    nav.deactivate();

    pressKey('Tab');
    expect(document.activeElement.id).not.toBe('b2');
  });
});

describe('tooltip de tipo de elemento', () => {
  it('al navegar muestra un tooltip con el tipo y se auto-oculta a los 2s', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button id="b1">Uno</button><a id="a1" href="#">Enlace</a>';
    nav.activate();
    pressKey('Tab');

    const tooltip = document.querySelector('.a11y-keyboard-tooltip');
    expect(tooltip).not.toBeNull();
    expect(tooltip.textContent).toBe('enlace');

    vi.advanceTimersByTime(2000);
    expect(document.querySelector('.a11y-keyboard-tooltip')).toBeNull();
  });

  it('solo hay un tooltip a la vez', () => {
    document.body.innerHTML = '<button>Uno</button><button>Dos</button>';
    nav.activate();
    pressKey('Tab');
    expect(document.querySelectorAll('.a11y-keyboard-tooltip').length).toBe(1);
  });
});

describe('getFocusInfo', () => {
  it('sin elemento enfocado retorna placeholders', () => {
    const info = nav.getFocusInfo();
    expect(info).toMatchObject({ total: 0, current: '-', element: '-', tabOrder: null });
  });

  it('con elemento enfocado retorna orden 1-indexed, nombre y tipo', () => {
    document.body.innerHTML = '<button id="b1">Aceptar</button><button id="b2">Cancelar</button>';
    nav.activate();
    pressKey('Tab');

    const info = nav.getFocusInfo();
    expect(info.total).toBe(2);
    expect(info.current).toBe(2);
    expect(info.tabOrder).toBe(2);
    expect(info.accessibleName).toBe('Cancelar');
    expect(info.elementType).toBe('botón');
  });
});

describe('descripciones de elementos', () => {
  it('getElementType prioriza role, luego tipo de input, luego tag', () => {
    document.body.innerHTML = `
      <div id="r" role="tab"></div>
      <input id="i" type="email">
      <select id="s"></select>
      <svg id="v"></svg>
    `;
    expect(nav.getElementType(document.getElementById('r'))).toBe('pestaña');
    expect(nav.getElementType(document.getElementById('i'))).toBe('campo de correo');
    expect(nav.getElementType(document.getElementById('s'))).toBe('lista desplegable');
    expect(nav.getElementType(null)).toBe('elemento desconocido');
  });

  it('getElementDescription prioriza aria-label sobre texto y cae a tipo + id', () => {
    document.body.innerHTML = `
      <button id="con-label" aria-label="Cerrar ventana">X</button>
      <button id="con-texto">Enviar formulario</button>
      <input id="solo-id" type="search">
    `;
    expect(nav.getElementDescription(document.getElementById('con-label'))).toBe('Cerrar ventana');
    expect(nav.getElementDescription(document.getElementById('con-texto'))).toBe('Enviar formulario');
    expect(nav.getElementDescription(document.getElementById('solo-id'))).toBe('buscador: solo-id');
  });
});

describe('notificaciones al sidebar', () => {
  it('al enfocar envía updateFocus con los datos del elemento', () => {
    document.body.innerHTML = '<button>Aceptar</button>';
    nav.activate();

    const updates = chrome.runtime.sendMessage.mock.calls
      .map(c => c[0])
      .filter(p => p && p.action === 'updateFocus');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates.at(-1).data).toMatchObject({ total: 1, current: 1, accessibleName: 'Aceptar' });
  });
});

describe('MutationObserver con debounce', () => {
  it('recalcula la lista 500ms después de cambios en el DOM', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button>Uno</button>';
    nav.activate();
    expect(nav.focusableElements.length).toBe(1);

    const extra = document.createElement('button');
    extra.textContent = 'Dos';
    document.body.appendChild(extra);
    // dejar que el callback del observer se entregue (microtask) y programe el debounce
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    expect(nav.focusableElements.length).toBe(2);
  });

  it('deactivate cancela el debounce pendiente', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<button>Uno</button>';
    nav.activate();

    document.body.appendChild(document.createElement('button'));
    await Promise.resolve();
    nav.deactivate();
    await vi.advanceTimersByTimeAsync(600);

    // la lista no se recalculó tras desactivar
    expect(nav.focusableElements.length).toBe(1);
  });
});
