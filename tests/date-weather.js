const assert=require('assert/strict');
const {env}=require('./harness');
const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));};
(async()=>{
 let x=env(),calls=0;
 x.ctx.GEO.weather=async()=>{calls++;return {items:[{date:'2026-10-26',day:'晴',tmin:8,tmax:20},{date:'2026-10-27',day:'小雨',tmin:7,tmax:18}]};};
 x.mount('schedule');await flush();let html=x.el.listWrap.innerHTML;
 assert.equal(calls,1,'空档日共用一次查询');
 assert(html.includes('小雨')&&html.includes('7~18℃'));
 const emptyDay=html.slice(html.indexOf('<b class="ag-dnum">10.27'),html.indexOf('<b class="ag-dnum">10.28'));
 assert(emptyDay.includes('全天可排')&&emptyDay.includes('小雨'),'空档日也显示天气');
 assert(html.includes('无历史天气')&&html.includes('暂无预报'));
 assert.equal((html.match(/class="ag-date-wx/g)||[]).length,31,'每个日期都有天气位置');
 x=env();x.ctx.GEO.weather=async()=>({items:[]});x.ctx.GEO.status=()=>({online:false,key:false});x.mount('schedule');await flush();assert(x.el.listWrap.innerHTML.includes('请配置地图 Key'));
 x=env();x.ctx.GEO.weather=async()=>({items:[]});x.ctx.GEO.status=()=>({online:true,key:true});x.ctx.navigator.onLine=false;x.mount('schedule');await flush();assert(x.el.listWrap.innerHTML.includes('离线，暂无天气'));
 x=env();let finish;x.ctx.GEO.weather=()=>new Promise(r=>finish=r);x.mount('schedule');const old=x.el.listWrap;x.mount('orders');finish({items:[{date:'2026-10-26',day:'晴'}]});await flush();assert.equal(old.innerHTML,'','离开页面后不更新旧 DOM');
 x=env();let now=x.ctx.Date.now(),hits=0;x.ctx.Date.now=()=>now;x.ctx.fetch=async url=>({json:async()=>String(url).includes('/health')?{ok:true,key:true}:(hits++,{source:'amap',items:[{date:'2026-10-26',day:'晴',tmin:8,tmax:20}]})});await x.ctx.GEO.weather(35,119);await x.ctx.GEO.weather(35,119);assert.equal(hits,1);now+=1800001;await x.ctx.GEO.weather(35,119);assert.equal(hits,2,'天气缓存30分钟后重新请求');
 console.log('8 date-weather checks passed: one request, empty-day forecast, 31 date slots, date limits, missing Key, offline, stale-page response');
})().catch(e=>{console.error(e);process.exitCode=1});
