const assert=require('assert/strict');
const {env}=require('./harness');
const cases=[];
async function test(name,fn){await fn();cases.push(name);}
async function fixture(){
 const x=env();x.mount('create');x.fill();x.el.inOwner.value='本地改期测试';
 await x.el.createTeams.fire('click',x.target({'data-team':'t2'}));await x.el.btnToSchedule.fire('click');
 const o=x.ctx.DATA.ORDERS.at(-1);await x.ctx.DATA.scheduleOrder(o.id,'2026-10-30','上午');return {x,o};
}
function open(x,o){x.ctx.location.hash='#/order/'+o.id;x.mount('order',{id:o.id});return x.el.btnEditSpec2.fire('click');}
function fill(x,date,period='下午'){x.el.rescheduleDate.value=date;x.el.reschedulePeriod.value=period;}
function placed(D,id){let result=[];Object.values(D.MONTHS).forEach(m=>m.days.forEach(d=>d.slots.forEach(s=>{if(s.items.some(i=>i.oid===id))result.push(m.y+'-'+d.date.replace('.','-')+' '+s.ampm);})));return result;}
(async()=>{
 await test('手动跨月跨年改期，旧位置清除、重载保留、金额及队伍不变',async()=>{
  const {x,o}=await fixture(),before=JSON.stringify({quote:o.quote,paid:o.paid,teams:o.teams});await open(x,o);
  assert(x.html.includes('type="date"')&&x.html.includes('value="2026-10-30"'));assert(x.html.includes('上午 selected')||x.html.includes('<option selected>上午'));
  fill(x,'2027-02-08');await x.el.rescheduleSave.fire('click');assert.equal(x.ctx.location.hash,'#/order/'+o.id);
  assert.equal(o.scheduledOn,'2027-02-08');assert.equal(o.scheduledAt,'02-08 下午');assert.deepEqual(placed(x.ctx.DATA,o.id),['2027-02-08 下午']);
  assert.equal(JSON.stringify({quote:o.quote,paid:o.paid,teams:o.teams}),before);
  const y=env(x.store);assert.equal(y.ctx.DATA.byId(o.id).scheduledOn,'2027-02-08');assert.deepEqual(placed(y.ctx.DATA,o.id),['2027-02-08 下午']);
 });
 await test('取消不修改数据，无效日期或时段不清除旧档期',async()=>{
  const {x,o}=await fixture();await open(x,o);const before=JSON.stringify(x.store);await x.el.rescheduleCancel.fire('click');assert.equal(JSON.stringify(x.store),before);
  for(const [date,period] of [['','下午'],['2027-02-30','下午'],['2027-03-01','全天']]){await open(x,o);fill(x,date,period);await x.el.rescheduleSave.fire('click');assert.equal(o.scheduledOn,'2026-10-30');assert.equal(JSON.stringify(x.store),before);}
 });
 await test('同日可调整上午下午，重复点击只保存一次',async()=>{
  const {x,o}=await fixture();await open(x,o);let calls=0;const move=x.ctx.DATA.moveOrder;x.ctx.DATA.moveOrder=(...args)=>(calls++,move(...args));fill(x,'2026-10-30');
  await Promise.all([x.el.rescheduleSave.fire('click'),x.el.rescheduleSave.fire('click')]);assert.equal(calls,1);assert.equal(o.scheduledAt,'10-30 下午');assert.deepEqual(placed(x.ctx.DATA,o.id),['2026-10-30 下午']);
 });
 await test('存储失败保留旧档期和选择，不破坏订单',async()=>{
  const {x,o}=await fixture(),bad=env(x.store,undefined,true),saved=bad.ctx.DATA.byId(o.id);await open(bad,saved);fill(bad,'2027-04-05');await bad.el.rescheduleSave.fire('click');
  assert.equal(saved.scheduledOn,'2026-10-30');assert.equal(bad.el.rescheduleDate.value,'2027-04-05');assert(bad.logs.at(-1).includes('保存失败'));
 });
 await test('两队分别显示设置队名与颜色，刷新保留，恶意颜色安全降级',async()=>{
  const {x,o}=await fixture();await x.ctx.DATA.updateTeam('t1',{name:'橙色队',color:'#D97A06'});await x.ctx.DATA.updateTeam('t2',{name:'<绿队>',color:'#00A06A'});
  function card(y){const html=y.mount('schedule').body;const start=html.indexOf('data-order="'+o.id+'"');return html.slice(start,html.indexOf('</div></div>',start));}
  for(const y of [x,env(x.store)]){const html=card(y);assert.equal((html.match(/class="ag-team"/g)||[]).length,2);assert(html.includes('--team-color:#D97A06')&&html.includes('--team-color:#00A06A'));assert(html.includes('橙色队')&&html.includes('&lt;绿队&gt;'));assert(!html.includes('>两队<'));}
  await x.ctx.DATA.updateTeam('t1',{color:'#fff;--injected:1'});assert(!card(x).includes('--injected'));assert(card(x).includes('--team-color:#0066FF'));
 });
 console.log(JSON.stringify({passed:cases.length,cases},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
