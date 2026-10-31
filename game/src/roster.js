// Front-end roster data (character select, VS screen): titles, sheet art and the colour schemes. UI ONLY: the sim and
// the agents never read this. Each palette is a full rig build (art/<char>/tools/split.mjs --palette pN, faces from
// art/faces/build_palettes.py); `sw` are the swatch colours shown on the select screen (main cloth, accent, hair).
export const ROSTER = {
  samurai: {
    name: 'SAMURAI', title: 'RONIN · HEAVY DUELIST', kanji: '侍',
    face: 'assets/ui/samurai_face.png', full: 'assets/ui/samurai_full.png',
    blurb: 'Patient iaido swordsman. Huge reach, parries kunai, punishes every whiff. Cannot jump.',
    style: [['POWER', 5], ['SPEED', 2], ['REACH', 5], ['MOBILITY', 1]],
    palettes: [
      { id: 'p1', label: 'Charcoal', rig: 'art/samurai/rig.json', sw: ['#26262f', '#8f1d2c', '#d2d3d5'] },
      { id: 'p2', label: 'Indigo', rig: 'art/samurai/rig_p2.json', sw: ['#232a4c', '#c8962e', '#e6dfcb'] },
      { id: 'p3', label: 'Oxblood', rig: 'art/samurai/rig_p3.json', sw: ['#4a1720', '#cfd0d8', '#24242c'] },
      { id: 'p4', label: 'Ivory', rig: 'art/samurai/rig_p4.json', sw: ['#ddd6c4', '#8f1d2c', '#1c1c24'] },
    ],
  },
  shinobi: {
    name: 'SHINOBI', title: 'ASSASSIN · FRONTLINE FIGHTER', kanji: '忍',
    face: 'assets/ui/shinobi_portrait.png', full: 'assets/ui/shinobi_full.png',
    blurb: 'Fast and slippery. Jumps, runs, throws kunai and swaps places with a log. Shadow-clone ultimate.',
    style: [['POWER', 2], ['SPEED', 5], ['REACH', 2], ['MOBILITY', 5]],
    palettes: [
      { id: 'p1', label: 'Midnight', rig: 'art/shinobi/rig.json', sw: ['#221f2d', '#a8232f', '#2a2846'] },
      { id: 'p2', label: 'Plum', rig: 'art/shinobi/rig_p2.json', sw: ['#3d2340', '#c8962e', '#c9c9d6'] },
      { id: 'p3', label: 'Jade', rig: 'art/shinobi/rig_p3.json', sw: ['#1f2a27', '#2f9a6e', '#4a2620'] },
      { id: 'p4', label: 'Snow', rig: 'art/shinobi/rig_p4.json', sw: ['#d4d6e0', '#3b6fd1', '#141420'] },
    ],
  },
};
export const ROSTER_ORDER = ['samurai', 'shinobi'];

/** the rig file of a character in palette `i` (default: P1 = 0, P2 = 1, the old fixed mirror palettes) */
export const paletteRig = (id, i) => ROSTER[id].palettes[i ?? 0].rig;
