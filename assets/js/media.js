/* Blob files are kept by generation. Restore stages a new generation, then switches
   the generation pointer with the business snapshot in one localStorage write. */
(function (w) {
  'use strict';
  var cache = {}, opening;
  function generation() { return w.DATA.mediaSet(); }
  function db() {
    if (!w.indexedDB) return Promise.reject(new Error('设备不支持留档存储'));
    if (!opening) opening = new Promise(function (resolve, reject) {
      var req = w.indexedDB.open('dingzhu-media-v1', 2);
      req.onupgradeneeded = function () {
        var database = req.result;
        if (!database.objectStoreNames.contains('media')) database.createObjectStore('media', {keyPath:'id'}).createIndex('orderId', 'orderId');
        if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta');
      };
      req.onsuccess = function () {
        var database = req.result;
        database.onversionchange = function () { database.close(); opening = null; };
        resolve(database);
      };
      req.onerror = function () { opening = null; reject(new Error('无法打开留档存储')); };
      req.onblocked = function () { opening = null; reject(new Error('请先关闭其他鼎筑页面，再读取留档')); };
    });
    return opening;
  }
  function read(storeName, operation) {
    return db().then(function (database) { return new Promise(function (resolve, reject) {
      var tx = database.transaction(storeName, 'readonly'), req = operation(tx.objectStore(storeName));
      tx.oncomplete = function () { resolve(req.result); };
      tx.onerror = tx.onabort = function () { reject(new Error('无法读取本机文件')); };
    }); });
  }
  function matches(record, set) { return (record.generation || 'legacy') === set; }
  function load(id) {
    var set = generation(), key = set + '|' + id;
    if (cache[key]) return cache[key].promise;
    var entry = cache[key] = {items:[], ready:false};
    entry.promise = read('media', function (store) { return store.index('orderId').getAll(id); }).then(function (rows) {
      entry.items = rows.filter(function (r) { return matches(r, set); }).map(function (r) {
        return {id:r.id, kind:r.kind, name:r.name, size:r.size, url:w.URL.createObjectURL(r.blob)};
      });
      entry.ready = true; return entry.items;
    }).catch(function (err) { delete cache[key]; throw err; });
    return entry.promise;
  }
  function randomId() {
    return w.crypto && w.crypto.randomUUID ? w.crypto.randomUUID() : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }
  function save(id, files, kind) {
    var list = Array.prototype.slice.call(files || []);
    return w.DATA.withStorageLock(function () {
      w.DATA.assertFresh();
      var set = generation(), key = set + '|' + id, existing;
      return read('media', function (store) { return store.index('orderId').getAll(id); }).then(function (rows) {
        existing = rows.filter(function (r) { return matches(r, set); });
        if (['image','video'].indexOf(kind) < 0 || !list.length || list.some(function (f) {
          return !f || !f.size || f.size > 120 * 1024 * 1024 || !(kind === 'image' ? /^image\// : /^video\//).test(f.type || '');
        })) throw new Error('请选择有效的照片或视频，每项不超过 120MB');
        if (existing.length + list.length > 9) throw new Error('每单最多保留 9 项留档');
        return db();
      }).then(function (database) { return new Promise(function (resolve, reject) {
        var tx = database.transaction('media', 'readwrite'), store = tx.objectStore('media'), records = [];
        list.forEach(function (f) {
          var r = {id:randomId(), orderId:id, generation:set, kind:kind, name:f.name || '留档文件', size:f.size, blob:f};
          store.add(r); records.push(r);
        });
        tx.oncomplete = function () {
          if (cache[key]) cache[key].items.forEach(function (m) { w.URL.revokeObjectURL(m.url); });
          var entry = {ready:true, items:existing.concat(records).map(function (r) {
            return {id:r.id, kind:r.kind, name:r.name, size:r.size, url:w.URL.createObjectURL(r.blob)};
          })};
          entry.promise = Promise.resolve(entry.items);
          cache[key] = entry;
          resolve(records.length);
        };
        tx.onerror = tx.onabort = function () { reject(new Error('留档保存失败，请检查设备空间')); };
      }); });
    });
  }
  function remove(id, mediaId) {
    return w.DATA.withStorageLock(function () {
      w.DATA.assertFresh();
      var set = generation(), key = set + '|' + id;
      return load(id).then(function () { return db(); }).then(function (database) { return new Promise(function (resolve, reject) {
        var tx = database.transaction('media', 'readwrite'), store = tx.objectStore('media'), req = store.get(mediaId);
        req.onsuccess = function () {
          if (req.result && req.result.orderId === id && matches(req.result, set)) store.delete(mediaId);
        };
        tx.oncomplete = function () {
          var entry = cache[key], i = entry.items.findIndex(function (m) { return m.id === mediaId; });
          if (i >= 0) { w.URL.revokeObjectURL(entry.items[i].url); entry.items.splice(i, 1); } resolve();
        };
        tx.onerror = tx.onabort = function () { reject(new Error('删除留档失败')); };
      }); });
    });
  }
  // These helpers run under DATA.withStorageLock in backup.js. They do not nest locks.
  function snapshot(set) {
    return read('media', function (store) { return store.getAll(); }).then(function (rows) {
      return rows.filter(function (r) { return matches(r, set); });
    });
  }
  function stageRestore(records, set, before) {
    return db().then(function (database) { return new Promise(function (resolve, reject) {
      var tx = database.transaction(['media','meta'], 'readwrite'), store = tx.objectStore('media');
      records.forEach(function (r, i) {
        store.add({id:set + '-' + i, orderId:r.orderId, generation:set, kind:r.kind, name:r.name, size:r.size, blob:r.blob});
      });
      // Do not replace the previous undo point until the business snapshot switches.
      tx.objectStore('meta').put({id:randomId(), createdAt:new Date().toISOString(), state:before.state, baseline:before.baseline, target:set}, 'restore-pending');
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(new Error('恢复失败，设备空间可能不足；原数据保留')); };
    }); });
  }
  function finishRestore(target) {
    return db().then(function (database) { return new Promise(function (resolve, reject) {
      var tx = database.transaction('meta', 'readwrite'), store = tx.objectStore('meta');
      var pending = store.get('restore-pending');
      pending.onsuccess = function () {
        if (!pending.result || pending.result.target !== target) { tx.abort(); return; }
        store.put(pending.result, 'rollback');
        store.delete('restore-pending');
      };
      tx.oncomplete = function () { resolve(); };
      tx.onerror = tx.onabort = function () { reject(new Error('恢复前副本暂未整理，请重新打开页面')); };
    }); });
  }
  // Caller holds the shared lock. Resolve interruptions between IndexedDB staging
  // and the atomic localStorage switch without losing an older undo point.
  function rollback() {
    return db().then(function (database) { return new Promise(function (resolve, reject) {
      var tx = database.transaction('meta', 'readwrite'), store = tx.objectStore('meta');
      var pending = store.get('restore-pending'), result;
      pending.onsuccess = function () {
        if (pending.result) {
          if (pending.result.target === generation()) store.put(pending.result, 'rollback');
          store.delete('restore-pending');
        }
        var saved = store.get('rollback');
        saved.onsuccess = function () { result = saved.result; };
      };
      tx.oncomplete = function () { resolve(result); };
      tx.onerror = tx.onabort = function () { reject(new Error('无法读取恢复前副本')); };
    }); });
  }
  function saveRollback(before, target) { return stageRestore([], target, before); }
  w.MEDIA = {load:load, save:save, remove:remove, entry:function (id) { return cache[generation() + '|' + id]; },
    snapshot:snapshot, stageRestore:stageRestore, finishRestore:finishRestore, rollback:rollback, saveRollback:saveRollback};
})(window);
