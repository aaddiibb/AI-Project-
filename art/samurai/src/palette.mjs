// Palette tokens: the ONLY place colors are defined. Art references these via classes
// f-<token> (fill) and s-<token> (stroke). Rebuild with another palette for P2 / alternates.

export const PALETTES = {
  default: {
    ink: '#0a0a10',
    far: '#0b0b16', // overlay for far-side limbs (used at reduced opacity)
    // skin
    // skin + hair sampled from the raster face sheet (docs/samurai/face_expr.png) so the vector neck, hands and ponytail match it
    skin: '#e8c7b2', skin_sh: '#c99f8b', skin_sh2: '#a97f6e', skin_hi: '#f6dccb', lip: '#b47868', scar: '#b9786a',
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
    hair: '#d2d3d5', hair_sh: '#a2a3a7', hair_sh2: '#6f7075', hair_hi: '#f2f2f3',
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

// Alternate 3 (oxblood): deep wine-red kimono, black inner layer and obi, silver accents
PALETTES.p3 = {
  ...PALETTES.default,
  cloth: '#4a1720', cloth_sh: '#2b0a11', cloth_mid: '#5a1d28', cloth_hi: '#73303c', cloth_rim: '#9a4a56',
  inner: '#24242c', inner_sh: '#15151b', inner_hi: '#3a3a46',
  obi: '#1d1d25', obi_sh: '#101016', obi_hi: '#383845',
  red: '#cfd0d8', red_sh: '#8f909c', red_hi: '#ffffff',
  cord: '#cfd0d8', cord_hi: '#ffffff',
  iris: '#a83040', iris_dk: '#3a0d14', iris_hi: '#e88a96',
};

// Alternate 4 (ivory): white kimono and hakama, crimson obi, jet-black hair
PALETTES.p4 = {
  ...PALETTES.default,
  cloth: '#ddd6c4', cloth_sh: '#ada38c', cloth_mid: '#cec5b0', cloth_hi: '#f1ecdf', cloth_rim: '#ffffff',
  inner: '#2b2b33', inner_sh: '#1a1a20', inner_hi: '#44444f',
  obi: '#8f1d2c', obi_sh: '#5a0f1a', obi_hi: '#b8384a',
  wrap: '#cfc7b3', wrap_sh: '#9f9682', wrap_hi: '#ece6d6',
  hair: '#1c1c24', hair_sh: '#0e0e14', hair_sh2: '#060609', hair_hi: '#45455a',
  cord: '#8f1d2c', cord_hi: '#b8384a',
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
