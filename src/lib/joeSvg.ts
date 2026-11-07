// Mister Joe, the mascot: an original, slightly doofy everyday guy in a red ball cap.
// One drawing feeds both the in-app mascot (MisterJoe.tsx) and the app icons
// (scripts/make-icons.mjs), so they always match.
//
// Style: a stop-motion clay figure. No outlines; every piece is a sculpted lump
// with soft light from the top left, a matte grain, slightly wobbly hand-made
// edges and soft contact shadows. The doofy part: sleepy heavy eyelids, a big
// putty nose, ears that stick out, two buck teeth and a crooked cap.

export type JoeMood = "idle" | "listening" | "thinking" | "happy";

/** Height / width of the plain (non-tile) drawing. */
export const JOE_ASPECT = 150 / 142;

const HEAD =
  "M52 106 C52 78 73 64 100 64 C127 64 148 78 148 106 L148 128 C148 160 127 181 100 181 C73 181 52 160 52 128 Z";
const CROWN = "M47 104 C46 64 70 45 100 45 C130 45 154 64 153 104 Z";
const BILL = "M46 98 Q100 86 154 98 Q158 104 150 108.5 Q100 120 50 108.5 Q42 104 46 98 Z";
const CAP_TILT = "rotate(-4 100 96)";

// Unique ids so several Joes on one page never share gradients or filters.
let uid = 0;

function defs(id: string): string {
  const radial = (name: string, stops: [number, string][], cx: number, cy: number, r: number) =>
    `<radialGradient id="${id}${name}" cx="${cx}" cy="${cy}" r="${r}">${stops
      .map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`)
      .join("")}</radialGradient>`;
  return `<defs>
    ${radial("skin", [[0, "#ffd9b8"], [0.55, "#f5b68f"], [1, "#d68662"]], 0.4, 0.3, 0.8)}
    ${radial("ear", [[0, "#fbc7a2"], [1, "#d07f5c"]], 0.35, 0.35, 0.8)}
    ${radial("nose", [[0, "#ffd0ae"], [0.6, "#eea07a"], [1, "#c9764f"]], 0.35, 0.28, 0.75)}
    ${radial("cap", [[0, "#ff7b57"], [0.5, "#e2492e"], [1, "#a32915"]], 0.36, 0.28, 0.85)}
    ${radial("eye", [[0, "#ffffff"], [0.65, "#f3ede6"], [1, "#cdc3b8"]], 0.38, 0.32, 0.8)}
    ${radial("mouth", [[0, "#73282a"], [1, "#2a0c0f"]], 0.5, 0.25, 0.9)}
    ${radial("lid", [[0, "#fcc8a3"], [1, "#e19c77"]], 0.4, 0.2, 0.9)}
    <linearGradient id="${id}bill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ea5333"/><stop offset="1" stop-color="#a42a15"/></linearGradient>
    <linearGradient id="${id}tooth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e4d9cb"/></linearGradient>
    <linearGradient id="${id}jaw" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#8a5a48" stop-opacity="0"/><stop offset="1" stop-color="#8a5a48" stop-opacity="0.32"/></linearGradient>
    <filter id="${id}clay" x="-8%" y="-8%" width="116%" height="116%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="wob"/>
      <feDisplacementMap in="SourceGraphic" in2="wob" scale="2.6" xChannelSelector="R" yChannelSelector="G" result="shape"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.15" numOctaves="2" seed="3" result="noise"/>
      <feColorMatrix in="noise" type="matrix" values="0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0.33 0.33 0.33 0 0  0 0 0 0 1" result="grain"/>
      <feComposite in="shape" in2="grain" operator="arithmetic" k1="0" k2="1" k3="0.13" k4="-0.065" result="grainy"/>
      <feComposite in="grainy" in2="shape" operator="in"/>
    </filter>
    <filter id="${id}sh" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="2.2" stdDeviation="1.8" flood-color="#5b2414" flood-opacity="0.38"/>
    </filter>
    <filter id="${id}big" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="4" stdDeviation="3.5" flood-color="#1a1014" flood-opacity="0.35"/>
    </filter>
  </defs>`;
}

function brows(mood: JoeMood, id: string): string {
  const [left, right] = {
    idle: ["M68 123Q77 118 86 121", "M114 120Q123 115 132 119"],
    listening: ["M68 121Q77 115 86 118", "M114 118Q123 112 132 116"],
    thinking: ["M68 125Q77 123 86 124", "M114 119Q123 113 132 117"],
    happy: ["M68 122Q77 116 86 120", "M114 120Q123 115 132 120"],
  }[mood];
  const roll = (d: string) =>
    `<path d="${d}" fill="none" stroke="#4e3122" stroke-width="6.5" stroke-linecap="round"/>
     <path d="${d}" transform="translate(-0.6 -1.4)" fill="none" stroke="#7a5038" stroke-width="2.2" stroke-linecap="round" opacity="0.8"/>`;
  return `<g filter="url(#${id}sh)">${roll(left)}${roll(right)}</g>`;
}

function eyes(mood: JoeMood, id: string): string {
  // Lid line per eye: lower numbers mean more open.
  const lids: Record<JoeMood, [number, number]> = {
    idle: [134.5, 134],
    listening: [129.5, 129],
    thinking: [131.5, 133.5],
    happy: [135.5, 135.5],
  };
  const [pdx, pdy] = mood === "thinking" ? [3, -2.5] : mood === "listening" ? [0, 0.5] : [0.5, 1.5];
  const pr = mood === "listening" ? 4 : 3.5;
  const one = (cx: number, lidY: number, n: number) => `
    <clipPath id="${id}e${n}"><ellipse cx="${cx}" cy="138" rx="9.2" ry="10"/></clipPath>
    <ellipse cx="${cx}" cy="138" rx="9.2" ry="10" fill="url(#${id}eye)" filter="url(#${id}sh)"/>
    <g clip-path="url(#${id}e${n})">
      <circle cx="${cx + pdx}" cy="${138 + pdy}" r="${pr}" fill="#1c1a20"/>
      <circle cx="${cx + pdx + 1.3}" cy="${138 + pdy - 1.4}" r="1.2" fill="#ffffff"/>
      <path d="M${cx - 12} 120 L${cx + 12} 120 L${cx + 12} ${lidY} Q${cx} ${lidY + 3.5} ${cx - 12} ${lidY} Z" fill="url(#${id}lid)" filter="url(#${id}sh)"/>
      <path d="M${cx - 12} ${lidY} Q${cx} ${lidY + 3.5} ${cx + 12} ${lidY}" fill="none" stroke="#c97e5c" stroke-width="1.6"/>
    </g>`;
  return `<g class="joe-eyes">${one(80, lids[mood][0], 1)}${one(120, lids[mood][1], 2)}</g>`;
}

function mouth(mood: JoeMood, id: string): string {
  if (mood === "thinking") {
    const d = "M89 166Q97 162 104 165.5Q109 168 113 163";
    return `<path d="${d}" fill="none" stroke="#a85a46" stroke-width="5" stroke-linecap="round"/>
      <path d="${d}" transform="translate(0 -1.2)" fill="none" stroke="#e39a7c" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>`;
  }
  const shape =
    mood === "listening"
      ? `<ellipse cx="100" cy="168" rx="6.5" ry="7.5"/>`
      : mood === "happy"
        ? `<path d="M76 158Q100 166 124 156Q121 181 100 181Q80 181 76 158Z"/>`
        : `<path d="M80 161Q100 167 120 159Q117 177 100 177Q83 177 80 161Z"/>`;
  const h = mood === "happy" ? 9.5 : 8.5;
  const teeth =
    mood === "listening"
      ? ""
      : `<rect x="93.2" y="160" width="6.4" height="${h}" rx="2" fill="url(#${id}tooth)"/>
         <rect x="100.4" y="160" width="6.4" height="${h}" rx="2" fill="url(#${id}tooth)"/>`;
  const tongueY = mood === "happy" ? 182 : mood === "listening" ? 175 : 178;
  return `<clipPath id="${id}m">${shape}</clipPath>
    <g fill="#c9775f" transform="translate(0 0.8)">${shape}</g>
    <g fill="url(#${id}mouth)">${shape}</g>
    <g clip-path="url(#${id}m)">
      <ellipse cx="100" cy="${tongueY}" rx="${mood === "listening" ? 5 : 10}" ry="6.5" fill="#d9675a"/>
      <g filter="url(#${id}sh)">${teeth}</g>
    </g>`;
}

function cap(id: string): string {
  return `<g transform="${CAP_TILT}" filter="url(#${id}big)">
    <path d="${CROWN}" fill="url(#${id}cap)"/>
    <path d="M100 48 C89 60 83 78 82 98 M100 48 C111 60 117 78 118 98" fill="none" stroke="#a42c17" stroke-width="1.8" stroke-linecap="round"/>
    <path d="M101.3 48.5 C90.5 60.5 84.5 78 83.4 98 M101.3 48.5 C112.4 60.5 118.4 78 119.4 98" fill="none" stroke="#ff8b6a" stroke-width="1" stroke-linecap="round" opacity="0.45"/>
    <g filter="url(#${id}sh)">
      <path d="M105.5 60 L105.5 73 Q105.5 80 99 80 Q94.5 80 93 76" fill="none" stroke="#f6e6d6" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="100" cy="46.5" r="5" fill="url(#${id}cap)"/>
    </g>
    <path d="M104.6 61 L104.6 72.5" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.7"/>
    <path transform="translate(0 3.5)" d="${BILL}" fill="#7a2010"/>
    <path d="${BILL}" fill="url(#${id}bill)"/>
    <path d="M54 101 Q100 91 146 101" fill="none" stroke="#ff8a68" stroke-width="1.6" stroke-linecap="round" opacity="0.5"/>
  </g>`;
}

/** The face, drawn in a 200x200 box. */
function face(mood: JoeMood): string {
  const id = `joe${++uid}`;
  return `${defs(id)}
  <clipPath id="${id}f"><path d="${HEAD}"/></clipPath>
  <g filter="url(#${id}clay)">
    <g filter="url(#${id}sh)">
      <ellipse cx="47" cy="128" rx="10" ry="13" fill="url(#${id}ear)"/>
      <ellipse cx="153" cy="128" rx="10" ry="13" fill="url(#${id}ear)"/>
    </g>
    <ellipse cx="48.5" cy="129" rx="4.5" ry="7.5" fill="#c4704e" opacity="0.55"/>
    <ellipse cx="151.5" cy="129" rx="4.5" ry="7.5" fill="#c4704e" opacity="0.55"/>
    <path d="${HEAD}" fill="url(#${id}skin)" filter="url(#${id}big)"/>
    <g clip-path="url(#${id}f)">
      <path d="${HEAD}" fill="url(#${id}jaw)"/>
      <path d="M52 104 L64 104 Q61 114 59.5 123 Q55 119 52 113 Z" fill="#4e3122"/>
      <path d="M148 104 L136 104 Q139 114 140.5 123 Q145 119 148 113 Z" fill="#4e3122"/>
      <ellipse cx="68" cy="157" rx="10" ry="6.5" fill="#ff8a76" opacity="0.32"/>
      <ellipse cx="132" cy="157" rx="10" ry="6.5" fill="#ff8a76" opacity="0.32"/>
    </g>
    ${brows(mood, id)}
    ${eyes(mood, id)}
    <path d="M100 141 C108.5 141 112 147 111.5 152.5 C111 158.5 106 160.5 100 160.5 C94 160.5 89 158.5 88.5 152.5 C88 147 91.5 141 100 141 Z" fill="url(#${id}nose)" filter="url(#${id}sh)"/>
    <ellipse cx="96.5" cy="147" rx="3" ry="2" fill="#ffffff" opacity="0.45"/>
    ${mouth(mood, id)}
    ${cap(id)}
  </g>`;
}

/**
 * Full SVG markup. `tile` draws the app-icon background on Apple's icon grid
 * (an 80% rounded square with margin) and fits Joe inside it.
 */
export function joeSvg(mood: JoeMood = "idle", opts: { tile?: boolean; title?: string } = {}): string {
  const title = opts.title ?? "Mister Joe";
  if (!opts.tile) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="29 37 142 150" role="img" aria-label="${title}"><title>${title}</title>${face(mood)}</svg>`;
  }
  const id = `tile${++uid}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img" aria-label="${title}"><title>${title}</title>
    <defs>
      <radialGradient id="${id}g" cx="0.5" cy="0.4" r="0.75">
        <stop offset="0" stop-color="#4a4954"/>
        <stop offset="1" stop-color="#1f1e25"/>
      </radialGradient>
      <filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <rect x="19.5" y="19.5" width="161" height="161" rx="36" fill="url(#${id}g)"/>
    <ellipse cx="100" cy="171" rx="48" ry="6" fill="#000000" opacity="0.35" filter="url(#${id}b)"/>
    <rect x="20.25" y="20.25" width="159.5" height="159.5" rx="35.25" fill="none" stroke="#ffffff" stroke-opacity="0.08" stroke-width="1.5"/>
    <g transform="translate(100 101) scale(0.95) translate(-100 -112)">${face(mood)}</g>
  </svg>`;
}
