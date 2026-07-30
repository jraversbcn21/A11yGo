// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Tests de content.js cuando el contexto de extensión no es válido
 * (chrome.runtime.id ausente: extensión recargada o contexto invalidado).
 * Los módulos no se cargan y las activaciones deben fallar con success: false
 * en vez de lanzar o quedar colgadas.
 */

function dispatch(message) {
  const calls = chrome.runtime.onMessage.addListener.mock.calls;
  const listener = calls[calls.length - 1][0];
  return new Promise(resolve => {
    listener(message, { tab: { id: 1 } }, resolve);
  });
}

describe('content.js — contexto de extensión inválido', () => {
  beforeAll(async () => {
    chrome.runtime.id = null;
    await import('../content.js');
  });

  it('registra el listener de mensajes aunque los módulos no carguen', () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  it('activar una función responde success: false', async () => {
    const response = await dispatch({ action: 'activate', function: 'textReader' });
    expect(response).toEqual({ success: false });
  });

  it('runA11yCheck responde lista vacía sin checker disponible', async () => {
    const response = await dispatch({ action: 'runA11yCheck', categories: {} });
    expect(response).toEqual([]);
  });

  it('los comandos del lector no lanzan sin módulo cargado', async () => {
    const response = await dispatch({ action: 'textReader', command: 'play' });
    expect(response).toEqual({ success: true });
  });
});
