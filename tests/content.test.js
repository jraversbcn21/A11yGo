// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Tests de content.js (orquestador de activación/mensajería).
 *
 * content.js es un script de efectos (sin exports) que carga sus módulos con
 * import(chrome.runtime.getURL(...)). Aquí getURL se redirige: los 4 módulos de
 * herramientas apuntan a tests/stubs/a11y-modules.js (instancias que registran
 * llamadas) y logger/dom-utils al código real. El listener de mensajes se captura
 * del mock de chrome.runtime.onMessage y se invoca directamente.
 */

import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import process from 'node:process';

// Bajo jsdom import.meta.url es http://localhost/..., inutilizable para el loader
// ESM nativo: construir URLs file:// desde la raíz del repo (cwd de vitest)
const STUB_URL = pathToFileURL(resolve(process.cwd(), 'tests/stubs/a11y-modules.js')).href;
const REAL_MODULES = ['utils/logger.js', 'utils/dom-utils.js', 'utils/i18n.js'];
const realModuleUrl = (path) => pathToFileURL(resolve(process.cwd(), path)).href;

function stubs() {
  return globalThis.__a11yGoStubs;
}

// Último listener registrado (cada carga de content.js añade uno al mock)
function latestListener() {
  const calls = chrome.runtime.onMessage.addListener.mock.calls;
  return calls[calls.length - 1][0];
}

// Despacha un mensaje al content script y resuelve con la respuesta
function dispatch(message) {
  return new Promise(resolve => {
    latestListener()(message, { tab: { id: 1 } }, resolve);
  });
}

function sidebarMessages(action) {
  return chrome.runtime.sendMessage.mock.calls
    .map(call => call[0])
    .filter(payload => payload && payload.action === action);
}

async function loadContentScript() {
  globalThis.__a11yGoStubs = {};
  globalThis.__a11yGoStubConfig = {};
  delete window.a11yGoContentScriptLoaded;
  delete window.pendingActivations;
  chrome.runtime.sendMessage.mockClear();
  chrome.storage.local.set.mockClear();
  chrome.runtime.getURL = (path) =>
    REAL_MODULES.includes(path) ? realModuleUrl(path) : STUB_URL;
  vi.resetModules();
  await import('../content.js');
  // Esperar a que la carga dinámica de módulos termine (onDeactivate ya asignado)
  await vi.waitFor(() => {
    if (typeof stubs().a11yChecker?.onDeactivate !== 'function') {
      throw new Error('módulos aún no cargados');
    }
  });
}

describe('content.js — orquestador', () => {
  beforeEach(async () => {
    await loadContentScript();
  });

  afterEach(async () => {
    // Desactivar todo en la instancia actual para que sus listeners de focusin
    // queden inertes en los tests siguientes (no se pueden desregistrar)
    await dispatch({ action: 'textReader', command: 'stop' });
    globalThis.__a11yGoStubConfig = {};
    vi.useRealTimers();
  });

  describe('carga de módulos', () => {
    it('instancia los 4 módulos y les asigna onDeactivate', () => {
      for (const kind of ['textReader', 'keyboardNav', 'visualNav', 'a11yChecker']) {
        expect(stubs()[kind]).toBeDefined();
        expect(typeof stubs()[kind].onDeactivate).toBe('function');
      }
    });

    it('marca la página para prevenir múltiples inyecciones', () => {
      expect(window.a11yGoContentScriptLoaded).toBe(true);
    });
  });

  describe('activación de funciones', () => {
    it('activa una función: responde success, activa el módulo y persiste el panel', async () => {
      const response = await dispatch({ action: 'activate', function: 'textReader' });

      expect(response).toEqual({ success: true });
      expect(stubs().textReader.count('activate')).toBe(1);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ activePanel: 'textReader' });
      expect(sidebarMessages('switchPanel').at(-1)).toMatchObject({ panel: 'textReader' });
    });

    it('activar una función desactiva la anterior (exclusión mutua)', async () => {
      await dispatch({ action: 'activate', function: 'textReader' });
      await dispatch({ action: 'activate', function: 'keyboardNav' });

      expect(stubs().textReader.count('deactivate')).toBeGreaterThan(0);
      expect(stubs().keyboardNav.isActive).toBe(true);
      expect(stubs().textReader.isActive).toBe(false);
    });

    it('reactivar la función ya activa no la reinicia', async () => {
      await dispatch({ action: 'activate', function: 'visualNav' });
      const response = await dispatch({ action: 'activate', function: 'visualNav' });

      expect(response).toEqual({ success: true });
      expect(stubs().visualNav.count('activate')).toBe(1);
    });

    it('una función desconocida responde success: false', async () => {
      const response = await dispatch({ action: 'activate', function: 'noExiste' });
      expect(response).toEqual({ success: false });
    });
  });

  describe('callbacks onDeactivate', () => {
    it('resetean el panel activo y permiten reactivar la función', async () => {
      await dispatch({ action: 'activate', function: 'keyboardNav' });
      chrome.storage.local.set.mockClear();

      stubs().keyboardNav.onDeactivate();

      expect(chrome.storage.local.set).toHaveBeenCalledWith({ activePanel: 'default' });
      // Si quedó fuera de activeFunctions, una nueva activación vuelve a llamar activate()
      await dispatch({ action: 'activate', function: 'keyboardNav' });
      expect(stubs().keyboardNav.count('activate')).toBe(2);
    });
  });

  describe('comandos del lector de texto', () => {
    it('play y pause se delegan al módulo', async () => {
      await dispatch({ action: 'textReader', command: 'play' });
      await dispatch({ action: 'textReader', command: 'pause' });

      expect(stubs().textReader.count('play')).toBe(1);
      expect(stubs().textReader.count('pause')).toBe(1);
    });

    it('stop desactiva todos los módulos y resetea el panel', async () => {
      await dispatch({ action: 'activate', function: 'textReader' });
      chrome.storage.local.set.mockClear();

      await dispatch({ action: 'textReader', command: 'stop' });

      expect(stubs().textReader.count('stop')).toBe(1);
      for (const kind of ['textReader', 'keyboardNav', 'visualNav', 'a11yChecker']) {
        expect(stubs()[kind].isActive).toBe(false);
      }
      expect(chrome.storage.local.set).toHaveBeenCalledWith({ activePanel: 'default' });
      expect(sidebarMessages('switchPanel').at(-1)).toMatchObject({ panel: 'default' });
    });

    it('setSpeed se delega al módulo con el valor recibido', async () => {
      await dispatch({ action: 'setSpeed', speed: 1.5 });
      expect(stubs().textReader.calls.at(-1)).toEqual({ method: 'setSpeed', args: [1.5] });
    });
  });

  describe('runA11yCheck', () => {
    it('responde los resultados del checker y los notifica al sidebar', async () => {
      const results = [{ type: 'noAltText', severity: 'error' }];
      globalThis.__a11yGoStubConfig.checkResults = results;

      const response = await dispatch({ action: 'runA11yCheck', categories: { images: true } });

      expect(response).toEqual(results);
      expect(stubs().a11yChecker.calls.at(-1).args).toEqual([{ images: true }]);
      expect(sidebarMessages('updateResults').at(-1)).toMatchObject({ results });
    });

    it('si el checker lanza, responde lista vacía', async () => {
      globalThis.__a11yGoStubConfig.checkError = true;
      const response = await dispatch({ action: 'runA11yCheck', categories: {} });
      expect(response).toEqual([]);
    });
  });

  describe('ajustes de navegación visual', () => {
    it('delega el ajuste al módulo', async () => {
      await dispatch({ action: 'visualNav', setting: 'showOrder', value: false });
      expect(stubs().visualNav.calls.at(-1)).toEqual({
        method: 'updateSetting',
        args: ['showOrder', false]
      });
    });
  });

  describe('highlightElement', () => {
    let target;

    beforeEach(() => {
      target = document.createElement('img');
      target.id = 'highlight-target';
      // jsdom no implementa layout: simular una caja visible
      target.getBoundingClientRect = () => ({
        top: 40, left: 20, width: 120, height: 60, right: 140, bottom: 100, x: 20, y: 40
      });
      document.body.appendChild(target);
    });

    afterEach(() => {
      target.remove();
      document.querySelectorAll('.a11y-error-highlight').forEach(el => el.remove());
    });

    it('crea el overlay con severidad y badge tras el asentamiento del scroll', async () => {
      vi.useFakeTimers();
      await dispatch({ action: 'highlightElement', selector: '#highlight-target', severity: 'warning' });

      expect(document.querySelector('.a11y-error-highlight')).toBeNull();
      vi.advanceTimersByTime(600);

      const overlay = document.querySelector('.a11y-error-highlight');
      expect(overlay).not.toBeNull();
      expect(overlay.classList.contains('severity-warning')).toBe(true);
      expect(overlay.querySelector('.a11y-error-highlight-badge')).not.toBeNull();
    });

    it('elimina el overlay automáticamente a los 12 segundos', async () => {
      vi.useFakeTimers();
      await dispatch({ action: 'highlightElement', selector: '#highlight-target', severity: 'error' });

      vi.advanceTimersByTime(600);
      expect(document.querySelector('.a11y-error-highlight')).not.toBeNull();

      vi.advanceTimersByTime(12000);
      expect(document.querySelector('.a11y-error-highlight')).toBeNull();
    });

    it('un selector inexistente no crea overlay ni lanza', async () => {
      vi.useFakeTimers();
      const response = await dispatch({ action: 'highlightElement', selector: '#no-existe', severity: 'error' });

      vi.advanceTimersByTime(700);
      expect(response).toEqual({ success: true });
      expect(document.querySelector('.a11y-error-highlight')).toBeNull();
    });

    it('un nuevo highlight reemplaza al anterior (solo un overlay a la vez)', async () => {
      vi.useFakeTimers();
      await dispatch({ action: 'highlightElement', selector: '#highlight-target', severity: 'error' });
      vi.advanceTimersByTime(600);

      await dispatch({ action: 'highlightElement', selector: '#highlight-target', severity: 'info' });
      vi.advanceTimersByTime(600);

      const overlays = document.querySelectorAll('.a11y-error-highlight');
      expect(overlays.length).toBe(1);
      expect(overlays[0].classList.contains('severity-info')).toBe(true);
    });
  });

  describe('handler de focusin', () => {
    it('con keyboardNav activa notifica updateFocus con los datos del módulo', async () => {
      await dispatch({ action: 'activate', function: 'keyboardNav' });
      chrome.runtime.sendMessage.mockClear();

      document.dispatchEvent(new Event('focusin'));

      expect(stubs().keyboardNav.count('getFocusInfo')).toBe(1);
      expect(sidebarMessages('updateFocus').at(-1)).toMatchObject({
        data: { tag: 'BUTTON', name: 'Aceptar' }
      });
    });

    it('con textReader activa lee el elemento enfocado y notifica el historial', async () => {
      await dispatch({ action: 'activate', function: 'textReader' });
      chrome.runtime.sendMessage.mockClear();

      const button = document.createElement('button');
      button.textContent = 'Enviar';
      document.body.appendChild(button);
      button.focus();

      await vi.waitFor(() => {
        expect(sidebarMessages('updateTextReaderFocus').at(-1)).toMatchObject({
          data: { accessibleName: 'Nombre accesible', elementType: 'botón' }
        });
      });
      button.remove();
    });

    it('no notifica historial si el lector no devuelve nombre o tipo', async () => {
      globalThis.__a11yGoStubConfig.focusResult = { read: false, name: '', type: '' };
      await dispatch({ action: 'activate', function: 'textReader' });
      chrome.runtime.sendMessage.mockClear();

      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();

      // Dar tiempo a que la promesa de lectura resuelva
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(sidebarMessages('updateTextReaderFocus')).toHaveLength(0);
      button.remove();
    });

    it('sin funciones activas no notifica nada', () => {
      chrome.runtime.sendMessage.mockClear();
      document.dispatchEvent(new Event('focusin'));
      expect(sidebarMessages('updateFocus')).toHaveLength(0);
    });
  });
});

describe('content.js — contexto invalidado en caliente', () => {
  const REAL_ID = chrome.runtime.id;

  beforeEach(async () => {
    await loadContentScript();
  });

  afterEach(() => {
    // Restaurar el contexto y limpiar el aviso entre tests
    chrome.runtime.id = REAL_ID;
    document.querySelectorAll('#a11ygo-context-invalidated').forEach(el => el.remove());
  });

  it('avisa en la página cuando la extensión se recarga con la página abierta', async () => {
    chrome.runtime.id = null;

    await dispatch({ action: 'activate', function: 'textReader' });

    const notice = document.getElementById('a11ygo-context-invalidated');
    expect(notice).not.toBeNull();
    expect(notice.getAttribute('role')).toBe('alert');
    // El texto sale de i18n: acepta cualquiera de los dos idiomas
    expect(notice.textContent.toLowerCase()).toMatch(/recarga|reload/);
  });

  it('no duplica el aviso aunque falle varias veces', async () => {
    chrome.runtime.id = null;

    await dispatch({ action: 'activate', function: 'textReader' });
    await dispatch({ action: 'activate', function: 'keyboardNav' });

    expect(document.querySelectorAll('#a11ygo-context-invalidated')).toHaveLength(1);
  });

  it('avisa también cuando lo que falla es una escritura en storage', async () => {
    chrome.runtime.id = null;

    // onDeactivate solo escribe en storage (no notifica al sidebar): aísla safeStorageSet
    stubs().textReader.onDeactivate();

    expect(document.getElementById('a11ygo-context-invalidated')).not.toBeNull();
  });

  it('detecta el contexto invalidado aunque nada intente usar la API', async () => {
    vi.useFakeTimers();
    try {
      await dispatch({ action: 'activate', function: 'textReader' });
      chrome.runtime.id = null;

      // Nadie envía mensajes ni escribe en storage (el hover del lector no lo
      // hace): solo pasa el tiempo. La vigilancia debe detectarlo igualmente.
      await vi.advanceTimersByTimeAsync(5000);

      expect(document.getElementById('a11ygo-context-invalidated')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('no muestra ningún aviso mientras el contexto sigue siendo válido', async () => {
    await dispatch({ action: 'activate', function: 'textReader' });

    expect(document.getElementById('a11ygo-context-invalidated')).toBeNull();
  });
});
