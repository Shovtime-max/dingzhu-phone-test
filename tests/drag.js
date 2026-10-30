const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const source=fs.readFileSync(__dirname+'/../assets/js/views/schedule.js','utf8');
const block=source.slice(source.indexOf('(function bindMove() {'),source.indexOf('      /* 排档期流程里点「取消」'));
function env(){
 const events={},frames=new Map(),timers=new Map(),writes=[],opens=[],nodes=[],classes=new Set();let frameId=0,timerId=0,slot;
 const cl=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),has:x=>values.has(x)}};
 const wrap={isConnected:true,contains:()=>true,addEventListener(n,fn){(events[n]??=[]).push(fn)},removeEventListener(n,fn){events[n]=(events[n]||[]).filter(x=>x!==fn)}};
 const screen={scrollTop:0,getBoundingClientRect:()=>({top:80,bottom:800})};
 function makeSlot(day){return {classList:cl(),getAttribute:k=>k==='data-day'?day:'上午',closest:()=>slot};}
 const origin=makeSlot('10.22'),target=makeSlot('10.24');slot=origin;
 const card={classList:cl(),getAttribute:()=> 'DW-test',closest:()=>origin,querySelector:()=>({innerHTML:'测试订单'}),setPointerCapture(){},releasePointerCapture(){}};
 const doc={getElementById:k=>k==='listWrap'?wrap:k==='screen'?screen:{getBoundingClientRect:()=>({top:720})},elementFromPoint:()=>slot,createElement:()=>({style:{},classList:cl()}),body:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},appendChild(g){nodes.push(g);g.parentNode={removeChild(){nodes.splice(nodes.indexOf(g),1)}}}}};
 const ctx={document:doc,suppressClickUntil:0,state:{month:'2026-10'},D:{MONTHS:{'2026-10':{y:2026}},moveOrder:(...a)=>{writes.push(a);return Promise.resolve({id:a[0]})}},U:{toast(){}},refresh(){},setTimeout:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId},clearTimeout:id=>timers.delete(id),Date,Math};
 ctx.w={APP:{openOrder:id=>opens.push(id)},requestAnimationFrame:fn=>{frames.set(++frameId,fn);return frameId},cancelAnimationFrame:id=>frames.delete(id),addEventListener(){},removeEventListener(){}};
 vm.createContext(ctx);vm.runInContext(block,ctx);
 const event=(type,overCard=true,extra={})=>({type,pointerType:'mouse',pointerId:1,isPrimary:true,button:0,clientX:150,clientY:300,cancelable:true,prevented:false,preventDefault(){this.prevented=true},stopPropagation(){},target:{closest:()=>overCard?card:null},...extra});
 function fire(e){for(const fn of [...(events[e.type]||[])])fn(e);return e;}
 function hold(){for(const [id,t] of [...timers])if(t.ms===220){timers.delete(id);t.fn();}}
 return {fire,event,hold,writes,opens,nodes,classes,screen,setTarget(){slot=target}};
}
const touch=(x=150,y=300,id=7)=>({identifier:id,clientX:x,clientY:y});
(async()=>{
 let x=env();x.fire(x.event('pointerdown'));x.fire(x.event('pointerup'));x.fire(x.event('click'));assert.deepEqual(x.opens,['DW-test']);assert.equal(x.writes.length,0);x.hold();assert.equal(x.nodes.length,0);
 x=env();x.fire(x.event('touchstart',true,{touches:[touch()]}));const swipe=x.fire(x.event('touchmove',true,{touches:[touch(150,330)]}));assert.equal(swipe.prevented,false);x.hold();assert.equal(x.nodes.length,0);
 x=env();x.fire(x.event('touchstart',true,{touches:[touch()]}));x.hold();assert.equal(x.nodes.length,1);assert(x.classes.has('is-dragging'));x.setTarget();const drag=x.fire(x.event('touchmove',true,{touches:[touch(180,350)]}));assert(drag.prevented);x.fire(x.event('touchend',true,{changedTouches:[touch(180,350)]}));await Promise.resolve();assert.deepEqual(x.writes,[['DW-test','2026-10-24','上午']]);x.fire(x.event('click'));assert.equal(x.opens.length,0);
 x=env();x.fire(x.event('touchstart',true,{touches:[touch()]}));x.hold();x.setTarget();x.fire(x.event('touchcancel'));assert.equal(x.writes.length,0);assert(!x.classes.has('is-dragging'));
 x=env();x.fire(x.event('touchstart',true,{touches:[touch()]}));x.hold();x.fire(x.event('touchstart',true,{touches:[touch(),touch(100,100,8)]}));assert.equal(x.writes.length,0);assert(!x.classes.has('is-dragging'));
 x=env();x.fire(x.event('pointerdown'));x.hold();x.fire(x.event('pointerup'));assert.equal(x.writes.length,0);
 x=env();x.fire(x.event('pointerdown'));x.hold();x.setTarget();x.fire(x.event('pointerup',true,{pointerId:2}));assert.equal(x.writes.length,0);x.fire(x.event('lostpointercapture'));assert.equal(x.writes.length,0);assert(!x.classes.has('is-dragging'));
 assert(!source.includes('ag-drag-handle'));assert(!source.includes('var openTag = it.oid ? "a"'));assert(source.includes('data-order-link'));
 console.log('8 gesture checks passed: tap, native swipe, hold-drag/drop, click suppression, cancellation, multitouch, same slot, no handles or native links');
})().catch(e=>{console.error(e);process.exitCode=1});
