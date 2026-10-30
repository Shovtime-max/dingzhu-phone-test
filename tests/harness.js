const fs = require('fs'), vm = require('vm'), assert = require('assert');
const root = __dirname + '/../';
const queues = new WeakMap();
const results = [];
function env(store = {}, date = '2026-10-26T10:00:00+08:00', failWrite = false) {
  let elements = {}, timers = [], html = '', logs = [], fetches = [];
  function ingest(s) { html = s; for (const m of s.matchAll(/\bid="([^"]+)"/g)) elements[m[1]] = new E(m[1]); }
  class E {
    constructor(id, attrs = {}) { this.id = id; this.attrs = attrs; this.events = {}; this.children = []; this.value = ''; this.classList = {toggle(){},add(){},remove(){}}; this.style = {}; }
    addEventListener(k, fn) { (this.events[k] ||= []).push(fn); }
    fire(k, target = this) { return Promise.all((this.events[k] || []).map(fn=>fn.call(this, {target,key:'',preventDefault(){},stopPropagation(){}}))); }
    getAttribute(k) { return this.attrs[k] ?? null; }
    closest(s) { if (s.startsWith('#')) return s.slice(1).split(' ')[0] === this.id ? this : null; return this; }
    querySelector() { return new E('cnt'); }
    querySelectorAll() { return []; }
    set innerHTML(s) { this._html = s; ingest(s); }
    get innerHTML() { return this._html || ''; }
    focus(){} select(){} scrollIntoView(){}
  }
  const doc = {readyState:'loading', addEventListener(){}, getElementById:id=>elements[id] || null,
    querySelectorAll:()=>[], querySelector:()=>new E('selected', {'data-ch':'微信'})};
  const RealDate = Date;
  class FakeDate extends RealDate { constructor(...a){ super(...(a.length ? a : [date])); } static now(){ return +new RealDate(date); } }
  const ctx = {navigator:{locks:{request(name, fn){const previous=queues.get(store)||Promise.resolve();const next=previous.catch(()=>{}).then(fn);queues.set(store,next);return next;}}}, console, document:doc, Date:FakeDate, URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},
    localStorage:{getItem:k=>store[k] ?? null,setItem(k,v){if(failWrite)throw Error('QuotaExceededError');store[k]=v;},removeItem:k=>delete store[k]},
    location:{hostname:'127.0.0.1',hash:'#/schedule'}, setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
    addEventListener(){},removeEventListener(){},requestAnimationFrame(){},
    fetch:async url=>{fetches.push(url); return {json:async()=>url.includes('/health')?{ok:true,key:true}:{source:'amap',ok:true,minutes:60,km:35,items:[{name:'外地真实村',addr:'外市',lat:31.23,lng:121.47,source:'amap'}]}};},
    APP:{render(){}}};
  ctx.window=ctx; vm.createContext(ctx);
  for(const f of ['ui.js','profile.js','data.js','geo.js',...['schedule','create','orders','pending','analytics','orderDetail','teams','trash'].map(x=>'views/'+x+'.js')])vm.runInContext(fs.readFileSync(root+'assets/js/'+f,'utf8'),ctx,{filename:f});
  ctx.UI.toast=s=>logs.push(s); ctx.UI.closeSheet=()=>{};
  ctx.UI.sheet=s=>{ingest(s);return elements.mask=new E('mask');};
  function mount(name, params={}){elements={screen:new E('screen')};let v=ctx.VIEWS[name](params);ingest(v.bar+v.body);if(v.mount)v.mount();return v;}
  function fill(){elements.inOwner.value='测试业主';elements.inAddr.value='外地真实村';elements.inPhone.value='13800000000';elements.inPrice.value='3000';}
  return {ctx,store,mount,fill, get el(){return elements;}, target:(attrs,id='')=>new E(id,attrs),get html(){return html;},logs,fetches};
}

module.exports = {env};
