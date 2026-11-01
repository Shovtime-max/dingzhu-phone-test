const fs = require('fs'), vm = require('vm'), assert = require('assert/strict');
function setup(response, key = 'test-key') {
  const calls = [], storage = {'dingzhu.amapkey.v1':key};
  const ctx = {console, Promise, Date, Math, Number, String, JSON, Object, Array, parseFloat, parseInt, isFinite, setTimeout, clearTimeout, AbortController,
    document:{readyState:'loading',addEventListener(){}}, location:{hostname:'example.test'},
    localStorage:{getItem:k=>storage[k] || null,setItem:(k,v)=>storage[k]=v,removeItem:k=>delete storage[k]},
    fetch:async url=>{calls.push(url);return {ok:true,json:async()=>response(new URL(url))};}};
  ctx.window=ctx;vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/../assets/js/geo.js','utf8'),ctx);return {geo:ctx.GEO,calls};
}
(async()=>{
  let x=setup(u=>u.pathname.endsWith('/convert')?{status:'1',locations:'119.015,35.010'}:{status:'1',route:{paths:[{distance:'12300',duration:'1200',steps:[{polyline:'119.0,35.0;119.01,35.01'},{polyline:'119.01,35.01;119.1,35.1'}]}]}});
  let route=await x.geo.routeGeometry({lat:35,lng:119},{lat:35.1,lng:119.1});
  assert.equal(route.points.length,4);assert.equal(route.km,12.3);assert.equal(route.min,20);assert(x.calls[0].includes('extensions=all'));
  let location=await x.geo.toMapPosition({lat:35,lng:119});assert.equal(location.lng,119.015);assert(x.calls[1].includes('coordsys=gps'));
  x=setup(()=>({status:'1',route:{paths:[{distance:'1000',duration:'60',steps:[]}]}}));await assert.rejects(x.geo.routeGeometry({lat:35,lng:119},{lat:35.1,lng:119.1}),/不完整/);
  x=setup(()=>{throw Error('should not call')},'');await assert.rejects(x.geo.toMapPosition({lat:35,lng:119}),/配置高德/);assert.equal(x.calls.length,0);
  console.log('道路轨迹解析、GPS 坐标转换及失败分支检查通过');
})().catch(err=>{console.error(err);process.exitCode=1});
