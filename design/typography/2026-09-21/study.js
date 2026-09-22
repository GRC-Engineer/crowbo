'use strict';

const fonts = [
  {id:'geist', name:'Geist Pixel Square', family:'GeistPixel', weight:400, kind:'PIXEL', trait:'Precise / geometric', character:'Precise pixels. A restrained arcade feel.'},
  {id:'departure', name:'Departure Mono', family:'Departure', weight:400, kind:'PIXEL', trait:'Terminal / technical', character:'A terminal personality, with the pixels left in.'},
  {id:'pixelify', name:'Pixelify Sans', family:'Pixelify', weight:600, kind:'PIXEL', trait:'Playful / rounded', character:'Softer pixels, closer to a friendly game companion.'},
  {id:'jersey', name:'Jersey 10', family:'Jersey', weight:400, kind:'PIXEL', trait:'Bold / arcade', character:'Chunky arcade lettering with a stronger game-title feel.'},
  {id:'plex', name:'IBM Plex Mono', family:'Plex', weight:700, kind:'MONO', trait:'Engineered / steady', character:'Technical and steady. The mascot brings the playfulness.'},
  {id:'google', name:'Google Sans Code', family:'GoogleCode', weight:600, kind:'MONO', trait:'Open / understated', character:'A quieter coding voice, with open, readable shapes.'},
  {id:'space', name:'Space Grotesk', family:'Space', weight:700, kind:'SANS', trait:'Clean / geometric', character:'Clean geometry that gives the detailed crow more room.'},
  {id:'bricolage', name:'Bricolage Grotesque', family:'Bricolage', weight:800, kind:'SANS', trait:'Expressive / friendly', character:'A rounder, expressive name beside a sharp pixel crow.'}
];

const grid = document.querySelector('#font-grid');
const hero = document.querySelector('#hero-wordmark');
const sizeControl = document.querySelector('#size');
const trackingControl = document.querySelector('#tracking');
const caseControl = document.querySelector('#letter-case');
const themeControl = document.querySelector('#theme');
const status = document.querySelector('#font-status');
const cards = new Map();
const loaded = new Set();
let selected = fonts[0];

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

for (const [index, font] of fonts.entries()) {
  const number = String(index + 1).padStart(2, '0');
  const card = element('button', 'font-card');
  card.type = 'button';
  card.disabled = true;
  card.setAttribute('aria-pressed', 'false');
  card.setAttribute('aria-label', number + ' — ' + font.name);
  const top = element('span', 'card-top');
  top.append(element('span', 'card-number', number), element('span', '', font.kind));
  const preview = element('span', 'card-preview', 'crowbo');
  preview.style.fontFamily = font.family;
  preview.style.fontWeight = String(font.weight);
  preview.setAttribute('aria-hidden', 'true');
  card.append(top, preview, element('span', 'card-name', font.name), element('span', 'card-trait', font.trait), element('span', 'card-selector', '↗'));
  card.addEventListener('click', () => selectFont(font));
  grid.append(card);
  cards.set(font.id, card);
}

function selectFont(font) {
  if (!loaded.has(font.id)) return;
  selected = font;
  for (const candidate of fonts) cards.get(candidate.id).setAttribute('aria-pressed', String(candidate.id === font.id));
  hero.style.fontFamily = font.family;
  hero.style.fontWeight = String(font.weight);
  hero.dataset.ready = 'true';
  const number = String(fonts.indexOf(font) + 1).padStart(2, '0');
  document.querySelector('#selected-label').textContent = number + ' / ' + font.name.toUpperCase();
  document.querySelector('#selected-character').textContent = font.character;
  updatePreview();
}

function boundedValue(control, min, max, fallback) {
  const value = Number(control.value);
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
}

function fitWordmark(node, requestedSize) {
  let size = Number.isFinite(requestedSize) ? Math.max(12, requestedSize) : 44;
  node.style.fontSize = size + 'px';
  for (let pass = 0; pass < 3; pass += 1) {
    const available = node.clientWidth;
    if (available < 1 || node.scrollWidth <= available) break;
    size = Math.max(12, Math.floor(size * available / node.scrollWidth) - 1);
    node.style.fontSize = size + 'px';
  }
}

function updatePreview() {
  const word = caseControl.value === 'upper' ? 'CROWBO' : 'crowbo';
  const size = boundedValue(sizeControl, 66, 132, 110);
  const tracking = boundedValue(trackingControl, -4, 10, -4) / 100;
  hero.textContent = word;
  hero.setAttribute('aria-label', word);
  hero.style.letterSpacing = tracking + 'em';
  document.querySelector('#size-value').textContent = size + ' px';
  document.querySelector('#tracking-value').textContent = tracking.toFixed(2) + ' em';
  fitWordmark(hero, size);
  for (const card of cards.values()) {
    const preview = card.querySelector('.card-preview');
    preview.textContent = word;
    preview.style.fontSize = '';
    fitWordmark(preview, parseFloat(getComputedStyle(preview).fontSize));
  }
}

sizeControl.addEventListener('input', updatePreview);
trackingControl.addEventListener('input', updatePreview);
caseControl.addEventListener('change', updatePreview);
themeControl.addEventListener('change', () => {
  document.documentElement.dataset.theme = themeControl.value === 'light' ? 'light' : 'dark';
});
document.querySelector('#reset').addEventListener('click', () => {
  sizeControl.value = '110';
  trackingControl.value = '-4';
  caseControl.value = 'lower';
  themeControl.value = 'dark';
  document.documentElement.dataset.theme = 'dark';
  updatePreview();
});
new ResizeObserver(updatePreview).observe(grid);

async function loadFonts() {
  await Promise.all(fonts.map(async font => {
    const card = cards.get(font.id);
    try {
      const faces = await document.fonts.load(font.weight + ' 44px ' + font.family, 'crowbo CROWBO');
      if (!faces.length || !faces.every(face => face.status === 'loaded')) throw new Error('Font unavailable');
      loaded.add(font.id);
      card.dataset.ready = 'true';
      card.disabled = false;
      if (font.id === selected.id) selectFont(font);
    } catch {
      card.querySelector('.card-trait').textContent = 'Font did not load';
    }
  }));
  if (!loaded.has(selected.id) && loaded.size) selectFont(fonts.find(font => loaded.has(font.id)));
  status.textContent = loaded.size === fonts.length
    ? '8 fonts ready. Preview controls change the large wordmark. Cards share a target type size; all specimens scale to fit smaller screens.'
    : loaded.size + ' of 8 fonts loaded. Unavailable specimens are disabled.';
  updatePreview();
}

loadFonts();
