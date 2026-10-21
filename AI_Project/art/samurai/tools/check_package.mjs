// Acceptance checks for the Samurai package (contract docs/samurai/04_integration_contract.md §1.5).
//   node tools/check_package.mjs   -> prints PASS / FAIL per check, writes renders/check_report.txt, exit code 1 on any FAIL
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { solve, ap, blendPoses, springsOf, stressOf } from '../../shinobi/rig_runtime.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const J = (f) => JSON.parse(readFileSync(join(ROOT, f), 'utf8'));
const rig = J('rig.json'), rigP2 = J('rig_p2.json'), poses = J('poses.json'), walkGen = J('walk.json');
const { SAMURAI: S } = await import(pathToFileURL(join(ROOT, 'samurai.moves.js')).href);
const lines = [];
let fails = 0;
const check = (ok, name, detail = '') => { if (!ok) fails++; lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -- ' + detail : ''}`); };

// ---- rig files
for (const [r, dir] of [[rig, 'parts/'], [rigP2, 'parts/p2/']]) {
  const missing = r.parts.filter((p) => !p.file.startsWith(dir) || !existsSync(join(ROOT, p.file)));
  check(!missing.length, `${r.palette} rig: every part file exists under ${dir}`, missing.map((p) => p.id).join(',') || `${r.parts.length} parts`);
}
check(JSON.stringify(rig.parts.map((p) => [p.id, p.parent, p.pivot, p.zIndex])) === JSON.stringify(rigP2.parts.map((p) => [p.id, p.parent, p.pivot, p.zIndex])), 'rig_p2.json matches rig.json except files');
const SHARED = ['pelvis', 'waist', 'torso_upper', 'neck', 'head_base', 'upper_arm_near', 'upper_arm_far', 'forearm_near', 'forearm_far', 'thigh_near', 'thigh_far', 'shin_boot_near', 'shin_boot_far', 'foot_near', 'foot_far', 'foot_near_side', 'face_neutral', 'face_intense', 'face_hurt', 'hand_near_open', 'hand_far_open', 'hand_near_grip_sword', 'hand_far_grip_sword', 'sword'];
const ids = new Set(rig.parts.map((p) => p.id));
check(SHARED.every((id) => ids.has(id)), 'Shinobi bone names kept', SHARED.filter((id) => !ids.has(id)).join(','));
const NEEDED_ANCHORS = ['sword_tip', 'sword_guard', 'saya_mouth', 'hand_near', 'hand_near_grip', 'hand_far_grip', 'fist_near', 'head', 'chest', 'foot_far_toe', 'foot_near_toe'];
check(NEEDED_ANCHORS.every((a) => rig.anchors[a]), 'required anchors present', NEEDED_ANCHORS.filter((a) => !rig.anchors[a]).join(','));
check(rig.springs && Object.keys(rig.springs).every((id) => ids.has(id)) && springsOf(rig) === rig.springs, 'rig.springs present and used by the shared runtime', `${Object.keys(rig.springs || {}).length} spring bones`);
check(rig.stress && stressOf(rig) === rig.stress, 'rig.stress present and used by the shared runtime', `${Object.keys(rig.stress || {}).length} joints`);
check(rig.attachments.sword.rest === 'saya' && rig.defaultPose.attach.sword === 'saya', 'sword rests in the saya by default');
check(Math.abs(rig.recommendedScale - 0.38) < 0.005, 'recommendedScale ~0.38', `${rig.recommendedScale} -> ${Math.round(rig.height * rig.recommendedScale)} px tall`);

// ---- pose list (contract §1.3)
const REQUIRED = ['stance', 'stance_b', ...Array.from({ length: 8 }, (_, i) => `walk_${i + 1}`), 'dash_start', 'dash', 'dash_end', 'backdash_start', 'backdash', 'backdash_end', 'guard', 'iai_windup', 'iai_slash', 'iai_recover', 'heavy_windup', 'heavy_cleave', 'heavy_follow', 'ult_charge', 'ult_windup', 'ult_release', 'ult_follow', 'ult_flourish', 'hit', 'ko_stagger', 'ko_fall', 'ko_down', 'wakeup'];
const OPTIONAL = ['win', 'select'];
const names = Object.keys(poses).filter((n) => !n.startsWith('_'));
check(REQUIRED.every((n) => poses[n]), 'every contract pose exists', REQUIRED.filter((n) => !poses[n]).join(',') || `${REQUIRED.length} required`);
const extra = names.filter((n) => !REQUIRED.includes(n) && !OPTIONAL.includes(n));
check(!extra.length, 'no poses outside the contract list', extra.join(','));
const FORBIDDEN = /jump|crouch|run|kick|air|throw|kunai|land|sweep/;
check(!names.some((n) => FORBIDDEN.test(n)), 'no jump / crouch / run / kick / air / throw poses');
check(!names.some((n) => poses[n].ground === false), 'no airborne (ground:false) poses', names.filter((n) => poses[n].ground === false).join(','));
check(['backdash_start', 'backdash', 'backdash_end'].every((n) => poses[n].ground !== false), 'back-dash is grounded');
const drawn = names.filter((n) => poses[n].attach?.sword && poses[n].attach.sword !== 'saya');
const DRAWN_EXPECTED = ['iai_slash', 'iai_recover', 'heavy_windup', 'heavy_cleave', 'heavy_follow', 'ult_windup', 'ult_release', 'ult_follow', 'ult_flourish'];
check(JSON.stringify([...drawn].sort()) === JSON.stringify([...DRAWN_EXPECTED].sort()), 'sword drawn exactly in the attack poses (sheathed elsewhere)', drawn.join(','));
const twoHand = ['heavy_windup', 'heavy_cleave', 'heavy_follow'].map((n) => {
  const sol = solve(rig, poses[n]);
  const a = rig.anchors.hand_far_grip, b = rig.anchors.sword_grip2;
  const pa = ap(sol.W[a.part], a.x, a.y), pb = ap(sol.W[b.part], b.x, b.y);
  return [n, Math.hypot(pa[0] - pb[0], pa[1] - pb[1])];
});
check(twoHand.every(([, d]) => d < 3), 'heavy: far hand on the hilt (two-handed grip)', twoHand.map(([n, d]) => `${n} ${d.toFixed(1)}u`).join(', '));
const STRIKES = ['iai_windup', 'iai_slash', 'heavy_windup', 'heavy_cleave', 'heavy_follow', 'ult_charge', 'ult_windup', 'ult_release', 'ult_follow', 'ult_flourish'];
const faceOk = STRIKES.every((n) => poses[n].slots?.face === 'face_intense') && ['hit', 'ko_stagger', 'ko_fall', 'ko_down'].every((n) => poses[n].slots?.face === 'face_hurt');
check(faceOk, 'faces: intense on strikes, hurt on hit / KO');

// ---- grounding: soles on the floor for every standing pose; lying pose on the floor
const soleErr = (n) => {
  const sol = solve(rig, poses[n]);
  const res = {};
  for (const [id, pts] of Object.entries(rig.contacts)) {
    if (!sol.visible[id]) continue;
    const d = pts.map(([x, y]) => y - ap(sol.W[id], x, y)[1]); // + = above its rest ground
    res[id] = [Math.min(...d), Math.max(...d)];
  }
  return res;
};
const lifted = { heavy_windup: 'front foot lifted', dash: 'feet skimming', dash_end: 'heel skid', ko_stagger: '', ko_fall: '', ko_down: '', hit: '', ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`walk_${i + 1}`, 'swing foot'])) };
const groundRows = [];
let lowest = Infinity;
for (const n of names) {
  if (poses[n].groundBy) continue;
  const e = soleErr(n);
  const lo = Math.min(...Object.values(e).map((v) => v[0]));
  lowest = Math.min(lowest, lo);
  const both = Object.values(e).every(([a]) => a < 4);
  groundRows.push(`${n}: ${Object.entries(e).map(([id, [a, b]]) => `${id} ${a.toFixed(1)}..${b.toFixed(1)}`).join('  ')}${both ? '' : '  (one foot up' + (lifted[n] !== undefined ? ': intended)' : ')')}`);
}
check(lowest > -0.5, 'no sole below the floor in any standing pose', `lowest contact ${lowest.toFixed(2)} units`);
const flat = names.filter((n) => !poses[n].groundBy && !(n in lifted)).filter((n) => Object.values(soleErr(n)).some(([a]) => a > 4));
check(!flat.length, 'both soles planted in every grounded pose (except intended lifts)', flat.join(','));
{
  const sol = solve(rig, poses.ko_down);
  let maxBelow = 0;
  for (const id of poses.ko_down.groundBy) {
    const p = rig.parts.find((q) => q.id === id), W = sol.W[id];
    const { x, y } = p.offset, { w, h } = p.size;
    for (const [cx, cy] of [[x + w * 0.2, y + h * 0.2], [x + w * 0.8, y + h * 0.2], [x + w * 0.2, y + h * 0.8], [x + w * 0.8, y + h * 0.8]]) maxBelow = Math.max(maxBelow, ap(W, cx, cy)[1] - rig.groundY);
  }
  check(maxBelow < 1, 'ko_down lies on the floor line (groundBy parts)', `deepest body point ${maxBelow.toFixed(1)} below`);
}

// ---- walk: steps match the generator; planted foot does not slide during the distance blend
const rot = (a) => [a[a.length - 1], ...a.slice(0, -1)];
check(JSON.stringify(S.walk.steps) === JSON.stringify(rot(walkGen.steps)), 'walk.steps match the generated keys (animator order)', S.walk.steps.join(', '));
check(JSON.stringify(S.walk.poses) === JSON.stringify(walkGen.poses), 'walk.poses = walk_1..walk_8');
{
  // the animator blends key i-1 -> key i over steps[i] while the fighter moves forward; the planted foot's world x
  // (root x + foot x) should stay fixed through the blend
  let worst = 0;
  const K = S.walk.poses, st = S.walk.steps;
  for (let i = 0; i < K.length; i++) {
    const a = poses[K[(i + K.length - 1) % K.length]], b = poses[K[i]];
    // the foot planted during key (i-1) -> i is key (i-1)'s stance foot: the far leg leads walk_1..4, the near leg walk_5..8
    const id = (i + K.length - 1) % K.length < 4 ? 'foot_far' : 'foot_near_side';
    let x0 = null;
    for (let k = 0; k <= 10; k++) {
      const u = k / 10, sol = solve(rig, blendPoses(a, b, u));
      const pts = rig.contacts[id], [cx, cy] = pts[2];
      const wx = ap(sol.W[id], cx, cy)[0] + u * st[i];
      if (x0 === null) x0 = wx; else worst = Math.max(worst, Math.abs(wx - x0));
    }
  }
  check(worst < 12, 'walk: planted-foot slide during key blends', `max ${worst.toFixed(1)} units (${(worst * rig.recommendedScale).toFixed(1)} px at game size)`);
}

// ---- samurai.moves.js
const used = new Set();
const walkFrames = (fr) => fr.forEach((f) => used.add(f.pose));
Object.values(S.anims).forEach((a) => walkFrames(a.frames));
Object.values(S.moves).forEach((m) => { walkFrames(m.frames); if (m.flash) walkFrames(m.flash); if (m.arc) { used.add(m.arc.from); used.add(m.arc.to); } });
S.walk.poses.forEach((p) => used.add(p));
const missingPoses = [...used].filter((p) => !poses[p]);
check(!missingPoses.length, 'every pose name used in samurai.moves.js exists in poses.json', missingPoses.join(',') || `${used.size} names`);
check(S.can.jump === false && S.can.crouch === false && S.can.run === false, 'can: no jump / crouch / run');
const totalOf = (a) => a.frames.reduce((s, f) => s + f.hold, 0);
check(totalOf(S.anims.dash) === S.phys.dashTotal && totalOf(S.anims.backdash) === S.phys.backdashTotal, 'dash / backdash animation lengths match phys totals', `${totalOf(S.anims.dash)} / ${totalOf(S.anims.backdash)}`);
const L = S.moves.light, H = S.moves.heavy, U = S.moves.ult;
check(L.total === 29 && JSON.stringify(L.active) === '[7,12]' && L.dmg === 90 && L.level === 'mid', 'light: 29 frames, active 7-12, 90 dmg, mid');
check(H.total === 46 && JSON.stringify(H.active) === '[16,22]' && H.dmg === 210 && H.level === 'overhead' && H.knockdown && H.chip === 0.25, 'heavy: 46 frames, active 16-22, 210 dmg, overhead, knockdown, chip 0.25');
check(U.ult && U.cost === 100 && U.projectile.dmg === 500 && U.projectile.chip >= 150 && U.projectile.chip <= 200 && !U.invuln, 'ultimate: 500 unblocked, 150-200 blocked, no invulnerability', `chip ${U.projectile.chip}`);
const measured = J('renders/boxes.json');
for (const k of ['light', 'heavy']) check(JSON.stringify(measured[k].box) === JSON.stringify(S.moves[k].box), `${k} box equals the anchor measurement (tools/measure_boxes.mjs)`, JSON.stringify(S.moves[k].box));

const report = [...lines, '', 'sole contact per standing pose (units above the floor, min..max per foot):', ...groundRows].join('\n');
writeFileSync(join(ROOT, 'renders/check_report.txt'), report + '\n');
console.log(lines.join('\n'));
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall checks passed');
process.exit(fails ? 1 : 0);
