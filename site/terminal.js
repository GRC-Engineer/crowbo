'use strict';

// Throwaway interaction study: a terminal homepage with an inspectable decision lab.
const byId = id => document.getElementById(id);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let effectsEnabled = !motionPreference.matches;
const scramblers = new Map();
const hex = '0123456789ABCDEF';

function restoreLabel(element) {
  const entry = scramblers.get(element);
  if (!entry) return;
  cancelAnimationFrame(entry.frame);
  entry.visual.textContent = entry.original;
  entry.visual.style.removeProperty('width');
  element.dataset.scrambling = 'false';
}

function scrambleLabel(element) {
  const entry = scramblers.get(element);
  if (!entry || !effectsEnabled) return;
  cancelAnimationFrame(entry.frame);
  entry.visual.textContent = entry.original;
  entry.visual.style.width = entry.visual.getBoundingClientRect().width + 'px';
  const started = performance.now();
  let previous = -100;
  element.dataset.scrambling = 'true';
  function tick(time) {
    if (!effectsEnabled || time - started >= 650) { restoreLabel(element); return; }
    if (time - previous >= 55) {
      const revealed = Math.max(0, (time - started - 200) / 450);
      entry.visual.textContent = [...entry.original].map((character, index) => {
        if (character === ' ' || index / entry.original.length < revealed) return character;
        return hex[Math.floor(Math.random() * hex.length)];
      }).join('');
      previous = time;
    }
    entry.frame = requestAnimationFrame(tick);
  }
  entry.frame = requestAnimationFrame(tick);
}

for (const element of document.querySelectorAll('[data-scramble]')) {
  const original = element.textContent;
  const accessible = document.createElement('span');
  accessible.className = 'sr-only';
  accessible.textContent = original;
  const visual = document.createElement('span');
  visual.className = 'scramble-visual';
  visual.setAttribute('aria-hidden', 'true');
  visual.textContent = original;
  element.replaceChildren(accessible, visual);
  scramblers.set(element, {original, visual, frame:0});
  element.addEventListener('pointerenter', () => scrambleLabel(element));
  element.addEventListener('pointerleave', () => restoreLabel(element));
  const focusTarget = element.closest('a, button') || element;
  focusTarget.addEventListener('focus', () => scrambleLabel(element));
  focusTarget.addEventListener('blur', () => restoreLabel(element));
}

const scenarios = new Map([
  ['unknown', {name:'unclear bottleneck', capacity:8, note:'The queue is growing. We do not yet know whether time, ownership or the release process is the constraint.'}],
  ['gap', {name:'urgent coverage gap', capacity:8, note:'Fictional variation: a critical asset class has no effective detection coverage. A bounded pilot may help establish whether the proposed tool closes that gap.'}],
  ['capacity', {name:'capacity plan', capacity:16, note:'Fictional variation: engineering time is the bottleneck. The proposal assumes the team can sustain 16 resolutions each week. That estimate still needs evidence.'}]
]);
const facts = new Map([
  ['budget','Source: public fictional development case. USD 120,000 is the additional annual limit. The designated budget owner must authorise commitments.'],
  ['arrivals','Source: eight weeks of synthetic records for one service population. Twelve actionable findings arrive per week. Finding counts do not establish severity or risk.'],
  ['resolved','Source: the same synthetic population and period. Eight findings are completed per week. This says how much work was completed, not why throughput is constrained.'],
  ['backlog','Source: fictional case snapshot. Thirty-two findings are overdue. Clearance arithmetic assumes comparable work and stable arrival and completion rates.']
]);
const views = new Map([['evidence','view-evidence'],['options','view-options'],['trace','view-trace']]);
const state = {scenario:'unknown',capacity:8,revision:0,trace:[],pending:false};
const capacityInput = byId('capacity');
const scenarioButtons = [...document.querySelectorAll('[data-scenario]')];
const fileTabs = [...document.querySelectorAll('[data-view]')];

function openSection(id) {
  if (!new Set(['top','playground','readme','references']).has(id)) return;
  byId(id).scrollIntoView({block:'start',behavior:'instant'});
}

function showView(view) {
  if (!views.has(view)) return;
  for (const [name,id] of views) byId(id).hidden = name !== view;
  for (const tab of fileTabs) {
    const selected = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
}

for (const tab of fileTabs) {
  tab.addEventListener('click', () => showView(tab.dataset.view));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    event.preventDefault();
    const current = fileTabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? fileTabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + fileTabs.length) % fileTabs.length;
    showView(fileTabs[next].dataset.view);
    fileTabs[next].focus();
  });
}
for (const link of document.querySelectorAll('[data-open-view]')) link.addEventListener('click', () => showView(link.dataset.openView));

for (const button of document.querySelectorAll('[data-fact]')) {
  button.addEventListener('click', () => {
    const value = facts.get(button.dataset.fact);
    if (!value) return;
    for (const candidate of document.querySelectorAll('[data-fact]')) candidate.setAttribute('aria-pressed', String(candidate === button));
    byId('source-text').textContent = value;
  });
}

function setCapacity(value) {
  if (!Number.isInteger(value) || value < 4 || value > 24) return false;
  state.capacity = value;
  capacityInput.value = String(value);
  byId('capacity-value').value = String(value);
  state.pending = true;
  byId('draft-status').textContent = 'input changed / rerun to compare';
  byId('draft-status').classList.add('pending');
  return true;
}
capacityInput.addEventListener('input', () => setCapacity(Number(capacityInput.value)));

function candidateAssessment() {
  if (state.scenario === 'gap') return {
    command:'pilot coverage-gap', title:'Test the coverage gap.',
    why:'A material blind spot changes the case for a tool. A bounded pilot can test whether it closes the gap before a wider purchase.',
    question:'Will the pilot produce useful findings, and who has capacity to act on them? The owner must approve the scope and spending.'
  };
  if (state.scenario === 'capacity' && state.capacity > 12) return {
    command:'compare capacity-plan', title:'Make room to remediate.',
    why:'If engineering time is the constraint and the estimate holds, more capacity could shrink the backlog. Compare the $90k proposal with improving the existing workflow.',
    question:'What supports the throughput estimate? Could a process change achieve the same result? The budget owner has the final call.'
  };
  if (state.scenario === 'capacity') return {
    command:'challenge capacity-plan', title:'Challenge the plan.',
    why:'The proposed throughput does not exceed the 12 findings arriving each week. At these rates, the existing backlog would not clear.',
    question:'What would make the capacity plan deliver more than the incoming work? Check its assumptions before committing the budget.'
  };
  return {
    command:'inspect bottleneck', title:'Inspect the bottleneck.',
    why:'More detections could add to a queue the team cannot clear. Find the constraint before choosing an investment.',
    question:'What actually blocks remediation: time, ownership or the release process? A hypothetical throughput alone does not answer that.'
  };
}

function drawQueue(capacity) {
  const net = 12 - capacity;
  const values = Array.from({length:7}, (_,week) => Math.max(0,32 + week * net));
  const plot = byId('queue-plot');
  const highest = Math.max(56,...values);
  const bars = values.map((value,week) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'queue-bar';
    button.style.setProperty('--bar-height', Math.max(3,value / highest * 88) + '%');
    button.setAttribute('aria-label', 'Week ' + week + ': ' + value + ' findings in the illustrative queue');
    const label = document.createElement('span');
    label.textContent = String(value);
    button.append(label);
    button.addEventListener('click', () => { byId('queue-note').textContent = 'Week ' + week + ': ' + value + ' findings, assuming 12 arrive and ' + capacity + ' are resolved each week.'; });
    return button;
  });
  plot.replaceChildren(...bars);
  byId('queue-change').textContent = (net > 0 ? '+' : '') + net + ' / week';
  const clearance = net < 0 ? ' Conditional clearance: ' + Number((32 / -net).toFixed(1)) + ' weeks.' : ' The backlog does not clear at these rates.';
  byId('queue-note').textContent = '32 → ' + values[6] + ' findings in six weeks.' + clearance;
}

function drawTrace() {
  const entries = state.trace.map(record => {
    const item = document.createElement('li');
    const meta = document.createElement('span');
    meta.textContent = 'revision_' + String(record.revision).padStart(2,'0') + ' / ' + record.scenario;
    const title = document.createElement('strong');
    title.textContent = record.title;
    const basis = document.createElement('p');
    basis.textContent = 'Basis: 12 incoming / ' + record.capacity + ' hypothetical completions per week. ' + record.reason;
    item.append(meta,title,basis);
    return item;
  });
  byId('trace-history').replaceChildren(...entries);
  byId('trace-count').textContent = String(state.trace.length);
}

function assess(reason) {
  const assessment = candidateAssessment();
  state.revision += 1;
  state.trace.unshift({revision:state.revision,scenario:scenarios.get(state.scenario).name,capacity:state.capacity,title:assessment.title,reason});
  state.trace = state.trace.slice(0,6);
  state.pending = false;
  byId('assessment-command').textContent = '> ' + assessment.command;
  byId('recommendation').textContent = assessment.title;
  byId('recommendation-why').textContent = assessment.why;
  byId('open-question').textContent = assessment.question;
  byId('revision-label').textContent = 'revision_' + String(state.revision).padStart(2,'0');
  byId('draft-status').textContent = 'basis recorded / trace updated';
  byId('draft-status').classList.remove('pending');
  byId('lab-status').textContent = 'fictional / ' + state.trace.length + ' retained assessments';
  drawQueue(state.capacity);
  drawTrace();
  return assessment.title;
}

function loadScenario(key) {
  const scenario = scenarios.get(key);
  if (!scenario) return false;
  state.scenario = key;
  setCapacity(scenario.capacity);
  byId('scenario-note').textContent = scenario.note;
  for (const button of scenarioButtons) button.setAttribute('aria-pressed', String(button.dataset.scenario === key));
  assess('Loaded the ' + scenario.name + ' scenario.');
  return true;
}
for (const button of scenarioButtons) button.addEventListener('click', () => loadScenario(button.dataset.scenario));
byId('reassess').addEventListener('click', () => assess(state.pending ? 'Throughput assumption changed.' : 'Rerun with the same material facts.'));
assess('Initial fictional case. No owner decision recorded.');

const crowStage = byId('crow-stage');
const crowCanvas = byId('crow-bytes');
const crowContext = crowCanvas.getContext('2d');
const crowImage = byId('crow-source');
const crow = {mode:'sprite',cells:[],ready:false,visible:true,hovering:false,x:.5,y:.5,pulseUntil:0,frame:0,last:0};
const columns = 84;
const rows = 60;

function syncCrowMode() {
  const showBytes = crow.ready && (crow.mode === 'bytes' || (effectsEnabled && (crow.hovering || performance.now() < crow.pulseUntil)));
  crowStage.classList.toggle('is-byte',showBytes);
  byId('crow-encoding').textContent = showBytes ? 'HEX / 01' : 'SPRITE / 01';
  for (const button of document.querySelectorAll('[data-render]')) button.setAttribute('aria-pressed', String(button.dataset.render === crow.mode));
}

function paintCrow(time) {
  if (!crow.ready || !crowContext) return;
  const width = crowCanvas.width;
  const height = crowCanvas.height;
  const cellWidth = width / columns;
  const cellHeight = height / rows;
  const pulse = effectsEnabled && time < crow.pulseUntil;
  crowContext.fillStyle = '#10101b';
  crowContext.fillRect(0,0,width,height);
  crowContext.textAlign = 'center';
  crowContext.textBaseline = 'middle';
  crowContext.font = '14px Departure, monospace';
  for (const cell of crow.cells) {
    const dx = cell.x / columns - crow.x;
    const dy = cell.y / rows - crow.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const disturbed = effectsEnabled && (pulse || (crow.hovering && distance < .2));
    if (!cell.solid && !(disturbed && (cell.x + cell.y) % 3 === 0)) continue;
    const amplitude = disturbed ? (pulse ? 5 : 2.4) : 0;
    const jitterX = Math.sin(time / 95 + cell.x * 1.4 + cell.y) * amplitude;
    const jitterY = Math.cos(time / 105 + cell.y * 1.5 + cell.x) * amplitude;
    crowContext.fillStyle = disturbed ? ((cell.x + cell.y) % 4 === 0 ? '#eef34b' : '#a4edc3') : cell.color;
    crowContext.globalAlpha = cell.solid ? 1 : .25;
    const character = disturbed ? hex[(Math.floor(time / 75) + cell.x * 3 + cell.y) % 16] : cell.character;
    crowContext.fillText(character,(cell.x + .5) * cellWidth + jitterX,(cell.y + .5) * cellHeight + jitterY);
  }
  crowContext.globalAlpha = 1;
}

function animateCrow(time) {
  crow.frame = 0;
  if (!effectsEnabled || !crow.visible || document.hidden) { paintCrow(performance.now()); return; }
  if (time - crow.last > 65) { paintCrow(time); crow.last = time; }
  if (crow.hovering || time < crow.pulseUntil) crow.frame = requestAnimationFrame(animateCrow);
  else { paintCrow(performance.now()); syncCrowMode(); }
}

function wakeCrow() {
  if (crow.frame || !effectsEnabled || !crow.ready || !crow.visible || document.hidden) return;
  crow.frame = requestAnimationFrame(animateCrow);
}

function loadCrow() {
  if (!crowImage.naturalWidth || !crowContext) return;
  const sample = document.createElement('canvas');
  sample.width = columns;
  sample.height = rows;
  const context = sample.getContext('2d',{willReadFrequently:true});
  if (!context) return;
  context.drawImage(crowImage,100,160,1000,950,0,0,columns,rows);
  const pixels = context.getImageData(0,0,columns,rows).data;
  crow.cells = Array.from({length:columns * rows},(_,index) => {
    const r = pixels[index * 4];
    const g = pixels[index * 4 + 1];
    const b = pixels[index * 4 + 2];
    const light = (r + g + b) / 3;
    const difference = Math.abs(r - 16) + Math.abs(g - 16) + Math.abs(b - 27);
    const solid = difference > 48 && light > 26;
    const lemon = r > 155 && g > 140 && b < g * .72;
    const mint = g > 110 && g > r * 1.06;
    const color = lemon ? '#eef34b' : mint ? '#a4edc3' : light > 185 ? '#f3e9d5' : light > 95 ? '#aca5c1' : light > 50 ? '#817791' : '#514967';
    return {x:index % columns,y:Math.floor(index / columns),solid,color,character:hex[(index * 7 + Math.floor(light)) % 16]};
  });
  crow.ready = true;
  paintCrow(performance.now());
  syncCrowMode();
}
if (crowImage.complete) loadCrow();
else crowImage.addEventListener('load',loadCrow,{once:true});

crowStage.addEventListener('pointerenter', event => {
  if (event.pointerType === 'touch') return;
  crow.hovering = true;
  syncCrowMode();
  wakeCrow();
});
crowStage.addEventListener('pointermove', event => {
  if (event.pointerType === 'touch') return;
  const bounds = crowStage.getBoundingClientRect();
  crow.x = Math.min(1,Math.max(0,(event.clientX - bounds.left) / bounds.width));
  crow.y = Math.min(1,Math.max(0,(event.clientY - bounds.top) / bounds.height));
});
crowStage.addEventListener('pointerleave', () => { crow.hovering = false; syncCrowMode(); });
function peck() {
  crow.pulseUntil = performance.now() + 850;
  byId('crow-hint').textContent = effectsEnabled ? 'caw. have you checked that assumption?' : 'caw. the crow is holding still.';
  syncCrowMode();
  wakeCrow();
}
crowStage.addEventListener('click',peck);
for (const button of document.querySelectorAll('[data-render]')) button.addEventListener('click', () => {
  if (!['sprite','bytes'].includes(button.dataset.render)) return;
  crow.mode = button.dataset.render;
  syncCrowMode();
  paintCrow(performance.now());
});
const crowObserver = new IntersectionObserver(entries => {
  crow.visible = entries[0].isIntersecting;
  if (crow.visible) wakeCrow();
  else { cancelAnimationFrame(crow.frame); crow.frame = 0; }
});
crowObserver.observe(crowStage);

function setEffects(enabled) {
  effectsEnabled = Boolean(enabled);
  document.body.classList.toggle('fx-off',!effectsEnabled);
  byId('motion-toggle').textContent = effectsEnabled ? '[fx:on]' : '[fx:off]';
  byId('motion-toggle').setAttribute('aria-pressed',String(effectsEnabled));
  if (!effectsEnabled) {
    for (const element of scramblers.keys()) restoreLabel(element);
    cancelAnimationFrame(crow.frame);
    crow.frame = 0;
    crow.pulseUntil = 0;
    paintCrow(performance.now());
  } else wakeCrow();
  syncCrowMode();
}
byId('motion-toggle').addEventListener('click', () => setEffects(!effectsEnabled));
motionPreference.addEventListener('change',event => setEffects(!event.matches));
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    cancelAnimationFrame(crow.frame);
    crow.frame = 0;
    for (const element of scramblers.keys()) restoreLabel(element);
  } else wakeCrow();
});
setEffects(effectsEnabled);

const help = byId('help-dialog');
function openHelp() { if (!help.open) help.showModal(); }
for (const button of document.querySelectorAll('[data-help]')) button.addEventListener('click',openHelp);
byId('close-help').addEventListener('click', () => help.close());
const commandInput = byId('command-input');
const shellOutput = byId('shell-output');
const commandHistory = [];
let historyIndex = 0;

function closeShell() { shellOutput.hidden = true; }
byId('close-shell').addEventListener('click',closeShell);
function printCommand(command,message) {
  const entry = document.createElement('div');
  entry.className = 'shell-entry';
  const prompt = document.createElement('span');
  prompt.textContent = '$ ' + command;
  const response = document.createElement('p');
  response.textContent = message;
  entry.append(prompt,response);
  const lines = byId('shell-lines');
  lines.append(entry);
  while (lines.children.length > 20) lines.firstElementChild.remove();
  shellOutput.hidden = false;
  shellOutput.scrollTop = shellOutput.scrollHeight;
}

const commands = new Map([
  ['help',() => { openHelp(); return 'Commands: explore, scenario unknown|gap|capacity, set capacity 4..24, reassess, readme, references, whoami, peck, clear.'; }],
  ['explore',() => { openSection('playground'); return 'Opened vulnerability-investment. Select a fact to inspect it, or change the scenario.'; }],
  ['reassess',() => { const result = assess(state.pending ? 'Throughput changed through the local controls.' : 'Rerun with the same facts.'); return 'revision_' + String(state.revision).padStart(2,'0') + ': ' + result + '\nBasis retained in trace.log. This is a candidate assessment, not an approval.'; }],
  ['readme',() => { openSection('readme'); return 'Opened readme.md.'; }],
  ['references',() => { openSection('references'); return 'Opened the reference desk: turbopuffer, opencode, terminal, ghostty.'; }],
  ['whoami',() => 'guest@crowbo\nRole: curious human.\nPrivileges: inspect, challenge, decide.\nResident corvid: Archivist / Circuit Frames V3.'],
  ['peck',() => { openSection('top'); peck(); return 'caw. one more question: what would change your mind?'; }],
  ['clear',() => { byId('shell-lines').replaceChildren(); closeShell(); return null; }]
]);

function runCommand(raw) {
  const supplied = raw.trim().slice(0,80);
  if (!supplied) return;
  const command = supplied.toLowerCase().replace(/\s+/g,' ');
  commandHistory.push(supplied);
  if (commandHistory.length > 24) commandHistory.shift();
  historyIndex = commandHistory.length;
  let response;
  const action = commands.get(command);
  if (action) response = action();
  else if (/^scenario (unknown|gap|capacity)$/.test(command)) {
    const scenario = command.split(' ')[1];
    loadScenario(scenario);
    showView('evidence');
    openSection('playground');
    response = 'Loaded ' + scenarios.get(scenario).name + '. Assumptions and candidate assessment updated.';
  } else if (/^set capacity \d{1,2}$/.test(command)) {
    const value = Number(command.split(' ')[2]);
    response = setCapacity(value) ? 'Hypothetical capacity set to ' + value + '/week. Type reassess to compare and record the new basis.' : 'Capacity must be an integer from 4 to 24. Try: set capacity 16';
  } else if (command === 'sudo' || command.startsWith('sudo ')) response = 'The crow has no sudo privileges. Recommendations do not grant authority.';
  else response = 'Unknown demo command. Type help for the available commands. Nothing was executed.';
  if (response !== null) printCommand(supplied,response);
  commandInput.value = '';
}
byId('command-form').addEventListener('submit',event => { event.preventDefault(); runCommand(commandInput.value); });
for (const button of document.querySelectorAll('[data-command]')) button.addEventListener('click', () => {
  help.close();
  runCommand(button.dataset.command);
});
const completions = ['help','explore','scenario unknown','scenario gap','scenario capacity','set capacity 16','reassess','readme','references','clear','whoami','peck'];
commandInput.addEventListener('keydown',event => {
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault();
    historyIndex = Math.max(0,Math.min(commandHistory.length,historyIndex + (event.key === 'ArrowUp' ? -1 : 1)));
    commandInput.value = commandHistory[historyIndex] || '';
  }
  if (event.key === 'Tab' && !event.shiftKey && commandInput.value.trim()) {
    const prefix = commandInput.value.trim().toLowerCase();
    const matches = completions.filter(value => value.startsWith(prefix));
    if (matches.length === 1 && matches[0] !== prefix) { event.preventDefault(); commandInput.value = matches[0]; }
  }
});
document.addEventListener('keydown',event => {
  if (event.key === 'Escape') { if (!help.open) { closeShell(); commandInput.blur(); } return; }
  if (event.metaKey || event.ctrlKey || event.altKey || help.open) return;
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (event.key === '/') { event.preventDefault(); commandInput.focus(); }
  if (event.key === '?') { event.preventDefault(); openHelp(); }
});

Promise.all([
  document.fonts.load('400 12px Departure','security decisions'),
  document.fonts.load('400 44px GeistPixel','crowbo')
]).then(results => {
  document.documentElement.dataset.fontsReady = String(results.every(faces => faces.length && faces.every(face => face.status === 'loaded')));
  for (const entry of scramblers.values()) entry.visual.style.removeProperty('width');
  paintCrow(performance.now());
});
