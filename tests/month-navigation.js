const assert=require('assert/strict');
const {env}=require('./harness');
(async()=>{
 let x=env(),v=x.mount('schedule');const before=JSON.stringify(x.ctx.DATA.ORDERS);
 assert(v.bar.includes('id="monthPick"'));
 await x.el.monthNext.fire('click');v=x.mount('schedule');assert(v.bar.includes('2026年 11月'));
 await x.el.monthNext.fire('click');x.mount('schedule');await x.el.monthNext.fire('click');v=x.mount('schedule');assert(v.bar.includes('2027年 1月'));
 assert.equal((v.body.match(/class="ag-date-wx/g)||[]).length,31,'尚无订单月份也有全部日期');
 assert(v.body.includes('全天可排'));
 await x.el.monthPrev.fire('click');v=x.mount('schedule');assert(v.bar.includes('2026年 12月'));
 await x.el.monthPick.fire('click');assert.equal((x.html.match(/data-m=/g)||[]).length,12);assert(!x.html.includes('mcell off'));
 await x.el.mask.fire('click',x.target({},'monthYearNext'));assert(x.html.includes('2027 年'));
 await x.el.mask.fire('click',x.target({'data-m':'2027-02'}));v=x.mount('schedule');assert(v.bar.includes('2027年 2月'));
 assert.equal((v.body.match(/class="ag-date-wx/g)||[]).length,28);
 assert.equal(JSON.stringify(x.ctx.DATA.ORDERS),before,'切月不改订单');
 assert.equal(x.ctx.DATA.ensureMonth('2028-02').days.length,29);
 assert.throws(()=>x.ctx.DATA.ensureMonth('2027-13'));
 for(const direction of [-1,1]){
   x=env({'dingzhu.calview.v1':'month'});let timers=[];x.ctx.setTimeout=fn=>(timers.push(fn),timers.length);
   x.mount('schedule');let wrap=x.el.calWrap;wrap.isConnected=true;wrap.clientHeight=500;wrap.scrollTop=direction===1?1000:0;
   await wrap.fire('touchstart');await wrap.fire('scroll');timers.pop()();
   assert(x.ctx.VIEWS.schedule().bar.includes('2026年 10月'),'手指未松开不切换');
   await wrap.fire('touchend');timers.pop()();
   assert(x.ctx.VIEWS.schedule().bar.includes(direction===1?'2026年 11月':'2026年 9月'));
 }
 x=env({'dingzhu.calview.v1':'month'});let timers=[],snap;x.ctx.setTimeout=fn=>(timers.push(fn),timers.length);x.mount('schedule');let wrap=x.el.calWrap;wrap.isConnected=true;wrap.clientHeight=500;wrap.scrollTop=600;wrap.scrollTo=value=>snap=value;await wrap.fire('scroll');timers.pop()();assert.equal(snap.top,500,'小幅滑动回到完整本月');
 x=env();const order=x.ctx.DATA.ORDERS.find(o=>x.ctx.DATA.state(o)==='done'&&x.ctx.DATA.due(o)>0);let message='';x.ctx.navigator.clipboard={writeText:async text=>message=text};x.mount('order',{id:order.id});await x.el.btnCallAgain.fire('click');assert(message.includes(order.owner));assert(message.includes('尚有尾款'));assert(!message.includes(order.addr),'催款不含施工地址');
 console.log('Month navigation checks passed: list/month entry, cross-year, 12-month picker, blank month, leap year, touch release, bidirectional paging, snap-back, unchanged orders, reminder address removed');
})().catch(e=>{console.error(e);process.exitCode=1});
