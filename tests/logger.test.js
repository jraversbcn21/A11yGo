// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger } from '../utils/logger.js';

/**
 * Tests de logger.js (logger condicional).
 *
 * El logger es un singleton de módulo: se usa setDebug() para fijar el estado
 * del flag en cada test. log() y warn() respetan el flag —en producción la
 * consola de la página queda limpia (H2)— pero error() nunca se silencia: un
 * fallo real debe poder diagnosticarse sin activar el debug.
 */

let logSpy, warnSpy, errorSpy;

beforeEach(() => {
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  logger.setDebug(false);
  vi.restoreAllMocks();
});

describe('con debug desactivado', () => {
  beforeEach(() => {
    logger.setDebug(false);
  });

  it('log no imprime', () => {
    logger.log('mensaje');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('warn no imprime (H2)', () => {
    logger.warn('aviso');
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('error SÍ imprime aunque el debug esté desactivado', () => {
    logger.error('fallo');
    expect(errorSpy).toHaveBeenCalledWith('fallo');
  });
});

describe('con debug activado', () => {
  beforeEach(() => {
    logger.setDebug(true);
  });

  it('log imprime los argumentos', () => {
    logger.log('mensaje', 42);
    expect(logSpy).toHaveBeenCalledWith('mensaje', 42);
  });

  it('warn imprime los argumentos', () => {
    logger.warn('aviso', { detalle: true });
    expect(warnSpy).toHaveBeenCalledWith('aviso', { detalle: true });
  });

  it('error imprime los argumentos', () => {
    logger.error('fallo');
    expect(errorSpy).toHaveBeenCalledWith('fallo');
  });
});

describe('setDebug', () => {
  it('persiste el flag en chrome.storage.local', () => {
    logger.setDebug(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ a11yGoDebug: true });
  });
});
