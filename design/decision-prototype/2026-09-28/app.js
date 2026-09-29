/* Disposable UI study: three structures, one synthetic decision, no remote calls or persistence. */
'use strict';

const ASSETS = '../../crow-concepts/2026-09-24/approved-runtime/';
const crowAssets = {modular: 'modular-crow.png', 'runner-glide': 'runner-glide.png', 'runner-up': 'runner-up.png', 'runner-down': 'runner-down.png'};
const variants = ['terminal', 'brief', 'programme'];
const variantNames = {terminal: 'Decision terminal', brief: 'Decision brief', programme: 'Programme view'};
const query = new URLSearchParams(location.search).get('variant');
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  variant: variants.includes(query) ? query : 'brief', page: 'nest', motion: !motionPreference.matches,
  selected: 'owner', fact: 'baseline', pending: null, corrections: [],
  versions: [{number: 1, fact: 'baseline', correction: null}],
  log: [{kind: 'Recommendation', title: 'A narrower role, with the work intact', detail: 'Version 1 · Initial synthetic recommendation', version: 1}],
};

// All editable content is rendered with textContent. No HTML string parsing.
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function append(node, ...children) { node.append(...children.flat().filter(Boolean)); return node; }
function button(text, className, action) {
  const node = el('button', className, text); node.type = 'button';
  node.addEventListener('click', action); return node;
}
function label(text) { return el('span', 'eyebrow', text); }
function tag(text, tone = '') { return el('span', `tag ${tone}`, text); }
function crow(size = 'small', pose = '', character = 'modular') {
  const wrap = el('span', `crow ${size} ${pose} ${character === 'modular' ? 'modular' : 'packet-runner'} ${character}`); wrap.setAttribute('aria-hidden', 'true');
  const img = el('img'); img.src = ASSETS + crowAssets[character]; img.alt = '';
  return append(wrap, img);
}
let announcementTimer;
function announce(text) {
  const output = document.querySelector('#announcements');
  output.textContent = text; output.className = 'toast';
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(() => { output.className = 'sr-only'; }, 5000);
}
function panelHead(number, title, end) {
  return append(el('div', 'panel-head'), append(el('div'), label(number), el('h2', '', title)), end);
}
function updateMotion() {
  document.documentElement.classList.toggle('motion-off', !state.motion || document.hidden || motionPreference.matches);
  const control = document.querySelector('#motion');
  if (control) { control.textContent = state.motion && !motionPreference.matches ? 'Ⅱ Motion on' : '▷ Motion off'; control.setAttribute('aria-pressed', String(state.motion && !motionPreference.matches)); }
}
motionPreference.addEventListener('change', () => { state.motion = !motionPreference.matches; updateMotion(); });
document.addEventListener('visibilitychange', updateMotion);

const evidence = [
  {id: 'activity', icon: '≋', type: 'APP ACTIVITY', title: 'The work is tickets & reports', short: '90 days of observed activity', status: 'Observed', checked: '28 Sep · 09:02', revision: 'activity / r17', period: '30 June – 27 September 2026', quote: 'Support members handled tickets and exported their queue reports. No app-settings or user-management events were observed in the selected activity window.', influence: 'Supports a narrower role. An absence of admin activity does not prove that admin access is never needed.', limit: 'Selected activity window only. Emergency and infrequent work need owner confirmation.'},
  {id: 'directory', icon: '⊞', type: 'PEOPLE DIRECTORY', title: '12 people. One support team.', short: 'Team membership & accountable owner', status: 'Mapped', checked: '28 Sep · 08:52', revision: 'directory / r8', period: 'Snapshot on 28 September 2026', quote: 'Twelve support staff hold the Administrator role. Maya Chen is the support owner; Alex Rivera is the platform delivery lead.', influence: 'Defines who the proposal covers and who should review it. Membership does not grant permission to approve.', limit: 'Synthetic directory snapshot. This prototype does not authenticate anyone.'},
  {id: 'roles', icon: '⌘', type: 'ROLE CATALOGUE', title: 'A smaller role is now possible', short: 'Custom permissions available', status: 'Available', checked: '28 Sep · 08:56', revision: 'roles / r3', period: 'Catalogue checked on 28 September 2026', quote: 'The platform supports a custom role with ticket handling and own-queue report exports, without app-settings or user-management permissions.', influence: 'Makes the proposed alternative feasible. If custom roles are unavailable, this proposal needs to change.', limit: 'The new role has not been created or tested. Effective permissions still need a controlled check.'},
  {id: 'calendar', icon: '▦', type: 'WORK CALENDAR', title: 'Quarter-end is close', short: 'Reporting window · 30 September', status: 'Context', checked: '28 Sep · 08:00', revision: 'calendar / r5', period: 'Quarter-end on 30 September 2026', quote: 'The support team produces queue reports for quarter-end. Reporting remains part of the work during this review.', influence: 'Sets the timing. Removing exports now could interrupt required reporting.', limit: 'The calendar gives timing; it does not independently confirm a legal or non-deferrable obligation.'},
  {id: 'owner', icon: '>_', type: 'OWNER CONTEXT', title: '“We still need those exports.”', short: 'Infrequent work, explicitly confirmed', status: 'Confirmed', checked: '27 Sep · 14:30', revision: 'owner / r2', period: 'Owner statement on 27 September 2026', quote: 'We do not export reports every week, but we need our queue exports for quarter-end. Keep that ability when changing the role.', influence: 'Preserve own-queue exports. Low frequency is not the same as low necessity.', limit: 'An attributed synthetic owner statement. The proposed role still needs owner review.'},
  {id: 'policy', icon: '◇', type: 'DATA-ACCESS POLICY', title: 'Only their own queue', short: 'A boundary every option must respect', status: 'Must hold', checked: 'Policy version 3', revision: 'policy / v3', period: 'Applicable to the support-platform scenario', quote: 'Support exports must be restricted to records in the team’s own queue. Any proposed role must preserve this scope.', influence: 'A constraint, not a weight. Other evidence cannot outweigh this boundary.', limit: 'Illustrative policy. Enforcement must be verified in the actual platform before any live change.'},
];

function advice(fact = state.fact) {
  if (fact === 'roles-unavailable') return {
    title: 'Verify a workable role first.', role: 'Pause the role change', description: 'The proposed custom role is not available. Confirm a scoped alternative with the platform owner before replacing access.',
    why: 'Removing access without a working replacement could break ticket handling and quarter-end reporting.',
    condition: 'Current access is not declared safe or accepted. The owner still needs to decide how to handle the interim exposure.', status: 'Feasibility unresolved',
  };
  if (fact === 'owner-unconfirmed') return {
    title: 'Ask about the infrequent work.', role: 'Confirm reporting needs', description: 'Ask the support owner whether own-queue exports are still required before finalising the role.',
    why: 'Activity alone cannot tell us whether an infrequent capability is necessary.',
    condition: 'Keep the existing recommendation as history. No permission change is ready for review yet.', status: 'Owner input needed',
  };
  return {title: 'Less privilege. Same useful work.', role: 'Support operator', description: 'Propose a custom role that keeps tickets and own-queue reports, and removes unnecessary administration.',
    why: 'The platform supports a narrower role, and the owner confirmed the reporting work that must survive the change.',
    condition: 'Owner review and a controlled permissions check are required before any change.', status: 'Owner review pending'};
}

function openDialog(eyebrow, title, content, wide = false) {
  const dialog = document.querySelector('#detail'); dialog.classList.toggle('wide', wide);
  const close = button('×', 'close', () => dialog.close()); close.setAttribute('aria-label', 'Close details');
  const heading = el('h2', '', title); heading.id = 'dialog-heading'; dialog.setAttribute('aria-labelledby', heading.id);
  document.querySelector('#dialog-content').replaceChildren(
    append(el('header', 'dialog-head'), label(eyebrow), close), heading, content,
    el('p', 'dialog-disclosure', 'Synthetic prototype · Changes stay in this tab. No permissions are changed.')
  );
  if (!dialog.open) dialog.showModal();
}

function openEvidence(id) {
  const item = evidence.find(x => x.id === id); if (!item) return;
  state.selected = id;
  const content = el('div', 'evidence-detail');
  append(content, append(el('div', 'detail-tags'), tag(item.status, id === 'policy' ? 'oxide' : 'sage'), tag('Synthetic source')),
    el('blockquote', '', item.quote), label('How this influences the decision'), el('p', '', item.influence),
    label('What it does not establish'), el('p', 'muted', item.limit));
  const dl = el('dl', 'metadata');
  for (const [name, value] of [['Subject', 'Acme · Support platform'], ['Source revision', item.revision], ['Period', item.period], ['Last checked in fixture', item.checked]]) append(dl, el('dt', '', name), el('dd', '', value));
  append(content, dl);
  if (state.fact !== 'baseline' && (id === 'roles' || id === 'owner')) append(content, el('p', 'notice', 'This is the original source. The selected counterfactual overlay is recorded separately in the Flight log.'));
  append(content, button('Challenge this Feather ↗', 'primary', () => correctionDialog(item.title)));
  openDialog('FEATHERS / EVIDENCE', item.title, content);
}

function evidenceCard(item, compact = false) {
  const card = button('', `feather-card ${item.id === 'policy' ? 'policy-card' : ''} ${compact ? 'compact' : ''}`, () => openEvidence(item.id));
  append(card, append(el('div', 'feather-top'), el('span', 'source-icon', item.icon), label(item.type), el('span', 'card-arrow', '↗')),
    el('h3', '', item.title), el('p', 'muted', item.short),
    append(el('div', 'feather-bottom'), tag(item.status, item.id === 'policy' ? 'oxide' : ''), el('span', 'mono', item.revision)));
  if ((item.id === 'roles' && state.fact === 'roles-unavailable') || (item.id === 'owner' && state.fact === 'owner-unconfirmed')) {
    append(card, el('span', 'overlay-label', 'Original source · Changed by demo overlay'));
  }
  return card;
}

function permissionList() {
  const table = el('table', 'permissions');
  const thead = el('thead'); const header = el('tr');
  for (const name of ['Work & permissions', 'Proposed']) { const th = el('th', '', name); th.scope = 'col'; header.append(th); }
  thead.append(header); table.append(thead);
  const tbody = el('tbody');
  for (const [name, keep] of [['Handle tickets', true], ['Export own queue reports', true], ['Change application settings', false], ['Manage users and roles', false]]) {
    const row = el('tr'); const th = el('th', '', name); th.scope = 'row';
    append(row, th, append(el('td'), el('span', keep ? 'keep' : 'remove', (keep ? '+ Keep' : '− Remove')))); tbody.append(row);
  }
  table.append(tbody); return table;
}

function compareDialog() {
  const body = el('div', 'comparison-grid');
  const options = [
    ['01', 'Custom support role', state.fact === 'baseline' ? 'Proposed' : state.fact === 'owner-unconfirmed' ? 'Needs confirmation' : 'Not yet feasible', 'Retains tickets and scoped reporting. Removes settings and user administration.', 'Needs custom-role support, owner review and a controlled test.'],
    ['02', 'Keep Administrator', 'Interim option', 'Avoids an immediate interruption to work. Broad administration access remains.', 'Would require an accountable decision about exposure and a time-bound follow-up.'],
    ['03', 'Ticket-only access', state.fact === 'owner-unconfirmed' ? 'Reporting need unresolved' : 'Conflicts with confirmed work', 'Removes administration, but also removes report exports.', state.fact === 'owner-unconfirmed' ? 'Ask the owner whether exports are necessary before deciding whether this option preserves required work.' : 'Does not preserve the owner-confirmed quarter-end work. Revisit if that need changes.'],
  ];
  for (const [number, title, status, benefit, cost] of options) append(body, append(el('section', 'option'), label(number), el('h3', '', title), tag(status), el('p', '', benefit), el('hr'), label('Trade-off'), el('p', 'muted', cost)));
  if (state.fact === 'owner-unconfirmed') body.append(el('p', 'notice', 'Owner confirmation is unverified in the current overlay. Ticket-only access remains an alternative to investigate, not an approved change.'));
  openDialog('DECISION / ALTERNATIVES', 'Three paths. Different consequences.', body, true);
}

function correctionDialog(source = 'The proposed role') {
  const form = el('form', 'correction-form');
  const fieldLabel = el('label', '', 'What should we reconsider?'); fieldLabel.htmlFor = 'correction';
  const text = el('textarea'); text.id = 'correction'; text.maxLength = 600; text.rows = 3; text.placeholder = 'Add context or challenge an assumption…';
  const scenarioLabel = el('label', '', 'Choose a fact to change in this demo'); scenarioLabel.htmlFor = 'scenario';
  const select = el('select'); select.id = 'scenario';
  for (const [value, name] of [['baseline', 'Custom role available · reporting need confirmed'], ['roles-unavailable', 'Custom roles are not available on our plan'], ['owner-unconfirmed', 'The reporting need has not been confirmed']]) { const option = el('option', '', name); option.value = value; select.append(option); }
  select.value = state.fact;
  const submit = el('button', 'primary', 'Save correction'); submit.type = 'submit';
  append(form, el('p', 'muted', `Regarding: ${source}`), fieldLabel, text, scenarioLabel, select,
    el('p', 'small muted', 'The selected fact drives a scripted reassessment. Your note is retained as context; this prototype does not interpret it with a model.'), submit);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (state.corrections.length >= 20) { announce('Demo limit reached. Reload to reset.'); return; }
    const note = text.value.trim() || 'Selected fact updated for this simulated review.';
    const correction = {note, fact: select.value, source, number: state.corrections.length + 1};
    state.corrections.push(correction); state.pending = correction;
    state.log.push({kind: 'Correction saved', title: note, detail: `Correction ${correction.number} · Not yet applied`, correction: correction.number});
    document.querySelector('#detail').close(); render(); announce('Correction saved. The recommendation has not changed. Reassess to apply the selected fact.');
    document.querySelector('[data-reassess]')?.focus();
  });
  openDialog('CHALLENGE / KEEP THE ORIGINAL', 'A better decision starts with better context.', form);
}

function reassess() {
  if (!state.pending) { correctionDialog(); return; }
  state.fact = state.pending.fact;
  const version = {number: state.versions.length + 1, fact: state.fact, correction: {...state.pending}};
  state.versions.push(version);
  const saved = state.log.find(entry => entry.correction === state.pending.number);
  if (saved) saved.detail = `Correction ${state.pending.number} · Applied in version ${version.number}`;
  state.log.push({kind: 'Reassessment', title: advice().role, detail: `Version ${version.number} · Scripted demo using correction ${state.pending.number}`, version: version.number});
  state.pending = null; render(); announce(`Version ${version.number} created. Previous versions remain in the Flight log.`);
  (document.querySelector('#decision-title') || document.querySelector('#main h1'))?.focus();
}

function reviewDialog() {
  const body = el('div');
  append(body, el('p', '', advice().condition), append(el('div', 'owner-review'), crow('medium'), append(el('div'), label('ACCOUNTABLE OWNER'), el('h3', '', 'Maya Chen'), el('p', 'muted', 'Support lead · Synthetic person'))),
    el('p', 'muted', 'Record a simulated preference for this recommendation. This is not authenticated approval and does not assign work or change access.'));
  append(body, button('Record simulated preference', 'primary', () => {
    if (state.log.filter(x => x.kind === 'Simulated preference').length >= 20) { announce('Demo preference limit reached.'); return; }
    state.log.push({kind: 'Simulated preference', title: advice().role, detail: `Recorded by demo operator · Version ${state.versions.length} · No execution`});
    document.querySelector('#detail').close(); render(); announce('Simulated preference recorded in the Flight log. No access changed.');
  }));
  openDialog('FLOCK / OWNER REVIEW', 'Put the decision with the right person.', body);
}

function outcomeDialog() {
  const body = el('div', 'outcome-list');
  for (const [title, detail] of [['Required work still works', 'Can support handle tickets and export only its own queue reports?'], ['Administration is removed', 'Do effective permissions deny app settings and user management?'], ['The owner confirms the result', 'Did the change disrupt reporting, emergency work or another legitimate task?']]) append(body, append(el('div', 'outcome'), el('span', 'check-empty', '○'), append(el('div'), el('h3', '', title), el('p', 'muted', detail), tag('Not observed'))));
  append(body, el('p', 'notice', 'These are proposed follow-up checks. No change has been executed and no outcome has been verified.'));
  openDialog('FLIGHT LOG / FOLLOW-UP', 'A recommendation is only the beginning.', body);
}

function recommendation(light = false) {
  const data = advice(); const node = el('section', `recommendation ${light ? 'paper' : ''}`);
  append(node, panelHead('02 / PROPOSED NEXT STEP', data.role, crow('small', 'nod')), el('p', 'recommendation-copy', data.description));
  if (state.fact === 'baseline') append(node, permissionList());
  else append(node, el('p', 'notice', data.why));
  append(node, append(el('div', 'decision-condition'), el('span', 'tiny-dot'), el('p', '', data.condition)),
    append(el('div', 'actions'), button(state.fact === 'baseline' ? 'Review proposal ↗' : 'Review next step ↗', 'primary', reviewDialog), button('Compare options', 'secondary', compareDialog)));
  return node;
}

function pendingBanner() {
  if (!state.pending) return null;
  const go = button('Reassess now ↗', 'primary', reassess); go.dataset.reassess = 'true';
  return append(el('aside', 'pending-banner'), append(el('div'), el('strong', '', 'A correction is waiting in the wings.'), el('p', '', 'Saved in this tab. The current recommendation is unchanged.')), go);
}

function scenarioNotice() {
  if (state.fact === 'baseline') return null;
  return append(el('div', 'scenario-notice'), tag('COUNTERFACTUAL', 'oxide'), el('span', '', state.fact === 'roles-unavailable' ? 'For this review, custom roles are unavailable. Original sources remain unchanged.' : 'For this review, the reporting need is unconfirmed. Original sources remain unchanged.'));
}

function caseHeader() {
  const header = el('header', 'case-header');
  append(header, append(el('div', 'case-meta'), label(`ACME / SUPPORT PLATFORM / V${state.versions.length}`), tag(advice().status, 'oxide')),
    el('h1', '', 'Does support still need admin access?'),
    el('p', 'muted', 'Preserve the work people need to do. Reduce the access they don’t.'),
    append(el('div', 'case-tools'), button('↗ Compare options', 'text-button', compareDialog), button('⌁ Challenge an assumption', 'text-button', () => correctionDialog()), button('◷ Outcome checks', 'text-button', outcomeDialog)));
  header.querySelector('h1').id = 'decision-title'; header.querySelector('h1').tabIndex = -1;
  return header;
}

function terminalView() {
  const root = el('div', 'variant terminal'); append(root, caseHeader(), pendingBanner(), scenarioNotice());
  const workspace = el('div', 'terminal-grid'); const sources = el('section', 'source-panel');
  append(sources, panelHead('01 / FEATHERS', 'Every signal has a source.', tag('5 inputs + 1 constraint')));
  const network = el('div', 'network'); const cards = el('div', 'network-cards');
  for (const item of evidence) cards.append(evidenceCard(item, true));
  const engine = append(el('div', 'engine'), label('DECISION ENGINE'), crow('large', 'float'), el('span', 'wordmark', 'crowbo'), el('span', 'mono', 'ASSESS · WEIGH · REASON'), tag('Illustrative connections'));
  const wires = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); wires.setAttribute('viewBox', '0 0 180 440'); wires.setAttribute('preserveAspectRatio', 'none'); wires.setAttribute('aria-hidden', 'true'); wires.classList.add('wires');
  for (const y of [66, 220, 372]) { const path = document.createElementNS(wires.namespaceURI, 'path'); path.setAttribute('d', `M0 ${y} H${40 + y / 8} V220 H180`); wires.append(path); }
  append(network, cards, wires, engine); append(sources, network,
    append(el('div', 'insight-bar'), crow('small', 'float', 'runner-down'), append(el('div'), label('THE DECIDING CONTEXT'), el('p', '', state.fact === 'baseline' ? 'Low usage does not mean no need. The owner confirmed quarter-end exports.' : advice().why))));
  append(workspace, sources, recommendation()); append(root, workspace, bottomContext()); return root;
}

function briefView() {
  const root = el('div', 'variant brief'); append(root, caseHeader(), pendingBanner(), scenarioNotice());
  const grid = el('div', 'brief-grid'); const left = el('div', 'brief-main');
  const hero = el('section', 'brief-hero');
  append(hero, append(el('div'), label('THE RECOMMENDATION'), el('h2', '', advice().title), el('p', '', advice().why)), crow('hero', 'float', 'runner-glide'));
  append(left, hero, recommendation(true));
  const right = el('aside', 'brief-context');
  append(right, panelHead('01 / FEATHERS', 'What tips the balance', button('All 6 ↗', 'text-button', () => navigate('feathers'))));
  for (const id of ['owner', 'roles', 'policy']) right.append(evidenceCard(evidence.find(x => x.id === id), true));
  append(right, append(el('section', 'owner-card'), label('THE FLOCK'), append(el('div', 'avatar-row'), el('span', 'avatar', 'MC'), append(el('div'), el('h3', '', 'Maya Chen'), el('p', 'muted', 'Support lead · Review owner'))), button('Who does what? ↗', 'text-button', () => navigate('flock'))));
  append(grid, left, right); append(root, grid, bottomContext()); return root;
}

function programmeView() {
  const root = el('div', 'variant programme');
  const heading = append(el('header', 'programme-heading'), append(el('div'), label('THE NEST / MONDAY, 28 SEPTEMBER'), el('h1', '', 'A little less noise.\nA clearer next move.'), el('p', 'muted', 'Your security programme, one considered decision at a time.')), crow('programme-crow', 'float', 'runner-up'));
  append(root, heading, pendingBanner(), scenarioNotice());
  const grid = el('div', 'programme-grid'); const queue = el('section', 'queue');
  append(queue, panelHead('01 / NEEDS ATTENTION', 'One decision to move forward', tag('1 open case')));
  const active = button('', 'queue-item selected', () => { document.querySelector('#programme-detail').scrollIntoView({behavior: state.motion ? 'smooth' : 'instant', block: 'start'}); document.querySelector('#decision-title').focus({preventScroll: true}); });
  append(active, append(el('div', 'queue-marker'), crow('tiny')), append(el('div'), label('ACCESS REVIEW'), el('h3', '', 'Support platform access'), el('p', 'muted', advice().status), append(el('div', 'queue-meta'), tag('6 Feathers'), tag('Maya Chen'))), el('span', 'card-arrow', '↗'));
  append(queue, active, append(el('div', 'quiet-state'), crow('medium', 'nod'), el('h3', '', 'Room to focus.'), el('p', 'muted', 'This study contains one decision. A real Nest would collect cases that need your attention.')),
    append(el('div', 'calendar-strip'), label('COMING INTO VIEW'), el('strong', '', '30 SEP'), el('p', '', 'Quarter-end reports'), el('span', 'small muted', 'Context for this case, not a separate approval.')));
  const detail = el('section', 'programme-detail'); detail.id = 'programme-detail';
  append(detail, append(el('div', 'case-meta'), label(`02 / CURRENT CASE / V${state.versions.length}`), tag(advice().status, 'oxide')));
  const title = el('h2', 'programme-title', 'Does support still need admin access?'); title.id = 'decision-title'; title.tabIndex = -1;
  append(detail, title, recommendation(),
    append(el('div', 'programme-links'), button('Inspect 6 Feathers ↗', 'secondary', () => navigate('feathers')), button('Challenge an assumption', 'secondary', () => correctionDialog()), button('Open Flight log ↗', 'text-button', () => navigate('log'))));
  append(grid, queue, detail); append(root, grid); return root;
}

function bottomContext() {
  return append(el('div', 'bottom-context'), append(el('div'), label('WHAT COULD CHANGE THE ANSWER?'), el('p', '', 'A missing role capability. An unconfirmed reporting need. A change in policy.')),
    button('Test a change ↗', 'secondary', () => correctionDialog()));
}

function feathersPage() {
  const root = el('div', 'secondary-page');
  append(root, pageHeading('FEATHERS / EVIDENCE', 'Keep the source within reach.', 'Six synthetic records behind this decision. Inspect what each supports, and where its limits begin.'), pendingBanner(), scenarioNotice());
  const grid = el('div', 'feathers-grid'); for (const item of evidence) grid.append(evidenceCard(item));
  append(root, grid, append(el('div', 'notice'), el('strong', '', 'A Feather is evidence, not a vote.'), el('p', '', 'More sources do not automatically mean a stronger decision. Policy stays a constraint, and missing information stays visible.'))); return root;
}
function pageHeading(overline, title, description) {
  return append(el('header', 'page-heading'), append(el('div'), label(overline), el('h1', '', title), el('p', 'muted', description)), crow('medium', 'nod'));
}
function flockPage() {
  const root = el('div', 'secondary-page'); append(root, pageHeading('FLOCK / PEOPLE & AGENTS', 'The right people, in the right roles.', 'A recommendation, an accountable choice and delivered work have different owners.'));
  const grid = el('div', 'flock-grid');
  for (const [initials, name, role, task, note] of [['JT', 'Jamie Taylor', 'GRC proposer', 'Brings the question and the evidence.', 'Can propose a priority. Cannot commit another team’s capacity.'], ['MC', 'Maya Chen', 'Support owner', 'Confirms required work and reviews the proposal.', 'Review is pending. This prototype does not authenticate approval.'], ['AR', 'Alex Rivera', 'Platform delivery lead', 'Checks feasibility and plans a controlled change.', 'No work is assigned. Capacity and execution remain unconfirmed.']]) append(grid, append(el('article', 'person-card'), el('span', 'avatar large', initials), label(role), el('h2', '', name), el('p', '', task), el('p', 'muted small', note), tag('Synthetic person')));
  append(root, grid, append(el('section', 'agent-card'), crow('medium', 'float'), append(el('div'), label('YOUR DECISION COMPANION'), el('h2', '', 'Crowbo'), el('p', 'muted', 'Connects evidence, proposes alternatives and keeps the basis inspectable. This study uses scripted recommendations.')), tag('Advisory only'))); return root;
}

function versionDialog(number) {
  const version = state.versions.find(item => item.number === number); if (!version) return;
  const body = el('div'); const result = advice(version.fact);
  append(body, tag(`Version ${number}`, 'sage'), el('h3', 'version-role', result.role), el('p', '', result.description), label('Basis retained'), el('p', 'muted', version.fact === 'baseline' ? 'Original six synthetic sources. Custom role available; reporting need confirmed.' : `Original six sources plus counterfactual: ${version.fact === 'roles-unavailable' ? 'custom roles unavailable' : 'owner confirmation missing'}.`));
  if (version.correction) append(body, label('Correction included'), el('blockquote', '', version.correction.note));
  append(body, label('Still required'), el('p', '', result.condition), button('Inspect original Feathers ↗', 'secondary', () => { document.querySelector('#detail').close(); navigate('feathers'); }));
  openDialog('FLIGHT LOG / RETAINED VERSION', `The basis of version ${number}`, body);
}

function logPage() {
  const root = el('div', 'secondary-page'); append(root, pageHeading('FLIGHT LOG / DECISION HISTORY', 'Every turn, with its reasons.', 'Recommendations, corrections and reported choices remain separate. Nothing here means work was executed.'), pendingBanner());
  const history = el('ol', 'history');
  for (const [index, item] of state.log.entries()) {
    const entry = el('li', 'history-entry');
    append(entry, el('span', 'history-marker', String(index + 1).padStart(2, '0')), append(el('div', 'history-copy'), label(item.kind), el('h3', '', item.title), el('p', 'muted', item.detail)), item.version ? button('Inspect version ↗', 'text-button', () => versionDialog(item.version)) : null); history.append(entry);
  }
  append(root, history, button('See proposed outcome checks ↗', 'secondary', outcomeDialog)); return root;
}

function navigate(page) { state.page = page; render(); window.scrollTo({top: 0}); document.querySelector('#main h1')?.focus(); }
function switchVariant(variant) {
  if (!variants.includes(variant)) return;
  state.variant = variant; state.page = 'nest'; const url = new URL(location.href); url.searchParams.set('variant', variant); history.replaceState(null, '', url);
  render(); window.scrollTo({top: 0});
  document.querySelector('.variant-button.selected')?.focus({preventScroll: true});
  document.querySelector('#announcements').className = 'sr-only';
  document.querySelector('#announcements').textContent = `${variantNames[variant]} selected. Same decision and saved session state.`;
}

function render() {
  const app = document.querySelector('#app'); const shell = el('div', 'shell');
  const sidebar = el('aside', 'sidebar');
  const brand = button('crowbo', 'wordmark brand', () => navigate('nest')); brand.setAttribute('aria-label', 'Crowbo · Open Nest');
  const nest = append(el('div', 'nest-picker'), el('span', 'nest-avatar', 'a'), append(el('div'), el('strong', '', 'Acme'), el('span', 'small muted', 'Your nest')), tag('DEMO'));
  append(sidebar, brand, nest, label('WORKSPACE'));
  const nav = el('nav', 'navigation'); nav.setAttribute('aria-label', 'Workspace');
  for (const [id, icon, name, count] of [['nest', '⌂', 'Nest', '01'], ['flock', '⌘', 'Flock', '04'], ['feathers', '⌁', 'Feathers', '06'], ['log', '◷', 'Flight log', String(state.log.length).padStart(2, '0')]]) {
    const item = button('', `nav-item ${state.page === id ? 'active' : ''}`, () => navigate(id));
    if (state.page === id) item.setAttribute('aria-current', 'page');
    append(item, el('span', 'nav-icon', icon), el('span', '', name), el('span', 'nav-count', count)); nav.append(item);
  }
  append(sidebar, nav, append(el('div', 'sidebar-companion'), crow('resident', 'nod'), label('GOOD JUDGEMENT TAKES CONTEXT.'), el('p', '', 'Every feather tells part of the story.')),
    append(el('div', 'sidebar-footer'), el('span', 'status-dot'), el('span', '', 'Local prototype'), button('Reset', 'text-button', () => location.reload())));
  const body = el('div', 'body'); const topbar = el('header', 'topbar');
  const motion = button('', 'text-button', () => { state.motion = !state.motion; updateMotion(); }); motion.id = 'motion';
  append(topbar, append(el('div', 'breadcrumb'), el('span', 'muted', 'Acme'), el('span', 'slash', '/'), el('span', '', {nest: 'The nest', flock: 'The flock', feathers: 'Feathers', log: 'Flight log'}[state.page])),
    append(el('div', 'topbar-right'), tag('SYNTHETIC STUDY', 'demo'), motion, el('span', 'avatar mini', 'AF')));
  const main = el('main'); main.id = 'main'; main.tabIndex = -1;
  const content = state.page === 'flock' ? flockPage() : state.page === 'feathers' ? feathersPage() : state.page === 'log' ? logPage() : ({terminal: terminalView, brief: briefView, programme: programmeView}[state.variant])();
  main.append(content); main.querySelectorAll('h1').forEach(node => { node.tabIndex = -1; });
  append(body, topbar, main, append(el('footer', 'page-footer'), el('span', '', 'A design study, with synthetic evidence. No live data or actions.'), el('span', 'mono', `V${state.versions.length} · ${state.corrections.length} CORRECTIONS · TAB-ONLY STATE`)));
  append(shell, sidebar, body); const switcher = el('nav', 'variant-switcher'); switcher.setAttribute('aria-label', 'Prototype layout comparison');
  const previous = button('←', 'variant-arrow', () => switchVariant(variants[(variants.indexOf(state.variant) + 2) % 3])); previous.setAttribute('aria-label', 'Previous layout');
  append(switcher, previous, label('EXPLORE THE LAYOUTS'));
  variants.forEach((variant, index) => { const item = button(`${String(index + 1).padStart(2, '0')}  ${variantNames[variant]}`, state.variant === variant ? 'variant-button selected' : 'variant-button', () => switchVariant(variant)); item.setAttribute('aria-pressed', String(state.variant === variant)); switcher.append(item); });
  const next = button('→', 'variant-arrow', () => switchVariant(variants[(variants.indexOf(state.variant) + 1) % 3])); next.setAttribute('aria-label', 'Next layout'); switcher.append(next);
  app.replaceChildren(shell, switcher); updateMotion();
}

document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || document.querySelector('#detail').open) return;
  if (event.target.closest('input,textarea,select,[contenteditable="true"],[role="slider"]')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
    event.preventDefault(); switchVariant(variants[(variants.indexOf(state.variant) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]);
  }
});
render();
