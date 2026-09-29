const NS = 'http://www.w3.org/2000/svg';

export function svgElement(tag, attributes = {}) {
  const element = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

const silhouettes = {
  review: {
    head: 'M9 7H11V4H14V2H17V4H21V5H24V8H25V16H22V18H11V16H8V10H9Z',
    wing: 'M12 18H21V21H18V23H15V26H11V22H12Z',
    tail: 'M9 23H6V25H3V28H8V26H10V29H13V24Z',
    detail: 'M14 20H17V22H14ZM12 23H15V25H12Z'
  },
  conversation: {
    head: 'M8 8H10V5H13V4H21V5H24V8H25V15H23V18H11V17H8Z',
    wing: 'M11 19H19V21H21V23H18V25H12V24H10V21H11Z',
    tail: 'M10 23H6V25H4V27H9V28H13V24Z',
    detail: 'M13 20H18V21H19V23H16V24H13Z'
  },
  context: {
    head: 'M8 8H10V5H14V4H22V6H25V16H23V19H11V17H8Z',
    wing: 'M11 18H21V21H19V23H17V25H14V27H10V23H11Z',
    tail: 'M11 23H7V26H5V29H9V27H11V29H14V24Z',
    detail: 'M13 19H19V20H13ZM12 22H17V23H12ZM11 25H14V26H11Z'
  },
  incident: {
    head: 'M9 7H12V3H15V1H17V4H21V5H24V8H25V16H22V18H12V17H9Z',
    wing: 'M12 17H20V20H18V23H16V26H12V23H11V20H12Z',
    tail: 'M12 22H8V26H7V29H10V27H13V24Z',
    detail: 'M14 18H18V20H16V23H14Z'
  },
  risk: {
    head: 'M7 8H9V5H13V3H21V5H24V7H26V15H24V18H10V17H7Z',
    wing: 'M10 18H22V21H20V24H17V26H11V24H9V21H10Z',
    tail: 'M10 23H6V25H3V28H9V27H13V24Z',
    detail: 'M12 19H19V20H17V22H15V24H12Z'
  },
  control: {
    head: 'M8 7H11V4H15V3H20V4H24V7H26V15H24V18H10V17H8Z',
    wing: 'M11 17H21V20H22V23H19V26H12V25H10V22H11Z',
    tail: 'M11 24H7V26H5V29H9V28H12V29H15V25Z',
    detail: 'M13 19H18V21H20V23H17V25H13V23H12V21H13Z'
  }
};

export function createCrowGlyph(kind, mirrored) {
  const shape = silhouettes[kind];
  const svg = svgElement('svg', {viewBox: '0 0 32 32', class: 'crow-glyph', 'aria-hidden': 'true'});
  const facing = svgElement('g', {transform: mirrored ? 'translate(32 0) scale(-1 1)' : ''});
  const tail = svgElement('path', {d: shape.tail, class: 'crow-tail crow-feather'});
  const wing = svgElement('g', {class: 'crow-wing'});
  const head = svgElement('g', {class: 'crow-head'});
  const eyes = svgElement('g', {class: 'crow-eyes'});
  facing.append(tail);
  facing.append(svgElement('path', {d: 'M11 15H21V18H24V22H25V27H22V29H9V27H7V23H9V19H11Z', class: 'crow-body'}));
  wing.append(svgElement('path', {d: shape.wing, class: 'crow-feather'}));
  wing.append(svgElement('path', {d: shape.detail, class: 'crow-detail'}));
  facing.append(wing);
  head.append(svgElement('path', {d: shape.head, class: 'crow-body'}));
  head.append(svgElement('path', {d: 'M9 8H10V13H9ZM10 5H12V6H10Z', class: 'crow-rim'}));
  head.append(svgElement('path', {d: 'M24 12H27V13H29V14H31V16H25V15H23Z', class: 'crow-beak'}));
  head.append(svgElement('path', {d: 'M10 9H18V15H10ZM21 10H25V15H21ZM18 11H21M6 10H10M25 11H28', class: 'crow-glasses'}));
  head.append(svgElement('rect', {x: 5, y: 9, width: 2, height: 2, class: 'crow-terminal'}));
  eyes.append(svgElement('rect', {x: 13, y: 11, width: 3, height: 3}));
  eyes.append(svgElement('rect', {x: 22, y: 12, width: 2, height: 2}));
  head.append(eyes);
  facing.append(head);
  facing.append(svgElement('path', {d: 'M11 29H13V30H9V29ZM20 29H22V30H18V29Z', class: 'crow-feet'}));
  svg.append(facing);
  return {svg, head, eyes, wing, tail};
}
