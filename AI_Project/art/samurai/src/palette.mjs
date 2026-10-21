// Palette tokens: the ONLY place colors are defined. Art references these via classes
// f-<token> (fill) and s-<token> (stroke). Rebuild with another palette for P2 / alternates.

export const PALETTES = {
  default: {
    ink: '#0a0a10',
    far: '#0b0b16', // overlay for far-side limbs (used at reduced opacity)
    // skin
    skin: '#efc8ad', skin_sh: '#d09a80', skin_sh2: '#a26c5c', skin_hi: '#fbe2d0', lip: '#b47868', scar: '#b9786a',
    // near-black charcoal cloth (kimono, haori, hakama)
    cloth: '#26262f', cloth_sh: '#14141c', cloth_mid: '#2f2f3a', cloth_hi: '#3b3b48', cloth_rim: '#565668',
    // dark grey (inner kimono layer, obi)
    inner: '#6e6e78', inner_sh: '#4c4c56', inner_hi: '#8e8e9a',
    obi: '#4a4a54', obi_sh: '#33333c', obi_hi: '#64646f',
    // black wraps (wrists, shins, tabi)
    wrap: '#1d1d25', wrap_sh: '#101016', wrap_hi: '#383845',
    // crimson accents
    red: '#8f1d2c', red_sh: '#5a0f1a', red_hi: '#b8384a',
    // silver-white hair
    hair: '#e6e6ee', hair_sh: '#b3b3c3', hair_sh2: '#86869a', hair_hi: '#ffffff',
    // dark hair cord
    cord: '#3a2724', cord_hi: '#64443c',
    // steel blade
    steel: '#b8bdc8', steel_sh: '#7b808d', steel_hi: '#eef1f7', hamon: '#ffffff',
    // bronze fittings
    bronze: '#8a6a3a', bronze_sh: '#5a4322', bronze_hi: '#c39d5e',
    // black lacquer (saya)
    lacq: '#121218', lacq_hi: '#40404f',
    // ray-skin diamonds under the hilt wrap
    same: '#d6d0bd',
    // straw sandals
    straw: '#b29863', straw_sh: '#7c6740',
    // eyes
    sclera: '#f1efec', iris: '#80838f', iris_dk: '#2b2d35', iris_hi: '#c9ccd6',
  },
};

// Player-2 alternate: deep indigo-navy cloth, ivory inner layer / obi, gold accents, black hair
PALETTES.p2 = {
  ...PALETTES.default,
  cloth: '#232a4c', cloth_sh: '#131833', cloth_mid: '#2b3358', cloth_hi: '#384574', cloth_rim: '#5a6aa6',
  inner: '#e6dfcb', inner_sh: '#b9b09a', inner_hi: '#f8f4e8',
  obi: '#d9d0b8', obi_sh: '#aaa18a', obi_hi: '#f2ecdc',
  wrap: '#1c2240', wrap_sh: '#10142a', wrap_hi: '#34406c',
  red: '#c8962e', red_sh: '#80601a', red_hi: '#efc966',
  hair: '#24242e', hair_sh: '#121218', hair_sh2: '#0a0a10', hair_hi: '#50506a',
  cord: '#c8962e', cord_hi: '#efc966',
  bronze: '#c8962e', bronze_sh: '#80601a', bronze_hi: '#f0cc6c',
  lacq: '#141a33', lacq_hi: '#3e4a7c',
  iris: '#8a6a3a', iris_dk: '#3a2a12', iris_hi: '#e0c48a',
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
