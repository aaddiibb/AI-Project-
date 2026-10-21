// Close-ups of the most stressed joints at extreme rotation (gap check). node tools/joint_check.mjs -> renders/joint_closeups.png
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
import { solve, mul, T, ap } from '../../shinobi/rig_runtime.js';
import { fileURLToPath } from 'node:url';
const R = fileURLToPath(new URL('..', import.meta.url));
const rig=JSON.parse(readFileSync(R+'rig.json','utf8'));
const png=Object.fromEntries(rig.parts.map(p=>[p.id,'data:image/png;base64,'+readFileSync(R+'renders/parts/'+p.id+'.png').toString('base64')]));
const DRAWN={attach:{sword:'hand_near_grip_sword'},slots:{hand_near:'hand_near_grip_sword',hand_far:'hand_far_grip_sword'}};
// extremes of walk / guard / iai strike / overhead cleave (the stress ranges in rig.stress)
const bendy={rot:{upper_arm_near:-80,forearm_near:-130,upper_arm_far:-60,forearm_far:-110,thigh_near:-70,shin_boot_near:100,thigh_far:45,shin_boot_far:100,foot_far:30,foot_near:-30,torso_upper:24,head_base:18},slots:{hand_near:'hand_near_fist',hand_far:'hand_far_fist'}};
const reach={...DRAWN,rot:{upper_arm_near:-165,forearm_near:0,upper_arm_far:-120,forearm_far:40,thigh_near:45,thigh_far:-70,waist:-10,torso_upper:-18,head_base:-20}};
function tile(pose, part, half=110){
  const sol=solve(rig,pose,{springs:{}});
  const p=rig.parts.find(q=>q.id===part); const [cx,cy]=ap(sol.W[part],p.pivot.x,p.pivot.y);
  const items=rig.parts.filter(q=>sol.visible[q.id]).map(q=>({q,z:sol.zOverride[q.id]??q.zIndex,m:mul(sol.W[q.id],T(q.offset.x,q.offset.y))})).sort((a,b)=>a.z-b.z);
  const body=items.map(({q,m})=>`<image href="${png[q.id]}" width="${q.size.w}" height="${q.size.h}" transform="matrix(${m.map(v=>+v.toFixed(4)).join(' ')})"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${cx-half} ${cy-half} ${half*2} ${half*2}"><rect x="${cx-half}" y="${cy-half}" width="${half*2}" height="${half*2}" fill="#eef3f2"/>${body}<circle cx="${cx}" cy="${cy}" r="2.5" fill="#ff2d6a"/></svg>`;
}
const list=[[bendy,'shin_boot_near'],[bendy,'shin_boot_far'],[bendy,'forearm_near'],[reach,'upper_arm_near'],[reach,'upper_arm_far'],[bendy,'thigh_near'],[reach,'thigh_far'],[bendy,'foot_far'],[reach,'head_base'],[bendy,'neck'],[reach,'waist'],[bendy,'hand_near_fist']];
const tiles=list.map(([po,id])=>new Resvg(tile(po,id),{fitTo:{mode:'width',value:360}}).render().asPng());
const sheet=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 1080">${tiles.map((b,i)=>`<image href="data:image/png;base64,${b.toString('base64')}" x="${(i%4)*360}" y="${Math.floor(i/4)*360}" width="360" height="360"/><text x="${(i%4)*360+8}" y="${Math.floor(i/4)*360+22}" font-family="Arial" font-size="16" fill="#333">${list[i][1]}</text>`).join('')}</svg>`;
writeFileSync(R+'renders/joint_closeups.png',new Resvg(sheet,{fitTo:{mode:'width',value:1440},font:{loadSystemFonts:true}}).render().asPng());
console.log('ok');
