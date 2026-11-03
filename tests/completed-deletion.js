const assert=require('node:assert/strict');
const {env}=require('./harness');
const fixture={owner:'删除测试',town:'测试镇',village:'测试村',addr:'测试村1号',phone:'13800000000',main:1,wing:0,mode:'人工',quote:1000,paid:0,teams:['t1'],tags:[],note:'',flows:[]};
async function completed(x,settled=false){let D=x.ctx.DATA;let o=await D.createOrder(fixture,'2026-10-30','上午');await D.transitionOrder(o.id,'start');await D.recordPayment(o.id,300,'现金');await D.transitionOrder(o.id,'finish');if(settled)await D.settleOrder(o.id,'现金');return o;}
function noSlot(D,id){return Object.values(D.MONTHS).every(m=>m.days.every(d=>d.slots.every(s=>(s.items||[]).every(i=>i.oid!==id))));}
(async()=>{
 for(const settled of [false,true]){
  let x=env(),D=x.ctx.DATA,o=await completed(x,settled),before=JSON.stringify(o),stats=JSON.stringify(D.stats());
  await D.removeItem('order',o.id);assert.equal(D.byId(o.id),null);assert.equal(D.stats().quote,0);assert.equal(D.stats().paid,0);assert.equal(D.stats().due,0);assert.equal(D.dueOrders().length,0);assert(noSlot(D,o.id));
  let y=env(x.store);assert.equal(y.ctx.DATA.byId(o.id),null);assert.equal(y.ctx.DATA.stats().paid,0);assert.equal(y.ctx.DATA.backupSummary(y.ctx.DATA.backupSnapshot()).paid,0);
  await y.ctx.DATA.restoreItem('order',o.id);let z=env(y.store);assert.deepEqual(JSON.parse(JSON.stringify(z.ctx.DATA.byId(o.id))),JSON.parse(before));assert.equal(JSON.stringify(z.ctx.DATA.stats()),stats);
 }
 let x=env(),D=x.ctx.DATA,o=await completed(x);let bad=env(x.store,undefined,true),raw=JSON.stringify(x.store);await assert.rejects(bad.ctx.DATA.removeItem('order',o.id));assert.equal(JSON.stringify(x.store),raw);assert(bad.ctx.DATA.byId(o.id));
 // Source lead receipts must leave live records too, and come back on restore.
 x=env();D=x.ctx.DATA;let p=await D.addPending({...fixture,budget:1000,rooms:1,stage:'待量尺',days:0,blocker:'',orderId:null,paid:200,flows:[{date:'10-26',type:'现金',amount:200,text:'定金'}]});
 o=await D.createOrder({...fixture,paid:200,flows:p.flows},'2026-10-30','上午',p.id);await D.transitionOrder(o.id,'start');await D.transitionOrder(o.id,'finish');await D.removeItem('order',o.id);
 let y=env(x.store);p=y.ctx.DATA.PENDING.find(v=>v.id===p.id);assert.equal(p.paid,0);assert.equal(p.flows.length,0);y.ctx.DATA.checkBackupState(y.ctx.DATA.backupSnapshot());await y.ctx.DATA.restoreItem('order',o.id);p=y.ctx.DATA.PENDING.find(v=>v.id===p.id);assert.equal(p.paid,200);assert.equal(p.flows.length,1);
 // Warning dialog: cancel and unacknowledged clicks do not write; typed confirmation deletes.
 x=env();D=x.ctx.DATA;o=await completed(x);let act;x.ctx.UI.bindSwipe=(root,options)=>{act=options.onAct};x.mount('orders');raw=JSON.stringify(x.store);act('del',x.target({'data-id':o.id}));assert(x.html.includes('删除已完成订单及收款记录'));assert(x.html.includes('disabled'));assert(x.html.includes('300'));assert(x.html.includes('1 笔收款流水'));await x.el.mask.fire('click',x.target({},'delYes'));assert.equal(JSON.stringify(x.store),raw);await x.el.mask.fire('click',x.target({},'delNo'));assert.equal(JSON.stringify(x.store),raw);
 act('del',x.target({'data-id':o.id}));x.el.deleteAck.value='错误';await x.el.deleteAck.fire('input');assert(x.el.delYes.disabled);x.el.deleteAck.value='删除';await x.el.deleteAck.fire('input');assert(!x.el.delYes.disabled);await x.el.mask.fire('click',x.target({},'delYes'));assert.equal(D.byId(o.id),null);
 console.log('PASS: 已完成/已结清删除、金额/流水/统计移除、刷新、还原、存储失败、关联线索和强提醒确认');
})().catch(e=>{console.error(e);process.exitCode=1});
