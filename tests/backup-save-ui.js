const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const {webcrypto}=require('node:crypto');const {env}=require('./harness');
const source=fs.readFileSync(__dirname+'/../assets/js/backup.js','utf8');const cases=[];
async function ready(config={}){const x=env();let downloads=0,lastFile=null;Object.assign(x.ctx,{crypto:webcrypto,Blob,File,TextEncoder,TextDecoder,MEDIA:{snapshot:async()=>[],rollback:async()=>null},...config});x.ctx.URL.createObjectURL=f=>(lastFile=f,'blob:test');x.ctx.document.body={appendChild(){}};x.ctx.document.createElement=()=>({click(){downloads++;},remove(){}});vm.runInContext(source,x.ctx);x.ctx.BACKUP.sheet();await x.el.backupCreate.fire('click');return {x,get downloads(){return downloads;},get file(){return lastFile;}};}
async function test(name,fn){await fn();cases.push(name);}
(async()=>{
 await test('支持系统保存时在点击手势内打开文件选择器，写入完整文件后关闭',async()=>{
  let opened=0,written,closed=0;const a=await ready({showSaveFilePicker:()=>{opened++;return Promise.resolve({createWritable:async()=>({write:async f=>written=f,close:async()=>closed++,abort:async()=>{}})});}});
  const promise=a.x.el.backupSave.events.click[0]();assert.equal(opened,1);await promise;assert.equal(closed,1);assert.equal((await a.x.ctx.BACKUP.read(written)).summary.orders,18);assert(a.x.el.backupSaveStatus.textContent.includes('已写入'));
 });
 await test('系统分享失败后仍可直接下载完整备份，不误报已保存',async()=>{
  const a=await ready();Object.assign(a.x.ctx.navigator,{canShare:()=>true,share:async()=>{throw Object.assign(Error('blocked'),{name:'NotAllowedError'});}});await a.x.el.backupSave.fire('click');assert.equal(a.x.el.backupSave.disabled,false);assert(a.x.el.backupSaveStatus.textContent.includes('直接下载'));assert(!a.x.el.backupSaveStatus.textContent.includes('已写入'));await a.x.el.backupDownload.fire('click');assert.equal(a.downloads,1);assert.equal((await a.x.ctx.BACKUP.read(a.file)).summary.orders,18);
 });
 await test('用户取消系统保存时不自动下载、不宣称保存成功',async()=>{
  const a=await ready({showSaveFilePicker:async()=>{throw Object.assign(Error('cancel'),{name:'AbortError'});}});await a.x.el.backupSave.fire('click');assert.equal(a.downloads,0);assert(a.x.el.backupSaveStatus.textContent.includes('已取消'));
 });
 await test('浏览器不支持文件分享或能力检测抛错时，直接走下载',async()=>{
  const a=await ready();a.x.ctx.navigator.canShare=()=>{throw Error('unsupported');};a.x.ctx.navigator.share=()=>{throw Error('must not call');};await a.x.el.backupSave.fire('click');assert.equal(a.downloads,1);
 });
 await test('文件写入失败时中止写入并保留下载入口',async()=>{
  let aborted=0;const a=await ready({showSaveFilePicker:async()=>({createWritable:async()=>({write:async()=>{throw Error('disk full');},close:async()=>{throw Error('must not close');},abort:async()=>aborted++})})});await a.x.el.backupSave.fire('click');assert.equal(aborted,1);assert(a.x.el.backupSaveStatus.textContent.includes('直接下载'));assert.equal(a.x.el.backupSave.disabled,false);
 });
 console.log(JSON.stringify({passed:cases.length,cases},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
