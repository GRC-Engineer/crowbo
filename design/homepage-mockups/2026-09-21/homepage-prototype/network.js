import {createCrowGlyph, svgElement} from './crow-glyphs.js?v=20260923-network';
import {createFeatherGlyph} from './feather-glyphs.js?v=20260924-modular';

// Authored visual emphasis for this design study, not an evidence score.
const nodes = [
  {name: 'PR reviews', role: 'Evidence source', kind: 'review', topology: 'braid', x: 115, y: 140, weight: .94},
  {name: 'Meetings', role: 'Working context', kind: 'conversation', topology: 'cluster', x: 100, y: 355, weight: .3},
  {name: 'Slack conversations', role: 'Working context', kind: 'conversation', topology: 'branch', x: 125, y: 575, weight: .4},
  {name: 'Recent changes', role: 'Evidence source', kind: 'review', topology: 'merge', x: 325, y: 80, weight: .65},
  {name: 'Policies', role: 'Requirements', kind: 'context', topology: 'spine', x: 340, y: 270, weight: .5},
  {name: 'Experience / resume', role: 'Feasibility context', kind: 'context', topology: 'vector', x: 305, y: 470, weight: .25},
  {name: 'Team capacity', role: 'Feasibility context', kind: 'context', topology: 'column', x: 330, y: 645, weight: .6},
  {name: 'incident.io feed', role: 'Evidence source', kind: 'incident', topology: 'series', x: 565, y: 135, weight: .8},
  {name: 'Key incidents', role: 'Evidence source', kind: 'incident', topology: 'object', x: 520, y: 505, weight: .85},
  {name: 'Control strength', role: 'Assessment', kind: 'control', topology: 'loop', x: 655, y: 330, weight: 1},
  {name: 'Top risks', role: 'Assessment', kind: 'risk', topology: 'shard', x: 665, y: 645, weight: .95},
  {name: 'Dependencies', role: 'Working context', kind: 'context', topology: 'mesh', x: 510, y: 345, weight: .35}
];

const pairs = [[3, 0], [0, 9], [1, 0], [1, 4], [2, 1], [2, 5], [5, 6], [6, 10], [4, 9], [7, 8], [8, 10], [9, 10], [3, 7], [4, 11], [11, 10], [8, 9]];
const routes = [[3, 0, 9], [7, 8, 10], [2, 5, 6], [1, 4, 9], [4, 9, 10], [4, 11, 10]];
const items = [
  ['PR', 'PR review / release approval'], ['MTG', 'Meeting note / change process'],
  ['MSG', 'Slack thread / deployment handoff'], ['GIT', 'Commit / approval check'],
  ['POL', 'Policy / change approval'], ['CV', 'Resume / cloud experience'],
  ['CAP', 'Capacity / team plan'], ['INC', 'Incident.io entry / approval bypass'],
  ['POST', 'Postmortem / bypass incident'], ['CTL', 'Assessment / control strength'],
  ['RISK', 'Assessment / top risk'], ['MAP', 'Service dependency map']
];
const motifs = {original: 'Original', crows: 'Crows', feathers: 'Feathers'};
const questions = {
  control: {
    label: 'What supports this control assessment?',
    weights: [.95, .26, .22, .85, .75, .18, .22, .75, .9, 1, .5, .55],
    links: [[3, 0], [0, 9], [4, 9], [8, 9]]
  },
  response: {
    label: 'What shapes a feasible response?',
    weights: [.4, .65, .75, .4, .3, .88, 1, .45, .7, .65, .9, .95],
    links: [[2, 5], [5, 6], [6, 10], [11, 10]]
  }
};
const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => value * value * (3 - 2 * value);
const envelope = (time, start, end) => time > start && time < end ? Math.sin((time - start) / (end - start) * Math.PI) : 0;

function pathBetween(a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let points;
  if (Math.abs(dx) > Math.abs(dy) * .8) {
    const from = {x: a.x + Math.sign(dx) * (a.size / 2 + 5), y: a.y};
    const to = {x: b.x - Math.sign(dx) * (b.size / 2 + 5), y: b.y};
    const middle = (from.x + to.x) / 2;
    points = [from, {x: middle, y: from.y}, {x: middle, y: to.y}, to];
  } else {
    const from = {x: a.x, y: a.y + Math.sign(dy) * (a.size / 2 + 5)};
    const to = {x: b.x, y: b.y - Math.sign(dy) * (b.size / 2 + 5)};
    const middle = (from.y + to.y) / 2;
    points = [from, {x: from.x, y: middle}, {x: to.x, y: middle}, to];
  }
  const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
  return {points, lengths, total: lengths.reduce((sum, length) => sum + length, 0)};
}

function pointAlong(path, progress) {
  let distance = path.total * clamp(progress);
  for (let index = 0; index < path.lengths.length; index += 1) {
    const length = path.lengths[index];
    if (distance <= length && length > 0) {
      const a = path.points[index];
      const b = path.points[index + 1];
      return {x: a.x + (b.x - a.x) * distance / length, y: a.y + (b.y - a.y) * distance / length};
    }
    distance -= length;
  }
  return path.points.at(-1);
}

export function createNetwork(container) {
  const stage = container.querySelector('.network-stage');
  const field = container.querySelector('.network-lines');
  const caption = container.querySelector('.network-caption');
  const label = container.querySelector('.network-label');
  const detail = container.querySelector('.network-detail');
  const sizing = document.querySelector('#network-sizing');
  const comparison = document.querySelector('#network-comparison');
  const questionControl = document.querySelector('#network-question-choice');
  const questionLabel = container.querySelector('.network-question');
  let motif = 'original';
  let question = 'control';
  let website = false;
  let selected = -1;
  let pinned = -1;
  let pointer = 0;
  let time = 0;
  let running = false;
  let weighted = true;
  let mix = 1;
  let fromMix = 1;
  let targetMix = 1;
  let layoutStarted = 0;
  let weightsStarted = 0;

  const birds = nodes.map((node, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `network-node ${node.role === 'Assessment' ? 'is-assessment' : ''}`;
    button.style.left = `${node.x / 8}%`;
    button.style.top = `${node.y / 7.6}%`;
    button.setAttribute('aria-label', `${node.name}. ${node.role}. Follow its connections.`);
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('aria-describedby', 'network-note network-caption');
    const glyph = createCrowGlyph(node.kind, node.x > 600);
    const feather = createFeatherGlyph(node.topology);
    button.dataset.topology = node.topology;
    const code = document.createElement('span');
    code.className = 'network-item-code';
    code.textContent = items[index][0];
    code.setAttribute('aria-hidden', 'true');
    const port = document.createElement('span');
    port.className = 'network-port';
    port.setAttribute('aria-hidden', 'true');
    button.append(glyph.svg, feather.svg, code, port);
    button.addEventListener('pointerenter', event => {
      if (event.pointerType === 'touch') return;
      selected = index;
      updateSelection();
    });
    button.addEventListener('pointermove', event => {
      if (event.pointerType === 'touch') return;
      const bounds = button.getBoundingClientRect();
      pointer = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    });
    button.addEventListener('pointerleave', () => { selected = -1; pointer = 0; updateSelection(); });
    button.addEventListener('focus', () => { selected = index; updateSelection(); });
    button.addEventListener('blur', () => { selected = -1; updateSelection(); });
    button.addEventListener('click', () => { pinned = pinned === index ? -1 : index; updateSelection(); });
    stage.append(button);
    return {...node, button, ...glyph, feather, size: 0, turn: 0, fromWeight: node.weight, toWeight: node.weight};
  });

  const links = pairs.map(([from, to]) => {
    const line = svgElement('path', {class: 'network-link', fill: 'none', 'data-from': from, 'data-to': to});
    const ports = svgElement('path', {class: 'network-line-ports', fill: 'none'});
    field.append(line, ports);
    return {from, to, line, ports, route: null};
  });
  const packets = [0, 1].map(() => {
    const group = svgElement('g', {class: 'network-packet', opacity: 0});
    const text = svgElement('text', {'text-anchor': 'middle', 'dominant-baseline': 'middle'});
    text.textContent = '01';
    group.append(svgElement('rect', {x: -11, y: -8, width: 22, height: 16}), text);
    field.append(group);
    return group;
  });

  function updateSelection() {
    const focus = selected >= 0 ? selected : pinned;
    for (let index = 0; index < birds.length; index += 1) {
      const neighbour = pairs.some(pair => pair.includes(focus) && pair.includes(index));
      birds[index].button.classList.toggle('is-selected', focus === index);
      birds[index].button.classList.toggle('is-neighbour', neighbour);
      birds[index].button.setAttribute('aria-pressed', String(pinned === index));
    }
    for (const link of links) {
      link.line.classList.toggle('is-selected', focus === link.from || focus === link.to);
      link.line.classList.toggle('is-relevant', motif !== 'original' && questions[question].links.some(([from, to]) => from === link.from && to === link.to));
    }
    if (focus < 0) {
      label.textContent = website ? 'Signals in context.' : motif === 'original' ? 'Small signals. Connected.' : 'Each mark, one item.';
      detail.textContent = website ? 'Illustrative network · explore a feather' : motif === 'original' ? 'Explore a crow to follow its connections' : 'Sources · context · assessments';
    } else {
      const bird = birds[focus];
      const emphasis = !weighted ? 'equal size' : bird.toWeight >= .75 ? 'high emphasis' : bird.toWeight >= .45 ? 'medium emphasis' : 'low emphasis';
      label.textContent = website || motif === 'original' ? bird.name : items[focus][1];
      const context = website ? bird.role : `${bird.role} · ${emphasis}${motif === 'feathers' ? ` · ${bird.feather.name}` : ''}`;
      detail.textContent = `${context}${pinned === focus ? ' · pinned' : ''}`;
    }
    caption.classList.toggle('is-active', focus >= 0);
    if (!running) draw(time);
  }

  function layout() {
    for (const bird of birds) {
      bird.size = 104 + (68 + bird.weight * 82 - 104) * mix;
      bird.button.style.width = `${bird.size / 8}%`;
    }
    for (const link of links) {
      link.route = pathBetween(birds[link.from], birds[link.to]);
      link.line.setAttribute('d', link.route.points.map((p, index) => `${index ? 'L' : 'M'}${p.x} ${p.y}`).join(' '));
      link.ports.setAttribute('d', [link.route.points[0], link.route.points.at(-1)].map(p => `M${p.x - 2} ${p.y}h4M${p.x} ${p.y - 2}v4`).join(' '));
    }
  }

  function draw(now) {
    const step = Math.min(1, Math.max(0, now - time) * 12);
    time = now;
    const nextMix = fromMix + (targetMix - fromMix) * ease(clamp((time - layoutStarted) / .75));
    let changed = nextMix !== mix;
    mix = nextMix;
    const weightProgress = ease(clamp((time - weightsStarted) / .75));
    for (const bird of birds) {
      const nextWeight = bird.fromWeight + (bird.toWeight - bird.fromWeight) * weightProgress;
      changed ||= bird.weight !== nextWeight;
      bird.weight = nextWeight;
    }
    if (changed) layout();
    const cycle = Math.floor(time / 9);
    const phase = time % 9;
    const route = routes[cycle % routes.length];
    const focus = selected >= 0 ? selected : pinned;
    for (let index = 0; index < birds.length; index += 1) {
      const bird = birds[index];
      const position = route.indexOf(index);
      const start = position * 1.6 + .4;
      const attention = position < 0 ? 0 : envelope(phase, start, start + 2.5);
      const turn = index === focus ? 4 + pointer * 3 : 0;
      if (running) bird.turn += (turn - bird.turn) * step;
      const nod = attention * (bird.kind === 'incident' ? -4 : 4);
      const blinkPhase = phase - start;
      const blink = position >= 0 && blinkPhase > .65 && blinkPhase < .87 ? 1 - Math.sin((blinkPhase - .65) / .22 * Math.PI) * .92 : 1;
      bird.head.style.transform = `rotate(${nod + bird.turn}deg)`;
      bird.eyes.style.transform = `scaleY(${blink})`;
      bird.wing.style.transform = `rotate(${attention * -3}deg)`;
      bird.tail.style.transform = `translateY(${attention * -.4}px)`;
      bird.feather.vane.style.transform = `rotate(${attention * 3 + bird.turn * .4}deg)`;
      bird.button.style.setProperty('--attention', attention.toFixed(3));
    }
    for (let index = 0; index < packets.length; index += 1) {
      const from = route[index];
      const to = route[index + 1];
      const link = links.find(edge => edge.from === from && edge.to === to || edge.from === to && edge.to === from);
      const progress = (phase - (index * 1.6 + 1)) / 2.1;
      const point = pointAlong(link.route, link.from === from ? progress : 1 - progress);
      packets[index].setAttribute('transform', `translate(${point.x} ${point.y})`);
      packets[index].setAttribute('opacity', progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) : 0);
    }
  }

  for (const button of sizing.querySelectorAll('button')) button.addEventListener('click', () => {
    weighted = button.dataset.sizing === 'weighted';
    fromMix = mix;
    targetMix = weighted ? 1 : 0;
    layoutStarted = time;
    if (!running) { mix = fromMix = targetMix; layout(); }
    for (const option of sizing.querySelectorAll('button')) option.setAttribute('aria-pressed', String(option === button));
    updateSelection();
  });

  function applyStudy(nextMotif, nextQuestion, animate) {
    const previousMotif = motif;
    const previousQuestion = question;
    motif = Object.hasOwn(motifs, nextMotif) ? nextMotif : 'original';
    question = Object.hasOwn(questions, nextQuestion) ? nextQuestion : 'control';
    const changeWeights = !animate || (previousMotif === 'original') !== (motif === 'original') || question !== previousQuestion;
    container.dataset.motif = motif;
    container.setAttribute('aria-label', website ? 'Explore an illustrative network of security evidence and context' : motif === 'original' ? 'Explore the crow network' : `Compare evidence items represented by ${motifs[motif].toLowerCase()}`);
    questionLabel.hidden = website || motif === 'original';
    questionLabel.textContent = questions[question].label;
    document.querySelector('#network-note').textContent = motif === 'original' ? 'Illustrative importance' : 'Illustrative example';
    questionControl.hidden = motif === 'original';
    if (changeWeights) weightsStarted = time;
    for (let index = 0; index < birds.length; index += 1) {
      const bird = birds[index];
      if (changeWeights) {
        bird.fromWeight = bird.weight;
        bird.toWeight = motif === 'original' ? nodes[index].weight : questions[question].weights[index];
        if (!animate || !running) bird.weight = bird.fromWeight = bird.toWeight;
      }
      const name = website || motif === 'original' ? bird.name : items[index][1];
      bird.button.setAttribute('aria-label', `${name}. ${bird.role}.${!website && motif === 'feathers' ? ` ${bird.feather.name} feather.` : ''} Follow its connections.`);
      bird.button.setAttribute('aria-describedby', website ? 'network-caption' : 'network-note network-caption');
    }
    for (const button of comparison.querySelectorAll('[data-motif]')) button.setAttribute('aria-pressed', String(button.dataset.motif === motif));
    for (const button of questionControl.querySelectorAll('[data-question]')) button.setAttribute('aria-pressed', String(button.dataset.question === question));
    layout();
    updateSelection();
  }

  function changeStudy(nextMotif, nextQuestion) {
    applyStudy(nextMotif, nextQuestion, true);
    const url = new URL(location.href);
    if (motif === 'original') { url.searchParams.delete('motif'); url.searchParams.delete('question'); }
    else { url.searchParams.set('motif', motif); url.searchParams.set('question', question); }
    if (url.href !== location.href) history.pushState(null, '', url);
  }

  function readStudy() {
    const params = new URLSearchParams(location.search);
    website = !params.has('variant');
    if (params.get('motif') === 'plumage') {
      params.set('motif', 'feathers');
      const url = new URL(location.href);
      url.search = params.toString();
      history.replaceState(null, '', url);
    }
    applyStudy(website ? 'feathers' : params.get('motif'), website ? 'response' : params.get('question'), false);
  }

  for (const button of comparison.querySelectorAll('[data-motif]')) button.addEventListener('click', () => changeStudy(button.dataset.motif, question));
  for (const button of questionControl.querySelectorAll('[data-question]')) button.addEventListener('click', () => changeStudy(motif, button.dataset.question));
  container.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    pinned = selected = -1;
    updateSelection();
  });
  readStudy();
  return {
    draw,
    readStudy,
    setRunning(value) {
      running = value;
      if (!running) {
        mix = fromMix = targetMix;
        for (const bird of birds) bird.weight = bird.fromWeight = bird.toWeight;
        layout();
      }
    },
    clear() {
      pinned = selected = -1;
      mix = fromMix = targetMix;
      layoutStarted = 0;
      weightsStarted = 0;
      for (const bird of birds) { bird.turn = 0; bird.weight = bird.fromWeight = bird.toWeight; }
      layout();
      updateSelection();
    }
  };
}
