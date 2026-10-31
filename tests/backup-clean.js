const {env} = require('./harness');
const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(__dirname + '/../assets/js/backup.js', 'utf8');
const results = [];
const clone = o => JSON.parse(JSON.stringify(o));
function setup(store = {}, disk = {rows:[], rollback:null}, failWrite = false, date = '2026-10-29T10:00:00+08:00') {
  const x = env(store, date, failWrite), c = x.ctx;
  Object.assign(c, {crypto:webcrypto, Blob, File, TextEncoder, TextDecoder});
  c.MEDIA = {
    async snapshot(set) { return disk.rows.filter(r => (r.generation || 'legacy') === set); },
    async stageRestore(records, set, before) {
      if (disk.failStage) throw Error('quota');
      disk.rows.push(...records.map((r,i) => ({...r, id:set+'-'+i, generation:set})));
      disk.pending = {id:webcrypto.randomUUID(), baseline:before.baseline, state:clone(before.state), target:set};
    },
    async finishRestore(target) {
      if (disk.failFinish) throw Error('interrupted');
      if (!disk.pending || disk.pending.target !== target) throw Error('missing pending restore');
      disk.rollback = disk.pending; disk.pending = null;
    },
    async rollback() {
      if (disk.pending) {
        if (disk.pending.target === c.DATA.mediaSet()) disk.rollback = disk.pending;
        disk.pending = null;
      }
      return disk.rollback;
    },
    async saveRollback(before, target) { return this.stageRestore([], target, before); }
  };
  vm.runInContext(source, c, {filename:'backup.js'});
  return {x, c, disk};
}
async function draft(x, owner='备份测试甲') {
  x.mount('create'); x.fill(); x.el.inOwner.value=owner; await x.el.btnToSchedule.fire('click');
  return x.ctx.DATA.ORDERS.at(-1);
}
async function test(name, task) {
  try { await task(); results.push({name,status:'passed'}); }
  catch (err) { results.push({name,status:'failed',error:err.stack}); }
}
async function modifyManifest(file, change) {
  const b = new Uint8Array(await file.arrayBuffer()), n = new DataView(b.buffer).getUint32(8,true);
  const m = JSON.parse(new TextDecoder().decode(b.slice(44,44+n))); change(m);
  const json = new TextEncoder().encode(JSON.stringify(m)), h = new Uint8Array(44);
  h.set(new TextEncoder().encode('DINGZHU1')); new DataView(h.buffer).setUint32(8,json.length,true);
  h.set(new Uint8Array(await webcrypto.subtle.digest('SHA-256',json)),12);
  return new File([h,json,b.slice(44+n)],'tampered.dingzhu');
}
(async () => {
  await test('完整备份跨设备恢复：订单、档期、收款、线索、队伍、头像及文件字节',async()=>{
    const a=setup(), o=await draft(a.x);
    await a.c.DATA.scheduleOrder(o.id,'2026-10-30','下午');
    await a.c.DATA.recordPayment(o.id,500,'银行');
    await a.c.DATA.saveBase({name:'测试出发地',addr:'测试地址',lat:36.2,lng:119.2});
    await a.c.PROFILE.save({name:'备份队',avatar:'data:image/png;base64,iVBORw0KGgo='});
    await a.c.DATA.addTeam({name:'第三队',alias:'测试',color:'#0066FF',leader:'测试队长',members:[{name:'测试队员'}]});
    a.x.mount('create');a.x.fill();await a.x.el.btnToPending.fire('click');
    const bytes = Uint8Array.from([0,1,2,3,254,255]);
    a.disk.rows.push({id:'photo-1',orderId:o.id,kind:'image',name:'测试照片.png',size:bytes.length,blob:new Blob([bytes],{type:'image/png'})});
    const made=await a.c.BACKUP.build(), b=setup(), parsed=await b.c.BACKUP.read(made.file);
    assert.equal(parsed.records.length,1); assert.deepEqual(new Uint8Array(await parsed.records[0].blob.arrayBuffer()),bytes);
    await b.c.BACKUP.restore(parsed);
    const reopened=setup(b.x.store,b.disk);const saved=reopened.c.DATA.byId(o.id);
    assert.equal(saved.owner,o.owner);assert.equal(saved.paid,500);assert.equal(saved.flows.at(-1).type,'银行');assert.equal(saved.scheduledOn,'2026-10-30');
    assert.equal(reopened.c.PROFILE.get().name,'备份队');assert.equal(reopened.c.PROFILE.get().avatar,'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(reopened.c.GEO.baseGeo().name,'测试出发地');assert.equal(reopened.c.GEO.baseGeo().lat,36.2);
    assert.equal(reopened.c.DATA.TEAMS.length,3);assert.equal(reopened.c.DATA.PENDING.length,1);
    assert.equal((await reopened.c.MEDIA.snapshot(reopened.c.DATA.mediaSet())).length,1);
  });
  await test('恢复后撤销，原订单及原文件字节都能回到恢复前',async()=>{
    const a=setup(),ao=await draft(a.x,'来源甲'),backup=await a.c.BACKUP.build();
    const b=setup(),bo=await draft(b.x,'原设备乙');
    b.disk.rows.push({id:'original-photo',orderId:bo.id,kind:'image',name:'原照片.png',size:2,blob:new Blob([Uint8Array.from([7,8])],{type:'image/png'})});
    await b.c.BACKUP.restore(await b.c.BACKUP.read(backup.file));
    const after=setup(b.x.store,b.disk);assert.equal(after.c.DATA.byId(ao.id).owner,'来源甲');
    await after.c.BACKUP.undo(b.disk.rollback.id);
    const undone=setup(b.x.store,b.disk);assert.equal(undone.c.DATA.byId(bo.id).owner,'原设备乙');
    const media=await undone.c.MEDIA.snapshot(undone.c.DATA.mediaSet());assert.deepEqual(new Uint8Array(await media[0].blob.arrayBuffer()),Uint8Array.from([7,8]));
    assert.equal(b.disk.rollback.state.orders[0].owner,'来源甲');
  });
  await test('损坏、截断、附加字节、错误版本及非备份文件全部拒绝，原存储不变',async()=>{
    const a=setup(),o=await draft(a.x);a.disk.rows.push({id:'photo-1',orderId:o.id,kind:'image',name:'test.png',size:3,blob:new Blob(['abc'],{type:'image/png'})});
    const {file}=await a.c.BACKUP.build(), raw=await file.arrayBuffer(), bad=new Uint8Array(raw.slice(0));bad[bad.length-1]^=1;
    const files=[new Blob(['not a backup']),new Blob([raw.slice(0,raw.byteLength-1)]),new Blob([raw,'x']),new Blob([bad]),await modifyManifest(file,m=>m.version=999),await modifyManifest(file,m=>m.baseline='different')];
    const before=JSON.stringify(a.x.store);
    for(const f of files) await assert.rejects(a.c.BACKUP.read(f));
    assert.equal(JSON.stringify(a.x.store),before);
  });
  await test('文件含重复记录、超额收款、脚本内容、损坏关联时拒绝恢复',async()=>{
    const a=setup();await draft(a.x);const {file}=await a.c.BACKUP.build();
    const changes=[m=>m.state.orders.push(m.state.orders[0]),m=>m.state.orders[0].paid=999999,m=>m.state.orders[0].mode='<img onerror=alert(1)>',m=>m.state.slots['2026-10-30|上午']=['missing'],m=>m.state.patches['PD-01']={stage:'<img>'},m=>m.state.orders[0].media=[{url:'https://example.com'}],m=>m.state.profile.avatar='javascript:alert(1)'];
    for(const change of changes) await assert.rejects(a.c.BACKUP.read(await modifyManifest(file,change)));
    assert.equal(a.c.DATA.ORDERS.length,1);
  });
  await test('文件写入失败时不切换订单和当前留档，恢复前数据原样保留',async()=>{
    const a=setup();await draft(a.x,'备份甲');const {file}=await a.c.BACKUP.build();
    const b=setup();await draft(b.x,'原记录乙');const parsed=await b.c.BACKUP.read(file),raw=JSON.stringify(b.x.store);
    b.disk.failStage=true;await assert.rejects(b.c.BACKUP.restore(parsed));assert.equal(JSON.stringify(b.x.store),raw);assert.equal(b.c.DATA.ORDERS.at(-1).owner,'原记录乙');
  });
  await test('恢复中断后自动保留正确的撤销点；写入失败时不覆盖此前撤销点',async()=>{
    const a=setup();await draft(a.x,'来源甲');const {file}=await a.c.BACKUP.build();
    const b=setup();await draft(b.x,'原设备乙');const parsed=await b.c.BACKUP.read(file);
    b.disk.failFinish=true;await b.c.BACKUP.restore(parsed);
    assert.equal(b.disk.rollback,null);assert(b.disk.pending);
    const reopened=setup(b.x.store,b.disk);const saved=await reopened.c.MEDIA.rollback();
    assert.equal(saved.state.orders[0].owner,'原设备乙');assert.equal(b.disk.pending,null);
    const oldUndoId=saved.id;const failing=setup(b.x.store,b.disk,true),p=await failing.c.BACKUP.read(file);
    await assert.rejects(failing.c.BACKUP.restore(p));
    const afterFail=setup(b.x.store,b.disk);assert.equal((await afterFail.c.MEDIA.rollback()).id,oldUndoId);
  });
  await test('回收站旧记录中的临时照片链接被剔除，实际照片仍包含在备份中',async()=>{
    const a=setup(),o=await draft(a.x,'回收站测试');
    o.media=[{id:'photo-x',url:'blob:temporary',name:'照片'}];
    await a.c.DATA.removeItem('order',o.id);
    const snap=a.c.DATA.backupSnapshot();assert.equal(snap.trash[0].payload.media,undefined);
    a.disk.rows.push({id:'photo-x',orderId:o.id,kind:'image',name:'照片.png',size:1,blob:new Blob(['x'],{type:'image/png'})});
    const p=await a.c.BACKUP.read((await a.c.BACKUP.build()).file);
    assert.equal(p.records.length,1);assert.equal(p.state.trash[0].payload.id,o.id);
  });
  await test('订单存储空间不足时，已暂存文件不进入当前代，刷新仍是原数据',async()=>{
    const a=setup();await draft(a.x,'备份甲');const {file}=await a.c.BACKUP.build();
    const b=setup();await draft(b.x,'原记录乙');const failing=setup(b.x.store,b.disk,true),parsed=await failing.c.BACKUP.read(file),raw=JSON.stringify(b.x.store);
    await assert.rejects(failing.c.BACKUP.restore(parsed));assert.equal(JSON.stringify(b.x.store),raw);
    const reopened=setup(b.x.store,b.disk);assert.equal(reopened.c.DATA.ORDERS.at(-1).owner,'原记录乙');assert.equal(reopened.c.DATA.mediaSet(),'legacy');
  });
  await test('其他页面已写入时，过期页面不能导出或恢复覆盖',async()=>{
    const a=setup();await draft(a.x);const {file}=await a.c.BACKUP.build();const stale=setup(a.x.store,a.disk),parsed=await stale.c.BACKUP.read(file);
    await draft(a.x,'后写入记录');const raw=JSON.stringify(a.x.store);
    await assert.rejects(stale.c.BACKUP.build());await assert.rejects(stale.c.BACKUP.restore(parsed));assert.equal(JSON.stringify(a.x.store),raw);
  });
  await test('恢复必须使用本次完整校验结果，重复恢复不写第二次',async()=>{
    const a=setup();await draft(a.x);const {file}=await a.c.BACKUP.build(),b=setup();
    await assert.rejects(b.c.BACKUP.restore({state:{}}));
    const p=await b.c.BACKUP.read(file);await b.c.BACKUP.restore(p);const raw=JSON.stringify(b.x.store);
    await assert.rejects(b.c.BACKUP.restore(p));assert.equal(JSON.stringify(b.x.store),raw);
  });
  await test('恢复前副本失效时拒绝撤销；不能悄悄回滚到另一份数据',async()=>{
    const a=setup();await assert.rejects(a.c.BACKUP.undo('missing'));
  });
  await test('空数据与零留档仍能生成和验证完整备份',async()=>{
    const a=setup(),raw=JSON.stringify(a.x.store),r=await a.c.BACKUP.build(),p=await a.c.BACKUP.read(r.file);
    assert.equal(p.records.length,0);assert.equal(p.summary.orders,0);assert.equal(JSON.stringify(a.x.store),raw);
  });
  await test('更换设备及跨年后仍能读取此前生成的备份',async()=>{
    const a=setup();const o=await draft(a.x,'跨年备份');await a.c.DATA.scheduleOrder(o.id,'2026-10-30','下午');
    const file=(await a.c.BACKUP.build()).file;
    const b=setup({},undefined,false,'2027-04-10T10:00:00+08:00');
    await b.c.BACKUP.restore(await b.c.BACKUP.read(file));
    const reopened=setup(b.x.store,b.disk,false,'2027-04-10T10:00:00+08:00');
    assert.equal(reopened.c.DATA.byId(o.id).owner,'跨年备份');
    assert.equal(reopened.c.DATA.byId(o.id).scheduledOn,'2026-10-30');
  });
  await test('旧版材料口径能在备份中保持兼容',async()=>{
    const a=setup();await draft(a.x);const {file}=await a.c.BACKUP.build();
    for(const mode of ['双包','清工']) {
      const changed=await modifyManifest(file,m=>m.state.orders[0].mode=mode);
      assert.equal((await a.c.BACKUP.read(changed)).state.orders[0].mode,mode);
    }
  });
  fs.writeFileSync(__dirname+'/backup-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,total:results.length,failures:results.filter(r=>r.status==='failed')},null,2));
  if(results.some(r=>r.status==='failed'))process.exitCode=1;
})();
