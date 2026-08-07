import { describe, it, expect } from 'vitest';
import { calculateTabOrder, compareDOMOrder, getAccessibleName, hasHiddenAncestor } from '../utils/dom-utils.js';

describe('compareDOMOrder', () => {
  it('returns 0 for same element', () => {
    const el = document.createElement('div');
    expect(compareDOMOrder(el, el)).toBe(0);
  });

  it('returns negative when a precedes b in DOM', () => {
    const container = document.createElement('div');
    const a = document.createElement('span');
    const b = document.createElement('span');
    container.appendChild(a);
    container.appendChild(b);
    document.body.appendChild(container);

    expect(compareDOMOrder(a, b)).toBeLessThan(0);
    expect(compareDOMOrder(b, a)).toBeGreaterThan(0);

    document.body.removeChild(container);
  });
});

describe('calculateTabOrder', () => {
  it('returns empty array for empty input', () => {
    expect(calculateTabOrder([])).toEqual([]);
  });

  it('elements with positive tabindex come first', () => {
    const el1 = document.createElement('button');
    const el2 = document.createElement('button');
    const el3 = document.createElement('button');

    el1.setAttribute('tabindex', '0');
    el2.setAttribute('tabindex', '2');
    el3.setAttribute('tabindex', '1');

    const container = document.createElement('div');
    container.append(el1, el2, el3);
    document.body.appendChild(container);

    const result = calculateTabOrder([el1, el2, el3]);

    expect(result[0]).toBe(el3); // tabindex=1
    expect(result[1]).toBe(el2); // tabindex=2
    expect(result[2]).toBe(el1); // tabindex=0

    document.body.removeChild(container);
  });

  it('elements without tabindex follow DOM order', () => {
    const container = document.createElement('div');
    const el1 = document.createElement('button');
    const el2 = document.createElement('button');
    const el3 = document.createElement('button');

    container.append(el1, el2, el3);
    document.body.appendChild(container);

    const result = calculateTabOrder([el3, el1, el2]);

    expect(result[0]).toBe(el1);
    expect(result[1]).toBe(el2);
    expect(result[2]).toBe(el3);

    document.body.removeChild(container);
  });
});

describe('getAccessibleName', () => {
  it('returns empty string for null', () => {
    expect(getAccessibleName(null)).toBe('');
  });

  it('aria-labelledby takes highest precedence over aria-label', () => {
    const label = document.createElement('span');
    label.id = 'over-label';
    label.textContent = 'From labelledby';
    document.body.appendChild(label);

    const el = document.createElement('button');
    el.setAttribute('aria-labelledby', 'over-label');
    el.setAttribute('aria-label', 'From aria-label');
    document.body.appendChild(el);

    expect(getAccessibleName(el)).toBe('From labelledby');

    document.body.removeChild(label);
    document.body.removeChild(el);
  });

  it('associated label takes precedence over aria-label for inputs', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'prec-input');
    label.textContent = 'From label';
    document.body.appendChild(label);

    const input = document.createElement('input');
    input.id = 'prec-input';
    input.setAttribute('aria-label', 'From aria-label');
    document.body.appendChild(input);

    const name = getAccessibleName(input);
    expect(name).toBe('From label');

    document.body.removeChild(label);
    document.body.removeChild(input);
  });

  it('aria-label falls back when no labelledby or label', () => {
    const el = document.createElement('button');
    el.setAttribute('aria-label', 'Close dialog');
    expect(getAccessibleName(el)).toBe('Close dialog');
  });

  it('alt text for images after labelledby and aria-label but before text', () => {
    const img = document.createElement('img');
    img.setAttribute('alt', 'Company logo');
    expect(getAccessibleName(img)).toBe('Company logo');
  });

  it('aria-labelledby takes precedence over alt for images', () => {
    const label = document.createElement('span');
    label.id = 'img-label';
    label.textContent = 'From labelledby';
    document.body.appendChild(label);

    const img = document.createElement('img');
    img.setAttribute('aria-labelledby', 'img-label');
    img.setAttribute('alt', 'Company logo');
    document.body.appendChild(img);

    expect(getAccessibleName(img)).toBe('From labelledby');

    document.body.removeChild(label);
    document.body.removeChild(img);
  });

  it('visible text takes precedence over title', () => {
    const el = document.createElement('a');
    el.setAttribute('title', 'Go to homepage');
    el.textContent = 'Visible link text';
    expect(getAccessibleName(el)).toBe('Visible link text');
  });

  it('falls back to title when no visible text', () => {
    const el = document.createElement('a');
    el.setAttribute('title', 'Go to homepage');
    expect(getAccessibleName(el)).toBe('Go to homepage');
  });

  it('returns associated label for inputs', () => {
    const label = document.createElement('label');
    label.setAttribute('for', 'email-input');
    label.textContent = 'Email address';
    document.body.appendChild(label);

    const input = document.createElement('input');
    input.id = 'email-input';
    document.body.appendChild(input);

    expect(getAccessibleName(input)).toBe('Email address');

    document.body.removeChild(label);
    document.body.removeChild(input);
  });

  it('truncates visible text longer than 50 chars', () => {
    const el = document.createElement('p');
    el.textContent = 'A'.repeat(60);
    expect(getAccessibleName(el)).toBe('A'.repeat(50) + '...');
  });

  it('returns descendant img alt as fallback', () => {
    const link = document.createElement('a');
    const img = document.createElement('img');
    img.setAttribute('alt', 'Icon');
    link.appendChild(img);
    expect(getAccessibleName(link)).toBe('Icon');
  });
});

describe('hasHiddenAncestor', () => {
  it('returns false for an element with no hidden ancestors', () => {
    document.body.innerHTML = '<div><button id="btn">Ok</button></div>';
    expect(hasHiddenAncestor(document.getElementById('btn'))).toBe(false);
  });

  it('returns true when an ancestor has display: none', () => {
    document.body.innerHTML = '<div style="display: none"><button id="btn">Oculto</button></div>';
    expect(hasHiddenAncestor(document.getElementById('btn'))).toBe(true);
  });

  it('returns true when an ancestor has visibility: hidden', () => {
    document.body.innerHTML = '<div style="visibility: hidden"><button id="btn">Oculto</button></div>';
    expect(hasHiddenAncestor(document.getElementById('btn'))).toBe(true);
  });

  it('returns true when an ancestor has aria-hidden="true"', () => {
    document.body.innerHTML = '<div aria-hidden="true"><button id="btn">Oculto</button></div>';
    expect(hasHiddenAncestor(document.getElementById('btn'))).toBe(true);
  });

  it('detects the hidden ancestor even when it is not the direct parent', () => {
    document.body.innerHTML =
      '<div style="display: none"><section><span><button id="btn">Oculto</button></span></section></div>';
    expect(hasHiddenAncestor(document.getElementById('btn'))).toBe(true);
  });
});
