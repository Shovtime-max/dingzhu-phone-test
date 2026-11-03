const assert = require('node:assert/strict'), fs = require('fs'), vm = require('vm');
const {env} = require('./harness');
function uiEnv() {
  const nodes = [], events = {}, calls = [];
  const shell = {appendChild(el){el.parentNode=this;nodes.push(el);}};
  function element(){ return {id:'',parentNode:null,classList:{add(){},remove(){}},addEventListener(){},removeAttribute(k){delete this[k];},remove(){this.parentNode=null;}}; }
  const ctx={console,setTimeout(){},document:{querySelector:s=>s==='.shell'?shell:null,createElement:element,getElementById:id=>nodes.find(n=>n.parentNode&&n.id===id)||null,addEventListener(){}},
    location:{hash:'#/schedule'},history:{state:{dzSeq:7},pushState(s){this.state=structuredClone(s);calls.push('push')},replaceState(s,t,href){this.state=structuredClone(s);ctx.location.hash=href;calls.push('replace')},back(){calls.push('back');}},addEventListener(k,fn){events[k]=fn;}};
  ctx.window=ctx; vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/ui.js','utf8'),ctx);return {ctx,calls,events};
}
(async()=>{
  const draft={owner:'审查测试',town:'测试镇',village:'测试村',addr:'测试村1号',main:1,wing:0,mode:'人工',quote:1000,paid:0,teams:['t1'],tags:[],note:'',flows:[]};
  let x=env(),D=x.ctx.DATA;
  let other=await D.createOrder(draft,'2026-10-30','上午');let o=await D.createOrder(draft,'2026-10-30','上午');assert.equal(D.MONTHS['2026-10'].days[29].slots[0].items.length,2);assert.equal(D.state(o),'planned');assert.equal(env(x.store).ctx.DATA.state(env(x.store).ctx.DATA.byId(o.id)),'planned');
  await D.transitionOrder(o.id,'start'); await D.recordPayment(o.id,200,'现金');
  await D.transitionOrder(o.id,'finish'); assert.equal(D.stats([o]).due,800);
  await D.undoOrder(o.id,'unfinish');assert.equal(D.stats([o]).due,0);assert.equal(D.stats([o]).openDue,800);
  await D.undoOrder(o.id,'unstart');let y=env(x.store),reloaded=y.ctx.DATA.byId(o.id);assert.equal(y.ctx.DATA.state(reloaded),'planned');assert.equal(reloaded.paid,200);assert.equal(reloaded.flows.length,1);
  await y.ctx.DATA.transitionOrder(o.id,'start');await y.ctx.DATA.transitionOrder(o.id,'finish');await y.ctx.DATA.settleOrder(o.id,'现金');await y.ctx.DATA.undoOrder(o.id,'unsettle');assert.equal(env(y.store).ctx.DATA.state(env(y.store).ctx.DATA.byId(o.id)),'done');
  await y.ctx.DATA.transitionOrder(other.id,'start');await y.ctx.DATA.transitionOrder(other.id,'finish');await y.ctx.DATA.saveOrder(y.ctx.DATA.byId(other.id),{phone:'" onclick="window.__auditXss=1'});y.mount('analytics');await y.el.btnCollect.fire('click');assert(!y.html.includes('data-call="" onclick='));assert(y.html.includes('&quot; onclick=&quot;'));
  // Restore must not leave a different device Key when business persistence fails.
  x=env();D=x.ctx.DATA; x.ctx.GEO.setAmapKey('oldtestkey');let snapshot=D.backupSnapshot();snapshot.amapKey='newtestkey';let original=x.ctx.localStorage.setItem;
  x.ctx.localStorage.setItem=(k,v)=>{if(k==='dingzhu.adds.v1')throw Error('quota');original(k,v)};
  assert.throws(()=>D.installBackupState(snapshot),/quota/);assert.equal(x.ctx.GEO.directKey(),'oldtestkey');assert.equal(x.store['dingzhu.adds.v1'],undefined);
  x.ctx.localStorage.setItem=(k,v)=>{if(k==='dingzhu.amapkey.v1')throw Error('key write failed');original(k,v)};
  assert.throws(()=>D.installBackupState(snapshot),/未保存/);assert.equal(x.store['dingzhu.adds.v1'],undefined);
  // Successful restore and rollback snapshots include the approved device settings.
  x=env();D=x.ctx.DATA;await D.saveBase({name:'审查出发地',full:'测试地址',lat:35,lng:119});x.ctx.GEO.setAmapKey('approvedkey');snapshot=D.backupSnapshot();assert.equal(snapshot.amapKey,'approvedkey');assert.equal(snapshot.base.name,'审查出发地');D.installBackupState(snapshot);assert.equal(x.ctx.GEO.directKey(),'approvedkey');assert(!JSON.parse(x.store['dingzhu.adds.v1']).amapKey);
  let ui=uiEnv();ui.ctx.UI.sheet('day');ui.ctx.UI.closeSheet({keepHistory:true});ui.ctx.UI.navigateFromSheet('#/create');assert.equal(ui.ctx.location.hash,'#/create');assert(!ui.calls.includes('back'));assert.equal(ui.ctx.history.state.dzSheet,undefined);
  ui=uiEnv();ui.ctx.UI.navigateFromSheet('#/create');assert.equal(ui.ctx.location.hash,'#/create');assert(!ui.calls.includes('replace'));
  ui=uiEnv();ui.ctx.UI.sheet('settings','settings');ui.ctx.UI.sheet('child');ui.ctx.history.state={dzSeq:7};ui.events.popstate();assert.equal(ui.ctx.history.state.dzSeq,8);assert.equal(ui.ctx.history.state.dzSheet,1);
  console.log('PASS: 状态撤销刷新、收款统计、Key/出发地恢复及失败回退、弹层跳转和嵌套返回');
})().catch(e=>{console.error(e);process.exitCode=1});
