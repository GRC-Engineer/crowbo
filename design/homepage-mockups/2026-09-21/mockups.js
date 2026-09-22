'use strict';

const concepts = new Map([
  ['field-notes', 'Field Notes'],
  ['command-room', 'Command Room'],
  ['flight-path', 'Flight Path']
]);
const conceptButtons = document.querySelectorAll('[data-concept]');

for (const button of conceptButtons) {
  button.addEventListener('click', () => {
    const chosen = button.dataset.concept;
    if (!concepts.has(chosen)) return;
    for (const [id] of concepts) document.getElementById(id).hidden = id !== chosen;
    for (const candidate of conceptButtons) candidate.setAttribute('aria-pressed', String(candidate.dataset.concept === chosen));
    document.querySelector('#concept-announcement').textContent = concepts.get(chosen) + ' selected.';
    window.scrollTo({top:0,behavior:'instant'});
  });
}

const scenarios = new Map([
  ['bottleneck', {
    arrivals:'12', resolved:'8', resolvedLabel:'Resolved / week',
    evidence:'Twelve findings arrive and eight get resolved each week. The queue is growing, but the cause is still unclear.',
    step:'Investigate the bottleneck.',
    why:'More detections may add work to a queue the team cannot clear. First find out what is holding remediation back.',
    unknown:'Is the constraint engineering time, ownership or the release process? A critical blind spot would also change the options.',
    metricValue:'+4', metricLabel:'Findings added to the queue / week'
  }],
  ['blindspot', {
    arrivals:'12', resolved:'8', resolvedLabel:'Resolved / week',
    evidence:'This fictional variation adds an urgent blind spot: a critical asset class has no effective detection coverage. The proposed tool may address it.',
    step:'Test the coverage gap.',
    why:'An urgent blind spot changes the case for a bounded tool pilot. Test whether it closes the gap before committing to a wider purchase.',
    unknown:'Will the pilot produce useful, actionable findings? Who can remediate them? The owner must approve the scope and spending.',
    metricValue:'$60k', metricLabel:'Illustrative cost of the proposed tool'
  }],
  ['capacity', {
    arrivals:'12', resolved:'16', resolvedLabel:'Proposed / week',
    evidence:'This fictional variation assumes engineering time is the main constraint and a credible capacity plan could resolve sixteen findings a week.',
    step:'Prioritise remediation capacity.',
    why:'If the proposed throughput holds, sixteen resolved and twelve arriving each week could clear a backlog of thirty-two in eight weeks.',
    unknown:'Can the team sustain the proposed throughput, and could an existing process change achieve it? The illustrative $90,000 plan still needs owner approval.',
    metricValue:'8 weeks', metricLabel:'Illustrative backlog clearance if the plan holds'
  }]
]);

const caseIds = new Set(['field', 'command', 'flight']);
for (const picker of document.querySelectorAll('[data-scenario-picker]')) {
  picker.addEventListener('change', () => {
    const data = scenarios.get(picker.value);
    const container = picker.closest('[data-case]');
    if (!data || !container || !caseIds.has(container.dataset.case)) return;
    for (const node of container.querySelectorAll('[data-field]')) {
      if (Object.hasOwn(data, node.dataset.field)) node.textContent = data[node.dataset.field];
    }
  });
}

Promise.all([
  document.fonts.load('400 42px CRPixel', 'crowbo'),
  document.fonts.load('500 16px CRSpace', 'Security decisions'),
  document.fonts.load('600 50px CRBricolage', 'A clear head.'),
  document.fonts.load('400 11px CRMono', 'EVIDENCE')
]).then(results => {
  const ready = results.every(faces => faces.length > 0 && faces.every(face => face.status === 'loaded'));
  document.documentElement.dataset.fontsReady = String(ready);
  document.querySelector('#font-warning').hidden = ready;
}).catch(() => {
  document.documentElement.dataset.fontsReady = 'false';
  document.querySelector('#font-warning').hidden = false;
});
