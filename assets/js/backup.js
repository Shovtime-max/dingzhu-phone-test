/* Local backup format: DINGZHU1 + manifest length + SHA-256(manifest) + JSON
   manifest + raw media blobs. Blobs are sliced/chunked, never converted to base64.
   There is no upload endpoint. The archive is an ordinary, unencrypted local file. */
(function (w) {
  'use strict';
  var MAGIC = 'DINGZHU1', HEADER = 44, MAX_MANIFEST = 8 * 1024 * 1024;
  var MAX_FILE = 2 * 1024 * 1024 * 1024, MAX_ITEM = 120 * 1024 * 1024;
  var verified = new WeakSet(), table = new Uint32Array(256), D = w.DATA;
  for (var n = 0; n < 256; n++) {
    var c = n;
    for (var k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  function textBytes(text) { return new w.TextEncoder().encode(text); }
  function digest(bytes) {
    if (!w.crypto || !w.crypto.subtle) return Promise.reject(new Error('请通过安全网址或本地服务使用备份功能'));
    return w.crypto.subtle.digest('SHA-256', bytes).then(function (x) { return new Uint8Array(x); });
  }
  function hex(bytes) { return Array.prototype.map.call(bytes, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function baseline() { return digest(textBytes(D.backupBaseline())).then(hex); }
  function crc32(blob) {
    var crc = 0xffffffff, offset = 0;
    function next() {
      if (offset >= blob.size) return Promise.resolve((crc ^ 0xffffffff) >>> 0);
      var end = Math.min(blob.size, offset + 1024 * 1024);
      return blob.slice(offset, end).arrayBuffer().then(function (buffer) {
        var bytes = new Uint8Array(buffer);
        for (var i = 0; i < bytes.length; i++) crc = table[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
        offset = end; return next();
      });
    }
    return next();
  }
  function build() {
    return D.withStorageLock(function () {
      var state = D.checkBackupState(D.backupSnapshot());
      var allowed = new Set(D.backupOrderIds(state)), createdAt = new Date().toISOString();
      return Promise.all([baseline(), w.MEDIA.snapshot(D.mediaSet())]).then(function (result) {
        var rows = result[1].filter(function (r) { return allowed.has(r.orderId); });
        var total = rows.reduce(function (size, r) { return size + r.blob.size; }, 0);
        if (total + MAX_MANIFEST + HEADER > MAX_FILE) throw new Error('留档超过单份备份的 2GB 上限，暂未生成文件');
        var media = [], chain = Promise.resolve();
        rows.forEach(function (r) {
          chain = chain.then(function () {
            if (!(r.blob instanceof w.Blob) || r.blob.size !== r.size || r.size <= 0 || r.size > MAX_ITEM) throw new Error('本机留档不完整，未生成备份：' + r.name);
            return crc32(r.blob).then(function (crc) {
              media.push({id:r.id, orderId:r.orderId, kind:r.kind, name:r.name, type:r.blob.type || '', size:r.size, crc32:crc});
            });
          });
        });
        return chain.then(function () {
          var manifest = {app:'dingzhu', version:1, createdAt:createdAt, baseline:result[0], state:state, media:media};
          var bytes = textBytes(JSON.stringify(manifest));
          if (bytes.length > MAX_MANIFEST) throw new Error('订单资料超过单份备份上限，暂未生成文件');
          return digest(bytes).then(function (hash) {
            var header = new Uint8Array(HEADER); header.set(textBytes(MAGIC));
            new DataView(header.buffer).setUint32(8, bytes.length, true); header.set(hash, 12);
            var blob = new w.Blob([header, bytes].concat(rows.map(function (r) { return r.blob; })), {type:'application/octet-stream'});
            var stamp = createdAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
            return {file:new w.File([blob], '鼎筑备份-' + stamp + '.dingzhu', {type:'application/octet-stream'}), summary:D.backupSummary(state), photos:media.length, createdAt:createdAt};
          });
        });
      });
    });
  }
  function read(file) {
    if (!(file instanceof w.Blob) || file.size < HEADER || file.size > MAX_FILE) return Promise.reject(new Error('请选择有效的鼎筑备份文件（不超过 2GB）'));
    return file.slice(0, HEADER).arrayBuffer().then(function (buffer) {
      var header = new Uint8Array(buffer), magic = new w.TextDecoder().decode(header.slice(0, 8));
      var length = new DataView(buffer).getUint32(8, true);
      if (magic !== MAGIC || length <= 0 || length > MAX_MANIFEST || HEADER + length > file.size) throw new Error('文件不是支持的鼎筑备份，或文件已损坏');
      return file.slice(HEADER, HEADER + length).arrayBuffer().then(function (json) {
        return digest(json).then(function (hash) {
          if (hex(hash) !== hex(header.slice(12))) throw new Error('备份资料校验失败，原数据未更改');
          var manifest;
          try { manifest = JSON.parse(new w.TextDecoder('utf-8', {fatal:true}).decode(json)); }
          catch (e) { throw new Error('备份资料无法解析'); }
          if (!manifest || manifest.app !== 'dingzhu' || manifest.version !== 1 || typeof manifest.createdAt !== 'string' || !Number.isFinite(Date.parse(manifest.createdAt)) || !Array.isArray(manifest.media) || !manifest.state) throw new Error('备份版本或格式不受支持');
          return baseline().then(function (expected) {
            if (manifest.baseline !== expected) throw new Error('备份与当前程序的数据版本不兼容，请使用生成备份时的版本');
            var state = D.checkBackupState(manifest.state), allowed = new Set(D.backupOrderIds(state));
            var ids = new Set(), counts = {}, offset = HEADER + length, records = [];
            manifest.media.forEach(function (m) {
              if (!m || typeof m.id !== 'string' || !/^[A-Za-z0-9-]+$/.test(m.id) || ids.has(m.id) || !allowed.has(m.orderId) || ['image','video'].indexOf(m.kind) < 0 || typeof m.name !== 'string' || m.name.length > 1024 || typeof m.type !== 'string' || m.type.length > 100 || (m.type && !(m.kind === 'image' ? /^image\/[a-zA-Z0-9.+-]+$/ : /^video\/[a-zA-Z0-9.+-]+$/).test(m.type)) || !Number.isSafeInteger(m.size) || m.size <= 0 || m.size > MAX_ITEM || !Number.isInteger(m.crc32) || m.crc32 < 0 || m.crc32 > 0xffffffff) throw new Error('备份中的照片或视频资料不正确');
              if ((counts[m.orderId] = (counts[m.orderId] || 0) + 1) > 9) throw new Error('备份中单个订单的留档超过 9 项');
              ids.add(m.id);
              if (offset + m.size > file.size) throw new Error('备份文件不完整，原数据未更改');
              records.push({id:m.id, orderId:m.orderId, kind:m.kind, name:m.name, size:m.size, crc32:m.crc32, blob:file.slice(offset, offset + m.size, m.type)});
              offset += m.size;
            });
            if (offset !== file.size) throw new Error('备份文件长度不正确');
            var chain = Promise.resolve();
            records.forEach(function (r) { chain = chain.then(function () { return crc32(r.blob).then(function (crc) { if (crc !== r.crc32) throw new Error('留档文件校验失败：' + r.name); }); }); });
            return chain.then(function () {
              var result = {state:state, records:records, baseline:expected, createdAt:manifest.createdAt, summary:D.backupSummary(state)};
              verified.add(result); return result;
            });
          });
        });
      });
    });
  }
  function restore(prepared) {
    if (!verified.has(prepared)) return Promise.reject(new Error('请先选择并校验备份文件'));
    return D.withStorageLock(function () {
      var before = D.backupSnapshot(), next = D.checkBackupState(prepared.state);
      var set = 'restore-' + (w.crypto.randomUUID ? w.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2));
      return w.MEDIA.stageRestore(prepared.records, set, {state:before, baseline:prepared.baseline}).then(function () {
        next.mediaSet = set;
        D.installBackupState(next);
        // If finalizing is interrupted, the next opening recovers the pending undo point.
        return w.MEDIA.finishRestore(set).catch(function () {});
      });
    });
  }
  function undo(expectedId) {
    return D.withStorageLock(function () {
      var before = D.backupSnapshot();
      return Promise.all([w.MEDIA.rollback(), baseline()]).then(function (result) {
        var saved = result[0];
        if (!saved || saved.id !== expectedId || saved.baseline !== result[1]) throw new Error('恢复前副本已变化，请重新打开备份与恢复');
        var next = D.checkBackupState(saved.state);
        var target = next.mediaSet || 'legacy';
        return w.MEDIA.saveRollback({state:before, baseline:result[1]}, target).then(function () {
          D.installBackupState(next);
          return w.MEDIA.finishRestore(target).catch(function () {});
        });
      });
    });
  }
  function size(bytes) { return bytes < 1024 * 1024 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1024 / 1024).toFixed(1) + ' MB'; }
  function summary(s, media) { return s.orders + ' 单订单 · ' + s.pending + ' 条待定 · ' + s.teams + ' 支队伍 · ' + media + ' 项留档'; }
  function reopen() { w.location.reload(); }
  function sheet() {
    var U = w.UI;
    var mask = U.sheet('<h3>备份与恢复</h3>' +
      '<div class="sub">平时自动保存在这台设备。备份文件需要手动保存；换设备时选择文件恢复。</div>' +
      '<button class="set-row" id="backupCreate" type="button" style="width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line-soft);font:inherit"><span class="si">' + U.icon('clipboard',18) + '</span><div><b>生成完整备份</b><span>订单、收款、队伍、资料和照片视频</span></div></button>' +
      '<button class="set-row" id="backupPick" type="button" style="width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line-soft);font:inherit"><span class="si">' + U.icon('undo',18) + '</span><div><b>从备份文件恢复</b><span>先检查文件，再确认替换本机数据</span></div></button>' +
      '<button class="set-row" id="backupUndo" type="button" style="display:none;width:100%;text-align:left;background:transparent;border:0;border-bottom:1px solid var(--line-soft);font:inherit"><span class="si">' + U.icon('undo',18) + '</span><div><b>撤销上次恢复</b><span>回到恢复前的数据；之后的改动也会被替换</span></div></button>' +
      '<input type="file" id="backupFile" hidden>' +
      '<div class="sub" id="backupStatus" role="status" aria-live="polite"></div>');
    var create = document.getElementById('backupCreate'), pick = document.getElementById('backupPick'), file = document.getElementById('backupFile');
    var undoButton = document.getElementById('backupUndo'), status = document.getElementById('backupStatus');
    var busy = false;
    function loading(text) { busy = !!text; create.disabled = pick.disabled = undoButton.disabled = busy; status.textContent = text || ''; }
    function error(err) { loading(''); status.textContent = err.message || '操作失败，原数据未更改'; }
    create.addEventListener('click', function () {
      if (busy) return;
      loading('正在整理数据和留档，请稍候…');
      return build().then(function (result) {
        loading('');
        if (document.getElementById('backupCreate') !== create) return;
        var ready = U.sheet('<h3>备份文件已生成</h3><div class="sub">' + U.esc(summary(result.summary, result.photos)) + '<br>' + U.esc(size(result.file.size)) + ' · ' + U.esc(new Date(result.createdAt).toLocaleString()) + '</div>' +
          '<div class="key-warn">点击下方按钮后，在系统菜单中选择“存储到文件”，再选“我的 iPhone”或“iCloud 云盘”。请确认文件已经保存。</div>' +
          '<button class="btn primary mt14" id="backupSave">保存备份文件</button>');
        var save = document.getElementById('backupSave');
        save.addEventListener('click', function () {
          if (save.disabled) return;
          // Share must be invoked in this click, after generation has completed.
          if (w.navigator.share && w.navigator.canShare && w.navigator.canShare({files:[result.file]})) {
            save.disabled = true;
            return w.navigator.share({files:[result.file]}).then(function () {
              U.toast('已交给系统，请确认备份文件已保存');
            }).catch(function (err) { if (err.name !== 'AbortError') U.toast('未能保存，请重试'); }).then(function () { save.disabled = false; });
          }
          var url = w.URL.createObjectURL(result.file), a = document.createElement('a');
          a.href = url; a.download = result.file.name; document.body.appendChild(a); a.click(); a.remove();
          w.setTimeout(function () { w.URL.revokeObjectURL(url); }, 60000);
          U.toast('已发起文件下载，请确认保存位置');
        });
      }).catch(error);
    });
    pick.addEventListener('click', function () { if (!busy) file.click(); });
    file.addEventListener('change', function () {
      var selected = file.files && file.files[0]; file.value = ''; if (!selected || busy) return;
      loading('正在校验备份和留档，原数据暂未更改…');
      return read(selected).then(function (prepared) {
        loading('');
        if (document.getElementById('backupCreate') !== create) return;
        confirmRestore(prepared);
      }).catch(error);
    });
    D.withStorageLock(function () { D.assertFresh(); return w.MEDIA.rollback(); }).then(function (saved) {
      if (!saved || !saved.state) return;
      undoButton.style.display = '';
      undoButton.addEventListener('click', function () {
        if (busy) return;
        U.sheet('<h3>撤销上次恢复？</h3><div class="sub">将回到恢复前的数据。当前数据会保留为新的恢复前副本。</div><div class="btn-row mt14"><button class="btn ghost" id="undoCancel">取消</button><button class="btn primary" id="undoConfirm">确认撤销</button></div>');
        document.getElementById('undoCancel').addEventListener('click', function () { U.closeSheet(); });
        var yes = document.getElementById('undoConfirm');
        yes.addEventListener('click', function () { if (yes.disabled) return; yes.disabled = true;
          return undo(saved.id).then(reopen).catch(function (err) { yes.disabled = false; U.toast(err.message); });
        });
      });
    }).catch(function (err) { status.textContent = err.message; });
    return mask;
  }
  function confirmRestore(prepared) {
    var U = w.UI;
    U.sheet('<h3>确认恢复这份备份？</h3><div class="sub">' + U.esc(new Date(prepared.createdAt).toLocaleString()) + '<br>' + U.esc(summary(prepared.summary, prepared.records.length)) + '</div>' +
      '<div class="key-warn">恢复会替换本机当前数据。当前数据将保留为恢复前副本，可在“备份与恢复”中撤销。</div>' +
      '<div class="btn-row mt14"><button class="btn ghost" id="restoreCancel">取消</button><button class="btn primary" id="restoreConfirm">确认恢复</button></div>');
    document.getElementById('restoreCancel').addEventListener('click', function () { U.closeSheet(); });
    var yes = document.getElementById('restoreConfirm');
    yes.addEventListener('click', function () { if (yes.disabled) return; yes.disabled = true; yes.textContent = '正在恢复…';
      return restore(prepared).then(reopen).catch(function (err) { yes.disabled = false; yes.textContent = '确认恢复'; U.toast(err.message || '恢复失败，原数据保留'); });
    });
  }
  w.BACKUP = {build:build, read:read, restore:restore, undo:undo, sheet:sheet};
})(window);
