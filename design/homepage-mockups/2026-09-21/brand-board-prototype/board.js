'use strict';

// One proposed identity in three applications; ?view= selects an application.
const views = ['overview', 'website', 'product', 'pitch'];
const viewNames = {overview: 'Open any application to explore it.', website: '01 / website. Hover over the crow; follow a decision.', product: '02 / product. Change the fictional context.', pitch: '03 / pitch. Compare the cover and method slide.'};
const root = document.documentElement;
const viewButtons = [...document.querySelectorAll('button[data-view]')];
const applications = [...document.querySelectorAll('[data-application]')];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let effects = !motionPreference.matches;
let currentView = 'overview';
let traceTimer;

function setView(requested, navigate = true) {
  const view = views.includes(requested) ? requested : 'overview';
  currentView = view;
  root.dataset.view = view;
  for (const application of applications) application.hidden = view !== 'overview' && application.dataset.application !== view;
  for (const button of viewButtons) button.setAttribute('aria-pressed', String(button.dataset.view === view));
  document.querySelector('#view-note').textContent = viewNames[view];
  clearScrambles();
  crowHover = false;
  crowFocus = false;
  syncCrow();
  if (navigate) {
    const url = new URL(location.href);
    url.searchParams.set('view', view);
    if (url.href !== location.href) history.pushState(null, '', url);
    window.scrollTo({top: 0, behavior: 'auto'});
    viewButtons.find(button => button.dataset.view === view).focus({preventScroll: true});
  }
}

for (const button of viewButtons) button.addEventListener('click', () => setView(button.dataset.view));
for (const control of document.querySelectorAll('[data-open]')) control.addEventListener('click', event => {
  event.preventDefault();
  setView(control.dataset.open);
});
function cycleView(offset) { setView(views[(views.indexOf(currentView) + offset + views.length) % views.length]); }
document.querySelector('#previous-view').addEventListener('click', () => cycleView(-1));
document.querySelector('#next-view').addEventListener('click', () => cycleView(1));
window.addEventListener('popstate', () => setView(new URLSearchParams(location.search).get('view'), false));
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
  if (event.target.closest('input,textarea,select,summary,[contenteditable],button:not(.review-bar button)')) return;
  event.preventDefault();
  cycleView(event.key === 'ArrowLeft' ? -1 : 1);
});

const scenarios = {
  unknown: {name: 'unclear constraint', fact: 'The cause of the constraint is still unknown.', title: 'Inspect the\nbottleneck.', copy: 'More detections could add to a queue the team cannot clear. Find the constraint before choosing an investment.', question: 'An urgent blind spot, or credible evidence that capacity is the constraint.'},
  gap: {name: 'coverage gap', fact: 'Fictional variation: a critical service has an urgent detection blind spot.', title: 'Scope a\nbounded pilot.', copy: 'A targeted pilot may address a material blind spot. Check coverage and the work it would create before asking the owner to commit.', question: 'Will the proposed tool cover that service, and can the team handle what it finds?'},
  capacity: {name: 'capacity plan', fact: 'Fictional variation: engineering time is the constraint. The plan assumes 16 resolutions a week.', title: 'Test the\ncapacity plan.', copy: 'At an assumed 16 fixes a week, the 32-item backlog clears in eight weeks if arrivals stay at 12. Verify that capacity before committing.', question: 'Is 16 resolutions a week achievable, and would an existing process change achieve the same result?'}
};
for (const button of document.querySelectorAll('[data-case]')) button.addEventListener('click', () => {
  const key = button.dataset.case;
  if (!Object.hasOwn(scenarios, key)) return;
  const scenario = scenarios[key];
  for (const other of document.querySelectorAll('[data-case]')) other.setAttribute('aria-pressed', String(other === button));
  document.querySelector('#case-fact').textContent = scenario.fact;
  document.querySelector('#candidate-title').textContent = scenario.title;
  document.querySelector('#candidate-copy').textContent = scenario.copy;
  document.querySelector('#candidate-question').textContent = scenario.question;
  document.querySelector('#case-state').textContent = 'case / ' + scenario.name;
});
for (const button of document.querySelectorAll('[data-slide]')) button.addEventListener('click', () => {
  const slide = button.dataset.slide;
  if (!['cover', 'method'].includes(slide)) return;
  for (const other of document.querySelectorAll('[data-slide]')) other.setAttribute('aria-pressed', String(other === button));
  document.querySelector('#slide-cover').hidden = slide !== 'cover';
  document.querySelector('#slide-method').hidden = slide !== 'method';
});

const scrambleStates = [];
function restoreLabel(state) {
  clearInterval(state.timer);
  state.visual.textContent = state.original;
  state.timer = null;
}
function clearScrambles() { for (const state of scrambleStates) restoreLabel(state); }
for (const element of document.querySelectorAll('[data-scramble]')) {
  const target = element.closest('button,a');
  const original = element.textContent;
  if (!target.hasAttribute('aria-label')) target.setAttribute('aria-label', original.trim());
  const visual = document.createElement('span');
  visual.className = 'scramble-label';
  visual.setAttribute('aria-hidden', 'true');
  visual.textContent = original;
  element.replaceChildren(visual);
  const state = {original, visual, timer: null};
  scrambleStates.push(state);
  const start = () => {
    restoreLabel(state);
    if (!effects) return;
    visual.style.setProperty('--scramble-width', visual.getBoundingClientRect().width + 'px');
    let step = 0;
    state.timer = setInterval(() => {
      step += 1;
      visual.textContent = [...original].map((character, index) => character === ' ' || index < original.length * step / 8 ? character : '01ABCDEF'[Math.floor(Math.random() * 8)]).join('');
      if (step >= 8) restoreLabel(state);
    }, 45);
  };
  target.addEventListener('pointerenter', start);
  target.addEventListener('focus', start);
  target.addEventListener('pointerleave', () => restoreLabel(state));
  target.addEventListener('blur', () => restoreLabel(state));
}

const crowStage = document.querySelector('#crow-stage');
const crowImage = document.querySelector('#crow-source');
const crowCanvas = document.querySelector('#crow-bytes');
const crowContext = crowCanvas.getContext('2d');
const cells = [];
let crowReady = false;
let crowHover = false;
let crowFocus = false;
let crowPinned = false;
let crowTimer;

function paintCrow(phase = 0) {
  if (!crowReady || !crowContext) return;
  crowContext.clearRect(0, 0, crowCanvas.width, crowCanvas.height);
  crowContext.font = '10px Departure, monospace';
  crowContext.textAlign = 'center';
  crowContext.textBaseline = 'middle';
  for (const cell of cells) {
    crowContext.fillStyle = cell.colour;
    crowContext.fillText('0123456789ABCDEF'[(cell.index + phase) % 16], cell.x, cell.y);
  }
}
function syncCrow() {
  clearInterval(crowTimer);
  const visibleView = currentView === 'overview' || currentView === 'website';
  const bytes = crowReady && visibleView && (crowPinned || effects && (crowHover || crowFocus));
  crowStage.classList.toggle('is-byte', bytes);
  crowStage.setAttribute('aria-pressed', String(crowPinned));
  document.querySelector('#crow-mode').textContent = bytes ? 'HEX' : 'SPRITE';
  if (!bytes) return;
  paintCrow();
  if (!effects || document.hidden) return;
  let phase = 0;
  crowTimer = setInterval(() => {
    phase += 1;
    paintCrow(phase);
    if (phase >= 7) clearInterval(crowTimer);
  }, 60);
}
function sampleCrow() {
  if (!crowContext || crowImage.naturalWidth < 1100 || crowImage.naturalHeight < 1110) return;
  const sample = document.createElement('canvas');
  sample.width = 72;
  sample.height = 62;
  const context = sample.getContext('2d', {willReadFrequently: true});
  if (!context) return;
  context.drawImage(crowImage, 100, 160, 1000, 950, 0, 0, 72, 62);
  const pixels = context.getImageData(0, 0, 72, 62).data;
  for (let row = 0; row < 62; row += 1) {
    for (let column = 0; column < 72; column += 1) {
      const index = (row * 72 + column) * 4;
      const [red, green, blue] = pixels.slice(index, index + 3);
      if (Math.max(red, green, blue) < 45) continue;
      cells.push({x: (column + .5) * 10, y: (row + .5) * 684 / 62, colour: `rgb(${red} ${green} ${blue})`, index: column * 3 + row * 7});
    }
  }
  crowReady = true;
  syncCrow();
}
crowStage.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { crowHover = true; syncCrow(); } });
crowStage.addEventListener('pointerleave', () => { crowHover = false; crowFocus = false; syncCrow(); });
crowStage.addEventListener('focus', () => { crowFocus = crowStage.matches(':focus-visible'); syncCrow(); });
crowStage.addEventListener('blur', () => { crowFocus = false; syncCrow(); });
crowStage.addEventListener('click', () => { crowPinned = !crowPinned; syncCrow(); });
new IntersectionObserver(entries => {
  if (!entries[0].isIntersecting) clearInterval(crowTimer);
}).observe(crowStage);

const motionButton = document.querySelector('#motion-toggle');
const traceMark = document.querySelector('#trace-mark');
function setEffects(enabled) {
  effects = enabled;
  root.classList.toggle('fx-off', !enabled);
  motionButton.setAttribute('aria-pressed', String(enabled));
  motionButton.textContent = enabled ? '[fx:on]' : '[fx:off]';
  clearScrambles();
  clearTimeout(traceTimer);
  traceMark.classList.remove('is-tracing');
  document.querySelector('#trace-label').textContent = enabled ? 'click to trace ↵' : 'motion paused';
  syncCrow();
}
motionButton.addEventListener('click', () => setEffects(!effects));
motionPreference.addEventListener('change', event => setEffects(!event.matches));
traceMark.addEventListener('click', () => {
  clearTimeout(traceTimer);
  document.querySelector('#trace-label').textContent = 'evidence + context → direction';
  if (!effects) return;
  traceMark.classList.add('is-tracing');
  traceTimer = setTimeout(() => {
    traceMark.classList.remove('is-tracing');
    document.querySelector('#trace-label').textContent = 'click to trace again ↵';
  }, 950);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  clearInterval(crowTimer);
  clearTimeout(traceTimer);
  clearScrambles();
  traceMark.classList.remove('is-tracing');
  crowHover = false;
  crowFocus = false;
  syncCrow();
});

setView(new URLSearchParams(location.search).get('view'), false);
setEffects(effects);
if (crowImage.complete) sampleCrow();
else crowImage.addEventListener('load', sampleCrow, {once: true});
