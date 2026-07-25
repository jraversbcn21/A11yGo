import { describe, it, expect, beforeEach } from 'vitest';
import { collectShadowRoots, deepQuerySelectorAll } from '../utils/dom-utils.js';

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
