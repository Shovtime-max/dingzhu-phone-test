/* ==========================================================================
   分析看板（复刻 waymo_1，全部指标由 data.js 实时计算）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  /* 主卡：一个主角数字 + 一个环形达成率 + 三列金额（v2） */
  function heroCard(s, scope) {
    var pct = Math.max(0, Math.min(1, s.rate || 0));
    return (
      '<section class="card hero">' +
        '<div class="hero-top">' +
          "<div>" +
            '<div class="hero-label">' + scope + "已收进账</div>" +
            '<div class="hero-num"><small>¥</small>' + U.n(s.paid) + "</div>" +
          "</div>" +
          '<div class="ring" style="--p:' + (pct * 100).toFixed(1) + '">' +
            "<b>" + U.pct(s.rate, 0) + "</b></div>" +
        "</div>" +
        '<div class="hero-split">' +
          "<div><em>总报价</em><b>¥" + U.n(s.quote) + "</b></div>" +
          '<div><em>已收</em><b class="g">¥' + U.n(s.paid) + "</b></div>" +
          '<div><em>待收</em><b class="o">¥' + U.n(s.due) + "</b></div>" +
        "</div>" +
        '<div class="hero-foot">' +
          "<span>" + s.count + " 单 · 完工率 " + U.pct(s.doneRate, 0) + "</span>" +
          '<span class="hf-due">' + s.dueCount + " 家待催</span>" +
          '<button class="hero-link" id="btnCollect" type="button">' + U.icon("phone", 12) + "催单表</button>" +
        "</div>" +
      "</section>"
    );
  }

  /* 班组施工效能对比：每队一条横向色条同场对垒
     队数不写死 —— DATA.TEAMS 里加几条就出几行，3 队以上照样按条长比 */
  function teamCard(s, scope) {
    var rows = (D.TEAMS || []).map(function (t) {
      var x = s.teams[t.id] || { rooms: 0, count: 0 };
      return {
        id: t.id, name: t.name || t.id, alias: t.alias || "",
        color: t.color || "#0066FF",
        rooms: x.rooms || 0, count: x.count || 0
      };
    }).sort(function (a, b) { return b.rooms - a.rooms || b.count - a.count; });

    var total = rows.reduce(function (a, r) { return a + r.rooms; }, 0);
    var max = Math.max.apply(null, rows.map(function (r) { return r.rooms; }).concat([0])) || 1;

    var list = rows.map(function (r) {
      var pct = r.rooms ? Math.max(5, Math.round((r.rooms / max) * 100)) : 0;
      return (
        '<div class="tr-row' + (r.rooms > 0 && r.rooms === max ? " lead" : "") + '" style="--tc:' + U.esc(r.color) + '">' +
          '<div class="tr-top">' +
            '<i class="tr-dot" aria-hidden="true"></i>' +
            '<span class="tr-name">' + U.esc(r.name) + "</span>" +
            (r.alias ? '<span class="tr-alias">' + U.esc(r.alias) + "</span>" : "") +
            '<span class="tr-sum"><b>' + r.rooms + "</b> 间 · " + r.count + " 单</span>" +
          "</div>" +
          '<div class="tr-track"><i style="width:' + pct + '%"></i></div>' +
        "</div>"
      );
    }).join("");

    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("users", 16) + "</span>班组施工效能对比</div>" +
          '<span class="card-meta">' + scope + " " + total + " 间</span>" +
        "</div>" + list +
      "</section>"
    );
  }

  /* 分口径均价：只留两个口径（包工包料 / 纯人工） */
  function avgCards(s) {
    return (
      '<div class="section-label"><span>分口径均价（按间核算）</span><em>包工包料 vs 纯人工</em></div>' +
      '<div class="avg-grid">' +
        '<div class="avg"><div><div class="ak">包工包料均价</div><div class="av brand-t">¥' + U.n(s.avgBag) + '<small>/间</small></div></div>' +
          '<span class="af green">含彩钢与配件</span></div>' +
        '<div class="avg"><div><div class="ak">只人工纯工费</div><div class="av">¥' + U.n(s.avgLabor) + '<small>/间</small></div></div>' +
          '<span class="af">业主自备瓦料</span></div>' +
      "</div>"
    );
  }

  /* ==========================================================================
     区域施工分布 · 天气场叠真地图
     --------------------------------------------------------------------------
     层级纯自动：z ≤ 11 看乡镇，z ≥ 12 看村。
     取坐标的优先级：订单现场定位 o.geo → 村镇坐标表（GEO.TOWN / GEO.SEED）。
     这两张表的坐标是 2026-10-31 用高德 geocode 回填的，村一级只精确到镇。
     ========================================================================== */
  var LEVEL_TOWN = 11;          /* 到这个缩放以下看镇，以上看村 */
  var FOUR_CITY = [115.6, 34.1, 121.2, 37.5];   /* 潍坊·青岛·日照·临沂 外框 */

  function townMeta(name) {
    var T = (w.GEO && w.GEO.TOWN) || {};
    return T[name] || null;
  }

  /* 单个订单定到哪个点：有现场定位就用定位，否则退到镇，再退到村表 */
  function pointOf(o, level) {
    var g = o.geo;
    if (g && isFinite(g.lat) && isFinite(g.lng)) return { lat: g.lat, lng: g.lng, precise: true };
    if (level === "village" && w.GEO && w.GEO.seedByVillage) {
      var s = null;
      try { s = w.GEO.seedByVillage(o.town, o.village); } catch (e) { s = null; }
      if (s && isFinite(s.lat)) return { lat: s.lat, lng: s.lng, precise: false };
    }
    var t = townMeta(o.town);
    if (t && isFinite(t.lat)) return { lat: t.lat, lng: t.lng, precise: false };
    return null;
  }

  /* 按层级聚合成点位 */
  function aggregate(list, level) {
    var map = Object.create(null), miss = 0, missTowns = Object.create(null), unknown = 0;
    list.forEach(function (o) {
      var p = pointOf(o, level);
      if (!p) { miss++; if (o.town) missTowns[o.town] = 1; return; }
      var key = level === "village" ? (o.town + "·" + (o.village || "未标")) : (o.town || "未标");
      var c = map[key];
      if (!c) {
        c = map[key] = {
          key: key, town: o.town, name: level === "village" ? (o.village || "未标村") : (o.town || "未标镇"),
          lat: p.lat, lng: p.lng, v: 0, rooms: 0, precise: p.precise
        };
      }
      c.v++; c.rooms += D.rooms(o);
      if (p.precise) { c.lat = p.lat; c.lng = p.lng; c.precise = true; }
      else if (!c.precise) { /* 保持镇中心 */ }
      if (!p.precise) unknown++;
    });
    var pts = Object.keys(map).map(function (k) { return map[k]; })
      .sort(function (a, b) { return b.v - a.v || a.name.localeCompare(b.name, "zh-CN"); });
    return { pts: pts, miss: miss, missTowns: Object.keys(missTowns), unknown: unknown };
  }

  function weatherCard(list, scope) {
    var m = aggregate(list, "town");
    if (!m.pts.length) return "";
    var lo = Math.min.apply(null, m.pts.map(function (p) { return p.v; }));
    var hi = Math.max.apply(null, m.pts.map(function (p) { return p.v; }));

    return (
      '<section class="card mt14 wx-card">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("pin", 16) + "</span>区域施工分布</div>" +
          '<span class="card-meta" id="wxMeta">' + scope + " 乡镇级</span>" +
        "</div>" +
        '<div class="wx-map" id="wxMap"></div>' +
        '<div class="wx-leg">' +
          '<div class="wx-bar"></div>' +
          '<div class="wx-scale"><span>少 ' + lo + " 单</span><span>多 " + hi + " 单</span></div>" +
        "</div>" +
        '<div class="wx-note" id="wxNote">拖动平移，双指或 +/− 缩放；放大到街道级自动切到村级。点圆点看该处单子</div>' +
      "</section>"
    );
  }

  /* 点一个点 → 该处订单清单（镇级看镇，村级看村） */
  function placeOrdersSheet(pt, list, level) {
    var rows = list.filter(function (o) {
      return level === "village" ? (o.town === pt.town && (o.village || "未标") === pt.name) : o.town === pt.town;
    }).sort(function (a, b) { return D.due(b) - D.due(a); });
    if (!rows.length) { U.toast("这里本月没有单子"); return; }
    var quote = rows.reduce(function (a, o) { return a + (Number(o.quote) || 0); }, 0);
    var dueAll = rows.reduce(function (a, o) { return a + D.due(o); }, 0);
    var nGeo = rows.filter(function (o) {
      return o.geo && typeof o.geo.lat === "number" && isFinite(o.geo.lat);
    }).length;
    var body = rows.map(function (o) {
      var dd = D.due(o);
      return (
        '<div class="wx-orow">' +
          '<div class="wx-orow-l"><b>' + U.esc(o.owner || "未填业主") + "</b>" +
            '<span>' + U.esc(o.village || o.addr || "—") + "</span></div>" +
          '<div class="wx-orow-r"><b>¥' + U.n(o.quote) + "</b>" +
            '<span class="' + (dd > 0 ? "orange-t" : "mut") + '">' +
            (dd > 0 ? "待收 ¥" + U.n(dd) : "已结清") + "</span></div>" +
        "</div>"
      );
    }).join("");

    U.sheet(
      "<h3>" + U.esc(level === "village" ? pt.town + " · " + pt.name : pt.name) + "</h3>" +
      '<div class="sub">' + rows.length + " 单 · " +
        rows.reduce(function (a, o) { return a + D.rooms(o); }, 0) + " 间 · 报价 ¥" + U.n(quote) +
        (dueAll > 0 ? " · 待收 ¥" + U.n(dueAll) : "") +
        (nGeo ? " · " + nGeo + " 单有现场定位" : " · 按镇级坐标显示") + "</div>" +
      '<div style="max-height:52vh;overflow-y:auto">' + body + "</div>"
    );
  }

  /* 真地图 + 天气场覆盖层，层级跟着缩放自动切 */
  function initMap(el, list, scope) {
    if (!el || !w.TILEMAP || !w.HEAT) return null;

    var level = "town";
    var layer = null, layerLevel = "";
    var shapes = w.COUNTIES || [];
    var metaEl = document.getElementById("wxMeta");
    var noteEl = document.getElementById("wxNote");

    function viewSpan(z, vw, vh) {
      var world = 256 * Math.pow(2, z);
      var spanLng = vw / world * 360 * 1.5;
      var spanLat = spanLng * (vh / Math.max(1, vw));
      return { lng: spanLng, lat: spanLat };
    }

    function refresh() {
      var agg = aggregate(list, level);
      var maxV = agg.pts.reduce(function (a, p) { return Math.max(a, p.v); }, 0);
      map.setMarkers(agg.pts.map(function (p) {
        return {
          lng: p.lng, lat: p.lat,
          label: (level === "village" ? p.name : p.name.replace(/镇$/, "")) + " " + p.v,
          title: p.name + " · " + p.v + " 单",
          major: p.v === maxV,
          onClick: function () { placeOrdersSheet(p, list, level); }
        };
      }));
      layer = null;    /* 下一帧重算密度场 */


      if (metaEl) {
        metaEl.textContent = scope + (level === "village"
          ? " 村级 · " + agg.pts.length + " 村"
          : " 乡镇级 · " + agg.pts.length + " 镇") + (agg.miss ? " · " + agg.miss + " 单未定位" : "");
      }
      if (noteEl) {
        var parts = [];
        parts.push(level === "village" ? "已按村汇总" : "已按乡镇汇总");
        if (agg.miss) parts.push("「" + agg.missTowns.slice(0, 2).join("、") + "」等 " + agg.miss + " 单没有坐标，未上图");
        if (level === "village" && agg.unknown) parts.push(agg.unknown + " 单只有镇级坐标，暂且堆在镇中心");
        parts.push("颜色为插值推算，非实测");
        noteEl.textContent = parts.join("；");
      }
    }

    var map = w.TILEMAP.create(el, {
      center: [119.1, 35.8],
      zoom: 9,
      minZoom: 8,
      maxZoom: 13,
      bounds: FOUR_CITY,
      focus: aggregate(list, "town").pts,
      onDraw: function (ctx, proj, z, vw, vh, dpr) {
        if (!map) return;
        var vg = map.viewGeo();
        /* 只在「换了层级」或「视野超出已有色场」时重算 —— 拖动时每帧重算会卡 */
        var need = layerLevel !== level || !layer ||
          !(layer.bb[0] <= vg[0] && layer.bb[1] <= vg[1] &&
            layer.bb[2] >= vg[2] && layer.bb[3] >= vg[3]);
        if (need) {
          var agg = aggregate(list, level);
          layer = agg.pts.length
            ? w.HEAT.field(agg.pts, {
                view: vg,
                /* 村级点少又挤，幂次压低让场平缓些，不然放大就一片死红 */
                power: level === "village" ? 1.3 : 2.6
              })
            : null;
          layerLevel = level;
        }
        /* 村级只作底色，主要靠点看，别压得太重 */
        if (layer) w.HEAT.paint(ctx, layer, proj, level === "village" ? 0.5 : 0.78);
        w.HEAT.strokeShapes(ctx, shapes, proj, dpr);
      },
      onMove: function (lng, lat, z) {
        var want = z >= 12 ? "village" : "town";
        if (want !== level) { level = want; refresh(); }
      }
    });

    refresh();

    /* 视野对准有单的点，而不是整个地级范围 */
    var agg0 = aggregate(list, "town");
    if (agg0.pts.length) {
      map.fitBounds([
        Math.min.apply(null, agg0.pts.map(function (p) { return p.lng; })),
        Math.min.apply(null, agg0.pts.map(function (p) { return p.lat; })),
        Math.max.apply(null, agg0.pts.map(function (p) { return p.lng; })),
        Math.max.apply(null, agg0.pts.map(function (p) { return p.lat; }))
      ], 46);
    }
    return map;
  }

  function townRank(list) {
    var all = D.townRank(list);
    var arr = all.slice(0, 4);
    var max = arr.length ? arr[0].count : 1;
    var rows = arr.map(function (t, i) {
      var w = (t.count / max) * 100;
      var cls = i === 0 ? "top" : "";
      return (
        '<div class="rank-item">' +
          '<div class="rank-h">' +
            '<div class="fx aic g8"><span class="rank-n ' + cls + '">' + (i + 1) + "</span>" +
            '<span class="b8">' + U.esc(t.town) + "</span></div>" +
            '<span class="rank-v"><b>' + t.count + " 单</b>" +
              '<span>' + t.rooms + " 间 · ¥" + U.n(t.money) + "</span></span>" +
          "</div>" +
          '<div class="bar thin"><i style="width:' + w + '%;opacity:' + (1 - i * 0.18) + '"></i></div>' +
        "</div>"
      );
    }).join("");

    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("flame", 16) + "</span>热门乡镇施工榜</div>" +
          '<button type="button" class="pill xs line" id="btnAllRanks">查看全部排行</button>' +
        "</div>" + rows +
      "</section>"
    );
  }

  function rankSheet(list, level) {
    var labels = {city:"市", district:"区", county:"县", town:"镇", village:"村"};
    var groups = Object.create(null), missing = 0;
    list.forEach(function (o) {
      var g = o.geo || {}, text = [g.district, g.addr, o.addr].filter(Boolean).join(" ");
      var val = level === "town" ? o.town : level === "village" ? o.village :
        level === "city" ? (g.city || (text.match(/[^\s，,省市]+市/) || [])[0]) :
        level === "district" ? (g.district && /区$/.test(g.district) ? g.district : (text.match(/[^\s，,市区县]+区/) || [])[0]) :
        (g.county || (g.district && /县$/.test(g.district) ? g.district : (text.match(/[^\s，,市区县]+县/) || [])[0]));
      val = String(val || "").trim();
      if (!val || /^未标|未知/.test(val)) { missing++; return; }
      var context = level === "village" ? String(o.town || "").trim() : "";
      var key = context + "|" + val;
      var row = groups[key] || (groups[key] = {name: context && context !== "未标镇" ? context + " · " + val : val, count:0, rooms:0, money:0});
      row.count++; row.rooms += D.rooms(o); row.money += Number(o.quote) || 0;
    });
    var rows = Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a,b) { return b.count-a.count || b.rooms-a.rooms || a.name.localeCompare(b.name, "zh-CN"); });
    var html = '<h3>地区施工排行</h3><div class="sub">按订单数排序 · 跟随分析页面所选月份</div><div class="fx g8" style="flex-wrap:wrap">' +
      Object.keys(labels).map(function (k) { return '<button type="button" class="pill ' + (k === level ? 'brand' : 'line') + '" data-rank-level="' + k + '">' + labels[k] + '</button>'; }).join('') + '</div>' +
      '<div class="sub mt12">未识别' + labels[level] + '：' + missing + ' 单</div><div style="max-height:48vh;overflow:auto">' +
      (rows.map(function (r,i) { return '<div class="rank-item"><div class="rank-h"><span class="b8">' + (i+1) + '. ' + U.esc(r.name) + '</span><span class="rank-v"><b>' + r.count + ' 单</b><span>' + r.rooms + ' 间 · ¥' + U.n(r.money) + '</span></span></div></div>'; }).join('') || '<div class="sub">暂无可识别的地区数据</div>') + '</div>';
    var mask = U.sheet(html);
    mask.addEventListener('click', function (e) { var b = e.target.closest('[data-rank-level]'); if (b) { U.closeSheet(); rankSheet(list, b.getAttribute('data-rank-level')); } });
  }

  function collectSheet() {
    var dues = D.dueOrders();
    var rows = dues.map(function (o) {
      var od = D.overdueDays(o);
      return (
        '<div class="fx aic jb" style="padding:11px 12px;border-radius:14px;background:var(--line-soft);margin-bottom:8px">' +
          "<div><div class=\"t-sm b8\">" + U.esc(o.town) + " · " + U.esc(o.owner) + "</div>" +
          '<div class="t-xs ' + (od > 15 ? "orange-t" : "mut") + ' b7 mt2">超 ' + od + " 天 · 欠 ¥" + U.n(D.due(o)) + "</div></div>" +
          '<button class="btn xs" data-call="' + U.esc(o.phone) + '" style="background:var(--brand);color:#fff">' + U.icon("phone", 11) + "催收</button>" +
        "</div>"
      );
    }).join("");

    return (
      "<h3>催收总名单（" + dues.length + " 家）</h3>" +
      '<div class="sub">待回款合计 ¥' + U.n(D.stats().due) + " · 建议午间电话联系</div>" +
      '<div style="max-height:46vh;overflow-y:auto">' + rows + "</div>" +
      '<button class="btn primary mt12" id="btnCopySms">一键复制全员提醒短信</button>'
    );
  }

  w.VIEWS = w.VIEWS || {};
  /* ---------- 统计区间：默认本月，可跨月 ---------- */
  var RANGE_KEY = "dingzhu.analytics.v1";

  function curKey() { return D.TODAY.y + "-" + ("0" + D.TODAY.m).slice(-2); }

  function readRange() {
    var list = D.monthChoices();
    var keys = list.map(function (m) { return m.key; });
    var out = { from: curKey(), to: curKey() };
    var raw = null;
    try { raw = w.localStorage.getItem(RANGE_KEY); } catch (e) { raw = null; }
    if (raw) {
      try {
        var o = JSON.parse(raw);
        if (o && keys.indexOf(o.from) >= 0 && keys.indexOf(o.to) >= 0) {
          out.from = o.from; out.to = o.to;
        }
      } catch (e) {}
    }
    if (out.from > out.to) { var t = out.from; out.from = out.to; out.to = t; }
    return out;
  }
  function writeRange(r) {
    try { w.localStorage.setItem(RANGE_KEY, JSON.stringify(r)); } catch (e) {}
  }
  function monthOf(key) {
    var list = D.monthChoices();
    for (var i = 0; i < list.length; i++) if (list[i].key === key) return list[i];
    return { key: key, y: 0, m: 0, label: key };
  }
  function rangeLabel(r) {
    var a = monthOf(r.from), b = monthOf(r.to);
    if (r.from === r.to) return a.label;
    if (a.y === b.y) return a.y + "年 " + a.m + "–" + b.m + "月";
    return a.label + " – " + b.label;
  }
  /* 口径文案：本月 / 指定月 / 区间 —— 选 9 月时说“本月已收”会误导 */
  function rangeScope(r) {
    if (r.from !== r.to) return "区间";
    return r.from === curKey() ? "本月" : monthOf(r.from).m + " 月";
  }

  /* 分月对比：区间跨月时才出，直接看每月各干了多少 */
  function monthBreakdown(r) {
    var months = D.monthChoices()
      .filter(function (m) { return m.key >= r.from && m.key <= r.to; })
      .sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    if (months.length < 2) return "";
    var rows = months.map(function (m) {
      var s = D.stats(D.ordersInRange(m.key, m.key));
      var w = Math.round((s.rate || 0) * 100);
      return (
        '<div class="mr-row">' +
          '<div class="mr-top"><b>' + m.m + " 月</b>" +
            '<span class="mut3">' + s.count + " 单 · " + s.rooms + " 间</span>" +
            '<em class="brand-t">' + U.pct(s.rate, 0) + "</em></div>" +
          '<div class="mr-bar"><i style="width:' + w + '%"></i></div>' +
          '<div class="mr-nums"><span>报价 ¥' + U.n(s.quote) + "</span>" +
            '<span class="g">已收 ¥' + U.n(s.paid) + "</span>" +
            '<span class="o">待收 ¥' + U.n(s.due) + "</span></div>" +
        "</div>"
      );
    }).join("");
    return (
      '<section class="card mt14">' +
        '<div class="card-head">' +
          '<div class="card-title"><span class="ico-chip">' + U.icon("layers", 16) + "</span>分月对比</div>" +
          '<span class="card-meta">' + months.length + " 个月</span>" +
        "</div>" + rows +
      "</section>"
    );
  }

  function rangeSheet(cur, done) {
    var months = D.monthChoices();
    var quick = [
      { k: "m", t: "本月" },
      { k: "q3", t: "近 3 个月" },
      { k: "all", t: "全部" }
    ].map(function (q) {
      return '<button class="rg-q" type="button" data-q="' + q.k + '">' + q.t + "</button>";
    }).join("");
    var opts = function (sel) {
      return months.map(function (m) {
        return '<option value="' + m.key + '"' + (m.key === sel ? " selected" : "") + ">" + m.label + "</option>";
      }).join("");
    };
    var mask = U.sheet(
      "<h3>统计区间</h3>" +
      '<div class="sub">选起止月份，跨月的数据会合并统计</div>' +
      '<div class="rg-quick">' + quick + "</div>" +
      '<div class="rg-pick">' +
        '<label class="rg-f"><span>起始</span><select class="field-box" id="rgFrom">' + opts(cur.from) + "</select></label>" +
        '<label class="rg-f"><span>结束</span><select class="field-box" id="rgTo">' + opts(cur.to) + "</select></label>" +
      "</div>" +
      '<button class="btn primary mt14" id="rgApply">应用</button>'
    );

    function apply(r) {
      writeRange(r);
      U.closeSheet();
      if (done) done(r);
      if (w.APP && w.APP.render) w.APP.render();
    }

    mask.addEventListener("click", function (e) {
      var q = e.target.closest("[data-q]");
      if (q) {
        var k = q.getAttribute("data-q");
        var all = months.map(function (m) { return m.key; }).sort();
        if (k === "m") return apply({ from: curKey(), to: curKey() });
        if (k === "q3") return apply({ from: all.slice(-3)[0] || curKey(), to: curKey() });
        return apply({ from: all[0], to: all[all.length - 1] });
      }
      if (e.target.closest("#rgApply")) {
        var f = document.getElementById("rgFrom").value;
        var t = document.getElementById("rgTo").value;
        if (f > t) { var tmp = f; f = t; t = tmp; }
        apply({ from: f, to: t });
      }
    });
  }

  w.VIEWS.analytics = function () {
    var range = readRange();
    var list = D.ordersInRange(range.from, range.to);
    var s = D.stats(list);
    var scope = rangeScope(range);

    var bar =
      '<div class="appbar-row">' +
        '<div class="appbar-logo">' + U.icon("chart", 20) + "</div>" +
        '<div class="col"><div class="appbar-title">分析</div>' +
        '<div class="appbar-sub">经营效能与营收核算</div></div>' +
        '<div class="appbar-actions">' +
          (w.PROFILE ? w.PROFILE.html() : '<div class="avatar">王队</div>') +
        "</div>" +
      "</div>";

    var body =
      '<div class="an-page">' +
      '<div class="toolrow">' +
        '<div class="left"><button class="month-pill" id="btnRange">' + U.icon("calendar", 16) +
          rangeLabel(range) + U.icon("chevronDown", 15) + "</button></div>" +
        '<span class="live-pill"><i></i>' + (range.from === range.to
          ? (range.from === curKey() ? "已核对至今日" : "历史月份 · " + list.length + " 单")
          : list.length + " 单在区间内") + "</span>" +
      "</div>" +
      heroCard(s, scope) +
      teamCard(s, scope) +
      monthBreakdown(range) +
      avgCards(s) +
      weatherCard(list, scope) +
      townRank(list) +
      "</div>";

    function drawMap() {
      var el = document.getElementById("wxMap");
      if (!el) return;
      initMap(el, list, scope);
    }

    function mount() {
      var ranksBtn = document.getElementById("btnAllRanks");
      if (ranksBtn) ranksBtn.addEventListener("click", function () { rankSheet(list, "town"); });
      var rbtn = document.getElementById("btnRange");
      if (rbtn) rbtn.addEventListener("click", function () { rangeSheet(readRange()); });

      var btn = document.getElementById("btnCollect");
      if (btn) btn.addEventListener("click", function () {
        var m = U.sheet(collectSheet());
        m.addEventListener("click", function (e) {
          if (e.target.closest("[data-call]")) return;
          if (e.target.id === "btnCopySms") {
            var dues = D.dueOrders();
            if (!dues.length) { U.toast("暂无待催订单"); return; }
            var messages = dues.map(function (o) {
              return (o.owner || "您好") + "，您好，" + (o.addr || "施工订单") + "尚有尾款 ¥" + U.n(D.due(o)) + "，麻烦您方便时核对并安排，谢谢。";
            }).join("\n\n");
            if (!w.navigator.clipboard || !w.navigator.clipboard.writeText) { U.toast("当前设备无法自动复制，请手动联系业主"); return; }
            w.navigator.clipboard.writeText(messages).then(function () {
              U.toast("已复制 " + dues.length + " 条催款内容，请自行发送"); U.closeSheet();
            }).catch(function () { U.toast("复制失败，请手动联系业主"); });
          }
        });
      });

      /* 画布要等布局落定才有宽高，双 rAF 兜一层；Safari 首帧偶发 0 宽 */
      if (w.requestAnimationFrame) {
        w.requestAnimationFrame(function () { w.requestAnimationFrame(drawMap); });
      } else {
        drawMap();
      }
    }

    return { bar: bar, body: body, mount: mount, tab: "analytics" };
  };
})(window);
