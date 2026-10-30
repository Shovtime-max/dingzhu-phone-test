const fs=require('fs'),vm=require('vm');
const code=fs.readFileSync(__dirname+'/../assets/js/geo.js','utf8');
function env(options={}){
 const store={'dingzhu.amapkey.v1':'test-only'},calls=[];
 const ctx={document:{readyState:"loading",addEventListener(){}},console,Promise,Date,Math,Number,String,JSON,Object,Array,parseFloat,parseInt,isFinite,setTimeout,clearTimeout,AbortController,location:{hostname:'shovtime-max.github.io'},localStorage:{getItem:k=>store[k]||null,setItem:(k,v)=>{if(options.failWrite)throw Error('full');store[k]=v},removeItem:k=>delete store[k]},fetch:async url=>{
 calls.push(url);
 if(url.startsWith('http://127.'))throw Error('unavailable');
 const path=new URL(url).pathname;
 let json=options.bad?{unexpected:'payload'}:path.includes('regeo')?{status:'1',regeocode:{addressComponent:{adcode:'370782',city:'测试市'}}}:path.includes('weatherInfo')?{status:'1',forecasts:[{city:'测试市',casts:[{date:'2026-10-30',dayweather:'晴',nightweather:'晴',daytemp:'20',nighttemp:'10'}]}]}:path.includes('driving')?{status:'1',route:{paths:[{duration:'1200',distance:'10000'}]}}:{status:'1',tips:[{name:'测试村',location:'119.01,35.01',district:'测试区'}],pois:[{name:'测试村',location:'119.01,35.01'}]};
 if(options.badRoute && path.includes('driving'))json={status:'1',route:{paths:[{duration:'bad',distance:'bad'}]}};
 return {ok:true,json:async()=>json};
 }};ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);return {geo:ctx.GEO,ctx,calls,store};
}
const assert=require('assert/strict');
(async()=>{
 let x=env();x.geo.setNear(35,119);
 assert.equal((await x.geo.searchPoi('测试村')).source,'amap');
 assert.equal((await x.geo.nearby()).source,'amap');
 assert.equal((await x.geo.suggest('测试村')).source,'amap');
 assert.equal((await x.geo.route({lat:35,lng:119},{lat:35.1,lng:119.1})).min,20);
 assert.equal((await x.geo.weather(35,119)).items.length,1);
 assert(x.calls.every(u=>u.startsWith('https://restapi.amap.com/')));
 x=env({failWrite:true});await assert.rejects(x.geo.setKey('new-test-only'),/未保存/);assert.equal(x.store['dingzhu.amapkey.v1'],'test-only');
 x=env({bad:true});await assert.rejects(x.geo.setKey('new-test-only'),/数据无效/);
 x=env({badRoute:true});const r=await x.geo.route({lat:35,lng:119},{lat:35.1,lng:119.1});assert.equal(r.source,'est');assert(Number.isFinite(r.min));
 x=env();await x.geo.weatherPoints([{lat:35,lng:119},{lat:35.02,lng:119.02},{lat:35.04,lng:119.04}]);assert.equal(x.calls.filter(u=>u.includes('/weather/weatherInfo')).length,1);
 x=env();delete x.store['dingzhu.amapkey.v1'];await x.geo.searchPoi('测试');await x.geo.weatherPoints([{lat:35,lng:119}]);assert.equal(x.calls.length,0);
 x=env();await x.geo.setKey('new-test-only');assert.equal(x.store['dingzhu.amapkey.v1'],'new-test-only');assert(x.calls.every(u=>!u.includes('127.0.0.1')));
 await x.geo.clearDirectKey();assert.equal(x.store['dingzhu.amapkey.v1'],undefined);
 console.log('12 direct-map checks passed (mock responses; no real user Key used)');
})().catch(e=>{console.error(e);process.exitCode=1});
