import {createFlock} from './flock.js?v=20260924-modular';
import {createNetwork} from './network.js?v=20260924-modular';

const root = document.documentElement;
const portrait = document.querySelector('#portrait');
const source = document.querySelector('#crow-source');
const canvas = document.querySelector('#crow-bytes');
const context = canvas.getContext('2d');
const scanTexture = document.createElement('canvas');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const review = document.querySelector('#motion-review');
const motionToggles = document.querySelectorAll('[data-motion-toggle]');
const networkMotionToggle = document.querySelector('#network-motion-toggle');
const descriptions = {
  scan: 'A slow upward sweep',
  stream: 'Rising columns of bytes',
  rebuild: 'Small blocks, rewritten',
  flock: 'A network of small crows',
  network: 'Sources, context and assessments'
};
const variants = Object.keys(descriptions);
const cells = [];
let variant = null;
let preview = false;
let ready = false;
let visible = true;
let paused = reducedMotion.matches;
let animation;
let restore;
let frame;
let elapsed = 0;
let clock = 0;
let lastPaint = 0;
let flock;
const networkElement = document.querySelector('#network');
const network = createNetwork(networkElement);

function showSprite() {
  clearInterval(animation);
  clearTimeout(restore);
  portrait.classList.remove('is-decoding');
}

function prepareCanvas() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = '12px monospace';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.globalAlpha = 1;
}

function paintBytes(phase) {
  prepareCanvas();
  for (const cell of cells) {
    context.fillStyle = cell.colour;
    context.fillText('0123456789ABCDEF'[(cell.index + phase) % 16], cell.x, cell.y);
  }
}

function revealBytes() {
  if (variant || !ready || document.hidden) return;
  showSprite();
  paintBytes(0);
  portrait.classList.add('is-decoding');
  if (!reducedMotion.matches) {
    let phase = 0;
    animation = setInterval(() => {
      paintBytes(++phase);
      if (phase === 6) clearInterval(animation);
    }, 65);
  }
  restore = setTimeout(showSprite, 850);
}

function paintScan(time) {
  const radius = 120;
  const head = canvas.height + radius - (canvas.height + radius * 2) * (time % 11 / 11);
  const band = context.createLinearGradient(0, head - radius, 0, head + radius);
  const opacity = [.5, .52, .62, .84, 1, .84, .62, .52, .5];
  for (let index = 0; index < opacity.length; index += 1) {
    band.addColorStop(index / (opacity.length - 1), `rgba(0, 0, 0, ${opacity[index]})`);
  }
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = band;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'source-in';
  context.drawImage(scanTexture, 0, 0);
  context.globalCompositeOperation = 'source-over';
}

function paintStudy(time) {
  if (variant === 'network') { network.draw(time); return; }
  if (variant === 'scan') { paintScan(time); return; }
  if (variant === 'flock') { flock.draw(time); return; }
  prepareCanvas();
  for (const cell of cells) {
    let character;
    let y = cell.y;
    context.fillStyle = cell.colour;
    if (variant === 'stream') {
      const head = 76 * (1 - (time * (.065 + cell.column % 5 * .006) + cell.column * .137) % 1);
      const trail = (cell.row - head + 76) % 76;
      context.globalAlpha = .34 + .66 * Math.exp(-trail / 12);
      const phase = Math.floor(time * 2 + cell.column * .3);
      character = '01.:|/'[(cell.index + phase) % 6];
      y -= (time * 18 + cell.column * 3) % 10;
    } else {
      const block = Math.floor(cell.row / 6) * 10 + Math.floor(cell.column / 8);
      const age = (time * 13 % 130 - block + 130) % 130;
      context.globalAlpha = .38 + .62 * Math.exp(-age / 14);
      character = age < 2
        ? '░▒▓_01'[(cell.index + Math.floor(time * 6)) % 6]
        : '0123456789ABCDEF'[cell.index % 16];
    }
    context.fillText(character, cell.x, y);
  }
  context.globalAlpha = 1;
}

function stopLoop() {
  cancelAnimationFrame(frame);
  frame = null;
  clock = 0;
  lastPaint = 0;
}

function tick(now) {
  if (!variant || paused || !visible || document.hidden) { stopLoop(); return; }
  if (clock) elapsed += now - clock;
  clock = now;
  if (variant === 'scan' || variant === 'flock' || variant === 'network' || now - lastPaint >= 1000 / 12) {
    paintStudy(elapsed / 1000);
    lastPaint = now;
  }
  frame = requestAnimationFrame(tick);
}

function syncMotion() {
  stopLoop();
  showSprite();
  portrait.hidden = variant === 'network';
  networkElement.hidden = variant !== 'network';
  network.setRunning(variant === 'network' && !paused && visible && !document.hidden);
  portrait.disabled = (Boolean(variant) && variant !== 'flock') || !ready;
  portrait.setAttribute('aria-label', variant === 'flock'
    ? 'Explore the crow network. Activate to follow another crow’s connections.'
    : variant ? 'Crow rendered in terminal characters' : 'Briefly reveal the crow in bytes');
  for (const toggle of motionToggles) {
    toggle.textContent = paused ? 'Play' : 'Pause';
    toggle.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  }
  if (!variant || !ready) return;
  paintStudy(elapsed / 1000);
  if (!paused && visible && !document.hidden) frame = requestAnimationFrame(tick);
}

function setVariant(requested, navigate = false) {
  preview = navigate || requested !== null;
  variant = Object.hasOwn(descriptions, requested) ? requested : null;
  if (!preview) variant = 'network';
  root.dataset.presentation = preview ? 'study' : 'website';
  if (variant) root.dataset.variant = variant;
  else delete root.dataset.variant;
  review.hidden = !preview || !variant;
  networkMotionToggle.hidden = preview || variant !== 'network';
  document.querySelector('#network-sizing').hidden = variant !== 'network';
  document.querySelector('#network-comparison').hidden = variant !== 'network';
  for (const button of document.querySelectorAll('button[data-variant]')) {
    button.setAttribute('aria-pressed', String(button.dataset.variant === variant));
  }
  document.querySelector('#effect-description').textContent = variant ? descriptions[variant] : '';
  document.querySelector('#effect-treatment').textContent = variant === 'flock'
    ? 'Hover, tap or press Enter'
    : '70% terminal · 45% transparent';
  if (navigate) {
    const url = new URL(location.href);
    if (variant) url.searchParams.set('variant', variant);
    else url.searchParams.delete('variant');
    if (url.href !== location.href) history.pushState(null, '', url);
  }
  flock?.clear();
  network.readStudy();
  network.clear();
  elapsed = 0;
  syncMotion();
}

function cycleVariant(offset) {
  setVariant(variants[(variants.indexOf(variant) + offset + variants.length) % variants.length], true);
}

function prepareBytes() {
  if (!context || !source.naturalWidth || !source.naturalHeight) return;
  const sample = document.createElement('canvas');
  sample.width = 80;
  sample.height = 76;
  const sampleContext = sample.getContext('2d', {willReadFrequently: true});
  if (!sampleContext) return;
  const scale = Math.min(sample.width / source.naturalWidth, sample.height / source.naturalHeight);
  const width = source.naturalWidth * scale;
  const height = source.naturalHeight * scale;
  sampleContext.drawImage(source, (sample.width - width) / 2, (sample.height - height) / 2, width, height);
  const pixels = sampleContext.getImageData(0, 0, 80, 76).data;
  for (let row = 0; row < 76; row += 1) {
    for (let column = 0; column < 80; column += 1) {
      const offset = (row * 80 + column) * 4;
      const [red, green, blue] = pixels.slice(offset, offset + 3);
      if (pixels[offset + 3] < 128 || Math.max(red, green, blue) < 45) continue;
      cells.push({
        x: (column + .5) * 10,
        y: (row + .5) * 10,
        row,
        column,
        colour: `rgb(${red} ${green} ${blue})`,
        index: column * 3 + row * 7
      });
    }
  }
  scanTexture.width = canvas.width;
  scanTexture.height = canvas.height;
  const textureContext = scanTexture.getContext('2d');
  if (!textureContext) return;
  paintBytes(0);
  textureContext.drawImage(canvas, 0, 0);
  flock = createFlock(canvas, source, scanTexture);
  ready = true;
  root.dataset.crowReady = 'true';
  syncMotion();
}

for (const button of document.querySelectorAll('button[data-variant]')) {
  button.addEventListener('click', () => setVariant(button.dataset.variant, true));
}
document.querySelector('#previous-effect').addEventListener('click', () => cycleVariant(-1));
document.querySelector('#next-effect').addEventListener('click', () => cycleVariant(1));
for (const toggle of motionToggles) toggle.addEventListener('click', () => { paused = !paused; syncMotion(); });
window.addEventListener('popstate', () => setVariant(new URLSearchParams(location.search).get('variant')));
document.addEventListener('keydown', event => {
  if (!preview || !variant || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.target.closest('input,textarea,select,[contenteditable],.network')) return;
  event.preventDefault();
  cycleVariant(event.key === 'ArrowLeft' ? -1 : 1);
});
portrait.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') revealBytes(); });
portrait.addEventListener('pointerleave', showSprite);
portrait.addEventListener('click', revealBytes);
portrait.addEventListener('blur', showSprite);
portrait.addEventListener('pointermove', event => {
  if (variant !== 'flock' || !ready || event.pointerType === 'touch') return;
  const bounds = canvas.getBoundingClientRect();
  flock.focusAt((event.clientX - bounds.left) * canvas.width / bounds.width, (event.clientY - bounds.top) * canvas.height / bounds.height);
  if (paused) paintStudy(elapsed / 1000);
});
portrait.addEventListener('click', event => {
  if (variant !== 'flock' || !ready) return;
  if (event.detail === 0) flock.advance();
  else {
    const bounds = canvas.getBoundingClientRect();
    flock.focusAt((event.clientX - bounds.left) * canvas.width / bounds.width, (event.clientY - bounds.top) * canvas.height / bounds.height);
  }
  paintStudy(elapsed / 1000);
});
for (const type of ['pointerleave', 'blur']) portrait.addEventListener(type, () => {
  if (variant !== 'flock' || !ready) return;
  flock.clear();
  paintStudy(elapsed / 1000);
});
reducedMotion.addEventListener('change', event => { paused = event.matches; syncMotion(); });
document.addEventListener('visibilitychange', syncMotion);
new IntersectionObserver(entries => {
  visible = entries[0].isIntersecting;
  if (variant) syncMotion();
}).observe(document.querySelector('.portrait-wrap'));

setVariant(new URLSearchParams(location.search).get('variant'));
if (source.complete) prepareBytes();
else source.addEventListener('load', prepareBytes, {once: true});
