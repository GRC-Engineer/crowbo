import {svgElement} from './crow-glyphs.js';

// new URL(..., import.meta.url) lets Vite bundle and hash these sprite sheets.
const sheets = [
  new URL('../../homepage-mockups/2026-09-21/assets/crowbo-feathers-topology-modular-v1.png', import.meta.url).href,
  new URL('../../homepage-mockups/2026-09-21/assets/crowbo-feathers-infrastructure-modular-v1.png', import.meta.url).href
];
const designs = {spine: 0, branch: 1, mesh: 2, loop: 3, braid: 4, cluster: 5, object: 6, column: 7, vector: 8, merge: 9, series: 10, shard: 11};

export function createFeatherGlyph(kind) {
  const tile = designs[kind];
  const svg = svgElement('svg', {viewBox: '48 -8 448 496', class: 'feather-glyph', 'aria-hidden': 'true'});
  const clipId = `feather-crop-${kind}`;
  const clip = svgElement('clipPath', {id: clipId});
  // Keep the complete quill while excluding the concept sheet's printed label.
  clip.append(svgElement('path', {d: 'M0 0H512V446H180V474H0Z'}));
  const defs = svgElement('defs');
  defs.append(clip);
  const vane = svgElement('g', {class: 'feather-vane'});
  vane.append(svgElement('image', {
    href: sheets[Math.floor(tile / 6)],
    x: -(tile % 3) * 512,
    y: -Math.floor(tile % 6 / 3) * 512,
    width: 1536,
    height: 1024,
    'clip-path': `url(#${clipId})`
  }));
  svg.append(defs, vane);
  return {svg, vane, name: kind[0].toUpperCase() + kind.slice(1)};
}
