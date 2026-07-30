// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { TextReader } from '../utils/text-reader.js';

/**
 * Tests de text-reader.js.
 *
 * jsdom no implementa Web Speech API: speechSynthesis y SpeechSynthesisUtterance
 * se mockean por test. Las pruebas cubren la lógica pura (formateo, detección de
 * idioma, normalización anti-deletreo, nombres accesibles, tipos de elemento,
 * deduplicación), la manipulación DOM (focusables temporales, highlight) y la
 * lógica async de read(): reentrancia vía readToken y reintento de voces.
 */

const VOICES = [
  { name: 'Español', lang: 'es-ES', localService: true },
  { name: 'English', lang: 'en-US', localService: true }
];

function createSynthesisMock(voices = VOICES) {
  return {
    speaking: false,
    pending: false,
    paused: false,
    getVoices: vi.fn(() => voices),
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    onvoiceschanged: null
  };
}

class FakeUtterance {
  constructor(text) {
    this.text = text;
  }
}

let synth;
let reader;

beforeAll(() => {
  // jsdom no calcula layout: offsetParent siempre es null. Simular que todo
  // elemento conectado está en el flujo del documento.
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    configurable: true,
    get() { return this.parentNode; }
  });
});

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.lang = '';
  globalThis.SpeechSynthesisUtterance = FakeUtterance;
  synth = createSynthesisMock();
  window.speechSynthesis = synth;
  // text-reader usa la forma promesa de storage.get (el mock global es callback)
  chrome.storage.local.get = vi.fn(() => Promise.resolve({}));
  chrome.storage.local.set.mockClear();
  reader = new TextReader();
});

afterEach(() => {
  reader.deactivate();
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('detección de idioma', () => {
  it('usa el atributo lang del html', async () => {
    document.documentElement.lang = 'es';
    expect(await reader.detectLanguage('any text')).toBe('es-ES');
    document.documentElement.lang = 'en-GB';
    expect(await reader.detectLanguage('cualquier texto')).toBe('en-US');
  });

  it('sin lang, detecta español por caracteres acentuados', async () => {
    expect(await reader.detectLanguage('¡Añadir más días!')).toBe('es-ES');
  });

  it('sin lang, detecta inglés por palabras sin acentos', async () => {
    expect(await reader.detectLanguage('The quick brown fox')).toBe('en-US');
  });

  it('texto mixto: gana el idioma con más palabras', async () => {
    expect(await reader.detectLanguage('canción emoción sesión ilusión with word')).toBe('es-ES');
  });

  it('por defecto retorna español', async () => {
    expect(await reader.detectLanguage('123 456')).toBe('es-ES');
  });
});

describe('formatTextForSpeech', () => {
  it('formatea precios en euros con decimales', () => {
    expect(reader.formatTextForSpeech('Cuesta 59,99 €')).toBe('Cuesta 59 euros con 99 céntimos');
  });

  it('formatea precios en euros sin decimales', () => {
    expect(reader.formatTextForSpeech('Total: 59 €')).toBe('Total: 59 euros');
  });

  it('formatea precios en dólares', () => {
    expect(reader.formatTextForSpeech('Price: $19.95')).toBe('Price: 19 dólares con 95 centavos');
  });

  it('elimina separadores de miles', () => {
    expect(reader.formatTextForSpeech('1.000 unidades')).toBe('1000 unidades');
  });

  it('formatea porcentajes', () => {
    expect(reader.formatTextForSpeech('20% de descuento')).toBe('20 por ciento de descuento');
  });

  it('normaliza GRATIS y FREE a minúsculas', () => {
    expect(reader.formatTextForSpeech('Envío GRATIS y FREE')).toBe('Envío gratis y gratis');
  });

  it('colapsa espacios múltiples', () => {
    expect(reader.formatTextForSpeech('hola    mundo   ')).toBe('hola mundo');
  });
});

describe('normalizeTextForReading (anti-deletreo)', () => {
  it('reconstruye palabras deletreadas con espacios', () => {
    expect(reader.normalizeTextForReading('J E A N S')).toBe('JEANS');
  });

  it('reconstruye palabras deletreadas con puntos', () => {
    expect(reader.normalizeTextForReading('J. E. A. N. S')).toBe('JEANS');
  });

  it('no altera frases normales', () => {
    expect(reader.normalizeTextForReading('Ropa de mujer en oferta')).toBe('Ropa de mujer en oferta');
  });

  it('normaliza espacios alrededor de puntuación', () => {
    expect(reader.normalizeTextForReading('Hola ,  mundo .  Fin')).toBe('Hola, mundo. Fin');
  });

  it('retorna cadena vacía para entrada vacía', () => {
    expect(reader.normalizeTextForReading('')).toBe('');
    expect(reader.normalizeTextForReading(null)).toBe('');
  });
});

describe('getAccessibleName', () => {
  it('prioriza aria-label', () => {
    document.body.innerHTML = '<button aria-label="Cerrar diálogo">X</button>';
    expect(reader.getAccessibleName(document.querySelector('button'))).toBe('Cerrar diálogo');
  });

  it('resuelve aria-labelledby concatenando los referidos', () => {
    document.body.innerHTML =
      '<span id="a">Precio</span><span id="b">final</span><div aria-labelledby="a b"></div>';
    expect(reader.getAccessibleName(document.querySelector('div'))).toBe('Precio final');
  });

  it('usa el alt en imágenes', () => {
    document.body.innerHTML = '<img alt="Logotipo de la tienda">';
    expect(reader.getAccessibleName(document.querySelector('img'))).toBe('Logotipo de la tienda');
  });

  it('usa el texto visible en enlaces y botones', () => {
    document.body.innerHTML = '<a href="#">Ver carrito</a>';
    expect(reader.getAccessibleName(document.querySelector('a'))).toBe('Ver carrito');
  });

  it('usa la label asociada por for en inputs', () => {
    document.body.innerHTML = '<label for="mail">Correo electrónico</label><input id="mail" type="email">';
    expect(reader.getAccessibleName(document.querySelector('input'))).toBe('Correo electrónico');
  });

  it('usa la label ancestro en inputs anidados', () => {
    document.body.innerHTML = '<label>Teléfono <input type="tel"></label>';
    expect(reader.getAccessibleName(document.querySelector('input'))).toBe('Teléfono');
  });

  it('usa el placeholder como último recurso en inputs', () => {
    document.body.innerHTML = '<input type="text" placeholder="Buscar productos">';
    expect(reader.getAccessibleName(document.querySelector('input'))).toBe('Buscar productos');
  });

  it('retorna vacío sin fuentes de nombre', () => {
    document.body.innerHTML = '<div></div>';
    expect(reader.getAccessibleName(document.querySelector('div'))).toBe('');
  });
});

describe('getElementType', () => {
  function typeOf(html, selector = '#t') {
    document.body.innerHTML = html;
    return reader.getElementType(document.querySelector(selector));
  }

  it('prioriza el role sobre la etiqueta', () => {
    expect(typeOf('<div id="t" role="button">x</div>')).toBe('botón');
    expect(typeOf('<div id="t" role="heading" aria-level="3">x</div>')).toBe('encabezado nivel 3');
  });

  it('describe encabezados con su nivel', () => {
    expect(typeOf('<h2 id="t">x</h2>')).toBe('título nivel 2');
  });

  it('distingue enlaces internos, externos y anclas', () => {
    expect(typeOf('<a id="t" href="/ruta">x</a>')).toBe('enlace');
    expect(typeOf('<a id="t" href="https://otro-sitio.example/">x</a>')).toBe('enlace externo');
    expect(typeOf('<a id="t">x</a>')).toBe('ancla');
  });

  it('distingue tipos de botón', () => {
    expect(typeOf('<button id="t" type="submit">x</button>')).toBe('botón de envío');
    expect(typeOf('<button id="t">x</button>')).toBe('botón');
  });

  it('anuncia el estado de checkboxes y radios', () => {
    expect(typeOf('<input id="t" type="checkbox" checked>')).toBe('casilla de verificación, marcado');
    expect(typeOf('<input id="t" type="radio">')).toBe('botón de opción, desmarcado');
  });

  it('anuncia inputs requeridos', () => {
    expect(typeOf('<input id="t" type="email" required>')).toBe('campo de correo electrónico, requerido');
  });

  it('describe selects y textareas con sus variantes', () => {
    expect(typeOf('<select id="t" multiple></select>')).toBe('lista desplegable de selección múltiple');
    expect(typeOf('<textarea id="t" rows="5"></textarea>')).toBe('área de texto de 5 líneas');
  });

  it('calcula el porcentaje en barras de progreso', () => {
    expect(typeOf('<progress id="t" value="30" max="120"></progress>')).toBe('barra de progreso, 25 por ciento');
  });

  it('detecta precios en spans y divs por clase o marca', () => {
    expect(typeOf('<span id="t" class="price">59 €</span>')).toBe('precio');
    expect(typeOf('<div id="t" data-textreader-price="true">59 €</div>')).toBe('precio');
    expect(typeOf('<span id="t">texto normal</span>')).toBe('');
  });

  it('usa estados ARIA como fallback en elementos sin tipo', () => {
    expect(typeOf('<x-el id="t" aria-pressed="true"></x-el>')).toBe('botón de alternancia, presionado');
    expect(typeOf('<x-el id="t" aria-expanded="false"></x-el>')).toBe('elemento expandible, colapsado');
  });
});

describe('shouldReadElement (deduplicación)', () => {
  it('siempre lee elementos hechos focusables por el lector', () => {
    document.body.innerHTML = '<p class="textreader-focusable">Hola</p>';
    reader.lastReadText = 'hola';
    reader.lastReadTime = Date.now();
    expect(reader.shouldReadElement(document.querySelector('p'), 'Hola', 'párrafo')).toBe(true);
  });

  it('siempre lee elementos interactivos aunque sean repetidos', () => {
    document.body.innerHTML = '<button>Hola</button>';
    reader.lastReadText = 'hola';
    reader.lastReadTime = Date.now();
    expect(reader.shouldReadElement(document.querySelector('button'), 'Hola', 'botón')).toBe(true);
  });

  it('omite contenedores repetidos dentro de la ventana de deduplicación', () => {
    document.body.innerHTML = '<section>Hola</section>';
    reader.lastReadText = 'hola';
    reader.lastReadTime = Date.now();
    expect(reader.shouldReadElement(document.querySelector('section'), 'Hola', 'sección')).toBe(false);
  });

  it('vuelve a leer el mismo texto pasada la ventana de deduplicación', () => {
    document.body.innerHTML = '<section>Hola</section>';
    reader.lastReadText = 'hola';
    reader.lastReadTime = Date.now() - (reader.DEDUPLICATION_WINDOW + 1000);
    expect(reader.shouldReadElement(document.querySelector('section'), 'Hola', 'sección')).toBe(true);
  });
});

describe('readElementOnFocus', () => {
  beforeEach(() => {
    reader.isActive = true;
    reader.read = vi.fn(async () => {});
  });

  it('anuncia botones como "tipo, nombre"', async () => {
    document.body.innerHTML = '<button>Enviar</button>';
    const result = await reader.readElementOnFocus(document.querySelector('button'));

    expect(result).toEqual({ read: true, name: 'Enviar', type: 'botón' });
    expect(reader.read).toHaveBeenCalledWith('botón, Enviar');
  });

  it('anuncia encabezados con su nivel', async () => {
    document.body.innerHTML = '<h2>Ofertas de verano</h2>';
    await reader.readElementOnFocus(document.querySelector('h2'));
    expect(reader.read).toHaveBeenCalledWith('título nivel 2, Ofertas de verano');
  });

  it('anuncia párrafos con el prefijo "texto"', async () => {
    document.body.innerHTML = '<p>Contenido del artículo</p>';
    await reader.readElementOnFocus(document.querySelector('p'));
    expect(reader.read).toHaveBeenCalledWith('texto, Contenido del artículo');
  });

  it('anuncia elementos de precio', async () => {
    document.body.innerHTML = '<div class="price">59,99 €</div>';
    await reader.readElementOnFocus(document.querySelector('div'));
    expect(reader.read).toHaveBeenCalledWith('precio, 59,99 €');
  });

  it('ignora regiones de navegación y elementos de lista', async () => {
    document.body.innerHTML = '<nav>Menú</nav><li>Item</li>';
    expect(await reader.readElementOnFocus(document.querySelector('nav')))
      .toEqual({ read: false, name: '', type: '' });
    expect(await reader.readElementOnFocus(document.querySelector('li')))
      .toEqual({ read: false, name: '', type: '' });
    expect(reader.read).not.toHaveBeenCalled();
  });

  it('ignora divs que no son precios', async () => {
    document.body.innerHTML = '<div>Contenedor genérico</div>';
    expect(await reader.readElementOnFocus(document.querySelector('div')))
      .toEqual({ read: false, name: '', type: '' });
  });

  it('con lector inactivo no lee nada', async () => {
    reader.isActive = false;
    document.body.innerHTML = '<button>Enviar</button>';
    expect(await reader.readElementOnFocus(document.querySelector('button')))
      .toEqual({ read: false, name: '', type: '' });
  });

  it('trunca anuncios de más de 200 caracteres', async () => {
    const longText = 'palabra '.repeat(40).trim();
    document.body.innerHTML = `<p>${longText}</p>`;
    await reader.readElementOnFocus(document.querySelector('p'));

    const spoken = reader.read.mock.calls[0][0];
    expect(spoken.length).toBeLessThanOrEqual(201); // 200 + elipsis
    expect(spoken.endsWith('…')).toBe(true);
  });

  it('un contenedor repetido retorna la info sin leerla (historial sin TTS)', async () => {
    document.body.innerHTML = '<section aria-label="Ofertas">Ofertas</section>';
    reader.lastReadText = 'ofertas';
    reader.lastReadTime = Date.now();

    const result = await reader.readElementOnFocus(document.querySelector('section'));
    expect(result).toEqual({ read: false, name: 'Ofertas', type: 'sección' });
    expect(reader.read).not.toHaveBeenCalled();
  });
});

describe('elementos de contenido focusables', () => {
  it('añade tabindex 0 y clase solo a contenido no interactivo', () => {
    document.body.innerHTML = `
      <h1>Título</h1>
      <p>Párrafo con texto</p>
      <button>Botón</button>
      <a href="#">Enlace</a>
      <div class="button-container"><button>X</button></div>
    `;
    reader.makeContentElementsFocusable();

    expect(document.querySelector('h1').getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('h1').classList.contains('textreader-focusable')).toBe(true);
    expect(document.querySelector('p').getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('button').classList.contains('textreader-focusable')).toBe(false);
    expect(document.querySelector('a').hasAttribute('tabindex')).toBe(false);
    expect(document.querySelector('.button-container').hasAttribute('tabindex')).toBe(false);
  });

  it('marca elementos de precio con data-textreader-price', () => {
    document.body.innerHTML = '<span class="price">59,99 €</span>';
    reader.makeContentElementsFocusable();
    expect(document.querySelector('span').getAttribute('data-textreader-price')).toBe('true');
  });

  it('restoreContentElements deja el DOM como estaba', () => {
    document.body.innerHTML = '<h1>Título</h1><p>Texto</p>';
    reader.makeContentElementsFocusable();
    reader.restoreContentElements();

    for (const el of document.querySelectorAll('h1, p')) {
      expect(el.hasAttribute('tabindex')).toBe(false);
      expect(el.hasAttribute('data-textreader-original-tabindex')).toBe(false);
      expect(el.classList.contains('textreader-focusable')).toBe(false);
    }
    expect(reader.modifiedElements).toEqual([]);
  });
});

describe('read() — síntesis y reentrancia', () => {
  beforeEach(() => {
    reader.isActive = true;
  });

  it('habla el texto formateado con la velocidad configurada', async () => {
    document.documentElement.lang = 'es';
    reader.speed = 1.5;
    await reader.read('20% de descuento');

    expect(synth.speak).toHaveBeenCalledTimes(1);
    const utterance = synth.speak.mock.calls[0][0];
    expect(utterance.text).toBe('20 por ciento de descuento');
    expect(utterance.rate).toBe(1.5);
    expect(utterance.lang).toBe('es-ES');
  });

  it('selecciona una voz que coincide con el idioma', async () => {
    document.documentElement.lang = 'en';
    await reader.read('Hello world');
    expect(synth.speak.mock.calls[0][0].voice).toEqual(VOICES[1]);
  });

  it('no habla si el lector está inactivo', async () => {
    reader.isActive = false;
    await reader.read('hola');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('no habla con texto vacío', async () => {
    await reader.read('   ');
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('corrige una velocidad inválida al valor por defecto', async () => {
    reader.speed = NaN;
    await reader.read('hola mundo');
    expect(synth.speak.mock.calls[0][0].rate).toBe(1.0);
  });

  it('de dos lecturas concurrentes solo habla la última (readToken)', async () => {
    const first = reader.read('primera lectura');
    const second = reader.read('segunda lectura');
    await Promise.all([first, second]);

    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0][0].text).toBe('segunda lectura');
  });

  it('cancela la síntesis en curso antes de hablar', async () => {
    synth.speaking = true;
    const promise = reader.read('nuevo texto');
    // la cancelación pone speaking a false (simular al llamar cancel)
    synth.cancel.mockImplementation(() => { synth.speaking = false; });
    await promise;

    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  // Simula voces que desaparecen justo en la verificación previa a speak
  // (2ª llamada a getVoices) y reaparecen en el reintento
  function mockVoicesMissingAtSpeakCheck() {
    let call = 0;
    synth.getVoices = vi.fn(() => (++call === 2 ? [] : VOICES));
  }

  it('sin voces disponibles programa un reintento y habla cuando cargan', async () => {
    vi.useFakeTimers();
    mockVoicesMissingAtSpeakCheck();

    await reader.read('hola mundo');
    expect(synth.speak).not.toHaveBeenCalled();
    expect(reader.voicesRetryTimer).not.toBeNull();

    await vi.advanceTimersByTimeAsync(100);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    expect(synth.speak.mock.calls[0][0].text).toBe('hola mundo');
  });

  it('el reintento de voces no habla si el lector fue desactivado', async () => {
    vi.useFakeTimers();
    mockVoicesMissingAtSpeakCheck();

    await reader.read('hola mundo');
    reader.isActive = false;
    await vi.advanceTimersByTimeAsync(100);

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('onstart y onend actualizan isReading', async () => {
    await reader.read('hola mundo');
    const utterance = synth.speak.mock.calls[0][0];

    utterance.onstart();
    expect(reader.isReading).toBe(true);
    utterance.onend();
    expect(reader.isReading).toBe(false);
  });
});

describe('controles play / pause / stop / setSpeed', () => {
  it('play lee el texto seleccionado', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'texto seleccionado',
      rangeCount: 0
    });
    reader.read = vi.fn();

    reader.play();
    expect(reader.read).toHaveBeenCalledWith('texto seleccionado');
  });

  it('pause pausa una lectura en curso y la reanuda al repetirse', () => {
    reader.isReading = true;
    reader.pause();
    expect(synth.pause).toHaveBeenCalled();
    expect(reader.isPaused).toBe(true);

    synth.paused = true;
    reader.pause();
    expect(synth.resume).toHaveBeenCalled();
    expect(reader.isPaused).toBe(false);
  });

  it('stop cancela la síntesis y resetea el estado', () => {
    reader.isReading = true;
    reader.isPaused = true;
    reader.stop();

    expect(synth.cancel).toHaveBeenCalled();
    expect(reader.isReading).toBe(false);
    expect(reader.isPaused).toBe(false);
  });

  it('setSpeed persiste la velocidad en storage', () => {
    reader.setSpeed(1.5);
    expect(reader.speed).toBe(1.5);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ textReaderSpeed: 1.5 });
  });
});

describe('activate / deactivate', () => {
  it('activate carga la velocidad guardada y hace el contenido navegable', async () => {
    chrome.storage.local.get = vi.fn(() => Promise.resolve({ textReaderSpeed: 1.8 }));
    document.body.innerHTML = '<h1>Título</h1><p>Texto de prueba</p>';

    await reader.activate();

    expect(reader.isActive).toBe(true);
    expect(reader.speed).toBe(1.8);
    expect(document.querySelector('h1').getAttribute('tabindex')).toBe('0');
  });

  it('deactivate restaura el DOM y queda pausado', async () => {
    document.body.innerHTML = '<h1>Título</h1>';
    await reader.activate();
    reader.deactivate();

    expect(reader.isActive).toBe(false);
    expect(reader.isPaused).toBe(true);
    expect(synth.cancel).toHaveBeenCalled();
    expect(document.querySelector('h1').hasAttribute('tabindex')).toBe(false);
  });

  it('Escape desactiva el lector y dispara onDeactivate', async () => {
    document.body.innerHTML = '<p>Texto</p>';
    const onDeactivate = vi.fn();
    reader.onDeactivate = onDeactivate;
    await reader.activate();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(reader.isActive).toBe(false);
    expect(onDeactivate).toHaveBeenCalledTimes(1);
  });

  it('si se desactiva mientras esperaba voces, no sigue con la activación', async () => {
    vi.useFakeTimers();
    synth.getVoices = vi.fn(() => []);
    document.body.innerHTML = '<p>Texto</p>';

    const promise = reader.activate();
    reader.deactivate();
    await vi.advanceTimersByTimeAsync(2500);
    await promise;

    expect(reader.isActive).toBe(false);
    expect(document.querySelector('p').hasAttribute('tabindex')).toBe(false);
  });
});

describe('lectura por hover y selección', () => {
  beforeEach(() => {
    reader.isActive = true;
    reader.isPaused = false;
    reader.read = vi.fn();
  });

  it('tras 500ms de hover lee el texto del elemento', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>Texto del párrafo</p>';
    const target = document.querySelector('p');

    reader.handleHoverMouseOver({ target, clientX: 10, clientY: 10 });
    expect(reader.read).not.toHaveBeenCalled();

    vi.advanceTimersByTime(500);
    expect(reader.read).toHaveBeenCalledWith('Texto del párrafo');
  });

  it('salir del elemento antes de 500ms cancela la lectura', () => {
    vi.useFakeTimers();
    document.body.innerHTML = '<p>Texto del párrafo</p>';
    const target = document.querySelector('p');

    reader.handleHoverMouseOver({ target, clientX: 10, clientY: 10 });
    reader.handleHoverMouseOut({});
    vi.advanceTimersByTime(600);

    expect(reader.read).not.toHaveBeenCalled();
  });

  it('con el lector pausado el hover no lee', () => {
    vi.useFakeTimers();
    reader.isPaused = true;
    document.body.innerHTML = '<p>Texto del párrafo</p>';

    reader.handleHoverMouseOver({ target: document.querySelector('p'), clientX: 0, clientY: 0 });
    vi.advanceTimersByTime(600);

    expect(reader.read).not.toHaveBeenCalled();
  });

  it('seleccionar texto dispara su lectura', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({
      toString: () => 'fragmento seleccionado'
    });
    reader.handleTextSelection();
    expect(reader.read).toHaveBeenCalledWith('fragmento seleccionado');
  });
});

describe('highlight de texto leído', () => {
  it('envuelve la primera ocurrencia y removeHighlight la restaura', () => {
    document.body.innerHTML = '<p>Un texto resaltable dentro del párrafo</p>';

    reader.highlightText('texto resaltable');
    expect(reader.highlightElements.length).toBe(1);
    expect(document.body.textContent).toContain('Un texto resaltable dentro del párrafo');

    reader.removeHighlight();
    expect(reader.highlightElements).toEqual([]);
    expect(document.querySelector('p').children.length).toBe(0);
    expect(document.querySelector('p').textContent).toBe('Un texto resaltable dentro del párrafo');
  });

  it('sin coincidencias no crea highlights', () => {
    document.body.innerHTML = '<p>Otro contenido</p>';
    reader.highlightText('texto inexistente');
    expect(reader.highlightElements).toEqual([]);
  });
});
