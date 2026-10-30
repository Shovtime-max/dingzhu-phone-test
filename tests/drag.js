const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../assets/js/views/schedule.js','utf8');
const block=source.slice(source.indexOf('(function bindMove() {'),source.indexOf('      /* 排档期流程里点「取消」'));
function env(){
 const events={},frames=new Map(),writes=[],nodes=[],classes=new Set();let frameId=0,slot;
 const cl=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),has:x=>values.has(x)}};
 const wrap={isConnected:true,contains:()=>true,addEventListener(n,fn){(events[n]??=[]).push(fn)},removeEventListener(n,fn){events[n]=(events[n]||[]).filter(x=>x!==fn)}};
 const screen={scrollTop:0,getBoundingClientRect:()=>({top:80,bottom:800})};
 function makeSlot(day){return {classList:cl(),getAttribute:k=>k==='data-day'?day:'上午',closest:()=>slot};}
 const origin=makeSlot('10.22'),target=makeSlot('10.24');slot=origin;
 const card={classList:cl(),getAttribute:()=> 'DW-test',closest:()=>origin,querySelector:()=>({innerHTML:'测试订单'})};
 const handle={closest:()=>card,setPointerCapture(){},releasePointerCapture(){}};
 const doc={getElementById:k=>k==='listWrap'?wrap:k==='screen'?screen:{getBoundingClientRect:()=>({top:720})},elementFromPoint:()=>slot,createElement:()=>({style:{},classList:cl()}),body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},appendChild(g){nodes.push(g);g.parentNode={removeChild(){nodes.splice(nodes.indexOf(g),1)}}}}};
 const ctx={document:doc,suppressClickUntil:0,state:{month:'2026-10'},D:{MONTHS:{'2026-10':{y:2026}},moveOrder:(...a)=>{writes.push(a);return Promise.resolve({id:a[0]})}},U:{toast(){}},refresh(){},setTimeout:fn=>fn(),Date,Math};
 ctx.w={requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},removeEventListener(){}};
 vm.createContext(ctx);vm.runInContext(block,ctx);
 const event=(type,overHandle=true,extra={})=>({type,pointerId:1,isPrimary:true,button:0,clientX:150,clientY:300,prevented:false,preventDefault(){this.prevented=true},stopPropagation(){},target:{closest:sel=>sel==='.ag-drag-handle'?(overHandle?handle:null):null},...extra});
 function fire(e){for(const fn of [...(events[e.type]||[])])fn(e);return e;}
 return {fire,event,writes,nodes,classes,screen,frames,setTarget(){slot=target}};
}
(async()=>{
 let x=env();assert.equal(x.fire(x.event('pointerdown',false)).prevented,false);assert.equal(x.nodes.length,0);
 x=env();x.fire(x.event('pointerdown'));assert.equal(x.nodes.length,1);assert(x.classes.has('is-dragging'));x.setTarget();x.fire(x.event('pointercancel'));assert.equal(x.writes.length,0);assert.equal(x.nodes.length,0);assert(!x.classes.has('is-dragging'));
 x=env();x.fire(x.event('pointerdown'));x.fire(x.event('pointerup'));assert.equal(x.writes.length,0);
 x=env();x.fire(x.event('pointerdown'));x.setTarget();x.fire(x.event('pointermove'));x.fire(x.event('pointerup'));await Promise.resolve();assert.deepEqual(x.writes,[['DW-test','2026-10-24','上午']]);x.fire(x.event('lostpointercapture'));assert.equal(x.writes.length,1);
 x=env();x.fire(x.event('pointerdown'));x.setTarget();x.fire(x.event('pointerup',true,{pointerId:2}));assert.equal(x.writes.length,0);assert.equal(x.nodes.length,1);x.fire(x.event('lostpointercapture'));assert.equal(x.writes.length,0);assert.equal(x.nodes.length,0);
 x=env();x.fire(x.event('pointerdown',true,{isPrimary:false}));assert.equal(x.nodes.length,0);
 assert(source.includes('class="ag-drag-handle"'));assert(source.includes('draggable="false"'));assert(!source.includes('swallowClick'));
 console.log('7 gesture checks passed: scroll area, instant feedback, cancel, same slot, valid drop, pointer isolation, native drag disabled');
})().catch(e=>{console.error(e);process.exitCode=1});
