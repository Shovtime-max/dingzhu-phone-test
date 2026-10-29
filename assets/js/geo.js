/* ==========================================================================
   地理能力（高德优先 · 本地坐标兜底）
   --------------------------------------------------------------------------
   三层：
   1. 真实：页面 → 本地代理 127.0.0.1:4174 → 高德（Key 只在代理里）
   2. 兜底：本地村镇坐标表（SEED）+ 直线距离折算车程
   3. 判定：车程 ≤ 30 分钟算「顺路」，超过就是「不顺路」

   任何一层失败都自动降到下一层，页面上会标明是「实测」还是「估算」。
   ========================================================================== */
(function (w) {
  "use strict";

  var EP = "http://127.0.0.1:4174";
  var LS_KEY = "roofgeo.v1";
  var ROAD_KMH = 32;      /* 农村路况按 32km/h 折算 */
  var BASE_MIN = 4;       /* 起步时间（出车、停车、搬工具） */
  var NEAR_MIN = 30;      /* 顺路阈值 */
  var POI_RADIUS_M = 15000; /* 搜村的搜索半径（米）：只搜附近的村，不搜全国 */
  var NEAR_KM = 30;         /* 超过这个距离的候选不占候选位 */

  /* ---------- 本地坐标表（村镇一级，近似值，用于兜底与联想） ---------- */
  var SEED = [
    { town: "富官庄镇", village: "富官庄村", lat: 35.9050, lng: 118.9800 },
    { town: "富官庄镇", village: "孙家沟村", lat: 35.9120, lng: 118.9920 },
    { town: "富官庄镇", village: "前吉庄村", lat: 35.8980, lng: 118.9660 },
    { town: "富官庄镇", village: "张家坡村", lat: 35.9180, lng: 118.9720 },
    { town: "富官庄镇", village: "刘家岭村", lat: 35.8930, lng: 118.9880 },
    { town: "富官庄镇", village: "桂花园村", lat: 35.9100, lng: 119.0000 },
    { town: "富官庄镇", village: "刘家沟村", lat: 35.9220, lng: 118.9600 },
    { town: "许孟镇", village: "赵家洼村", lat: 35.7860, lng: 119.1060 },
    { town: "许孟镇", village: "赵家岭村", lat: 35.7700, lng: 119.1280 },
    { town: "许孟镇", village: "孙家楼村", lat: 35.7920, lng: 119.1200 },
    { town: "棋山镇", village: "棋山南村", lat: 35.6970, lng: 119.2250 },
    { town: "棋山镇", village: "北沟村", lat: 35.7060, lng: 119.2380 },
    { town: "棋山镇", village: "西河村", lat: 35.6920, lng: 119.2400 },
    { town: "龙山镇", village: "龙山东村", lat: 35.6420, lng: 118.8960 },
    { town: "龙山镇", village: "李家庄村", lat: 35.6350, lng: 118.9100 },
    { town: "石桥镇", village: "石桥村", lat: 35.8200, lng: 119.3180 },
    { town: "石桥镇", village: "王家沟村", lat: 35.8280, lng: 119.3300 },
    { town: "城区", village: "保利香槟国际", lat: 35.7620, lng: 119.1000 },
    { town: "城区", village: "中海锦城", lat: 35.7520, lng: 119.1080 },
    { town: "城区", village: "万科城", lat: 35.7680, lng: 119.0920 }
  ];

  var TOWN = {
    "富官庄镇": { lat: 35.9050, lng: 118.9800 },
    "许孟镇": { lat: 35.7800, lng: 119.1150 },
    "棋山镇": { lat: 35.7000, lng: 119.2300 },
    "龙山镇": { lat: 35.6400, lng: 118.9000 },
    "石桥镇": { lat: 35.8200, lng: 119.3200 },
    "城区": { lat: 35.7600, lng: 119.1000 }
  };

  /* ---------- 工具 ---------- */
  function rad(d) { return (d * Math.PI) / 180; }

  function haversine(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    var R = 6371;
    var dLat = rad(b.lat - a.lat);
    var dLng = rad(b.lng - a.lng);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /* 直线距离折算车程：农村路况跑不出高速速度，按 32km/h + 4 分钟起步 */
  function estMinutes(km) {
    if (km == null) return null;
    return Math.round(BASE_MIN + (km / ROAD_KMH) * 60);
  }

  function fmtMin(min) {
    if (min == null) return "—";
    if (min < 60) return min + "分";
    var h = Math.floor(min / 60), m = min % 60;
    return h + "小时" + (m ? m + "分" : "");
  }

  /* ---------- 本地匹配 ---------- */
  function clean(s) {
    return String(s || "").replace(/\s+/g, "").replace(/[省市区县]/g, "");
  }

  /* 按村名 → 乡镇名逐级匹配，优先最长命中。
     注意两轮：先按「李家庄村」原样找，找不到再退一步按「李家庄」找——
     因为录单时人往往只打「李家庄 5 排 2 号」，不带「村」字。 */
  function seedMatch(text) {
    var t = clean(text);
    if (!t) return null;
    var best = null, bestLen = 0;
    function scan(stripTail) {
      allSeed().forEach(function (s) {
        var v = clean(s.village);
        if (stripTail) v = v.replace(/[村庄]$/, "");
        if (v.length < 2) return;
        if (t.indexOf(v) >= 0 && v.length > bestLen) { best = s; bestLen = v.length; }
      });
    }
    scan(false);
    if (!best) { bestLen = 0; scan(true); }
    if (best) return { town: best.town, village: best.village, lat: best.lat, lng: best.lng, source: "seed" };

    var townHit = null;
    Object.keys(TOWN).forEach(function (k) {
      if (clean(t).indexOf(clean(k)) >= 0) townHit = k;
    });
    if (townHit) {
      return { town: townHit, village: "", lat: TOWN[townHit].lat, lng: TOWN[townHit].lng, source: "town" };
    }
    return null;
  }

  function seedByVillage(village, town) {
    var v = clean(village);
    var list = allSeed();
    for (var i = 0; i < list.length; i++) {
      if (clean(list[i].village) === v) {
        return {
          town: list[i].town, village: list[i].village,
          lat: list[i].lat, lng: list[i].lng,
          source: list[i].approx ? "town" : "seed"
        };
      }
    }
    if (town && TOWN[town]) {
      return { town: town, village: village || "", lat: TOWN[town].lat, lng: TOWN[town].lng, source: "town" };
    }
    return null;
  }

  /* ---------- 代理可用性 ---------- */
  var status = { checked: 0, online: false, key: false };

  function fetchJSON(url, ms, options) {
    return new Promise(function (resolve, reject) {
      var ctl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (ctl) ctl.abort();
        reject(new Error("timeout"));
      }, ms || 3500);
      fetch(url, Object.assign({}, options || {}, { signal: ctl ? ctl.signal : undefined }))
        .then(function (r) { return r.json(); })
        .then(function (j) { clearTimeout(timer); resolve(j); })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function health(force) {
    var now = Date.now();
    if (!force && status.checked && now - status.checked < 30000) {
      return Promise.resolve(status);
    }
    return fetchJSON(EP + "/health", 1200)
      .then(function (j) {
        status = { checked: Date.now(), online: !!j.ok, key: !!j.key };
        return status;
      })
      .catch(function () {
        status = { checked: Date.now(), online: false, key: false };
        return status;
      });
  }

  function mode() {
    return status.online && status.key ? "amap" : "seed";
  }

  /* ---------- 缓存（内存 + localStorage） ---------- */
  /* 用户自己录过的村镇：录一次就记住，下次直接能联想（存在 localStorage） */
  var LS_VILLAGE = "roofgeo.villages.v1";
  var lastTown = null;

  /* 搜索偏置点：没给坐标时默认抬到工队常做的片区（诸城—五莲一带），
     中国同名村太多，不带偏置会搜出外省的村 */
  var lastNear = { lat: 35.905, lng: 118.980 };

  /* 队伍出发地：固定取 DATA.BASE。
     不做本机覆盖——出发地一般不变，多一层存储反而会让「改了 data.js 却不生效」很难查。 */
  function baseGeo() {
    return (w.DATA && w.DATA.BASE) || null;
  }

  function nearPoint() { return lastNear; }
  function setNear(lat, lng) {
    if (lat == null || lng == null) return;
    lastNear = { lat: lat, lng: lng };
  }

  /* 设备定位：搜村之前先把偏置点换成"我现在在哪"。
     只改搜索圆心，不落任何界面控件；失败就继续用上次的位置。 */
  var LS_LOC = "roofgeo.loc.v1";
  var LOC_TTL = 12 * 3600000;

  function cachedLoc() {
    try {
      var it = JSON.parse(localStorage.getItem(LS_LOC) || "null");
      if (it && it.lat != null && it.lng != null && Date.now() - (it.t || 0) < LOC_TTL) return it;
    } catch (e) {}
    return null;
  }

  function locate() {
    var geo = w.navigator && w.navigator.geolocation;
    if (!geo || !geo.getCurrentPosition) return Promise.resolve(null);
    return new Promise(function (resolve) {
      geo.getCurrentPosition(function (p) {
        var lat = p.coords.latitude, lng = p.coords.longitude;
        lastNear = { lat: lat, lng: lng };
        try { localStorage.setItem(LS_LOC, JSON.stringify({ lat: lat, lng: lng, t: Date.now() })); } catch (e) {}
        resolve({ lat: lat, lng: lng });
      }, function () {
        /* 用户拒绝或超时：不拦搜索，按上次位置继续 */
        resolve(null);
      }, { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 });
    });
  }

  /* 附近村庄：输入框还空着时，直接按当前定位列近处的村 */
  function nearby(radius) {
    var r = radius || 15000;
    var p = nearPoint();
    var ck = "nb:v1:" + p.lat.toFixed(4) + "," + p.lng.toFixed(4) + ":" + r;
    if (mem[ck]) return Promise.resolve(mem[ck]);

    function offline() {
      var items = allSeed().map(function (s) {
        var d = haversine(p, s);
        return {
          name: s.village, addr: s.town, kind: "村",
          lat: s.lat, lng: s.lng, dist: d == null ? null : Math.round(d * 10) / 10,
          approx: !!s.approx
        };
      }).filter(function (x) { return x.dist != null && x.dist <= r / 1000; });
      items.sort(function (a, b) { return a.dist - b.dist; });
      return { source: items.length ? "offline" : "none", items: items.slice(0, 8) };
    }

    return health().then(function (h) {
      if (!h.online || !h.key) return offline();
      var url = EP + "/nearby?lat=" + p.lat + "&lng=" + p.lng + "&radius=" + r;
      return fetchJSON(url, 7000).then(function (j) {
        var items = (j.items || []).filter(function (it) { return it.lat != null && it.name; });
        items.sort(function (a, b) { return (a.dist == null ? 1e9 : a.dist) - (b.dist == null ? 1e9 : b.dist); });
        if (!items.length) return offline();
        var res = { source: "amap", items: items.slice(0, 8) };
        mem[ck] = res;
        return res;
      }).catch(offline);
    });
  }

  function selfVillages() {
    try {
      var arr = JSON.parse(localStorage.getItem(LS_VILLAGE) || "[]");
      return Array.isArray(arr) ? arr : [];
    } catch (e) { return []; }
  }

  function remember(town, village, lat, lng, approx) {
    if (!town || !village || lat == null) return;
    var arr = selfVillages();
    var key = town + "|" + village;
    arr = arr.filter(function (x) { return x.town + "|" + x.village !== key; });
    /* approx=true 表示这条只是"镇中心落点"，下次命中时仍然要如实标出来 */
    arr.unshift({ town: town, village: village, lat: lat, lng: lng, approx: approx !== false });
    try { localStorage.setItem(LS_VILLAGE, JSON.stringify(arr.slice(0, 200))); } catch (e) {}
  }

  /* 本地能查的全部村镇 = 内置表 + 自己录过的 */
  function allSeed() {
    return selfVillages().concat(SEED);
  }

  var mem = {};

  /* ---------- 天气：按坐标取区县预报 ----------
     走代理的 /weather（内部先反查 adcode 再取高德预报）。高德只给未来 4 天，
     拿不到的日期前端就不显示天气，绝不用假数据凑。 */
  function weather(lat, lng) {
    var p = nearPoint();
    var la = lat != null ? lat : p.lat;
    var lo = lng != null ? lng : p.lng;
    var ck = "wx:" + Number(la).toFixed(2) + "," + Number(lo).toFixed(2);
    if (mem[ck]) return Promise.resolve(mem[ck]);
    return fetchJSON(EP + "/weather?lat=" + la + "&lng=" + lo, 9000)
      .then(function (j) {
        var res = {
          source: j.source || "none",
          city: j.city || "",
          report: j.report || "",
          items: (j.items || []).filter(function (x) { return x && x.date; })
        };
        if (res.items.length) mem[ck] = res;
        return res;
      })
      .catch(function () { return { source: "none", city: "", report: "", items: [] }; });
  }

  /* 批量：按每条活的施工坐标取天气。
     入参 [{lat,lng}]，返回 {"35.98,119.56": {"2026-10-28": {day,tmax,tmin,...}}}。
     1 km 网格内去重（同一个村只问一次），代理再按区县合并上游请求。 */
  function weatherPoints(list) {
    var uniq = [], seen = {};
    (list || []).forEach(function (p) {
      if (!p || p.lat == null || p.lng == null) return;
      var k = Number(p.lat).toFixed(2) + "," + Number(p.lng).toFixed(2);
      if (seen[k]) return;
      seen[k] = 1;
      uniq.push({ k: k, lat: p.lat, lng: p.lng });
    });
    if (!uniq.length) return Promise.resolve({});

    var ck = "wxm:" + uniq.map(function (u) { return u.k; }).join(";");
    if (mem[ck]) return Promise.resolve(mem[ck]);

    var pts = uniq.map(function (u) { return u.lat + "," + u.lng; }).join(";");
    return fetchJSON(EP + "/weather?pts=" + encodeURIComponent(pts), 15000)
      .then(function (j) {
        var out = {};
        (j.points || []).forEach(function (p) {
          if (!p || !p.items || !p.items.length || p.lat == null) return;
          var k = Number(p.lat).toFixed(2) + "," + Number(p.lng).toFixed(2);
          var byDate = {};
          p.items.forEach(function (w) { if (w && w.date) byDate[w.date] = w; });
          out[k] = byDate;
        });
        if (Object.keys(out).length) mem[ck] = out;
        return out;
      })
      .catch(function () { return {}; });
  }
  function lsAll() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch (e) { return {}; }
  }
  function lsPut(k, v) {
    try {
      var all = lsAll();
      all[k] = { t: Date.now(), v: v };
      localStorage.setItem(LS_KEY, JSON.stringify(all));
    } catch (e) { /* 隐私模式忽略 */ }
  }
  function lsGet(k, ttl) {
    var all = lsAll();
    var it = all[k];
    if (!it) return null;
    if (Date.now() - it.t > (ttl || 7 * 86400000)) return null;
    return it.v;
  }

  /* 认不出村名时的兜底：按镇中心落一个点，界面标「镇中心 · 待校准」 */
  function fallbackItem(text) {
    var raw = String(text || "").trim();
    var t = clean(raw);
    if (t.length < 2) return null;

    var town = null;
    Object.keys(TOWN).forEach(function (k) {
      if (t.indexOf(clean(k)) >= 0) town = k;
    });
    if (!town) town = lastTown || "富官庄镇";

    var village = (raw.replace(town, "").trim() || raw).slice(0, 14);
    var c = TOWN[town] || TOWN["富官庄镇"];
    return {
      name: village,
      district: town,
      lat: c.lat,
      lng: c.lng,
      source: "town",
      approx: true
    };
  }

  /* ---------- 对外：地址联想 ---------- */
  function suggest(text) {
    var local = [];
    var t = clean(text);
    if (t) {
      allSeed().forEach(function (s) {
        var hay = clean(s.town + s.village);
        if (hay.indexOf(t) >= 0) {
          local.push({
            name: s.village, district: s.town,
            lat: s.lat, lng: s.lng, source: "seed", approx: !!s.approx
          });
        }
      });
    }

    /* 本地一条都没命中 → 末尾给一条「按镇中心」的兜底，让任何输入都能落地 */
    function withFallback(res) {
      var items = res.items || [];
      if (!items.length) {
        var fb = fallbackItem(text);
        if (fb) items = [fb];
      }
      return { items: items, source: res.source || "seed" };
    }

    return health().then(function (h) {
      if (!h.online || !h.key || !t) return withFallback({ items: local, source: "seed" });
      return fetchJSON(EP + "/suggest?keywords=" + encodeURIComponent(text), 2600)
        .then(function (j) {
          var items = local.slice();
          (j.items || []).forEach(function (it) {
            if (it.lat == null) return;
            if (!it.name) return;
            items.push({
              name: it.name, district: it.district,
              lat: it.lat, lng: it.lng, source: "amap"
            });
          });
          /* 去重（同名同镇保留高德那条） */
          var seen = {}, out = [];
          items.forEach(function (it) {
            var k = it.district + "|" + it.name;
            if (seen[k]) return;
            seen[k] = 1;
            out.push(it);
          });
          return withFallback({ items: out.slice(0, 7), source: j.source === "amap" ? "amap" : "seed" });
        })
        .catch(function () { return withFallback({ items: local, source: "seed" }); });
    });
  }

  /* ---------- 对外：地名搜索（像地图软件那样，输入即搜真地名） ----------
     有高德 Key → 高德输入提示；没 Key → OpenStreetMap(Photon)。
     两条都是"真搜索"，不掺本地历史库——本地库只在彻底搜不到 / 断网时兜底。
  */
  function localMatch(text) {
    var t = clean(text), out = [];
    if (!t) return out;
    allSeed().forEach(function (s) {
      var hay = clean(s.town + s.village);
      if (hay.indexOf(t) >= 0) {
        out.push({
          name: s.village, addr: s.town, kind: s.approx ? "镇中心" : "本地",
          lat: s.lat, lng: s.lng, dist: null,
          source: "seed", approx: !!s.approx
        });
      }
    });
    return out;
  }

  function searchPoi(text) {
    var q = String(text || "").trim();
    if (!q) return Promise.resolve({ source: "none", items: [] });

    var ck = "poi:v4:" + lastNear.lat.toFixed(4) + "," + lastNear.lng.toFixed(4) + ":" + q;
    if (mem[ck]) return Promise.resolve(mem[ck]);

    var url = EP + "/poi?keywords=" + encodeURIComponent(q) +
      "&lat=" + lastNear.lat + "&lng=" + lastNear.lng + "&radius=" + POI_RADIUS_M;

    return fetchJSON(url, 7000)
      .then(function (j) {
        var res = { source: j.source || "none", items: j.items || [] };
        /* 服务端已按半径收过一遍，这里再兜一层：远处同名村不占候选位。
           附近一条都没有时，保留最近的 3 条并标 widened，免得直接搜不到。 */
        var near = res.items.filter(function (it) { return it.dist == null || it.dist <= NEAR_KM; });
        if (!near.length && res.items.length) {
          near = res.items.slice(0, 3);
          res.widened = true;
        }
        res.items = near;
        if (!res.items.length) {
          /* 真搜不到才给本地兜底，且标明是离线库 */
          res.items = localMatch(q);
          res.source = res.items.length ? "offline" : "none";
        }
        if (res.source === "amap") mem[ck] = res;
        return res;
      })
      .catch(function () {
        var items = localMatch(q);
        return { source: items.length ? "offline" : "none", items: items };
      });
  }

  /* ---------- 对外：两个点之间开车多久 ---------- */
  function route(a, b) {
    if (!a || !b) return Promise.resolve(null);
    var km = haversine(a, b);
    var key = "r:v2:" + a.lat.toFixed(5) + "," + a.lng.toFixed(5) + ">" + b.lat.toFixed(5) + "," + b.lng.toFixed(5);

    if (mem[key] && mem[key].source === "amap") return Promise.resolve(mem[key]);
    var cached = lsGet(key, 30 * 86400000);
    if (cached && cached.source === "amap") { mem[key] = cached; return Promise.resolve(cached); }

    return health().then(function (h) {
      if (!h.online || !h.key) {
        var est = { min: estMinutes(km), km: km == null ? null : Math.round(km * 10) / 10, source: "est" };
        mem[key] = est;
        return est;
      }
      var url = EP + "/route?origin=" + a.lng + "," + a.lat + "&dest=" + b.lng + "," + b.lat;
      return fetchJSON(url, 3200)
        .then(function (j) {
          var out = (j.ok && j.minutes != null)
            ? { min: j.minutes, km: j.km, source: "amap" }
            : { min: estMinutes(km), km: km == null ? null : Math.round(km * 10) / 10, source: "est" };
          mem[key] = out;
          if (out.source === "amap") lsPut(key, out);
          return out;
        })
        .catch(function () {
          var est = { min: estMinutes(km), km: km == null ? null : Math.round(km * 10) / 10, source: "est" };
          mem[key] = est;
          return est;
        });
    });
  }

  /* 同步估算（用于首屏立刻出结果，不等网络） */
  function routeSync(a, b) {
    if (!a || !b) return null;
    var km = haversine(a, b);
    return { min: estMinutes(km), km: km == null ? null : Math.round(km * 10) / 10, source: "est" };
  }

  /* ---------- 订单地理字段补齐 ---------- */
  function of(o) {
    if (!o) return null;
    if (o.geo && o.geo.lat != null) return o.geo;
    var g = seedByVillage(o.village, o.town) || seedMatch(o.addr || "");
    if (g) { o.geo = g; }
    return o.geo || null;
  }

  function ensureAll() {
    (w.DATA.ORDERS || []).forEach(of);
    (w.DATA.PENDING || []).forEach(of);
  }

  /* ---------- 某一天里，离本单最近的那一单 ---------- */
  function nearestOnDay(day, geo) {
    if (!day || !geo) return null;
    var best = null;
    (day.slots || []).forEach(function (sl) {
      (sl.items || []).forEach(function (it) {
        var o = it.oid ? w.DATA.byId(it.oid) : null;
        var g = o ? of(o) : null;
        if (!g) return;
        var r = routeSync(geo, g);
        if (r.min == null) return;
        if (!best || r.min < best.min) {
          best = { min: r.min, km: r.km, source: r.source, oid: it.oid, title: it.title };
        }
      });
    });
    return best;
  }

  /* 在页面里直接配置高德 Key：交给本机代理写入并立即生效 */
  function setKey(k) {
    return fetchJSON(EP + "/session", 1800).then(function (session) {
      if (!session.ok || !session.token) throw new Error("请通过本地服务打开页面后配置 Key");
      return fetchJSON(EP + "/key", 10000, {
        method:"POST", headers:{"Content-Type":"application/json", "X-Geo-Token":session.token},
        body:JSON.stringify({key:k || ""})
      });
    }).then(function (r) {
      if (r.ok) {
        mem = {}; status.checked = 0;
        try { localStorage.removeItem(LS_KEY); } catch (e) {}
      }
      return r;
    });
  }

  /* ---------- 这天跑一趟的现实代价 ----------
     两种情况必须分开算，否则判断会失真：
     · 当天已有活儿 → 看「新单与已有活儿的转场」，≤30 分钟算顺路（插进去几乎不增加成本）
     · 当天空着     → 看「从家出发的单程」，这是专门跑一趟的代价，不存在顺不顺路
  */
  function dayTrip(day, geo) {
    if (!day || !geo) return null;

    var best = null;
    (day.slots || []).forEach(function (sl) {
      (sl.items || []).forEach(function (it) {
        var o = it.oid ? w.DATA.byId(it.oid) : null;
        var g = o ? of(o) : null;
        if (!g) return;
        var r = routeSync(geo, g);
        if (r.min == null) return;
        if (!best || r.min < best.min) {
          best = {
            min: r.min, km: r.km, source: r.source,
            kind: "transfer", oid: it.oid, title: it.title
          };
        }
      });
    });
    if (best) return best;

    var b = baseGeo();
    if (!b) return null;
    var r2 = routeSync(b, geo);
    if (r2.min == null) return null;
    return {
      min: r2.min, km: r2.km, source: r2.source,
      kind: "home", title: b.name, oid: null
    };
  }

  w.GEO = {
    EP: EP,
    SEED: SEED,
    TOWN: TOWN,
    NEAR_MIN: NEAR_MIN,
    health: health,
    setKey: setKey,
    mode: mode,
    status: function () { return status; },
    suggest: suggest,
    route: route,
    routeSync: routeSync,
    estMinutes: estMinutes,
    fmtMin: fmtMin,
    haversine: haversine,
    seedMatch: seedMatch,
    seedByVillage: seedByVillage,
    searchPoi: searchPoi,
    locate: locate,
    cachedLoc: cachedLoc,
    nearby: nearby,
    weather: weather,
    weatherPoints: weatherPoints,
    baseGeo: baseGeo,
    dayTrip: dayTrip,
    localMatch: localMatch,
    nearPoint: nearPoint,
    setNear: setNear,
    fallbackItem: fallbackItem,
    remember: remember,
    selfVillages: selfVillages,
    allSeed: allSeed,
    setTown: function (t) { lastTown = t; },
    townCount: function () { return allSeed().length; },
    nearestOnDay: nearestOnDay,
    of: of,
    ensureAll: ensureAll
  };

  /* 上次的定位（12 小时内有效）直接当搜索圆心，省得每次进来都先搜到外地去；
     没定位过就用队伍出发地（DATA.BASE），别再拿写死的莒县坐标当圆心 */
  var _loc = cachedLoc();
  if (_loc) lastNear = { lat: _loc.lat, lng: _loc.lng };
  else {
    var _base = baseGeo();
    if (_base && _base.lat != null && _base.lng != null) lastNear = { lat: _base.lat, lng: _base.lng };
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      if (w.DATA) { ensureAll(); health(); }
    });
  } else if (w.DATA) {
    ensureAll();
    health();
  }
})(window);
