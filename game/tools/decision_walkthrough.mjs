// Trace existing controllers without modifying production game behavior.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {Match,AgentController,ReplayController} from '../src/ai/match.js';
import {makeAgent} from '../src/ai/registry.js';
import {getChar} from '../src/characters/index.js';
import {BTN} from '../src/sim.js';
import {terms,evaluate} from '../src/ai/eval.js';
import {features,phase} from '../src/ai/features.js';
import {legalMacros,macroSet,atDecision,settle,copyProgram} from '../src/ai/macros.js';
import {subSeed} from '../src/ai/rng.js';

const hp=Number(process.argv[2]||300);
if(!Number.isFinite(hp)||hp<=0)throw Error('HP must be positive');
const out=fileURLToPath(new URL(`../../docs/decision-walkthrough/normal-${hp}hp/`,import.meta.url));
await fs.mkdir(out,{recursive:true});
const json=v=>JSON.stringify(v,(_k,x)=>typeof x==='number'&&!Number.isFinite(x)?String(x):x);
const save=(name,v)=>fs.writeFile(out+'/'+name,json(v));
const config={seed:20261028,hp,bestOf:1,roundFrames:5940,characters:['samurai','shinobi'],algorithms:['minimax','mcts'],level:'normal',mode:'nodes',note:'Standard arena Normal fixed-work mode: 600 nodes / 240 rollouts, 14-frame delay, 8% mistakes. Browser Normal uses nominal 8 ms instead.'};
const chars=config.characters.map(id=>{const c=getChar(id);return {...c,phys:{...c.phys,hp:config.hp}}});
const agents=config.algorithms.map((name,side)=>makeAgent(name,{side,seed:subSeed(config.seed,side+1),level:config.level,mode:config.mode}));
const decisions=[],frames=[],tree={nodes:[],edges:[],searchCalls:[],leaves:[]};
let match,currentFrame=0,active=null;
const snapshot=s=>({frame:s.frame,hash:s.hash(),fighters:s.f.map(f=>({character:s.C(f).id,x:f.x,h:f.h,vx:f.vx,hp:f.hp,meter:f.meter,state:f.state,phase:phase(s,f),move:f.move,t:f.t,stun:f.stun,guard:f.guard,ko:f.ko})),projectiles:s.projectiles.map(p=>({owner:p.owner,x:p.x,vx:p.vx,life:p.life}))});
const buttons=b=>Object.entries(BTN).filter(([,v])=>(b&v)!==0).map(([k])=>k);
const ids=new WeakMap();
function nodeId(node){if(!ids.has(node)){const id=tree.nodes.length;ids.set(node,id);tree.nodes.push({id,state:snapshot(node.sim),programs:node.progs.map(p=>p?{macro:p.m.id,framesEmitted:p.i,length:p.m.len}:null)});}return ids.get(node);}
const mm=agents[0];
const child0=mm.child.bind(mm),leaf0=mm.leaf.bind(mm),search0=mm.search.bind(mm);
mm.child=function(node,a,b){const kid=child0(node,a,b);if(active?.first){tree.edges.push({from:nodeId(node),to:nodeId(kid),ourAction:a?.id??'continue',opponentAction:b?.id??'continue',depthIteration:this.depthIter,framesAdvanced:kid.sim.frame-node.sim.frame});}return kid};
mm.leaf=function(node){const value=leaf0(node);if(active?.first){const s=node.sim.clone(),ps=node.progs.map(copyProgram);const advanced=settle(s,ps,this.cap);tree.leaves.push({node:nodeId(node),depthIteration:this.depthIter,settleFrames:advanced,state:snapshot(s),terms:terms(s,0),value});}return value};
mm.search=function(node,depth,alpha,beta,ply){if(!active?.first)return search0(node,depth,alpha,beta,ply);const rec={node:nodeId(node),depth,ply,alpha,beta,depthIteration:this.depthIter};tree.searchCalls.push(rec);try{const v=search0(node,depth,alpha,beta,ply);rec.value=v;return v}catch(e){rec.aborted=true;throw e}};

for(const [side,ag] of agents.entries()){
 const decide0=ag.decide.bind(ag),act0=ag.act.bind(ag);
 ag.decide=function(s){
  const rec={index:decisions.length,side,character:config.characters[side],liveFrame:currentFrame,first:side===0&&!decisions.some(d=>d.side===0),estimated:snapshot(s),estimatedFullState:s.toState(),initialTerms:terms(s,side),initialEvaluation:evaluate(s,side),features:Object.fromEntries(Object.entries(features(s,side)).filter(([k,v])=>!['me','op'].includes(k)&&typeof v!=='object')),inventory:macroSet(s.C(s.f[side])).list.map(m=>m.id),candidates:[0,1].map(i=>({side:i,free:atDecision(s,i,null),actions:atDecision(s,i,null)?legalMacros(s,i).map(m=>m.id):['continue']})),rngBefore:this.rng.s,previousBest:this.prevBest??null};
  decisions.push(rec);active=rec;
  try{const m=decide0(s);rec.searchChoice=m.id;rec.thinking=structuredClone(this.thinking());rec.work=this.lastWork;rec.rngAfterSearch=this.rng.s;return m}finally{active=null}
 };
 ag.act=function(view,frame,age){
  const count=decisions.length,oldMistakes=this.stats.mistakes;
  const before={live:snapshot(match.sim),view:snapshot(view),viewAge:age,program:this.prog?{macro:this.prog.m.id,framesEmitted:this.prog.i,length:this.prog.m.len}:null};
  const bits=act0(view,frame,age);
  if(decisions.length>count){const rec=decisions.at(-1);rec.observation=before;rec.installedMacro=this.prog.m.id;rec.mistake=this.stats.mistakes>oldMistakes;rec.firstOutput={bits,buttons:buttons(bits)};}
  return bits;
 };
}
match=new Match({chars,controllers:agents.map(a=>new AgentController(a)),bestOf:config.bestOf,roundFrames:config.roundFrames,record:true,meta:config});
const initial=match.sim.toState();
const started=performance.now();
while(!match.over){currentFrame=match.sim.frame;const before=snapshot(match.sim);const decisionStart=decisions.length;match.step();frames.push({frame:currentFrame,before,inputs:match.lastBits.map(b=>({bits:b,buttons:buttons(b)})),after:snapshot(match.sim),events:structuredClone(match.sim.events),decisionIndices:decisions.slice(decisionStart).map(d=>d.index),programs:agents.map(a=>a.prog?{macro:a.prog.m.id,framesEmitted:a.prog.i,length:a.prog.m.len}:null)});if(frames.length>config.roundFrames+5)throw Error('Unexpected run length');}
const finalHash=match.sim.hash();
const replay=new Match({chars,controllers:[new ReplayController(match.log),new ReplayController(match.log)],bestOf:config.bestOf,roundFrames:config.roundFrames,verify:match.log});
while(!replay.over)replay.step();
if(replay.sim.hash()!==finalHash||replay.verify.bad||replay.winner!==match.winner)throw Error('Replay mismatch');
const sources=['game/src/sim.js','game/src/ai/agent.js','game/src/ai/macros.js','game/src/ai/eval.js','game/src/ai/minimax.js','game/src/ai/mcts.js','game/src/ai/match.js','game/src/ai/view.js','game/src/ai/difficulty.js','game/src/characters/samurai.js','game/src/characters/shinobi.js'];
const hashes={};for(const name of sources)hashes[name]=createHash('sha256').update(await fs.readFile(new URL('../../'+name,import.meta.url))).digest('hex');
const summary={config,actualOptions:agents.map(a=>a.opts),hashes,initial:snapshot({ ...match.sim,...{frame:0,f:initial.f,projectiles:initial.projectiles},C:match.sim.C.bind(match.sim),hash:()=>null}),winner:match.winner===null?'draw':config.characters[match.winner],rounds:match.rounds,frames:frames.length,finalHash,replay:{matchingHash:replay.sim.hash()===finalHash,checksPassed:replay.verify.ok,checksFailed:replay.verify.bad},decisions:agents.map((a,side)=>({side,count:a.stats.decisions,mistakes:a.stats.mistakes})),wallMs:performance.now()-started};
await save('summary.json',summary);await save('initial-state.json',initial);await save('decisions.json',decisions);await save('first-minimax-tree.json',tree);await save('recorded-inputs.json',{...match.log,chars:config.characters,meta:config});
await fs.writeFile(out+'/frames.jsonl',frames.map(json).join('\n')+'\n');
console.log(JSON.stringify({out,summary,firstDecisions:decisions.slice(0,4).map(({estimatedFullState,observation,...d})=>d)},null,2));
