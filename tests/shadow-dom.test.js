import { describe, it, expect, beforeEach } from 'vitest';
import { collectShadowRoots, deepQuerySelectorAll, resolveDeepSelector, compareDOMOrder, getAccessibleName } from '../utils/dom-utils.js';
import { A11yChecker } from '../utils/a11y-checker.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

// Helper: crea un host con shadow root y lo añade al padre
function makeShadowHost(parent, mode = 'open') {
  const host = document.createElement('div');
  parent.appendChild(host);
  const root = host.attachShadow({ mode });
  return { host, root };
}

describe('collectShadowRoots', () => {
  it('devuelve array vacío sin shadow roots', () => {
    document.body.innerHTML = '<div><p>texto</p></div>';
    expect(collectShadowRoots()).toEqual([]);
  });

  it('encuentra shadow roots anidados en orden (host antes que su contenido)', () => {
    const outer = makeShadowHost(document.body);
    const inner = makeShadowHost(outer.root);
    const roots = collectShadowRoots();
    expect(roots).toEqual([outer.root, inner.root]);
  });

  it('ignora shadow roots cerrados', () => {
    makeShadowHost(document.body, 'closed');
    expect(collectShadowRoots()).toEqual([]);
  });

  it('respeta el límite de profundidad', () => {
    let parent = document.body;
    for (let i = 0; i < 25; i++) {
      const host = document.createElement('div');
      parent.appendChild(host);
      parent = host.attachShadow({ mode: 'open' });
    }
    const roots = collectShadowRoots();
    expect(roots.length).toBe(20);
  });
});

describe('deepQuerySelectorAll', () => {
  it('sin shadow roots equivale a querySelectorAll plano', () => {
    document.body.innerHTML = '<button>a</button><button>b</button>';
    const result = deepQuerySelectorAll('button');
    expect(result.length).toBe(2);
    expect(result[0].textContent).toBe('a');
  });

  it('encuentra elementos dentro de shadow roots anidados, documento primero', () => {
    const docBtn = document.createElement('button');
    docBtn.textContent = 'doc';
    document.body.appendChild(docBtn);
    const outer = makeShadowHost(document.body);
    outer.root.innerHTML = '<button>outer</button>';
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<button>inner</button>';

    const result = deepQuerySelectorAll('button');
    expect(result.map(b => b.textContent)).toEqual(['doc', 'outer', 'inner']);
  });

  it('acepta lista de roots pre-calculada', () => {
    const outer = makeShadowHost(document.body);
    outer.root.innerHTML = '<button>outer</button>';
    const roots = collectShadowRoots();
    const result = deepQuerySelectorAll('button', roots);
    expect(result.length).toBe(1);
  });

  it('selector inválido devuelve array vacío sin lanzar', () => {
    expect(deepQuerySelectorAll(':::invalido:::')).toEqual([]);
  });
});

describe('deepQuerySelectorAll con baseDoc', () => {
  it('consulta el documento base dado en vez del global', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const idoc = iframe.contentDocument;
    idoc.body.innerHTML = '<button>dentro</button>';

    const result = deepQuerySelectorAll('button', null, idoc);
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe('dentro');

    iframe.remove();
  });

  it('sin baseDoc sigue consultando el document global', () => {
    document.body.innerHTML = '<button>global</button>';
    const result = deepQuerySelectorAll('button');
    expect(result.length).toBe(1);
    expect(result[0].textContent).toBe('global');
  });
});

describe('resolveDeepSelector', () => {
  it('selector sin >>> equivale a document.querySelector', () => {
    document.body.innerHTML = '<button id="btn">a</button>';
    expect(resolveDeepSelector('#btn')).toBe(document.getElementById('btn'));
  });

  it('resuelve una ruta de dos niveles', () => {
    const { host, root } = makeShadowHost(document.body);
    host.id = 'host';
    root.innerHTML = '<button>dentro</button>';
    const el = resolveDeepSelector('#host >>> button');
    expect(el).toBe(root.querySelector('button'));
  });

  it('resuelve una ruta de tres niveles', () => {
    const outer = makeShadowHost(document.body);
    outer.host.id = 'outer';
    const inner = makeShadowHost(outer.root);
    inner.host.classList.add('inner');
    inner.root.innerHTML = '<span class="target">x</span>';
    const el = resolveDeepSelector('#outer >>> .inner >>> .target');
    expect(el).toBe(inner.root.querySelector('.target'));
  });

  it('devuelve null si un salto no existe', () => {
    expect(resolveDeepSelector('#no-existe >>> button')).toBeNull();
  });

  it('devuelve null si el host intermedio no tiene shadow root abierto', () => {
    document.body.innerHTML = '<div id="plain"></div>';
    expect(resolveDeepSelector('#plain >>> button')).toBeNull();
  });

  it('devuelve null para entradas inválidas', () => {
    expect(resolveDeepSelector('')).toBeNull();
    expect(resolveDeepSelector(null)).toBeNull();
  });
});

describe('compareDOMOrder con shadow DOM', () => {
  it('mantiene el comportamiento para elementos del mismo root', () => {
    document.body.innerHTML = '<p id="a"></p><p id="b"></p>';
    const a = document.getElementById('a');
    const b = document.getElementById('b');
    expect(compareDOMOrder(a, b)).toBeLessThan(0);
    expect(compareDOMOrder(b, a)).toBeGreaterThan(0);
  });

  it('ordena elementos de shadow roots distintos por la posición de sus hosts', () => {
    const first = makeShadowHost(document.body);
    first.root.innerHTML = '<span>1</span>';
    const second = makeShadowHost(document.body);
    second.root.innerHTML = '<span>2</span>';
    const a = first.root.querySelector('span');
    const b = second.root.querySelector('span');
    expect(compareDOMOrder(a, b)).toBeLessThan(0);
    expect(compareDOMOrder(b, a)).toBeGreaterThan(0);
  });

  it('el host precede a su propio contenido shadow', () => {
    const { host, root } = makeShadowHost(document.body);
    root.innerHTML = '<span>dentro</span>';
    const inner = root.querySelector('span');
    expect(compareDOMOrder(host, inner)).toBeLessThan(0);
    expect(compareDOMOrder(inner, host)).toBeGreaterThan(0);
  });

  it('ordena entre elemento del documento y elemento en shadow', () => {
    const before = document.createElement('p');
    document.body.appendChild(before);
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<span>s</span>';
    const shadowEl = root.querySelector('span');
    expect(compareDOMOrder(before, shadowEl)).toBeLessThan(0);
    expect(compareDOMOrder(shadowEl, before)).toBeGreaterThan(0);
  });
});

describe('getAccessibleName dentro de shadow DOM', () => {
  it('resuelve aria-labelledby dentro del shadow root', () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<span id="lbl">Nombre interno</span><input aria-labelledby="lbl">';
    const input = root.querySelector('input');
    expect(getAccessibleName(input)).toBe('Nombre interno');
  });

  it('resuelve label[for] dentro del shadow root', () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<label for="campo">Etiqueta interna</label><input id="campo">';
    const input = root.querySelector('input');
    expect(getAccessibleName(input)).toBe('Etiqueta interna');
  });

  it('sigue funcionando para elementos del documento principal', () => {
    document.body.innerHTML = '<label for="x">Doc label</label><input id="x">';
    expect(getAccessibleName(document.getElementById('x'))).toBe('Doc label');
  });
});

// Categorías: solo la indicada activa
function onlyCategory(cat) {
  const all = ['images', 'contrast', 'forms', 'headings', 'landmarks', 'links', 'aria', 'keyboard', 'tabOrder'];
  const categories = {};
  for (const c of all) categories[c] = c === cat;
  return categories;
}

describe('A11yChecker con shadow DOM', () => {
  it('detecta imagen sin alt dentro de un shadow root', async () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<img src="foto.png">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const noAlt = results.filter(r => r.code === 'noAltText');
    expect(noAlt.length).toBe(1);
  });

  it('detecta enlace vacío dentro de shadow roots anidados', async () => {
    const outer = makeShadowHost(document.body);
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<a href="/x"></a>';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('links'));

    expect(results.some(r => r.code === 'emptyLink')).toBe(true);
  });

  it('encuentra label[for] dentro del mismo shadow root (sin falso positivo)', async () => {
    const { root } = makeShadowHost(document.body);
    root.innerHTML = '<label for="c1">Nombre</label><input id="c1" type="text">';

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('forms'));

    expect(results.some(r => r.code === 'missingLabel')).toBe(false);
  });

  it('limpia _shadowRoots al terminar', async () => {
    const checker = new A11yChecker();
    await checker.check(onlyCategory('images'));
    expect(checker._shadowRoots).toBeNull();
  });
});

describe('getElementSelector con shadow DOM', () => {
  it('elementos del documento mantienen el formato actual (sin >>>)', () => {
    document.body.innerHTML = '<div><button id="btn">x</button></div>';
    const checker = new A11yChecker();
    const sel = checker.getElementSelector(document.getElementById('btn'));
    expect(sel).toBe('#btn');
    expect(sel).not.toContain('>>>');
  });

  it('elemento en shadow produce selector con >>> resoluble con resolveDeepSelector', () => {
    const { host, root } = makeShadowHost(document.body);
    host.id = 'mi-host';
    root.innerHTML = '<div><button>dentro</button></div>';
    const target = root.querySelector('button');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel).toContain(' >>> ');
    expect(resolveDeepSelector(sel)).toBe(target);
  });

  it('shadow anidado produce dos separadores y resuelve al elemento', () => {
    const outer = makeShadowHost(document.body);
    outer.host.id = 'outer-host';
    const inner = makeShadowHost(outer.root);
    inner.root.innerHTML = '<span>profundo</span>';
    const target = inner.root.querySelector('span');

    const checker = new A11yChecker();
    const sel = checker.getElementSelector(target);

    expect(sel.split(' >>> ').length).toBe(3);
    expect(resolveDeepSelector(sel)).toBe(target);
  });
});

// Mock de tamaño renderizado (jsdom no calcula layout)
function mockSize(el, width = 100, height = 40) {
  el.getBoundingClientRect = () => ({
    width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0
  });
}

describe('detección de shadow DOM cerrado (heurística)', () => {
  it('emite un único resultado info con el recuento', async () => {
    const w1 = document.createElement('my-widget');
    mockSize(w1);
    document.body.appendChild(w1);
    const w2 = document.createElement('other-widget');
    mockSize(w2);
    document.body.appendChild(w2);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    const closed = results.filter(r => r.code === 'closedShadow');
    expect(closed.length).toBe(1);
    expect(closed[0].severity).toBe('info');
    expect(closed[0].description).toContain('2');
  });

  it('no se emite para custom elements con shadow root abierto', async () => {
    const host = document.createElement('open-widget');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' });
    mockSize(host);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });

  it('no se emite para custom elements con hijos en el DOM ligero', async () => {
    const el = document.createElement('light-widget');
    el.innerHTML = '<p>contenido visible</p>';
    mockSize(el);
    document.body.appendChild(el);

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });

  it('no se emite para elementos sin tamaño renderizado', async () => {
    const el = document.createElement('empty-widget');
    document.body.appendChild(el); // jsdom: rect a 0 por defecto

    const checker = new A11yChecker();
    const results = await checker.check(onlyCategory('images'));

    expect(results.some(r => r.code === 'closedShadow')).toBe(false);
  });
});
