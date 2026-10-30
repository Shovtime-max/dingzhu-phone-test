const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {env}=require('./harness');
const cases=[];async function test(name,fn){await fn();cases.push(name);}
const flush=()=>new Promise(r=>setImmediate(r));
(async()=>{
 await test('订单与待定的自定义工序原子加入预设，刷新后可选',async()=>{
  for(const target of ['btnToSchedule','btnToPending']){let x=env();x.mount('create');x.fill();x.el.inScope.value='卷材收口 新增工序 卷材收口';await x.el[target].fire('click');let y=env(x.store);assert(y.ctx.DATA.processPresets().includes('新增工序'));assert.equal(y.ctx.DATA.processPresets().filter(s=>s==='卷材收口').length,1);assert(y.mount('create').body.includes('data-s="新增工序"'));}
 });
 await test('长按删除预设保留旧订单工序，新单不再显示，最后一项也能删',async()=>{
  let x=env(),history=JSON.stringify(x.ctx.DATA.ORDERS.map(o=>o.tags)),timers=[];x.ctx.setTimeout=fn=>(timers.push(fn),timers.length);const query=x.ctx.document.querySelector;x.ctx.document.querySelector=s=>s==='.shell'?null:query(s);x.mount('create');
  x.el.scopeRow.events.pointerdown[0]({target:x.target({'data-s':'换瓦'}),clientX:10,clientY:10,isPrimary:true,button:0});timers.pop()();await flush();
  assert(!x.ctx.DATA.processPresets().includes('换瓦'));assert(!x.el.scopeRow.innerHTML.includes('data-s="换瓦"'));assert.equal(JSON.stringify(x.ctx.DATA.ORDERS.map(o=>o.tags)),history);
  const y=env(x.store);assert(!y.mount('create').body.includes('data-s="换瓦"'));await y.ctx.DATA.saveProcessPresets(['仅此工序']);await y.ctx.DATA.removeProcessPreset('仅此工序');assert.deepEqual(Array.from(env(y.store).ctx.DATA.processPresets()),[]);
 });
 await test('删除旧待定工序后再补充成单，不会将旧工序重新加入预设',async()=>{
  let x=env(),p=x.ctx.DATA.PENDING[0];p.tags=['旧工序'];await x.ctx.DATA.saveProcessPresets(['新工序']);x.ctx.location.hash='#/create?for='+p.id;x.mount('create');x.fill();x.el.inScope.value='旧工序 本次新增';await x.el.btnToSchedule.fire('click');assert(!x.ctx.DATA.processPresets().includes('旧工序'));assert(x.ctx.DATA.processPresets().includes('本次新增'));assert(x.ctx.DATA.ORDERS.at(-1).tags.includes('旧工序'));
 });
 await test('工序达到上限或存储失败时，订单和预设均不被部分写入',async()=>{
  let x=env();await x.ctx.DATA.saveProcessPresets(Array.from({length:30},(_,i)=>'工序'+i));const raw=JSON.stringify(x.store);x.mount('create');x.fill();x.el.inScope.value='超出上限';await x.el.btnToSchedule.fire('click');assert.equal(x.ctx.DATA.ORDERS.length,18);assert.equal(JSON.stringify(x.store),raw);
  let bad=env({},undefined,true);bad.mount('create');bad.fill();bad.el.inScope.value='保存失败工序';await bad.el.btnToSchedule.fire('click');assert.equal(bad.ctx.DATA.ORDERS.length,18);assert(!bad.ctx.DATA.processPresets().includes('保存失败工序'));
 });
 await test('出发地保存、刷新及备份持久化，非法坐标和失败写入不改变出发地',async()=>{
  let x=env(),p={name:'测试出发地',addr:'测试地址',lat:36.2,lng:119.2};await x.ctx.DATA.saveBase(p);let y=env(x.store);assert.equal(y.ctx.GEO.baseGeo().name,p.name);assert.equal(y.ctx.DATA.backupSnapshot().base.lng,p.lng);let before=JSON.stringify(y.ctx.GEO.baseGeo());await assert.rejects(y.ctx.DATA.saveBase({...p,lat:999}));assert.equal(JSON.stringify(y.ctx.GEO.baseGeo()),before);let bad=env(x.store,undefined,true);await assert.rejects(bad.ctx.DATA.saveBase({...p,name:'未保存'}));assert.equal(bad.ctx.GEO.baseGeo().name,p.name);
 });
 await test('路由变化关闭弹层，详情重新渲染不丢来源和滚动位置',async()=>{
  let elements={},modal=false,events={};function screen(){return{scrollTop:0,cloneNode:screen,parentNode:{replaceChild(el){elements.screen=el;}}};}elements.screen=screen();elements.appbar={};elements.tabbar={};
  let ctx={console,sessionStorage:{getItem(){},setItem(){}},location:{hash:'#/schedule'},document:{getElementById:id=>elements[id],addEventListener:(k,fn)=>events[k]=fn},DATA:{refreshToday(){}},UI:{icon:()=>'',esc:String,closeSheet(){modal=false;}},VIEWS:{schedule:()=>({bar:'',body:'schedule',tab:'schedule'}),order:()=>({bar:'',body:'order',tab:'orders'})},addEventListener(){},requestAnimationFrame:fn=>fn()};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/router.js','utf8'),ctx);ctx.APP.render();elements.screen.scrollTop=703;modal=true;ctx.APP.openOrder('test');elements.screen.scrollTop=0;ctx.APP.render();assert.equal(modal,false);assert.equal(ctx.APP.orderBackHref(),'#/schedule');ctx.APP.render();ctx.location.hash=ctx.APP.orderBackHref();ctx.APP.render();assert.equal(elements.screen.scrollTop,703);modal=true;ctx.APP.render();assert.equal(modal,true,'同页面渲染不能随意关闭弹层');
 });
 console.log(JSON.stringify({passed:cases.length,cases},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
