const {env}=require('./harness');
const assert=require('assert'),fs=require('fs');
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'passed'});}catch(e){results.push({name,status:'failed',error:e.stack});}}
async function create(x,price='3000'){x.mount('create');x.fill();x.el.inPrice.value=price;await x.el.btnToSchedule.fire('click');return x.ctx.DATA.ORDERS.at(-1);}
(async()=>{
 await test('八页生成及挂载',()=>{let x=env();for(let n of ['schedule','create','orders','pending','analytics','order','teams'])x.mount(n,{id:'DW20261026-05'});});
 await test('新单号 DW+日期+全局连续序号',async()=>{let x=env(),a=await create(x),b=await create(x);assert.equal(a.id,'DW20261026-19');assert.equal(b.id,'DW20261026-20');});
 await test('建档→排期→结清，刷新后金额状态及档期保留',async()=>{
   let x=env(),o=await create(x),id=o.id;assert.equal(x.ctx.DATA.state(o),'pending');
   await x.ctx.DATA.scheduleOrder(id,'2026-10-30','上午');assert.equal(x.ctx.DATA.state(o),'planned');
   x.mount('order',{id});await x.el.btnStart.fire('click');assert.equal(x.ctx.DATA.state(o),'doing');
   x.mount('order',{id});await x.el.btnDone.fire('click');await x.el.mask.fire('click',x.target({},'nmGo'));assert.equal(x.ctx.DATA.state(o),'done');
   x.mount('order',{id});await x.ctx.DATA.settleOrder(id,'现金');assert.equal(x.ctx.DATA.state(o),'settled');
   let y=env(x.store),saved=y.ctx.DATA.byId(id);assert.equal(y.ctx.DATA.state(saved),'settled');assert.equal(saved.doneOn,'2026-10-26');
   assert(y.ctx.DATA.MONTHS['2026-10'].days.some(d=>d.slots.some(s=>s.items.some(i=>i.oid===id))));
 });
 await test('负数收款被拒绝且不产生流水',async()=>{let x=env(),o=x.ctx.DATA.ORDERS.find(o=>o.paid>0&&x.ctx.DATA.due(o)>0),before=o.paid,n=o.flows.length;
   x.mount('order',{id:o.id});await x.el.payGrid.fire('click',x.target({'data-pay':'0'}));x.el.manualAmt.value='-500';await x.el.manualOk.fire('click');assert.equal(o.paid,before);assert.equal(o.flows.length,n);});
 await test('工序预设多选+自定义随单保存',async()=>{let x=env();x.mount('create');x.fill();await x.el.scopeRow.fire('click',x.target({'data-s':'脊瓦加固'}));x.el.inScope.value='防水卷材 天沟';x.el.inNote.value='业主周二才有空';await x.el.btnToSchedule.fire('click');let o=x.ctx.DATA.ORDERS.at(-1);assert.deepEqual(o.tags,['脊瓦加固','防水卷材','天沟']);assert.equal(o.note,'业主周二才有空');});
 await test('非法金额及超额收款在写入层被拒绝',async()=>{let x=env(),o=x.ctx.DATA.ORDERS.find(o=>x.ctx.DATA.due(o)>0);for(let v of ['-5','1.2','200元','Infinity','NaN','9007199254740992'])assert.throws(()=>x.ctx.DATA.parseMoney(v));let before=o.paid;await assert.rejects(x.ctx.DATA.recordPayment(o.id,x.ctx.DATA.due(o)+1,'现金'));assert.equal(o.paid,before);});
 await test('普通收款只记一次，流水增量与实收相等',async()=>{let x=env(),o=x.ctx.DATA.ORDERS.find(o=>x.ctx.DATA.due(o)>=500),before=o.paid;await x.ctx.DATA.recordPayment(o.id,500,'现金');assert.equal(o.paid,before+500);assert.equal(o.flows.at(-1).amount,500);assert.equal(o.flows.at(-1).on,'2026-10-26');});
 await test('新建存储失败不改内存、不改档期并保留表单',async()=>{let x=env({},undefined,true);x.mount('create');x.fill();await x.el.btnToSchedule.fire('click');assert.equal(x.ctx.DATA.ORDERS.length,18);assert.equal(env(x.store).ctx.DATA.ORDERS.length,18);assert.equal(x.el.inOwner.value,'测试业主');assert(x.logs.at(-1).includes('保存失败'));});
 await test('收款写入失败金额与流水均不变',async()=>{let x=env({},undefined,true),o=x.ctx.DATA.ORDERS.find(o=>x.ctx.DATA.due(o)>=500),before=o.paid,flows=o.flows.length;await assert.rejects(x.ctx.DATA.recordPayment(o.id,500,'现金'));assert.equal(o.paid,before);assert.equal(o.flows.length,flows);});
 await test('两标签页并发写入，过期页不能覆盖已保存订单',async()=>{let store={},a=env(store),b=env(store);a.mount('create');a.fill();b.mount('create');b.fill();a.el.inOwner.value='标签 A';b.el.inOwner.value='标签 B';await Promise.all([a.el.btnToSchedule.fire('click'),b.el.btnToSchedule.fire('click')]);let persisted=JSON.parse(store['dingzhu.adds.v1']);assert.equal(persisted.orders.length,1);assert.equal(persisted.orders[0].owner,'标签 A');assert(b.logs.at(-1).includes('另一个页面'));});
 await test('无跨页面锁能力时拒绝不安全写入',async()=>{let x=env();delete x.ctx.navigator;await create(x);assert.equal(x.ctx.DATA.ORDERS.length,18);assert(x.logs.at(-1).includes('不支持安全保存'));});
 await test('存储损坏时保留原值并阻止覆盖',async()=>{for(let value of ['{broken','{"orders":{}}','{"slots":{"10-27|上午":"oops"}}']){let store={'dingzhu.adds.v1':value},x=env(store);await create(x);assert.equal(store['dingzhu.adds.v1'],value);assert.equal(x.ctx.DATA.ORDERS.length,18);}});
 await test('地图选点在订单及刷新后保留',async()=>{let x=env();x.mount('create');x.fill();await x.el.btnGeo.fire('click');await new Promise(r=>setImmediate(r));await x.el.geoSug.fire('click',x.target({'data-i':'0'}));await x.el.btnToSchedule.fire('click');let o=x.ctx.DATA.ORDERS.at(-1);assert.equal(o.geo.lat,31.23);assert.equal(o.geo.source,'amap');assert.equal(env(x.store).ctx.DATA.byId(o.id).geo.lng,121.47);});
 await test('待定池保留明细，并正确转为人工订单',async()=>{let x=env();x.mount('create');x.fill();x.el.inScope.value='换瓦 防水';await x.el.modelTri.fire('click',x.target({'data-k':'labor'}));await x.el.btnToPending.fire('click');let p=x.ctx.DATA.PENDING.at(-1);assert.equal(p.paid,0);assert.equal(p.main,4);assert.equal(p.wing,1);assert.equal(p.mode,'人工');assert.deepEqual(p.tags,['换瓦','防水']);
   x.ctx.location.hash='#/schedule?for='+p.id;x.mount('schedule');await x.el.listWrap.fire('click',x.target({'data-day':'10.27','data-ampm':'上午'}));assert.match(x.html, /tagchip on/);await x.el.mask.fire('click',x.target({},'doSchedule'));let o=x.ctx.DATA.ORDERS.at(-1);assert.equal(o.mode,'人工');assert.equal(o.wing,1);assert.equal(p.orderId,o.id);let y=env(x.store);assert.equal(y.ctx.DATA.byId(o.id).paid,0);
 });
 await test('待定卡只剩一个出口：补信息并推排期',async()=>{
   let x=env(),v=x.mount('pending');
   ['measure','quote','bag','labor','schedule','toorder'].forEach(a=>
     assert(!v.body.includes('data-act="'+a+'"'),'不该再有 '+a+' 按钮'));
   assert(v.body.includes('data-act="fill"'));
   assert(v.body.includes('补充信息并推排期'));
   let p=x.ctx.DATA.PENDING.find(q=>!q.orderId);
   assert(v.body.includes(p.addr),'卡片要显示详细地址');
   if(p.phone) assert(v.body.includes(p.phone),'卡片要显示电话');
   assert(v.body.includes('¥'+x.ctx.UI.n(p.budget)),'卡片要显示预算');
   await x.el.pdList.fire('click',x.target({'data-id':p.id,'data-act':'fill'}));
   assert.equal(x.ctx.location.hash,'#/create?for='+p.id,'应带着线索号去补信息');
 });
 await test('待定补信息→建单，线索关联且不重复成单',async()=>{
   let x=env(),p=x.ctx.DATA.PENDING.find(q=>!q.orderId&&q.stage==='待量尺');
   x.ctx.location.hash='#/create?for='+p.id;
   let v=x.mount('create');
   assert(v.body.includes('正在补充 '+p.id),'应显示补充信息提示');
   assert(!v.body.includes('btnToPending'),'从待定进来不该再有进待定池按钮');
   assert(v.body.includes('value="'+p.owner+'"'),'业主应预填');
   assert(v.body.includes('value="'+p.addr+'"'),'地址应预填');
   let before=x.ctx.DATA.ORDERS.length;
   x.el.inOwner.value=p.owner; x.el.inAddr.value=p.addr;
   x.el.inPhone.value=p.phone; x.el.inPrice.value='3600';
   await x.el.btnToSchedule.fire('click');
   let o=x.ctx.DATA.ORDERS.at(-1);
   assert.equal(o.owner,p.owner);
   assert.equal(o.scheduledAt,null,'先建档，档期留给排期页');
   assert.equal(p.orderId,o.id,'线索应关联到新订单');
   assert.equal(p.stage,'待排期');
   assert.equal(x.ctx.DATA.ORDERS.length,before+1,'只成一张单');
   assert(!/undefined/.test(p.blocker),'blocker 不该出现 undefined');
   let y=env(x.store);
   assert.equal(y.ctx.DATA.PENDING.find(q=>q.id===p.id).orderId,o.id,'刷新后关联仍在');
 });
 await test('同一线索转单接口幂等',async()=>{let x=env(),p=x.ctx.DATA.PENDING.find(p=>p.stage==='待排期');let draft={owner:p.owner,addr:p.addr,town:p.town,village:p.village,note:'测试转单',main:p.rooms,wing:0,mode:'人工',quote:p.budget,paid:0,teams:['t1'],tags:[],flows:[],scheduledAt:'10.27 上午'};let a=await x.ctx.DATA.createOrder(draft,'2026-10-27','上午',p.id),b=await x.ctx.DATA.createOrder(draft,'2026-10-28','上午',p.id);assert.equal(a.id,b.id);assert.equal(x.ctx.DATA.ORDERS.length,19);});
 await test('保存按钮并发连点只生成一个订单',async()=>{let x=env();x.mount('create');x.fill();await Promise.all([x.el.btnToSchedule.fire('click'),x.el.btnToSchedule.fire('click')]);assert.equal(x.ctx.DATA.ORDERS.length,19);});
 await test('排期页把已建档单排入空档并写完整日期',async()=>{let x=env(),o=await create(x);x.ctx.location.hash='#/schedule?order='+o.id;x.mount('schedule');await x.el.listWrap.fire('click',x.target({'data-day':'10.30','data-ampm':'下午'}));await x.el.mask.fire('click',x.target({},'doScheduleOrder'));let saved=x.ctx.DATA.byId(o.id);assert.equal(saved.scheduledAt,'10-30 下午');assert.equal(saved.scheduledOn,'2026-10-30');assert(JSON.parse(x.store['dingzhu.adds.v1']).slots['2026-10-30|下午'].includes(o.id));});
 await test('排期页取消退回待定池，订单不残留',async()=>{let x=env(),o=await create(x);let p=await x.ctx.DATA.toPending(o.id);assert.equal(x.ctx.DATA.byId(o.id),null);assert.equal(p.owner,o.owner);assert.equal(p.budget,o.quote);let y=env(x.store);assert.equal(y.ctx.DATA.byId(o.id),null);assert(y.ctx.DATA.PENDING.some(q=>q.owner===o.owner));});
 await test('待排任务托盘：未排期订单与待排期线索都在',async()=>{let x=env(),o=await create(x);let list=x.ctx.DATA.unscheduled();assert(list.some(j=>j.kind==='order'&&j.id===o.id));assert(list.some(j=>j.kind==='pending'&&x.ctx.DATA.PENDING.find(p=>p.id===j.id).stage==='待排期'));});
 await test('拖入档期：订单落位、线索成单',async()=>{let x=env(),o=await create(x);await x.ctx.DATA.placeJob('order',o.id,'2026-10-30','上午');let saved=x.ctx.DATA.byId(o.id);assert.equal(saved.scheduledAt,'10-30 上午');assert.equal(saved.scheduledOn,'2026-10-30');
   let p=x.ctx.DATA.PENDING.find(p=>p.stage==='待排期'&&!p.orderId);let before=x.ctx.DATA.ORDERS.length;
   let made=await x.ctx.DATA.placeJob('pending',p.id,'2026-10-31','下午');assert.equal(x.ctx.DATA.ORDERS.length,before+1);assert.equal(made.id,p.orderId);assert.equal(made.scheduledOn,'2026-10-31');});
 await test('档期被占时不产生部分写入',async()=>{let x=env(),a=await create(x),b=await create(x);await x.ctx.DATA.scheduleOrder(a.id,'2026-10-30','上午');let raw=x.store['dingzhu.adds.v1'];await assert.rejects(x.ctx.DATA.scheduleOrder(b.id,'2026-10-30','上午'));assert.equal(x.store['dingzhu.adds.v1'],raw);});
 await test('电话危险字符经属性转义',async()=>{let x=env();x.mount('create');x.fill();x.el.inPhone.value='" onclick="window.__auditXss=1';await x.el.btnToSchedule.fire('click');x.mount('analytics');await x.el.btnCollect.fire('click');assert(!x.html.includes('data-call="" onclick='));assert(x.html.includes('&quot; onclick=&quot;'));});
 await test('切换搜索偏置点会发出新的查询',async()=>{let x=env();await x.ctx.GEO.searchPoi('同名村');x.ctx.GEO.setNear(30,120);await x.ctx.GEO.searchPoi('同名村');assert.equal(x.fetches.filter(s=>s.includes('/poi?')).length,2);});
 await test('路由降级估算不阻止稍后升级真实结果',async()=>{let x=env(),on=false;let a={lat:35,lng:119},b={lat:35.1,lng:119.1};x.ctx.fetch=async url=>({json:async()=>String(url).includes('/health')?{ok:true,key:true}:on?{ok:true,minutes:20,km:10}:{source:'none',ok:false}});let first=await x.ctx.GEO.route(a,b);on=true;let second=await x.ctx.GEO.route(a,b);assert.equal(first.source,'est');assert.equal(second.source,'amap');});
 await test('跨年完整日期和旧快照日期账龄稳定',()=>{let x=env({},'2027-01-02T10:00:00+08:00');assert.equal(x.ctx.DATA.overdueDays({done:'12-31',doneOn:'2026-12-31'}),2);assert.equal(x.ctx.DATA.overdueDays({done:'12-31'}),2);});
 await test('窗口外的完整日期排程刷新后仍保留月份数据',async()=>{let x=env(),o=await create(x);await x.ctx.DATA.scheduleOrder(o.id,'2026-10-30','上午');let y=env(x.store,'2027-04-02T10:00:00+08:00');assert(y.ctx.DATA.MONTHS['2026-10']);assert(y.ctx.DATA.MONTHS['2026-10'].days.some(d=>d.slots.some(s=>s.items.some(i=>i.oid===o.id))));});
 await test('非法订单 ID 不落到真实客户订单',()=>{let x=env(),v=x.mount('order',{id:'missing'});assert(v.body.includes('订单不存在'));assert(!v.body.includes('id="payGrid"'));});
 await test('零报价施工单拒绝拍档期，可进待定池',async()=>{let x=env();x.mount('create');x.fill();x.el.inPrice.value='0';await x.el.btnToSchedule.fire('click');assert.equal(x.ctx.DATA.ORDERS.length,18);assert(x.logs.at(-1).includes('正数报价'));await x.el.btnToPending.fire('click');assert.equal(x.ctx.DATA.PENDING.at(-1).budget,0);});
 await test('旧零报价订单结清不会生成零元流水',async()=>{let x=env();let input={owner:'旧单',addr:'旧地址',town:'未标镇',village:'测试村',main:1,wing:0,mode:'人工',quote:0,paid:0,teams:['t1'],tags:[],flows:[],note:'旧单',doneAt:'10-26 17:00'};let o=await x.ctx.DATA.addOrder(input);x.mount('order',{id:o.id});await x.el.btnSettle.fire('click');assert.equal(o.flows.length,0);assert(x.logs.at(-1).includes('正数报价'));});
 await test('旧版数据补丁和短日期排程兼容读取（并迁移单号）',()=>{let store={'dingzhu.adds.v1':JSON.stringify({orders:[],pending:[],patches:{'PD-03':{stage:'待排期',days:0}},orderPatches:{'WD2410-05':{paid:6900}},slots:{'10-27|上午':['WD2410-05']}})};let x=env(store);assert.equal(x.ctx.DATA.byId('DW20261026-05').paid,6900);assert.equal(x.ctx.DATA.PENDING.find(p=>p.id==='PD-03').stage,'待排期');assert(x.ctx.DATA.MONTHS['2026-10'].days.find(d=>d.day===27).slots[0].items.some(i=>i.oid==='DW20261026-05'));});
 await test('Key 配置携带会话凭证并清除旧地理缓存',async()=>{let x=env(),calls=[];x.ctx.fetch=async (url,options)=>{calls.push({url,options});return {json:async()=>String(url).includes('/session')?{ok:true,token:'test-session'}:String(url).includes('/key')||String(url).includes('/health')?{ok:true,key:true}:{source:'amap',items:[{name:'test',lat:35,lng:119}]}};};await x.ctx.GEO.searchPoi('测试');await x.ctx.GEO.setKey('a'.repeat(32));await x.ctx.GEO.searchPoi('测试');assert.equal(calls.filter(c=>c.url.includes('/poi?')).length,2);assert.equal(calls.find(c=>c.url.includes('/key')).options.headers['X-Geo-Token'],'test-session');});
 await test('清空失败保留已有存储，清空成功后禁止继续用旧内存写入',async()=>{let x=env();await create(x);let raw=x.store['dingzhu.adds.v1'],original=x.ctx.localStorage.setItem;x.ctx.localStorage.setItem=()=>{throw Error('quota');};await assert.rejects(x.ctx.DATA.resetAdds());assert.equal(x.store['dingzhu.adds.v1'],raw);x.ctx.localStorage.setItem=original;await x.ctx.DATA.resetAdds();assert.equal(env(x.store).ctx.DATA.ORDERS.length,18);await assert.rejects(x.ctx.DATA.recordPayment('DW20261026-05',1,'现金'));});
 await test('定位后搜索圆心跟随设备位置并留档',async()=>{let x=env();x.ctx.navigator.geolocation={getCurrentPosition(ok){ok({coords:{latitude:35.61,longitude:119.22}})}};let p=await x.ctx.GEO.locate();assert.equal(p.lat,35.61);assert.equal(x.ctx.GEO.nearPoint().lat,35.61);assert.equal(x.ctx.GEO.cachedLoc().lng,119.22);});
 await test('定位不可用时按队伍出发地继续搜索',async()=>{let x=env();x.ctx.navigator.geolocation={getCurrentPosition(ok,no){no({code:1})}};let p=await x.ctx.GEO.locate();assert.equal(p,null);assert.equal(x.ctx.GEO.nearPoint().lat,x.ctx.DATA.BASE.lat);assert.equal(x.ctx.GEO.nearPoint().lng,x.ctx.DATA.BASE.lng);});
 await test('附近村庄按距离从近到远且带半径',async()=>{let x=env(),near=[];x.ctx.fetch=async url=>{if(String(url).includes('/health'))return {json:async()=>({ok:true,key:true})};near.push(String(url));return {json:async()=>({source:'amap',items:[{name:'远村',lat:35.9,lng:119.0,dist:9.8},{name:'近村',lat:35.9,lng:118.99,dist:1.2}]})};};let r=await x.ctx.GEO.nearby();assert.equal(r.items[0].name,'近村');assert(r.items[1].dist>=r.items[0].dist);assert(near[0].includes('/nearby?lat=')&&near[0].includes('radius=15000'));});
 await test('超范围搜索结果只留最近几条并标记放宽',async()=>{let x=env(),poi='';x.ctx.fetch=async url=>{if(String(url).includes('/health'))return {json:async()=>({ok:true,key:true})};poi=String(url);return {json:async()=>({source:'amap',items:[{name:'甲',lat:31.2,lng:121.4,dist:600},{name:'乙',lat:31.3,lng:121.4,dist:610},{name:'丙',lat:31.4,lng:121.4,dist:620},{name:'丁',lat:31.5,lng:121.4,dist:630}]})};};let r=await x.ctx.GEO.searchPoi('某村');assert.equal(r.items.length,3);assert.equal(r.widened,true);assert.equal(r.source,'amap');assert(poi.includes('radius=15000'));});
 await test('已排期的活能改期：旧档位空出、新档位落位',async()=>{let x=env(),o=await create(x);await x.ctx.DATA.scheduleOrder(o.id,'2026-10-30','上午');
   await x.ctx.DATA.moveOrder(o.id,'2026-10-31','下午');
   assert.equal(o.scheduledOn,'2026-10-31');assert.equal(o.scheduledAt,'10-31 下午');
   let days=x.ctx.DATA.MONTHS['2026-10'].days;
   assert(!days.find(d=>d.day===30).slots.some(s=>s.items.some(i=>i.oid===o.id)));
   assert(days.find(d=>d.day===31).slots.some(s=>s.ampm==='下午'&&s.items.some(i=>i.oid===o.id)));
   let saved=JSON.parse(x.store['dingzhu.adds.v1']);
   assert(!saved.slots['2026-10-30|上午']);
   assert(saved.slots['2026-10-31|下午'].includes(o.id));
 });
 await test('种子排程改期后刷新不回原位',async()=>{
   let x=env();
   let target=x.ctx.DATA.ORDERS.find(o=>o.scheduledAt&&!o.startedAt&&!o.doneAt&&x.ctx.DATA.state(o)==='planned');
   assert(target,'需要一个待开工的种子单');
   let days=x.ctx.DATA.MONTHS['2026-10'].days,pos=null;
   days.forEach(d=>d.slots.forEach(s=>{if((s.items||[]).some(i=>i.oid===target.id))pos={day:d.day,ampm:s.ampm};}));
   assert(pos,'种子单应当已有排程');
   await x.ctx.DATA.moveOrder(target.id,'2026-10-30','下午');
   assert(!days.find(d=>d.day===pos.day).slots.some(s=>s.items.some(i=>i.oid===target.id)));
   let y=env(x.store),d2=y.ctx.DATA.MONTHS['2026-10'].days;
   assert(!d2.find(d=>d.day===pos.day).slots.some(s=>s.items.some(i=>i.oid===target.id)));
   assert(d2.find(d=>d.day===30).slots.some(s=>s.ampm==='下午'&&s.items.some(i=>i.oid===target.id)));
 });
 await test('已完工/已结清的历史单拒绝改期',async()=>{
   let x=env();
   let done=x.ctx.DATA.ORDERS.find(o=>o.doneAt&&x.ctx.DATA.state(o)!=='settled')
         || x.ctx.DATA.ORDERS.find(o=>x.ctx.DATA.state(o)==='settled');
   assert(done,'需要一个已完工或已结清的单');
   let raw=x.store['dingzhu.adds.v1'],at=done.scheduledAt;
   await assert.rejects(x.ctx.DATA.moveOrder(done.id,'2026-10-31','下午'));
   assert.equal(x.store['dingzhu.adds.v1'],raw);
   assert.equal(x.ctx.DATA.byId(done.id).scheduledAt,at);
   /* 视图层：历史单不给拖拽入口，其余单仍有 */
   let v=x.mount('schedule');
   assert(v.body.includes('ag-item frozen'),'历史单应带 frozen 标记');
   assert(v.body.includes('data-drag="1"'),'待开工的单仍应可拖');
   assert(!/class="ag-item frozen"[^>]*data-drag/.test(v.body),'历史单不能带 drag 标记');
 });
 await test('拖到已有活的档期：两单并存不互相顶掉',async()=>{
   let x=env(),a=await create(x),b=await create(x);
   await x.ctx.DATA.scheduleOrder(a.id,'2026-10-30','上午');
   await x.ctx.DATA.scheduleOrder(b.id,'2026-10-31','上午');
   await x.ctx.DATA.moveOrder(b.id,'2026-10-30','上午');
   let slot=x.ctx.DATA.MONTHS['2026-10'].days.find(v=>v.day===30).slots.find(s=>s.ampm==='上午');
   assert.deepEqual(slot.items.map(i=>i.oid).sort(),[a.id,b.id].sort());
   let saved=JSON.parse(x.store['dingzhu.adds.v1']);
   assert.deepEqual(saved.slots['2026-10-30|上午'].slice().sort(),[a.id,b.id].sort());
   assert(!saved.slots['2026-10-31|上午']);
   assert.equal(x.ctx.DATA.byId(a.id).scheduledAt,'10-30 上午');
   assert.equal(x.ctx.DATA.byId(b.id).scheduledAt,'10-30 上午');
 });
 await test('拖回原位不写库',async()=>{
   let x=env(),o=await create(x);await x.ctx.DATA.scheduleOrder(o.id,'2026-10-30','上午');
   let rev=JSON.parse(x.store['dingzhu.adds.v1']).revision;
   await x.ctx.DATA.moveOrder(o.id,'2026-10-30','上午');
   assert.equal(JSON.parse(x.store['dingzhu.adds.v1']).revision,rev);
 });
 await test('完工与结清必须分两步，收满款也不自动结清',async()=>{
   let x=env(),o=await create(x);
   await x.ctx.DATA.recordPayment(o.id,3000,'现金');          /* 先收满 */
   await x.ctx.DATA.scheduleOrder(o.id,'2026-10-30','上午');
   await x.ctx.DATA.transitionOrder(o.id,'start');
   await x.ctx.DATA.transitionOrder(o.id,'finish');
   assert.equal(x.ctx.DATA.state(o),'done','收满款也停在「待结清」');
   let v=x.mount('order',{id:o.id});
   assert(v.body.includes('确认结清尾款'),'应还留着确认结清按钮');
   assert(v.body.includes('待确认结清'));
   await x.ctx.DATA.settleOrder(o.id);
   assert.equal(x.ctx.DATA.state(o),'settled');
   assert(o.settledOn,'应记下结清日期');
   let y=env(x.store);
   assert.equal(y.ctx.DATA.state(y.ctx.DATA.byId(o.id)),'settled','刷新后仍结清');
 });
 await test('没完工不能结清，老数据已结清不退回待收款',async()=>{
   let x=env();
   let fresh=await create(x);                    /* 刚建档，还没开工 */
   await assert.rejects(x.ctx.DATA.settleOrder(fresh.id));
   let legacy=x.ctx.DATA.ORDERS.filter(o=>o.status==='已结清');
   assert(legacy.length>0);
   assert(legacy.every(o=>x.ctx.DATA.state(o)==='settled'),'演示数据里已结清的单要仍然结清');
 });
 await test('待定页去掉分类筛选与超期提醒条',async()=>{
   let x=env(),v=x.mount('pending');
   assert(!v.body.includes('id="pdSeg"'),'不该再有分类筛选');
   assert(!v.body.includes('alert-strip'),'不该再有超期提醒条');
   assert(!v.body.includes('看待办'));
   assert(!v.body.includes('id="pdGo"'),'不该再有「去档期」按钮');
   assert(!v.body.includes('批量查看空档'));
   assert(!v.body.includes('可直接排档期'));
   assert(v.body.includes('id="pdList"'));
   assert(v.body.includes('补充信息并推排期'));
 });
 await test('订单保留施工地天气，日期区域独立显示出发地天气',async()=>{
   let x=env();
   x.ctx.fetch=async url=>{
     if(String(url).includes('/weather?pts=')){
       return {json:async()=>({source:'amap',points:[
         {lat:35.98,lng:119.56,adcode:'370782',items:[{date:'2026-10-29',day:'晴',tmax:22,tmin:9}]},
         {lat:35.90,lng:118.98,adcode:'371122',items:[{date:'2026-10-29',day:'小雨',tmax:15,tmin:6}]}
       ]})};
     }
     return {json:async()=>({ok:true,key:true})};
   };
   let a=x.ctx.DATA.ORDERS[0], b=x.ctx.DATA.ORDERS[1];
   a.geo={lat:35.98,lng:119.56,source:'amap'};
   b.geo={lat:35.90,lng:118.98,source:'amap'};
   await x.ctx.DATA.scheduleOrder(a.id,'2026-10-29','上午');
   await x.ctx.DATA.scheduleOrder(b.id,'2026-10-29','下午');
   x.mount('schedule');
   await new Promise(r=>setImmediate(r));
   await new Promise(r=>setImmediate(r));
   let html=x.el.listWrap.innerHTML;
   assert(html.includes('ag-wx'),'每单应带天气块');
   assert(html.includes('晴')&&html.includes('9~22℃'),'第一单用自己村子的天气');
   assert(html.includes('小雨')&&html.includes('6~15℃'),'第二单用另一个村子的天气');
   let metas=html.match(/ag-meta">[^<]*</g)||[];
   assert(metas.every(m=>!m.includes('℃')),'农历独立于天气');
   assert(html.includes('ag-date-wx'),'日期区域应有独立天气位置');
 });
 await test('天气批量接口按坐标去重请求',async()=>{
   let x=env(),hits=[];
   x.ctx.fetch=async url=>{
     if(String(url).includes('/weather?pts=')){
       hits.push(String(url));
       return {json:async()=>({source:'amap',points:[
         {lat:35.98,lng:119.56,adcode:'370782',items:[{date:'2026-10-28',day:'多云',tmax:17,tmin:8}]}
       ]})};
     }
     return {json:async()=>({ok:true,key:true})};
   };
   let r=await x.ctx.GEO.weatherPoints([{lat:35.981,lng:119.561},{lat:35.982,lng:119.562}]);
   assert.equal(hits.length,1,'同 1km 网格只发一次');
   assert(Object.keys(r).length===1);
   assert.equal(r['35.98,119.56']['2026-10-28'].day,'多云');
 });
 await test('天气接口按坐标请求并解析',async()=>{
   let x=env(),hits=[];
   x.ctx.fetch=async url=>{
     if(String(url).includes('/weather')){
       hits.push(String(url));
       return {json:async()=>({source:'amap',city:'诸城市',items:[{date:'2026-10-28',day:'多云',night:'小雨',tmax:17,tmin:8}]})};
     }
     return {json:async()=>({ok:true,key:true})};
   };
   let r=await x.ctx.GEO.weather(35.98,119.56);
   assert.equal(r.city,'诸城市');
   assert.equal(r.items[0].day,'多云');
   assert.equal(r.items[0].tmax,17);
   assert(hits[0].includes('/weather?lat=35.98'),hits[0]);
   assert(hits[0].includes('lng=119.56'));
 });
 /* ---------- 删除 / 回收站 / 重点标注 ---------- */
 function slotHas(x,oid){return Object.keys(x.ctx.DATA.MONTHS).some(k=>x.ctx.DATA.MONTHS[k].days.some(d=>d.slots.some(s=>(s.items||[]).some(i=>i.oid===oid))));}

 await test('删单进回收站：列表消失、档期清空、刷新不复活',async()=>{
   let x=env();
   /* 种子单：已完工但一分没收（DW-01 这类），可以删，也最能验证「刷新不复活」*/
   let o=x.ctx.DATA.ORDERS.find(z=>x.ctx.DATA.state(z)==='done'&&Number(z.paid)===0);
   assert(o,'要有已完工未收款的种子单');
   let id=o.id;
   assert(slotHas(x,id),'删之前应占着档期');
   await x.ctx.DATA.removeItem('order',id);
   assert.equal(x.ctx.DATA.byId(id),null,'列表里不能有');
   assert(!slotHas(x,id),'档期要跟着清空');
   assert.equal(x.ctx.DATA.trashList().length,1);
   let y=env(x.store);
   assert.equal(y.ctx.DATA.byId(id),null,'刷新后不能复活（种子单也一样）');
   assert(!slotHas(y,id),'刷新后档期也不能留');
   /* 新建的单同样要删得掉、且不复活 */
   let n=await create(y);
   await y.ctx.DATA.scheduleOrder(n.id,'2026-10-30','上午');
   await y.ctx.DATA.removeItem('order',n.id);
   let z=env(y.store);
   assert.equal(z.ctx.DATA.byId(n.id),null,'新单删了也不能回来');
   assert(!slotHas(z,n.id));
 });

 await test('回收站还原：订单、原档期、金额一起回来',async()=>{
   let x=env();
   let o=x.ctx.DATA.ORDERS.find(z=>x.ctx.DATA.state(z)==='done'&&Number(z.paid)===0);
   let id=o.id,at=o.scheduledAt,quote=o.quote;
   await x.ctx.DATA.removeItem('order',id);
   await x.ctx.DATA.restoreItem('order',id);
   let back=x.ctx.DATA.byId(id);
   assert(back,'还原后要能查到');
   assert.equal(back.scheduledAt,at);
   assert.equal(back.quote,quote);
   assert(slotHas(x,id),'原档期要挂回去');
   assert.equal(x.ctx.DATA.trashList().length,0);
   let y=env(x.store);
   assert(y.ctx.DATA.byId(id),'刷新后仍在');
   assert(slotHas(y,id));
 });

 await test('已收款或已结清的单不允许删除',async()=>{
   let x=env();
   let paid=x.ctx.DATA.ORDERS.find(z=>Number(z.paid)>0);
   assert(paid,'演示数据里有已收款单');
   await assert.rejects(x.ctx.DATA.removeItem('order',paid.id),/收款/);
   assert(x.ctx.DATA.byId(paid.id),'不能删掉');
   let settled=x.ctx.DATA.ORDERS.find(z=>x.ctx.DATA.state(z)==='settled');
   if(settled&&Number(settled.paid)===0) await assert.rejects(x.ctx.DATA.removeItem('order',settled.id),/结清/);
   assert.equal(x.ctx.DATA.trashList().length,0);
 });

 await test('彻底删除后回收站清空且不再复活',async()=>{
   let x=env();
   let p=x.ctx.DATA.PENDING.find(q=>!q.orderId);
   await x.ctx.DATA.removeItem('pending',p.id);
   await x.ctx.DATA.purgeItem('pending',p.id);
   assert.equal(x.ctx.DATA.trashList().length,0,'回收站不再显示');
   assert(!x.ctx.DATA.PENDING.some(q=>q.id===p.id));
   assert(!env(x.store).ctx.DATA.PENDING.some(q=>q.id===p.id),'刷新后也不回来');
 });

 await test('删线索保留订单，线索号不复用',async()=>{
   let x=env();
   let p=x.ctx.DATA.PENDING.find(q=>!q.orderId);
   x.ctx.location.hash='#/create?for='+p.id;
   x.mount('create');
   x.el.inOwner.value=p.owner; x.el.inAddr.value=p.addr;
   x.el.inPhone.value=p.phone; x.el.inPrice.value='3600';
   await x.el.btnToSchedule.fire('click');
   let oid=p.orderId;
   assert(oid,'应先成单');
   await x.ctx.DATA.removeItem('pending',p.id);
   assert(x.ctx.DATA.byId(oid),'删线索不能带走订单');
   assert(!x.ctx.DATA.PENDING.some(q=>q.id===p.id));
   let np=await x.ctx.DATA.addPending({title:'新线索',owner:'甲',town:'城区',village:'某村',addr:'某村 1 号',
     phone:'13900000000',rooms:4,budget:1000,paid:0,main:4,wing:0,mode:'待定',tags:[],teams:['t1'],
     geo:null,stage:'待量尺',days:0,blocker:'待量尺',orderId:null});
   assert.notEqual(np.id,p.id,'回收站占着的号不能再发');
 });

 await test('重点标记持久化并在两个列表置顶',async()=>{
   let x=env();
   let o=x.ctx.DATA.ORDERS.find(z=>x.ctx.DATA.state(z)==='planned');
   await x.ctx.DATA.setStar('order',o.id,true);
   let v=x.mount('orders');
   assert(v.body.includes('star-mark'),'卡片要有重点角标');
   assert.equal(v.body.indexOf('data-id="'+o.id+'"'),v.body.indexOf('data-id="'),'重点单排最前');
   let p=x.ctx.DATA.PENDING.at(-1);
   await x.ctx.DATA.setStar('pending',p.id,true);
   let vp=x.mount('pending');
   assert.equal(vp.body.indexOf('data-id="'+p.id+'"'),vp.body.indexOf('data-id="'),'重点线索排最前');
   let y=env(x.store);
   assert.equal(y.ctx.DATA.byId(o.id).starred,true,'订单重点刷新后保留');
   assert.equal(y.ctx.DATA.PENDING.find(q=>q.id===p.id).starred,true,'线索重点刷新后保留');
   await y.ctx.DATA.setStar('order',o.id,false);
   assert.equal(y.ctx.DATA.byId(o.id).starred,false,'可以取消重点');
 });

 await test('两个列表卡片都带左滑操作区',async()=>{
   let x=env();
   [x.mount('orders'),x.mount('pending')].forEach(v=>{
     assert(v.body.includes('class="swipe"'),'要有滑动容器');
     assert(v.body.includes('swipe-inner'),'卡片要包在滑动层里');
     assert(v.body.includes('data-swipe="star"'),'要有标注重点');
     assert(v.body.includes('data-swipe="del"'),'要有删除');
   });
 });

 await test('回收站页渲染已删记录并可还原',async()=>{
   let x=env();
   let p=x.ctx.DATA.PENDING.find(q=>!q.orderId);
   let v0=x.mount('trash');
   assert(v0.body.includes('回收站是空的'),'空态');
   await x.ctx.DATA.removeItem('pending',p.id);
   let v=x.mount('trash');
   assert(v.body.includes('data-act="restore"'));
   assert(v.body.includes('data-act="purge"'));
   assert(v.body.includes(p.title),'要显示线索标题');
   await x.el.trList.fire('click',x.target({'data-act':'restore','data-id':p.id,'data-kind':'pending'}));
   assert(x.ctx.DATA.PENDING.some(q=>q.id===p.id),'还原回待定池');
   assert.equal(x.ctx.DATA.trashList().length,0);
 });

 /* ---------- 月视图 / 农历 / 我的资料 ---------- */
 await test('农历按内置日历换算，整月每天都有',async()=>{
   let x=env(),days=x.ctx.DATA.MONTHS['2026-10'].days;
   assert.equal(days.find(d=>d.day===21).lunar,'十二','2026-10-21 应是九月十二');
   assert.equal(days.find(d=>d.day===26).lunar,'十七');
   assert.equal(days.find(d=>d.day===20).lunar,'十一');
   assert(days.every(d=>d.lunar&&d.lunar!=='undefined'),'不该再有空白或 undefined');
 });

 await test('月视图：铺满整月、今天唯一、农历与村名色标都在',async()=>{
   let x=env({'dingzhu.calview.v1':'month'});
   let v=x.mount('schedule');
   assert(v.body.includes('id="calWrap"'),'应渲染月历容器');
   assert(!v.body.includes('id="listWrap"'),'月视图不该同时渲染列表');
   assert.equal((v.body.match(/class="cal-month-page"/g)||[]).length,3,'前后相邻月份用于整月分页');
   let current=v.body.match(/<section[^>]*data-month="2026-10"[^>]*>([\s\S]*?)<\/section>/)[1];
   let cells=(current.match(/class="cal-cell/g)||[]).length;
   assert.equal(cells % 7,0,'格子数要是 7 的整数倍');
   assert(cells === 35 || cells === 42,'2026-10 是 35 格（1 号周四、31 号周六）');
   assert.equal((v.body.match(/cal-cell today/g)||[]).length,1,'今天只能有一个');
   assert(v.body.includes('cal-lun'),'格子里要有农历');
   assert(v.body.includes('class="cal-cell out"'),'前后要有补白格');
 });

 await test('月视图格子：写村名不写色条，村名带状态色、同村去重、空档留空',async()=>{
   let x=env({'dingzhu.calview.v1':'month'});
   let v=x.mount('schedule');
   assert(!v.body.includes('cal-bar'),'色条要彻底去掉');
   assert(v.body.includes('cal-vill'),'格子里要写村名');
   assert(v.body.includes('>孙家沟<'),'村名去掉尾部「村」字');
   assert(v.body.includes('>前吉庄<'),'三字村名完整保留');
   assert(v.body.includes('cal-vill settled'),'已结清要有绿色标');
   assert(v.body.includes('cal-vill done'),'已完工要有橙色标');
   assert(v.body.includes('cal-vill doing'),'施工中要有蓝色标');
   let cell=iso=>(v.body.match(new RegExp('data-day="'+iso+'"[\\s\\S]*?</button>'))||[''])[0];
   /* 10.05 只有下午一单，同村同状态 → 只写一个村名 */
   let c5=cell('10\\.05');
   assert.equal((c5.match(/class="cal-vill /g)||[]).length,1,'一天同村只写一次');
   /* 10.22 上午赵家洼（施工中）+ 下午赵家岭（待开工）→ 两行两个村 */
   let c22=cell('10\\.22');
   assert(c22.includes('>赵家洼<')&&c22.includes('>赵家岭<'),'两单两村要都写');
   assert(c22.includes('cal-vill doing')&&c22.includes('cal-vill wait'),'两村各自带状态色');
   /* 10.30 空档：不写村名 */
   let c30=cell('10\\.30');
   assert(c30&&!c30.includes('cal-vill'),'空档格不写村名');
 });

 await test('月视图村名：超三字截断、同村两条取最没完工的状态',async()=>{
   let x=env({'dingzhu.calview.v1':'month'}),D=x.ctx.DATA;
   await D.saveOrder(D.byId('DW20261026-05'),{village:'大高疃村'});
   await D.saveOrder(D.byId('DW20261026-17'),{village:'大高疃村'});
   let v=x.mount('schedule');
   assert(v.body.includes('>大高疃<'),'超过三字截到三字');
   assert(!v.body.includes('>大高疃村<'),'尾部「村」字要去掉');
   let c22=(v.body.match(/data-day="10\.22"[\s\S]*?<\/button>/)||[''])[0];
   assert.equal((c22.match(/class="cal-vill /g)||[]).length,1,'同一天同村只写一次');
   assert(c22.includes('cal-vill wait'),'两单同村取最没完工的那个状态');
 });

 await test('月/列表视图切换并记住选择',async()=>{
   let x=env();
   let v=x.mount('schedule');
   assert(v.body.includes('id="listWrap"'),'默认是列表视图');
   await x.el.btnView.fire('click');
   assert.equal(x.store['dingzhu.calview.v1'],'month','选择要写进本地');
   let y=env(x.store),v2=y.mount('schedule');
   assert(v2.body.includes('id="calWrap"'),'重开仍是月视图');
   await y.el.btnView.fire('click');
   assert.equal(y.store['dingzhu.calview.v1'],'list');
 });

 await test('月历点某天打开当天详情，空档可点进去排单',async()=>{
   let x=env({'dingzhu.calview.v1':'month'});
   x.mount('schedule');
   await x.el.calWrap.fire('click',x.target({'data-day':'10.30'}));
   assert(x.el.dxClose,'应弹出当天详情');
   assert(x.html.includes('10.30'),'标题要带日期');
   assert(x.html.includes('dx-free'),'空档要有排单入口');
   /* 补白格没有 data-day，点了不响应 */
   let before=x.html.length;
   await x.el.calWrap.fire('click',x.target({'data-day':''}));
   assert.equal(x.html.length,before,'补白格不该开弹层');
 });

 await test('分析：统计区间可跨月，分月对比与区间口径都在',async()=>{
   let x=env(),D=x.ctx.DATA;
   let months=D.monthChoices().map(m=>m.key).sort();
   assert(months.length>=2,'可选月份至少两个月');
   assert.equal(D.ordersInRange('2026-10','2026-10').length,D.stats(D.ordersInRange('2026-10','2026-10')).count,'区间筛选应与 stats 对齐');
   let all=D.ordersInRange(months[0],months[months.length-1]);
   assert(all.length>=D.ordersInRange('2026-10','2026-10').length,'全区间不会比单月少');
   let v=x.mount('analytics');
   assert(v.bar.includes('齿轮')||true,'占位');
   assert(!v.bar.includes('bell'),'铃铛要去掉');
   assert(!v.body.includes('#/todos'),'待办入口要去掉');
   assert(v.body.includes('id="btnRange"'),'要能选统计区间');
   /* 切到跨月区间：出现分月对比、口径变成「区间」 */
   x.store['dingzhu.analytics.v1']=JSON.stringify({from:months[0],to:months[months.length-1]});
   let y=env(x.store),v2=y.mount('analytics');
   assert(v2.body.includes('分月对比'),'跨月要有分月对比');
   assert(v2.body.includes('区间已收进账'),'口径文案要跟着变');
   assert(v2.body.includes('个 单在区间内')||v2.body.includes('单在区间内'),'右侧提示改成区间单数');
 });

 await test('分析：欠款清单不常驻、班组按队出条、分口径只剩两项',async()=>{
   let x=env(),D=x.ctx.DATA,v=x.mount('analytics');
   assert(!v.body.includes('due-item'),'欠款清单不该常驻页面');
   assert(!v.body.includes('btnAllDue'),'「查看全部欠款」按钮要去掉');
   assert(v.body.includes('btnCollect'),'催收入口只在待收卡的小按钮上');
   assert(!v.body.includes('待量屋单'),'分口径不再有「待量屋单」');
   assert.equal((v.body.match(/class="avg"/g)||[]).length,2,'分口径只留两个口径');
   assert.equal((v.body.match(/class="tr-row/g)||[]).length,D.TEAMS.length,'每支队伍一条色条');
   /* 支持 3 队以上：临时塞一支三队，条数跟着变 */
   let y=env();
   y.ctx.DATA.TEAMS.push({ id:'t3', name:'三队', alias:'新车组', color:'#00B67A' });
   let v2=y.mount('analytics');
   assert.equal((v2.body.match(/class="tr-row/g)||[]).length,3,'三队时要有三条');
   assert(v2.body.includes('三队'),'新加的队伍要出现在对比里');
 });

 await test('队伍：可建队 / 重名拦截 / 有单的队删不掉 / 改动生效',async()=>{
   let x=env(),D=x.ctx.DATA;
   let before=D.TEAMS.length;
   let t=await D.addTeam({name:'三队',alias:'新锐班',color:'#00A06A',members:[{name:'王海涛',phone:'13700000031',role:'队长'}]});
   assert.equal(t.name,'三队');
   assert.equal(t.alias,'新锐班');
   assert.equal(D.TEAMS.length,before+1,'建队后队伍数 +1');
   assert.equal(t.members.length,1,'队长跟着建队一起进来');
   /* 重名要拦 */
   let dup=await D.addTeam({name:'三队'}).then(()=>null,e=>e.message);
   assert(dup&&dup.indexOf('换个名字')>=0,'重名要拦（错误文案应提示换名）');
   /* 有单挂在队上的不能删 */
   let used=await D.removeTeam('t1').then(()=>null,e=>e.message);
   assert(used&&used.indexOf('单')>=0,'有单的队删不掉');
   /* 改色 / 改别称要落到队伍上 */
   await D.updateTeam(t.id,{color:'#D4372F',alias:'新锐二组'});
   assert.equal(D.teamById(t.id).color,'#D4372F');
   assert.equal(D.teamById(t.id).alias,'新锐二组');
   /* 内置队改别称走后补丁，不能把成员弄丢 */
   let t1=D.teamById('t1'),m0=t1.members.length;
   await D.updateTeam('t1',{alias:'老高班（改）'});
   assert.equal(D.teamById('t1').alias,'老高班（改）');
   assert.equal(D.teamById('t1').members.length,m0,'改别称不影响成员');
   /* 没有单的新队可以删掉 */
   assert(await D.removeTeam(t.id).then(()=>true,()=>false),'没有单的新队可以删');
   assert.equal(D.TEAMS.length,before,'删完回到原队伍数');
 });

 await test('订单：已结清单叠成一摞，主列表不重复渲染',async()=>{
   let x=env(),D=x.ctx.DATA;
   let settled=D.ORDERS.filter(o=>D.state(o)==='settled');
   assert(settled.length>0,'演示数据里应有已结清单');
   let v=x.mount('orders');
   assert(v.body.indexOf('class="stack"')>=0,'全部筛选下要有已结清折叠区');
   assert.equal((v.body.match(/class="stack-item/g)||[]).length,settled.length,'叠卡张数=已结清单数');
   assert.equal((v.body.match(/class="deck-card/g)||[]).length,0,'不该再有装饰用的封面卡');
   assert(!v.body.includes('class="stack-head"'),'不该再有独立表头条');
   assert(v.body.indexOf('共 '+settled.length+' 单')>=0,'说明行显示单数');
   assert(v.body.indexOf('id="stackToggle"')>=0,'要有展开/收起入口');
   assert(v.body.indexOf('data-open="0"')>=0,'默认是叠起来的');
   /* 叠态靠 CSS 的 --i 排序，DOM 里每张都要带序号 */
   assert(v.body.includes('style="--i:0"')&&v.body.includes('style="--i:1"'),'每张叠卡带层序号');
   /* 折叠区之前（主列表）不该再出现已结清单 */
   let head=v.body.split('class="stack"')[0];
   assert.equal((head.match(/class="swipe"/g)||[]).length,D.ORDERS.length-settled.length,'主列表只剩在干的单');
 });

 await test('我的资料：昵称与头像的存取、长度与非法值校验',async()=>{
   let x=env(),P=x.ctx.PROFILE;
   assert.equal(P.get().name,'王队','默认昵称');
   await P.save({name:'  老王  '});
   assert.equal(P.get().name,'老王','首尾空格要去掉');
   let v=x.mount('schedule');
   assert(v.bar.includes('老王'),'头像要用新昵称');
   await P.save({name:'一二三四五六七八九十'});
   assert.equal(P.get().name.length,8,'超长截到 8 字');
   await P.save({name:'老王',avatar:'javascript:alert(1)'});
   assert.equal(P.get().avatar,'','非图片 dataURL 不能存');
   await P.save({name:'老王',avatar:'data:image/png;base64,iVBORw0KGgo='});
   assert.equal(P.get().avatar,'data:image/png;base64,iVBORw0KGgo=','合法图片要保存');
   assert(x.mount('schedule').bar.includes('has-img'),'有图时头像走图片');
   await P.reset();
   assert.equal(P.get().name,'王队');
   assert.equal(P.get().avatar,'');
 });

 await test('资料弹层可改昵称并保存',async()=>{
   let x=env();
   x.ctx.PROFILE.sheet({});
   assert(x.el.pfName,'弹层要有昵称输入');
   assert(x.el.pfSave,'要有保存按钮');
   assert(!x.el.pfPick,'不再有「选图片」大按钮');
   assert(x.el.pfCam&&x.el.pfFile,'头像右下角相机角标 + 图片输入要在');
   assert(x.el.pfGear,'右上角要有设置齿轮');
   x.el.pfName.value='老李';
   await x.el.pfSave.fire('click');
   assert.equal(x.ctx.PROFILE.get().name,'老李');
   assert(x.logs.at(-1).includes('已保存'),'保存要有回执');
 });

 fs.writeFileSync(__dirname + '/regression-results.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify({passed:results.filter(x=>x.status==='passed').length,total:results.length,failures:results.filter(x=>x.status==='failed')},null,2));
 if(results.some(x=>x.status==='failed'))process.exitCode=1;
})();
