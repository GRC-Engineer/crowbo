import{J as e,Q as t,S as n,X as r,Y as i,h as a,i as o,v as s,x as c}from"./base-BdcsycC_.js";/* empty css               */import{c as l}from"./pixel-icons-KujJq89b.js";var u=new URL(`01-inspecting-v1-C6nBZCNJ.png`,import.meta.url).href,d=new URL(`02-weighing-v1-DQvOiCE9.png`,import.meta.url).href,f=new URL(`03-challenging-v1-Cj-C1GCm.png`,import.meta.url).href,p=new URL(`04-unresolved-v1-BZRl6N7_.png`,import.meta.url).href,m=new URL(`05-resting-v1-B_ANGr1g.png`,import.meta.url).href,h=new URL(`06-pointing-v1-C-eBihXQ.png`,import.meta.url).href,g=new URL(`07-expressions-v1-wPkxhFVf.png`,import.meta.url).href,_=new URL(`08-size-ladder-v1-Bf2rKgmn.png`,import.meta.url).href,v=new URL(`09-feather-in-beak-v1-DtVvNYGs.png`,import.meta.url).href,y=new URL(`10-pair-v1-WIF_nQ0d.png`,import.meta.url).href,b=new URL(`11-runner-carrying-v1-D3O3zFGW.png`,import.meta.url).href,x=new URL(`12-compact-head-v1-CkGMjjkn.png`,import.meta.url).href,S=t(r(),1),C=i(),w=`/*
 * Crowbo brand tokens. design/BRAND.md owns the four selected colours
 * (chalk, sage, near-black, oxide) and the two supporting values
 * (charcoal, base). Every other step is an interpolation between them.
 *
 * Stylesheets use these names only. tests/brand-tokens.test.mjs fails on a
 * raw colour, a corner radius, a blur or a soft shadow anywhere else.
 */
:root {
  --black: #000000;
  --base: #0c1010;
  --ink-900: #111615;
  --ink: #171b1a;
  --ink-700: #1f2523;
  --line: #29312e;
  --charcoal: #38413c;
  --ink-400: #48524c;
  --slate: #59645e;
  --ink-200: #748579;
  --sage: #91aa9d;
  --muted: #a0aaa3;
  --fog: #bfc6be;
  --chalk-300: #d1d2c5;
  --chalk-200: #e4e6d9;
  --chalk: #f5f3e8;

  --oxide-950: #241b17;
  --oxide-900: #35291e;
  --oxide-700: #785238;
  --oxide-600: #a77453;
  --oxide: #d18a66;
  --oxide-300: #e1a17e;
  --oxide-200: #f1c5aa;

  --background: var(--base);

  --pixel: GeistPixel, monospace;
  --mono: Departure, monospace;
  --display: Bricolage, sans-serif;
  --body: SpaceGrotesk, sans-serif;

  /* One pixel of the interface grid. Corners, offsets and marks step by it. */
  --px: 4px;
  --shadow-hard: var(--px) var(--px) 0
    color-mix(in srgb, var(--black) 55%, transparent);
  --scrim: color-mix(in srgb, var(--base) 88%, transparent);
}

/* Square corners everywhere. The identity is drawn in square pixels. */
*,
*::before,
*::after {
  border-radius: 0;
}

/*
 * Stepped corner for buttons and tags: one grid pixel removed from each
 * corner. clip-path also clips outlines, so these elements draw their focus
 * ring inside the box.
 */
.pixel-corner,
.primary-button,
.ask-primary,
.badge {
  clip-path: polygon(
    0 var(--px),
    var(--px) var(--px),
    var(--px) 0,
    calc(100% - var(--px)) 0,
    calc(100% - var(--px)) var(--px),
    100% var(--px),
    100% calc(100% - var(--px)),
    calc(100% - var(--px)) calc(100% - var(--px)),
    calc(100% - var(--px)) 100%,
    var(--px) 100%,
    var(--px) calc(100% - var(--px)),
    0 calc(100% - var(--px))
  );
}
.pixel-corner:focus-visible,
.primary-button:focus-visible,
.ask-primary:focus-visible {
  outline-offset: -5px;
}
`,T=e();function E({pose:e=`modular`}){return(0,T.jsx)(`img`,{className:`crow`,src:s[e],alt:``,"aria-hidden":`true`,draggable:!1})}var D=Object.assign({"../../crow-concepts/2026-09-29/state-poses/web/01-inspecting-v1.png":u,"../../crow-concepts/2026-09-29/state-poses/web/02-weighing-v1.png":d,"../../crow-concepts/2026-09-29/state-poses/web/03-challenging-v1.png":f,"../../crow-concepts/2026-09-29/state-poses/web/04-unresolved-v1.png":p,"../../crow-concepts/2026-09-29/state-poses/web/05-resting-v1.png":m,"../../crow-concepts/2026-09-29/state-poses/web/06-pointing-v1.png":h,"../../crow-concepts/2026-09-29/state-poses/web/07-expressions-v1.png":g,"../../crow-concepts/2026-09-29/state-poses/web/08-size-ladder-v1.png":_,"../../crow-concepts/2026-09-29/state-poses/web/09-feather-in-beak-v1.png":v,"../../crow-concepts/2026-09-29/state-poses/web/10-pair-v1.png":y,"../../crow-concepts/2026-09-29/state-poses/web/11-runner-carrying-v1.png":b,"../../crow-concepts/2026-09-29/state-poses/web/12-compact-head-v1.png":x}),O={"01-inspecting":{name:`Inspecting`,use:`Reading one source record`},"02-weighing":{name:`Weighing`,use:`Comparing two options`},"03-challenging":{name:`Challenging`,use:`A reviewer disputes a fact`},"04-unresolved":{name:`Unresolved`,use:`Missing evidence, empty states, 404`},"05-resting":{name:`Resting`,use:`Motion paused`},"06-pointing":{name:`Pointing`,use:`The next action`},"12-compact-head":{name:`Compact head`,use:`Inline mark beside a label`},"09-feather-in-beak":{name:`Carrying a feather`,use:`A new source was added`},"07-expressions":{name:`Expressions`,use:`Six head studies`,wide:!0},"08-size-ladder":{name:`Size ladder`,use:`16, 24 and 40 pixel grids`,wide:!0},"10-pair":{name:`Pair`,use:`Owner and reviewer`,wide:!0},"11-runner-carrying":{name:`Runner with a record`,use:`Packet Runner delivering`,wide:!0}},k=[...w.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map(([,e,t])=>({name:e,hex:t.toUpperCase()})),A=new Set([`--chalk`,`--sage`,`--ink`,`--oxide`]),j=new Set([`--base`,`--charcoal`]),M=k.filter(({name:e})=>!e.startsWith(`--oxide`)),N=k.filter(({name:e})=>e.startsWith(`--oxide`)),P=[{family:`var(--pixel)`,name:`Geist Pixel Square`,role:`Wordmark only`,sample:`crowbo`,size:64},{family:`var(--display)`,name:`Bricolage Grotesque`,role:`Headings`,sample:`Test a role that fits the work`,size:34},{family:`var(--body)`,name:`Space Grotesk`,role:`Reading text`,sample:`Keep tickets and own-queue exports. Remove broad administration after the owner reviews the role.`,size:17},{family:`var(--mono)`,name:`Departure Mono`,role:`Labels, versions, source ids`,sample:`DECISION 001 · VERSION 2`,size:12}],F=[[`Small signals. Connected.`,`Records a decision draws on`],[`Decisions, with context.`,`Removed. The heading already says it.`],[`01 / A little perspective`,`Removed. It labelled nothing.`],[`Start with a question. Put the context around it.`,`Pick a prepared security question and see the records behind the recommendation.`],[`Same work. Different tradeoffs.`,`Options for the same work`],[`Twelve shapes. Different kinds of context.`,`Twelve feather shapes, one per kind of source`],[`The original stays. The context grows.`,`Earlier versions stay available.`]];function I({id:e,title:t,note:n,children:r}){return(0,T.jsxs)(`section`,{className:`brand-section`,"aria-labelledby":e,children:[(0,T.jsxs)(`header`,{children:[(0,T.jsx)(`h2`,{id:e,children:t}),(0,T.jsx)(`p`,{children:n})]}),r]})}function L({name:e,hex:t}){let n=A.has(e)?`Selected`:j.has(e)?`Supporting`:`Step`;return(0,T.jsxs)(`li`,{className:`swatch swatch-${n.toLowerCase()}`,children:[(0,T.jsx)(`span`,{className:`swatch-chip`,style:{background:`var(${e})`}}),(0,T.jsx)(`code`,{children:e}),(0,T.jsx)(`span`,{children:t}),(0,T.jsx)(`span`,{className:`swatch-status`,children:n})]})}function R(){return(0,T.jsxs)(`div`,{className:`brand`,children:[(0,T.jsxs)(`header`,{className:`brand-masthead`,children:[(0,T.jsxs)(`div`,{children:[(0,T.jsx)(`a`,{className:`brand-wordmark`,href:`../`,children:`crowbo`}),(0,T.jsx)(`h1`,{children:`Brand system`}),(0,T.jsx)(`p`,{children:`The rules that make a Crowbo page look like Crowbo. Everything here is rendered from the same tokens, icons and artwork the website uses. The brand guide in the repository records what was selected and when.`})]}),(0,T.jsx)(E,{})]}),(0,T.jsx)(I,{id:`characters`,title:`Characters`,note:`Modular Crow is the primary character. Packet Runner is the flying companion. Both were selected on 24 September 2026.`,children:(0,T.jsxs)(`ul`,{className:`character-grid`,children:[(0,T.jsxs)(`li`,{children:[(0,T.jsx)(E,{}),(0,T.jsx)(`strong`,{children:`Modular Crow`}),(0,T.jsx)(`span`,{children:`Opening, landing page, source network`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(E,{pose:`glide`}),(0,T.jsx)(`strong`,{children:`Packet Runner, glide`}),(0,T.jsx)(`span`,{children:`Page headings`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(E,{pose:`up`}),(0,T.jsx)(`strong`,{children:`Packet Runner, up`}),(0,T.jsx)(`span`,{children:`Progress`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(E,{pose:`down`}),(0,T.jsx)(`strong`,{children:`Packet Runner, down`}),(0,T.jsx)(`span`,{children:`End of a list`})]})]})}),(0,T.jsx)(I,{id:`poses`,title:`Crow state poses`,note:`Generated on 29 September 2026 from the approved crow. The grid is approximate, so a pose is redrawn on the native grid before use.`,children:(0,T.jsx)(`ul`,{className:`pose-grid`,children:Object.entries(O).map(([e,t])=>{let n=Object.entries(D).find(([t])=>t.includes(e))?.[1];return(0,T.jsxs)(`li`,{className:t.wide?`pose-wide`:void 0,children:[(0,T.jsx)(`img`,{src:n,alt:`Crow pose: ${t.name}`,loading:`lazy`}),(0,T.jsx)(`strong`,{children:t.name}),(0,T.jsx)(`span`,{children:t.use})]},e)})})}),(0,T.jsxs)(I,{id:`colour`,title:`Colour`,note:`Four selected colours and two supporting values. Every other step sits between them. Near-black carries most of the area, chalk carries reading contrast, sage carries sources and structure, and oxide marks the one thing to act on.`,children:[(0,T.jsxs)(`div`,{className:`proportion`,"aria-label":`Approximate share of area: near-black 70 percent, chalk 15, sage 10, oxide 5`,children:[(0,T.jsx)(`span`,{style:{background:`var(--ink)`,flexGrow:70}}),(0,T.jsx)(`span`,{style:{background:`var(--chalk)`,flexGrow:15}}),(0,T.jsx)(`span`,{style:{background:`var(--sage)`,flexGrow:10}}),(0,T.jsx)(`span`,{style:{background:`var(--oxide)`,flexGrow:5}})]}),(0,T.jsx)(`ul`,{className:`swatches`,children:M.map(e=>(0,T.jsx)(L,{...e},e.name))}),(0,T.jsx)(`ul`,{className:`swatches`,children:N.map(e=>(0,T.jsx)(L,{...e},e.name))})]}),(0,T.jsx)(I,{id:`type`,title:`Type`,note:`Four local typefaces, one job each. One uppercase mono label per block. No text is set below 11 pixels.`,children:(0,T.jsx)(`ul`,{className:`type-list`,children:P.map(e=>(0,T.jsxs)(`li`,{children:[(0,T.jsxs)(`div`,{children:[(0,T.jsx)(`strong`,{children:e.name}),(0,T.jsx)(`span`,{children:e.role})]}),(0,T.jsx)(`p`,{style:{fontFamily:e.family,fontSize:e.size},children:e.sample})]},e.name))})}),(0,T.jsxs)(I,{id:`shape`,title:`Shape`,note:`The crow is drawn in square pixels, so the interface is too. One grid pixel is 4 CSS pixels.`,children:[(0,T.jsxs)(`ul`,{className:`shape-grid`,children:[(0,T.jsxs)(`li`,{children:[(0,T.jsx)(`div`,{className:`shape-demo shape-square`}),(0,T.jsx)(`strong`,{children:`Square corners`}),(0,T.jsx)(`span`,{children:`Panels, inputs, dialogs`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(`div`,{className:`shape-demo shape-stepped pixel-corner`}),(0,T.jsx)(`strong`,{children:`Stepped corner`}),(0,T.jsx)(`span`,{children:`Primary buttons and tags`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(`div`,{className:`shape-demo shape-shadow`}),(0,T.jsx)(`strong`,{children:`Hard shadow`}),(0,T.jsx)(`span`,{children:`Floating layers only`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsxs)(`div`,{className:`shape-demo shape-mark`,children:[(0,T.jsx)(`i`,{}),(0,T.jsx)(`i`,{}),(0,T.jsx)(`i`,{})]}),(0,T.jsx)(`strong`,{children:`Square marks`}),(0,T.jsx)(`span`,{children:`Status, packets, bullets`})]}),(0,T.jsxs)(`li`,{children:[(0,T.jsx)(`div`,{className:`shape-demo shape-wire`}),(0,T.jsx)(`strong`,{children:`Right-angle wires`}),(0,T.jsx)(`span`,{children:`Connections between sources`})]})]}),(0,T.jsx)(`p`,{className:`shape-never`,children:`Not used: rounded corners, circles, blurred shadows, frosted overlays, glow rings, faded grids and gradient fills. A test fails the build if a stylesheet adds one.`})]}),(0,T.jsx)(I,{id:`icons`,title:`Icons`,note:`Thirty-one icons drawn on a 16-unit grid from filled rectangles, so they share the stepped edges of the crow and the feathers.`,children:(0,T.jsx)(`ul`,{className:`icon-grid`,children:Object.entries(l).map(([e,t])=>(0,T.jsxs)(`li`,{children:[(0,T.jsxs)(`span`,{children:[(0,T.jsx)(t,{size:32}),(0,T.jsx)(t,{size:24}),(0,T.jsx)(t,{size:16})]}),(0,T.jsx)(`code`,{children:e})]},e))})}),(0,T.jsx)(I,{id:`feathers`,title:`Feathers`,note:`Twelve feather shapes, one per kind of source. The circuits inside them are drawn, not measured.`,children:(0,T.jsx)(`ul`,{className:`feather-grid`,children:Object.keys(n).map(e=>(0,T.jsxs)(`li`,{children:[(0,T.jsx)(c,{kind:e}),(0,T.jsx)(`strong`,{children:n[e].label}),(0,T.jsx)(`span`,{children:n[e].use})]},e))})}),(0,T.jsx)(I,{id:`components`,title:`Components`,note:`The same classes the demo uses.`,children:(0,T.jsxs)(`div`,{className:`component-row`,children:[(0,T.jsxs)(`button`,{className:`t-primary`,type:`button`,children:[`Take the next step `,(0,T.jsx)(o,{children:`↵`})]}),(0,T.jsxs)(`button`,{className:`t-secondary`,type:`button`,children:[`Compare the options `,(0,T.jsx)(o,{children:`o`})]}),(0,T.jsx)(a,{tone:`oxide`,children:`Deciding`}),(0,T.jsx)(a,{tone:`chalk`,children:`Must hold`}),(0,T.jsx)(a,{children:`Supporting`})]})}),(0,T.jsx)(I,{id:`voice`,title:`Voice`,note:`A line says what the thing is or does. If it could sit unchanged on another product's page, it is cut.`,children:(0,T.jsxs)(`table`,{className:`copy-table`,children:[(0,T.jsx)(`thead`,{children:(0,T.jsxs)(`tr`,{children:[(0,T.jsx)(`th`,{scope:`col`,children:`Before`}),(0,T.jsx)(`th`,{scope:`col`,children:`After`})]})}),(0,T.jsx)(`tbody`,{children:F.map(([e,t])=>(0,T.jsxs)(`tr`,{children:[(0,T.jsx)(`td`,{children:e}),(0,T.jsx)(`td`,{children:t})]},e))})]})}),(0,T.jsxs)(`footer`,{className:`brand-footer`,children:[(0,T.jsx)(`span`,{children:`Unlisted page. Not indexed.`}),(0,T.jsx)(`span`,{children:`Crowbo, 2026`})]})]})}var z=document.getElementById(`root`);if(!z)throw Error(`The Crowbo root element is missing.`);(0,C.createRoot)(z).render((0,T.jsx)(S.StrictMode,{children:(0,T.jsx)(R,{})}));