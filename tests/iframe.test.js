import { describe, it, expect, beforeEach } from 'vitest';
import { A11yChecker } from '../utils/a11y-checker.js';

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
    expect(checker._framePath).toBeNull();
  });
});
