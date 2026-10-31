import fs from 'node:fs/promises';
import {Sim} from '../src/sim.js';
import {getChar} from '../src/characters/index.js';
import {makeAgent} from '../src/ai/registry.js';
import {terms} from '../src/ai/eval.js';
import {settle,copyProgram,atDecision,legalMacros} from '../src/ai/macros.js';
const hp=Number(process.argv[2]||300);
const indices=process.argv.length>3?process.argv.slice(3).map(Number):[0,33];
const dir=new URL(`../../docs/decision-walkthrough/normal-${hp}hp/`,import.meta.url);
const decisions=JSON.parse(await fs.readFile(new URL('decisions.json',dir),'utf8'));
for(const index of indices){
 const d=decisions[index],sim=Sim.fromState(d.estimatedFullState);
 sim.chars=sim.chars.map(c=>({...c,phys:{...c.phys,hp}}));
 const a=makeAgent('minimax',{side:0,level:'normal',mode:'nodes',seed:1});
 a.rng.s=d.rngBefore;a.prevBest=d.previousBest;
 const trace={index,frame:d.liveFrame,nodes:[],orders:[],passes:[],edges:[],leaves:[]};
 const ids=new WeakMap();let nextId=0;
 const id=n=>{if(!ids.has(n)){const k=nextId++;ids.set(n,k);trace.nodes.push({id:k,frame:n.sim.frame,fighters:n.sim.f.map(f=>({state:f.state,move:f.move,t:f.t,hp:f.hp,meter:f.meter,x:f.x})),programs:n.progs.map(p=>p?{id:p.m.id,i:p.i,len:p.m.len}:null),candidates:n.sim.f.map((f,i)=>atDecision(n.sim,i,n.progs[i])?legalMacros(n.sim,i).map(m=>m.id):['continue'])});}return ids.get(n)};
 const order=a.order.bind(a),search=a.search.bind(a),child=a.child.bind(a),leaf=a.leaf.bind(a);
 a.order=function(s,side,list,hint,jitter){const result=order(s,side,list,hint,jitter);if(s===sim)trace.orders.push({depth:this.depthIter,side,hint,jitter,input:list.map(m=>m.id),output:result.map(m=>m.id)});return result};
 a.search=function(node,depth,alpha,beta,ply){if(ply!==0)return search(node,depth,alpha,beta,ply);id(node);const r={depth,startNodes:this.nodes};trace.passes.push(r);try{r.value=search(node,depth,alpha,beta,ply);r.chosen=this.rootBest?.id;r.rows=structuredClone(this.rootRows);return r.value}catch(e){r.aborted=true;throw e}finally{r.endNodes=this.nodes;r.nodesUsed=r.endNodes-r.startNodes}};
 a.child=function(n,x,y){const k=child(n,x,y);if(this.depthIter>0)trace.edges.push({depth:this.depthIter,from:id(n),to:id(k),actions:[x?.id??'continue',y?.id??'continue'],fromFrame:n.sim.frame,toFrame:k.sim.frame});return k};
 a.leaf=function(n){const v=leaf(n);const s=n.sim.clone();settle(s,n.progs.map(copyProgram),this.cap);trace.leaves.push({depth:this.depthIter,node:id(n),frame:s.frame,hp:s.f.map(f=>f.hp),meter:s.f.map(f=>f.meter),positions:s.f.map(f=>f.x),terms:terms(s,0),value:v});return v};
 const chosen=a.decide(sim);trace.result=a.thinking();
 if(chosen.id!==d.searchChoice||Math.abs(trace.result.value-d.thinking.value)>1e-9||a.rng.s!==d.rngAfterSearch)throw Error('Checkpoint did not reproduce');
 await fs.writeFile(new URL(`checkpoint-${d.liveFrame}.json`,dir),JSON.stringify(trace,null,2));
 console.log(JSON.stringify({frame:d.liveFrame,orders:trace.orders,passes:trace.passes,result:trace.result},null,2));
}
