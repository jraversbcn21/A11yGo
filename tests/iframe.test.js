import { describe, it, expect, beforeEach } from 'vitest';
import { A11yChecker } from '../utils/a11y-checker.js';
import { resolveDeepSelector } from '../utils/dom-utils.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

function onlyCategory(cat) {
  const all = ['images', 'contrast', 'forms', 'headings', 'landmarks', 'links', 'aria', 'keyboard', 'tabOrder'];
  const categories = {};
  for (const c of all) categories[c] = c === cat;
  return categories;
}

describe('A11yChecker audita iframes same-origin', () => {
  it('detecta imagen sin alt dentro de un iframe same-origin', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<img src="foto.png">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.filter(r => r.code === 'noAltText').length).toBe(1);

    iframe.remove();
  });

  it('evalúa encabezados por-documento (h1 en top y h1 en iframe no dan invalidHeadingOrder)', async () => {
    document.body.innerHTML = '<h1>Top</h1>';
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<h1>Iframe</h1>';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('headings'));

    expect(results.some(r => r.code === 'invalidHeadingOrder')).toBe(false);

    iframe.remove();
  });

  it('resetea el contexto de frame al terminar', async () => {
    const checker = new A11yChecker();
    await checker.check(onlyCategory('images'));
    expect(checker._currentDoc).toBeNull();
  });
});

describe('getElementSelector y aviso cross-origin', () => {
  it('genera selector frame-aware resoluble para un elemento en iframe', () => {
    const iframe = document.createElement('iframe');
    iframe.id = 'fr';
    document.body.appendChild(iframe);
    iframe.contentDocument.body.innerHTML = '<div><button>x</button></div>';
    const target = iframe.contentDocument.querySelector('button');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel).toContain(' ::iframe:: ');
    expect(resolveDeepSelector(sel)).toBe(target);

    iframe.remove();
  });

  it('emite un aviso info crossOriginIframe con el recuento', async () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    Object.defineProperty(iframe, 'contentDocument', { get: () => null, configurable: true });

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const notice = results.filter(r => r.code === 'crossOriginIframe');
    expect(notice.length).toBe(1);
    expect(notice[0].severity).toBe('info');
    expect(notice[0].description).toContain('1');

    iframe.remove();
  });

  it('getTitle devuelve el título de iframe cross-origin', () => {
    const checker = new A11yChecker();
    expect(checker.getTitle('crossOriginIframe')).toBe('Iframe de origen cruzado');
  });
});
