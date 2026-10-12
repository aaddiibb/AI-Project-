// Palette tokens: the ONLY place colors are defined. Art references these via classes
// f-<token> (fill) and s-<token> (stroke). Rebuild with another palette for P2 / alternates.

export const PALETTES = {
  default: {
    ink: '#0b0a12',
    far: '#140f26', // overlay for far-side limbs (used at reduced opacity)
    // skin
    skin: '#f3cdb4', skin_sh: '#dc9f89', skin_sh2: '#b8786b', skin_hi: '#fde9db', lip: '#c9847a', blush: '#eeb5a0',
    // black cloth (top, shorts, gloves, boots)
    cloth: '#221f2d', cloth_sh: '#131220', cloth_mid: '#2e2b3e', cloth_hi: '#45425e', cloth_rim: '#5b6196',
    // stockings
    stock: '#272029', stock_sh: '#151117', stock_hi: '#4f4250', stock_br: '#6e5e6c',
    // indigo half-skirt
    indigo: '#2a2846', indigo_sh: '#18172d', indigo_hi: '#34406f', indigo_br: '#4a5a9a', emb: '#6a1f35',
    // crimson accents
    red: '#a8232f', red_sh: '#6a1420', red_hi: '#d6464e',
    // leather
    leather: '#4c3429', leather_sh: '#2b1d17', leather_hi: '#7d5844',
    // metal
    metal: '#7a7a85', metal_sh: '#44444f', metal_hi: '#b5b5bd', metal_br: '#eef0f6',
    // hair
    hair: '#24213a', hair_sh: '#110f1d', hair_hi: '#3e3c74', hair_br: '#7c78b8',
    // eyes
    sclera: '#f6f1ef', iris: '#7a73a0', iris_dk: '#2f2a4a', iris_hi: '#b9b3d6',
    // boot soles
    sole: '#6d5a4b', sole_sh: '#45382f',
  },
};

// Player-2 alternate: crimson -> gold accents, indigo -> plum, silver hair
PALETTES.p2 = {
  ...PALETTES.default,
  red: '#c8962e', red_sh: '#7d5b17', red_hi: '#efc760',
  indigo: '#3d2340', indigo_sh: '#24132a', indigo_hi: '#7a3f6e', emb: '#c8962e',
  hair: '#c9c9d6', hair_sh: '#8d8da4', hair_hi: '#ececf4', hair_br: '#ffffff',
  iris: '#c8962e', iris_dk: '#5a3f12', iris_hi: '#f3d48a',
};

export function styleBlock(p) {
  const rules = Object.entries(p).map(([k, v]) => `.f-${k}{fill:${v}}.s-${k}{fill:none;stroke:${v}}`).join('');
  return (
    rules +
    `.f-far{fill:${p.far};fill-opacity:.26}` +
    `.ol,.ln{fill:none;stroke:${p.ink};stroke-linejoin:round;stroke-linecap:round}` +
    `.olf{stroke:${p.ink};stroke-linejoin:round;stroke-linecap:round}`
  );
}
