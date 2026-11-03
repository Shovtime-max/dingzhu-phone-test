/* ==========================================================================
   档期（按月 · 连续日程面板 · 电影票根撕线）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI, GEO = w.GEO;

  /* 视图切换（列表 / 月历）记在本地，下次打开还是上次那个 */
  var VIEW_KEY = "dingzhu.calview.v1";
  function savedView() {
    try { return w.localStorage.getItem(VIEW_KEY) === "month" ? "month" : "list"; }
    catch (e) { return "list"; }
  }
  var state = { filter: "全部", month: w.DATA.TODAY.key, view: savedView() };
  var calWxState = "正在获取天气", calWx = {};        /* "2026-10-28" → 出发地当天的天气（月历格子用） */
  var CAL_WEEK = ["日", "一", "二", "三", "四", "五", "六"];
  var resizeHandler = null;
  var wxOf = {};          /* 订单号 → { "2026-10-28": {day,tmax,tmin,...} }，按施工地点取 */
  var suppressClickUntil = 0;   /* 拖拽松手后紧接着的 click 要吃掉，否则会误跳「记一单」 */

  var FILTERS = [
    { k: "全部", t: "全部", nocount: true },
    { k: "free", t: "空闲" },
    { k: "full", t: "排满" },
    { k: "today", t: "今天", jump: true }
  ];

  var TODAY_MONTH = D.TODAY.key;
  var pendingFilter = null;

  function hasToday() {
    return days().some(function (d) { return d.status === "today"; });
  }

  /* 打开就把"今天"放到视口中上方（约 1/4 屏高），
     上面留出前几天的上下文，下面留出后几天的余量。
     只滚 #screen 自己 —— scrollIntoView 会把外层页面一起滚走，
     桌面预览时机身会整体上移、顶栏被切掉。 */
  function scrollToToday(smooth) {
    var screen = document.getElementById("screen");
    var row = document.querySelector(".ag-row.today");
    if (!row || !screen) return;
    var h = screen.clientHeight || 640;
    var delta = row.getBoundingClientRect().top - screen.getBoundingClientRect().top +
      screen.scrollTop - Math.round(h * 0.26);
    if (smooth && screen.scrollTo) screen.scrollTo({ top: delta, behavior: "smooth" });
    else screen.scrollTop = delta;
  }

  function flashToday() {
    var row = document.querySelector(".ag-row.today");
    if (!row) return;
    row.classList.add("flash");
    setTimeout(function () { row.classList.remove("flash"); }, 1150);
  }

  /* ?for=PD-02 表示「正在给这张待定线索找空档」 */
  function forPending() {
    var m = (w.location.hash || "").match(/[?&]for=([A-Za-z0-9\-]+)/);
    if (!m) return null;
    for (var i = 0; i < D.PENDING.length; i++) if (D.PENDING[i].id === m[1]) return D.PENDING[i];
    return null;
  }

  /* ?order=DW20261027-19 表示「给这张已建档施工单找空档」 */
  function forOrder() {
    var m = (w.location.hash || "").match(/[?&]order=([A-Za-z0-9\-]+)/);
    if (!m) return null;
    var o = D.byId(m[1]);
    return (o && !o.scheduledAt) ? o : null;
  }

  /* ---------- 数据 ---------- */
  function shiftedMonth(key, offset) {
    var parts = key.split("-"), date = new Date(+parts[0], +parts[1] - 1 + offset, 1);
    var result = date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2);
    return result < "1900-01" ? "1900-01" : result > "9998-12" ? "9998-12" : result;
  }
  function switchMonth(key) {
    D.ensureMonth(key); state.month = key; pendingFilter = "全部";
    w.APP.render();
    var screen = document.getElementById("screen"); if (screen) screen.scrollTop = 0;
  }
  function days() { return D.MONTHS[state.month].days; }
  function label() { return D.MONTHS[state.month].label; }
  function isBlank(d) {
    return !d.slots.some(function (s) { return s.items && s.items.length; });
  }
  /* 按订单号去重：同一单可能跨两天施工，不能算成两张单 */
  function totalOrders() {
    var seen = {}, n = 0;
    days().forEach(function (d) {
      d.slots.forEach(function (s) {
        (s.items || []).forEach(function (it) {
          if (it.oid && !seen[it.oid]) { seen[it.oid] = 1; n++; }
        });
      });
    });
    return n;
  }
  function hasAnyJob() { return totalOrders() > 0; }

  /* 排程条目的状态直接读订单的人工状态，不再按日期推断 */
  function stateOf(o) {
    var st = D.state(o);
    if (st === "settled") return "settled";
    if (st === "done") return "done";
    if (st === "doing") return "doing";
    return "wait";
  }

  var ST_TEXT = { wait: "待开工", doing: "施工中", done: "已完工", settled: "已结清" };

  function jobMeta(it) {
    var o = D.byId(it.oid);
    if (!o) return null;
    var key = stateOf(o);
    return { key: key, text: ST_TEXT[key], flags: [] };
  }

  /* ---------- 顺路（车程 ≤ 30 分钟算顺路） ---------- */
  function dayByDate(date) {
    var arr = days();
    for (var i = 0; i < arr.length; i++) if (arr[i].date === date) return arr[i];
    return null;
  }

  /* 待定线索的坐标；没有线索或没坐标就不标 */
  function pendingGeo() {
    var p = forPending();
    return p ? GEO.of(p) : null;
  }

  function nearOf(day) {
    var g = pendingGeo();
    if (!g || !day) return null;
    return GEO.dayTrip(day, g);
  }

  /* 空档右侧的小徽标：
     当天有活儿 → 「顺路 12分」（插进去的转场成本）
     当天空着   → 「单程 68分」（从家出发跑一趟的代价，谈不上顺路） */
  function nearBadge(day) {
    var n = nearOf(day);
    if (!n) return "";
    var near = n.min <= GEO.NEAR_MIN;
    var label = n.kind === "home" ? "单程 " : (near ? "顺路 " : "");
    return '<span class="ag-near' + (near ? "" : " far") +
      (n.kind === "home" ? " home" : "") + '"' +
      ' data-day="' + day.date + '" data-oid="' + (n.oid || "") + '"' +
      ' data-kind="' + n.kind + '" data-src="' + (n.source || "est") + '">' +
      label + GEO.fmtMin(n.min) + "</span>";
  }

  function weatherIcon(wx) {
    var t = String(wx || "");
    if (t.indexOf("雨") >= 0 || t.indexOf("雪") >= 0) return U.icon("cloud", 12);
    return t.indexOf("晴") >= 0 ? U.icon("sun", 12) : U.icon("cloud", 12);
  }

  /* 日期区域统一显示出发地天气，空档日也显示；缺少预报时如实提示。 */
  function metaHtml(d) {
    var iso = d.y + "-" + d.date.replace(".", "-"), wx = calWx[iso];
    var lunar = d.lunar ? '<span class="ag-meta">' + U.esc(d.lunar) + "</span>" : "";
    var text, icon = "", detail = "队伍出发地天气";
    if (wx && wx.day && iso >= D.TODAY.iso) {
      text = wx.day + (wx.tmin != null && wx.tmax != null ? " " + wx.tmin + "~" + wx.tmax + "℃" : "");
      icon = weatherIcon(wx.day);
      detail += (wx.night ? "；夜间 " + wx.night : "") + (wx.wind ? "；" + wx.wind + "风 " + (wx.power || "") + "级" : "");
    } else if (iso < D.TODAY.iso) text = "无历史天气";
    else {
      var delta = Math.round((new Date(d.y, d.m - 1, d.day) - new Date(D.TODAY.y, D.TODAY.m - 1, D.TODAY.d)) / 86400000);
      text = delta > 3 ? "暂无预报" : calWxState;
    }
    return lunar + '<span class="ag-date-wx' + (icon ? " available" : "") + '" title="' + U.esc(detail) + '">' + icon + U.esc(text) + '</span>';
  }

  /* 某一单在当天的天气（按它的施工坐标取，取不到就不显示） */
  function jobWx(oid, d) {
    var byDate = wxOf[oid];
    if (!byDate) return "";
    var iso = d.y + "-" + d.date.replace(".", "-");
    var w = byDate[iso];
    if (!w || !w.day) return "";
    var t = (w.tmin != null && w.tmax != null) ? " " + w.tmin + "~" + w.tmax + "℃" : "";
    var tip = (w.night ? "夜间 " + w.night : "") +
      (w.wind ? " · " + w.wind + "风" : "") + (w.power ? " " + w.power + " 级" : "");
    return '<span class="ag-wx"' + (tip ? ' title="' + U.esc(tip) + '"' : "") + ">" +
      weatherIcon(w.day) + U.esc(w.day) + t + "</span>";
  }

  /* 当天小结：几句话而不是一排胶囊 */
  function sumText(d) {
    var n = d.slots.reduce(function (a, sl) { return a + (sl.items ? sl.items.length : 0); }, 0);
    if (!n) return d.full ? "排满" : "空档";
    return n + " 单" + (d.full ? " · 排满" : "");
  }

  function teamPills(it) {
    var o = it.oid && D.byId(it.oid);
    var teams = o ? (o.teams || []).map(D.teamById).filter(function (t) { return !!t; }) : [];
    if (!teams.length) return '<span class="ag-team unassigned">' + U.esc(it.team || "未分配") + '</span>';
    return '<span class="ag-teams">' + teams.map(function (t) {
      var color = /^#[0-9a-f]{6}$/i.test(t.color) ? t.color : "#0066FF";
      var rgb = [1, 3, 5].map(function (i) {
        var c = parseInt(color.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      var ink = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? "#000000" : "#FFFFFF";
      return '<span class="ag-team" role="button" tabindex="0" data-team-info="' + U.esc(t.id) + '" style="--team-color:' + color + ';--team-ink:' + ink + '">' + U.esc(t.name) + '</span>';
    }).join("") + '</span>';
  }

  function slotHtml(slot, day) {
    var has = slot.items && slot.items.length;
    var body = "";
    if (has) {
      body = slot.items.map(function (it) {
        var tag = "div";
        var openTag = "div";
        var href = it.oid ? ' role="link" tabindex="0" data-order-link="' + U.esc(it.oid) + '"' : "";
        var m = it.oid ? jobMeta(it) : null;
        var st = m ? '<span class="ag-st ' + m.key + '">' + m.text + "</span>" : "";
        /* 已完工 / 已结清是历史账，别让人顺手拖走把日期改了 */
        var frozen = !!m && (m.key === "done" || m.key === "settled");
        var dragable = it.oid && !frozen;
        return (
          "<" + tag + ' class="ag-item' + (frozen ? " frozen" : "") + '"' +
            (it.oid ? ' data-order="' + U.esc(it.oid) + '"' : "") +
            (dragable ? ' data-drag="1"' : "") + ">" +
            '<' + openTag + ' class="ag-open"' + href + ' draggable="false">' +
            '<div class="ag-ji">' +
              '<b class="ag-ttl">' + U.esc(it.title) + "</b>" +
              '<span class="ag-sub">' +
                teamPills(it) +
                '<i class="ag-sep">·</i>' +
                '<span class="ag-txt">' + U.esc(it.desc) + "</span>" +
                (it.oid ? jobWx(it.oid, day) : "") +
              "</span>" +
            "</div>" +
            st +
            (it.oid ? '<span class="ag-go">' + U.icon("chevronRight", 13) + "</span>" : "") +
            '</' + openTag + '>' +
          "</" + tag + ">"
        );
      }).join("");
    } else {
      body = '<div class="ag-free" data-day="' + day.date + '" data-ampm="' + slot.ampm + '">' +
        "<span>" + (slot.free || (slot.ampm + " 空闲")) + "</span>" +
        nearBadge(day) + "</div>";
    }
    return (
      '<div class="ag-slot" data-day="' + day.date + '" data-ampm="' + slot.ampm + '">' +
        '<span class="ag-ampm' + (has ? " on" : "") + '">' + slot.ampm + "</span>" +
        '<div class="ag-items">' + body + "</div>" +
        /* 这个时段已经有活了也给个入口：上下午不限单数，随时能再加 */
        (has ? '<button type="button" class="ag-add" data-day="' + day.date + '" data-ampm="' + slot.ampm +
          '" aria-label="' + slot.ampm + '再加一单">+</button>' : "") +
      "</div>"
    );
  }

  function dayHtml(d, i) {
    var body;
    if (isBlank(d)) {
      /* 空档日压成一行，整月 30 天才不至于滚太长 */
      body = '<div class="ag-slots"><div class="ag-slot" data-day="' + d.date + '" data-ampm="上午">' +
        '<span class="ag-ampm">全天</span>' +
        '<div class="ag-items"><div class="ag-free" data-day="' + d.date + '" data-ampm="上午">' +
        "<span>全天空闲 · 点击查看</span>" + nearBadge(d) + "</div></div>" +
        "</div></div>";
    } else {
      body = '<div class="ag-slots">' + d.slots.map(function (s) { return slotHtml(s, d); }).join("") + "</div>";
    }

    return (
      '<div class="ag-row' + (d.status === "today" ? " today" : "") + '">' +
        '<div class="ag-day" data-open-day="' + d.date + '">' +
          '<button type="button" class="day-status' + (d.full ? " is-full" : "") + '" data-full-day="' + d.date + '" aria-label="' + (d.full ? "已排满，点击取消" : "未排满，点击标记排满") + '" aria-pressed="' + !!d.full + '">' + (d.full ? "满" : "") + "</button>" +
          '<b class="ag-dnum">' + d.date + "</b>" +
          '<span class="ag-week">' + d.week + "</span>" +
          metaHtml(d) +
          (d.status === "today" ? '<span class="ag-today">今天</span>' : "") +
          '<em class="ag-sum">' + sumText(d) + "</em>" +
        "</div>" +
        '<div class="ag-card">' + body + "</div>" +
      "</div>"
    );
  }

  function filtered() {
    return days().filter(function (d) {
      if (state.filter === "全部") return true;
      if (state.filter === "today") return d.status === "today";
      if (state.filter === "full") return d.full;
      return d.status === state.filter;
    });
  }

  function countOf(k) {
    if (k === "全部") return days().length;
    if (k === "today") {
      var td = days().filter(function (d) { return d.status === "today"; })[0];
      return td ? td.slots.reduce(function (a, sl) { return a + (sl.items ? sl.items.length : 0); }, 0) : 0;
    }
    if (k === "full") return days().filter(function (d) { return d.full; }).length;
    return days().filter(function (d) { return d.status === k; }).length;
  }

  function listHtml() {
    var arr = filtered();
    if (!arr.length) {
      return '<div class="empty"><div class="art">' + U.icon("inbox", 28) + "</div>" +
        "<h4>这个筛选下没有日程</h4><p>换一个条件看看</p></div>";
    }
    return '<div class="agenda" id="dayList">' + arr.map(dayHtml).join("") + "</div>";
  }

  /* ==========================================================================
     月视图（7 列 × 自然行数）
     · 格子只有 54px 宽：日期 + 天气图标一行，农历一行，下面写当天干的村子。
       不再画上/下两条色条（看不出在哪个村），改为村名 + 状态色。
     · 格子不承载拖拽（改期仍在列表里做），点一下开当天详情
     ========================================================================== */
  function calCells(key) {
    var mth = D.ensureMonth(key || state.month), y = mth.y, m = mth.m;
    var lead = new Date(y, m - 1, 1).getDay();          /* 0 = 周日 */
    var prevTotal = new Date(y, m - 1, 0).getDate();
    var out = [], i;
    for (i = lead - 1; i >= 0; i--) out.push({ out: true, day: prevTotal - i });
    mth.days.forEach(function (d) { out.push({ out: false, d: d }); });
    var tail = (7 - (out.length % 7)) % 7;
    for (i = 1; i <= tail; i++) out.push({ out: true, day: i });
    while (out.length < 35) out.push({ out: true, day: i++ });
    return out;
  }

  /* 格子里写的村名：去掉尾部「村」字，最多 3 字（54px 宽、8.5px 字号刚好三字一行） */
  function villName(o) {
    var v = (o && o.village ? String(o.village) : "").replace(/村$/, "");
    return v.length > 3 ? v.slice(0, 3) : v;
  }

  /* 当天的村子：同一村上下午都有活只写一次；同村多条取「最没完工」的状态，
     免得一张已结清的单把还在施工的单染成绿色。顺序按档期先后。 */
  var VILL_RANK = { wait: 0, doing: 1, done: 2, settled: 3 };
  function dayVills(d) {
    var out = [], at = {};
    d.slots.forEach(function (sl) {
      (sl.items || []).forEach(function (it) {
        var o = it.oid ? D.byId(it.oid) : null;
        if (!o) return;
        var name = villName(o);
        if (!name) return;
        var key = stateOf(o);
        if (at[name] === undefined) { at[name] = out.length; out.push({ name: name, key: key }); }
        else if (VILL_RANK[key] < VILL_RANK[out[at[name]].key]) out[at[name]].key = key;
      });
    });
    return out;
  }

  function villsHtml(d) {
    var arr = dayVills(d);
    if (!arr.length) return "";
    var rest = arr.length - 2;
    var html = arr.slice(0, 2).map(function (v) {
      return '<span class="cal-vill ' + v.key + '">' + U.esc(v.name) + "</span>";
    }).join("");
    if (rest > 0) html += '<b class="cal-more">+' + rest + "</b>";
    return '<span class="cal-vills">' + html + "</span>";
  }

  /* 筛选只淡化、不隐藏：隐藏会让格子不连续、日期错位 */
  function dimByFilter(d) {
    if (state.filter === "全部" || state.filter === "today") return false;
    if (state.filter === "full") return !d.full;
    if (state.filter === "free") return !isBlank(d);
    return false;
  }

  function calCellHtml(c) {
    if (c.out) return '<div class="cal-cell out"><span class="cal-d">' + c.day + "</span></div>";
    var d = c.d;
    var iso = d.y + "-" + d.date.replace(".", "-");
    var wx = calWx[iso] && calWx[iso].day
      ? '<span class="cal-wx">' + weatherIcon(calWx[iso].day) + "</span>" : "";
    var cls = "cal-cell";
    if (d.status === "today") cls += " today";
    if (d.full) cls += " full";
    if (dimByFilter(d)) cls += " dim";
    return '<button type="button" class="' + cls + '" data-day="' + d.date + '">' +
      '<span class="cal-hd"><b class="cal-d">' + d.day + "</b>" +
      (d.full ? '<span class="cal-status is-full" aria-label="已排满">满</span>' : "") + wx + "</span>" +
      (d.lunar ? '<span class="cal-lun">' + U.esc(d.lunar) + "</span>" : "") +
      villsHtml(d) +
      "</button>";
  }

  function monthHtml(key) {
    var cells = calCells(key);
    var head = '<div class="cal-week">' + CAL_WEEK.map(function (t, i) {
      return '<span' + (i === 0 || i === 6 ? ' class="we"' : "") + ">" + t + "</span>";
    }).join("") + "</div>";

    var legend =
      '<div class="cal-legend">' +
        '<span><span class="cal-vill wait">待开工</span></span>' +
        '<span><span class="cal-vill doing">施工中</span></span>' +
        '<span><span class="cal-vill done">已完工</span></span>' +
        '<span><span class="cal-vill settled">已结清</span></span>' +
        '<span><i class="cal-sw full"></i>红点“满” = 整天排满</span>' +
      "</div>";

    return '<div class="cal">' + head +
      '<div class="cal-grid">' + cells.map(calCellHtml).join("") + "</div>" +
      legend + "</div>";
  }

  function monthPagesHtml() {
    return [-1, 0, 1].map(function (offset) {
      var key = shiftedMonth(state.month, offset);
      return '<section class="cal-month-page" data-month="' + key + '" aria-label="' + U.esc(D.ensureMonth(key).label) + '">' + monthHtml(key) + '</section>';
    }).join("");
  }

  /* 月历格子点开：当天详情（订单 + 空档排单 + 出发地/作业地天气） */
  /* 当天要跑的点：坐标优先用现场定位，没有就退到镇中心 */
  /* 当天要跑的点，精度从高到低：
     ① 现场定位（geo.source 不是 seed/town）② 村口坐标 ③ geo 里存的镇中心 ④ 镇表 ⑤ 村名反查 */
  function orderPoint(o) {
    var g = o.geo;
    var hasGeo = g && typeof g.lat === "number" && typeof g.lng === "number" &&
                 isFinite(g.lat) && isFinite(g.lng);
    if (hasGeo && g.source !== "seed" && g.source !== "town") {
      return { lat: g.lat, lng: g.lng, prec: "gps" };
    }
    if (w.GEO && w.GEO.villagePoint) {
      var vp = w.GEO.villagePoint(o.village, o.town);
      if (vp && isFinite(vp.lat) && isFinite(vp.lng)) return { lat: vp.lat, lng: vp.lng, prec: "village" };
    }
    if (hasGeo) return { lat: g.lat, lng: g.lng, prec: "town" };
    var T = (w.GEO && w.GEO.TOWN) || {};
    var t = T[o.town];
    if (t && isFinite(t.lat)) return { lat: t.lat, lng: t.lng, prec: "town" };
    /* 镇名没命中（写成「诸城市」「城区」或写错字）：拿村名反查一次镇 */
    if (w.GEO && w.GEO.seedByVillage) {
      var s = w.GEO.seedByVillage(o.village, o.town);
      if (s && isFinite(s.lat) && isFinite(s.lng)) return { lat: s.lat, lng: s.lng, prec: "town" };
    }
    return null;
  }

  /* 一天的活按上午→下午排成一条串；同一天的活再按班组分组，
     两个队跑两个方向时线不会搅在一起 */
  function dayRoute(d) {
    var pts = [], miss = 0;
    d.slots.forEach(function (sl) {
      (sl.items || []).forEach(function (it) {
        var o = it.oid ? D.byId(it.oid) : null;
        if (!o) return;
        var p = orderPoint(o);
        if (!p) { miss++; return; }
        pts.push({
          oid: o.id, title: it.title || o.owner || "", team: it.team || "",
          ampm: sl.ampm, town: o.town || "", village: o.village || "",
          lat: p.lat, lng: p.lng,
          /* gps = 现场定位过；village = 有村口坐标；town = 只有镇中心 */
          prec: p.prec || "town"
        });
      });
    });

    var km = 0;
    for (var i = 1; i < pts.length; i++) {
      var seg = w.GEO ? w.GEO.haversine(pts[i - 1], pts[i]) : null;
      if (seg) km += seg;
    }
    km = Math.round(km);

    /* 坐标只精确到镇时，同镇的几单会落在同一个像素上叠成一坨。
       这里只做屏幕上的环形错开（不动经纬度），让「几处」能看见 */
    var seen = {};
    pts.forEach(function (p) {
      var k = p.lat.toFixed(4) + "," + p.lng.toFixed(4);
      var n = seen[k] || 0;
      seen[k] = n + 1;
      if (n === 0) { p.dx = 0; p.dy = 0; return; }
      p.sameCoord = true;   /* 和前面某一户坐标完全一样：只有镇中心，没有村坐标 */
      var ring = Math.ceil(n / 6), idx = (n - 1) % 6;
      var ang = idx * Math.PI / 3 - Math.PI / 2;
      p.dx = Math.cos(ang) * 22 * ring;
      p.dy = Math.sin(ang) * 22 * ring;
    });

    var colorOf = {};
    (D.TEAMS || []).forEach(function (t) { colorOf[t.name || t.id] = t.color || "#185FA5"; });
    var groups = [], gmap = {};
    pts.forEach(function (p, i) {
      p.idx = i + 1;
      var k = p.team || "—";
      var g = gmap[k];
      if (!g) { g = gmap[k] = { team: k, color: colorOf[k] || "#185FA5", pts: [] }; groups.push(g); }
      g.pts.push(p);
    });

    return { pts: pts, groups: groups, km: km, miss: miss };
  }

  /* ==========================================================================
     抽屉里那张大地图
     --------------------------------------------------------------------------
     · 打开就自动算这趟的实际车程 —— 只在跨镇时算，同镇差不了几公里，不值得耗配额
     · 点地图上任一处 → 从「我的位置」到那里单独规划一段；再点一次回整趟
     · 右下角 ◎ → 请求一次 GPS，把视野飞回自己身上
     · 我的位置从哪来：GPS / 上次定位缓存 → 都没有就按当天第一处（文案里写明）
     ========================================================================== */
  function initDayMap(route) {
    var el = document.getElementById("dxMap"), meta = document.getElementById("dxMapMeta"), hint = document.getElementById("dxMapHint");
    if (!el || !w.TILEMAP) return;
    var base = w.GEO && w.GEO.baseGeo && w.GEO.baseGeo();
    var points = route.pts.map(function (p, i) {
      /* dx/dy：同镇几户坐标一模一样，靠屏幕上的环形错开才看得见第二户 */
      return {lat:p.lat, lng:p.lng, name:(p.village || p.town || p.title || "施工点"), no:i + 1, dx:p.dx || 0, dy:p.dy || 0,
        prec:p.prec || "town", sameAsPrev:!!p.sameCoord};
    });
    if (base && isFinite(base.lat) && isFinite(base.lng)) points.unshift({lat:base.lat, lng:base.lng, name:"固定出发地"});
    /* to = 目的地：点一下就有，导航按钮同时出现（点一处就能「带我过去」）
       from = 自己指定的起点：再点一处才会设，不设就按「出发地 / 我的位置」估算 */
    var from = null, to = null, me = null, serial = 0, map, road = null;
    var pointList = document.getElementById("dxPointList");
    var nav = document.getElementById("dxNavBtn"), navPick = document.getElementById("dxNavPick");
    function isApple() {
      return /iPad|iPhone|iPod|Macintosh/.test((w.navigator && w.navigator.userAgent) || "");
    }
    /* 同名点会重名（同镇几户），显示时带序号区分；导航链接里只用干净的地名 */
    function pname(p) { return p ? p.name + (p.no ? " " + p.no : "") : ""; }
    function autoStart() {
      if (me && isFinite(me.lat)) return me;
      if (base && isFinite(base.lat)) return {lat:base.lat, lng:base.lng, name:base.name || "出发地"};
      return null;
    }
    /* 只传目的地时，起点交给导航 App 自己的定位（多半就是「我现在在哪」）；
       只有用户明确点了起点，才把 from 一起传过去 */
    function navUrl(kind) {
      if (!to) return "#";
      var name = to.village || to.town || to.title || to.name || "目的地";
      var lat = Number(to.lat).toFixed(6), lng = Number(to.lng).toFixed(6);
      if (kind === "apple") {
        var s = from ? "&saddr=" + Number(from.lat).toFixed(6) + "," + Number(from.lng).toFixed(6) : "";
        return "https://maps.apple.com/?daddr=" + lat + "," + lng + s + "&q=" + encodeURIComponent(name) + "&dirflg=d";
      }
      var url = "https://uri.amap.com/navigation?to=" + lng + "," + lat + "," + encodeURIComponent(name);
      if (from) url += "&from=" + Number(from.lng).toFixed(6) + "," + Number(from.lat).toFixed(6) + "," + encodeURIComponent(from.village || from.town || from.name || "起点");
      return url + "&mode=car&coordinate=gaode&callnative=1&src=dingzhu";
    }
    function refresh() {
      map.setMarkers(points.map(function (p) { return {lat:p.lat, lng:p.lng, label:U.esc(pname(p)), title:pname(p),
        dx:p.dx || 0, dy:p.dy || 0,
        major:p === from || p === to, state:p === from || p === to ? "sel" : "",
        onClick:function () { choose(p); }}; }));
      if (pointList) pointList.innerHTML = points.map(function (p, i) {
        var tag = p === from ? "起点 · " : p === to ? (from ? "终点 · " : "目的地 · ") : "";
        return '<button type="button" class="dx-point' + (p === from ? ' start' : p === to ? ' end' : '') + '" data-point-index="' + i + '">' + U.esc(tag) + U.esc(pname(p)) + '</button>';
      }).join("");
      if (nav) { nav.hidden = !to; nav.textContent = from ? "开始导航" : "导航到这处"; }
      if (navPick) navPick.hidden = true;
      if (hint) hint.textContent = !to ? "点地图上任意一处，直接导航过去"
        : !from ? "已选 " + pname(to) + " · 再点另一处可设为起点，规划两点之间怎么走"
        : "路线 " + pname(from) + " → " + pname(to) + " · 再点一处换目的地";

      var start = from || autoStart();
      if (!to) {
        road = null;
        var townOnly = route.pts.filter(function (p) { return p.prec === "town"; }).length;
        if (meta) meta.textContent = route.pts.length
          ? route.pts.length + " 处施工点" + (townOnly ? " · " + townOnly + " 处只到镇中心" : "") + " · 点一处看怎么过去"
          : route.miss ? route.miss + " 单缺坐标 · 到工单里定位一次就有点了" : "当天没有施工点";
        map.redraw(); return;
      }
      var id = ++serial;
      /* 导航链接跟着目的地同步，跟「有没有算出路线」无关：
         没设出发地也能导航（起点交给导航 App 的定位） */
      if (navPick) {
        var a = navPick.querySelector('[data-nav="amap"]'), b = navPick.querySelector('[data-nav="apple"]');
        if (a) a.href = navUrl("amap");
        if (b) { b.hidden = !isApple(); b.href = navUrl("apple"); }
      }
      if (!start) {
        road = null; map.redraw();
        if (meta) meta.textContent = "到 " + pname(to) + " · 还没设出发地，导航按当前位置起算";
        return;
      }
      /* 两户坐标一模一样（同镇、都没现场定位）：算出来必然是 0 km，
         别拿「0 km · 约1分」糊弄，把原因说清楚 */
      if (from && Math.abs(from.lat - to.lat) < 1e-6 && Math.abs(from.lng - to.lng) < 1e-6) {
        road = null; map.redraw();
        if (meta) meta.textContent = pname(from) + " → " + pname(to) + " · 两点坐标相同（都只到镇中心）";
        if (hint) hint.textContent = "这两户都只有镇名、没有现场定位，地图上落在同一个镇中心 · 在工单里定位一次就分开";
        return;
      }
      if (meta) meta.textContent = (from ? pname(from) + " → " : "从出发地到 ") + pname(to) + " · 正在规划…";
      map.redraw();
      w.GEO.routeGeometry(start, to).then(function (result) {
        if (id !== serial) return;
        road = result.points; map.redraw();
        if (meta) meta.textContent = (from ? pname(from) + " → " : "到 ") + pname(to) +
          " · " + result.km + " km · 约 " + w.GEO.fmtMin(result.min);
        if (hint) hint.textContent = "蓝线为道路规划路线 · 再点一处可换起点或目的地";
      }).catch(function (err) {
        if (id !== serial) return;
        road = null; map.redraw();
        var km = null;
        try { km = w.GEO.haversine ? Math.round(w.GEO.haversine(start, to)) : null; } catch (e2) {}
        if (meta) meta.textContent = (from ? pname(from) + " → " : "到 ") + pname(to) +
          (km != null ? " · 直线 " + km + " km" : "") + " · 未取到道路路线";
        if (hint) hint.textContent = "没算到道路路线 · 上面按直线距离给，导航按钮照样能用";
      });
    }
    /* 第一次点 = 目的地；第二次点 = 起点（两点之间怎么走）；
       再点一处换目的地，点当前选中的那个则取消选择 */
    function choose(p) {
      serial++; road = null;
      if (!to) to = p;
      else if (p === to) { to = null; from = null; }
      else if (p === from) from = null;
      else if (!from) from = p;
      else { from = null; to = p; }
      refresh();
    }
    function locateMe() {
      return w.GEO.locate({fresh:true}).then(function (p) {
        if (!p) { U.toast("无法获取当前位置，请检查手机定位权限后重试"); return; }
        return w.GEO.toMapPosition(p).then(function (point) {
          if (!me) { me = {name:"当前位置", lat:point.lat, lng:point.lng}; points.push(me); }
          else { me.lat = point.lat; me.lng = point.lng; }
          serial++; road = null; map.panTo(me.lng, me.lat, 15); refresh(); U.toast("已回到我的位置");
        }).catch(function (err) { U.toast(err.message || "定位坐标转换失败，请检查网络和高德 Key"); });
      });
    }
    if (pointList) pointList.addEventListener("click", function (e) {
      var button = e.target.closest("[data-point-index]"); if (!button) return;
      var point = points[Number(button.getAttribute("data-point-index"))]; if (point) choose(point);
    });
    if (nav) nav.addEventListener("click", function () { if (to && navPick) navPick.hidden = !navPick.hidden; });
    if (navPick) navPick.addEventListener("click", function (e) { if (e.target.closest('[data-nav="off"]')) navPick.hidden = true; });
    map = w.TILEMAP.create(el, {center:points.length ? [points[0].lng, points[0].lat] : [119.0,35.75], zoom:11, minZoom:6, maxZoom:16, onLocate:locateMe,
      onDraw:function (ctx, proj) {
        if (!road || road.length < 2) return;
        ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.beginPath();
        road.forEach(function (point, i) { var p = proj(point.lng, point.lat); if (i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); });
        ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 8; ctx.stroke();
        ctx.strokeStyle = "#1672e8"; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
      }});
    if (points.length) map.fitBounds([Math.min.apply(null,points.map(function(p){return p.lng;})) - 0.005, Math.min.apply(null,points.map(function(p){return p.lat;})) - 0.005, Math.max.apply(null,points.map(function(p){return p.lng;})) + 0.005, Math.max.apply(null,points.map(function(p){return p.lat;})) + 0.005], 48);
    refresh();
  }

  function openDay(date, refreshSchedule) {
    var d = dayByDate(date);
    if (!d) return;
    var iso = d.y + "-" + date.replace(".", "-");
    var count = d.slots.reduce(function (a, sl) { return a + (sl.items ? sl.items.length : 0); }, 0);

    function wxPill(tag, wx) {
      var t = (wx.tmin != null && wx.tmax != null) ? " " + wx.tmin + "~" + wx.tmax + "℃" : "";
      return '<span class="dx-wxp"><i>' + tag + "</i>" + weatherIcon(wx.day) + U.esc(wx.day) + t + "</span>";
    }
    function wxRow() {
      var parts = [];
      var base = calWx[iso];
      if (base && base.day) parts.push(wxPill("出发地", base));
      var oid = null;
      d.slots.some(function (sl) {
        return (sl.items || []).some(function (it) { if (it.oid) { oid = it.oid; return true; } return false; });
      });
      var jw = oid && wxOf[oid] ? wxOf[oid][iso] : null;
      /* 作业地和出发地一样就不重复占一行 */
      if (jw && jw.day && (!base || jw.day !== base.day || jw.tmax !== base.tmax)) {
        parts.push(wxPill("作业地", jw));
      }
      return parts.length ? '<div class="dx-wx">' + parts.join("") + "</div>" : "";
    }

    var secs = d.slots.map(function (sl) {
      var items = sl.items || [];
      var body;
      if (items.length) {
        body = items.map(function (it) {
          var o = it.oid ? D.byId(it.oid) : null;
          var key = o ? stateOf(o) : "wait";
          return '<a class="dx-job" href="' + (it.oid ? "#/order/" + it.oid : "#/orders") + '">' +
            '<div class="dx-t">' + U.esc(it.title) + U.statusPill(key === "wait" ? "planned" : key, true) + "</div>" +
            '<div class="dx-s">' + U.esc(it.team) + " · " + U.esc(it.desc) +
              (o && D.state(o) === "done" && D.due(o) > 0 ? " · 待收 ¥" + U.n(D.due(o)) : "") +
            "</div></a>";
        }).join("");
      } else { body = ""; }
      return '<div class="dx-sec"><div class="dx-lb">' + sl.ampm + " · " +
        (items.length ? items.length + " 单" : "空档") + "</div>" + body +
        '<button type="button" class="dx-free" data-day="' + d.date + '" data-ampm="' + sl.ampm + '">添加' + sl.ampm + "订单</button></div>";
    }).join("");

    var route = dayRoute(d);
    var mapBlock = "";
    {
      /* 地图可用于定位，即使当天没有施工点。 */
      var meta = route.pts.length + " 处";
      if (route.km >= 1) {
        meta += " · 直线 " + route.km + " km";
        var min = w.GEO ? w.GEO.estMinutes(route.km) : null;
        if (min) meta += " · 约 " + w.GEO.fmtMin(min);
      }
      if (route.miss) meta += " · " + route.miss + " 单无坐标";
      mapBlock =
        '<div class="dx-map-title"><div><b>当天路线</b><span>点一处直接导航 · 点两处规划路线</span></div></div>' +
        '<div class="dx-point-list" id="dxPointList" aria-label="选择路线地点"></div>' +
        '<div class="dx-map" id="dxMap"></div>' +
        '<div class="dx-maprow">' +
          '<div class="dx-mapmeta" id="dxMapMeta">' + meta + "</div>" +
          '<button type="button" class="dx-navbtn" id="dxNavBtn" hidden>开始导航</button>' +
        "</div>" +
        '<div class="dx-maphint" id="dxMapHint">' +
          (route.pts.length ? "点地图上任意一处，直接导航过去" : "") + "</div>" +
        /* 选好导航软件再跳走：直接唤起的话误触一次就得从导航里退出来 */
        '<div class="dx-navpick" id="dxNavPick" hidden>' +
          '<a data-nav="amap" href="#">高德地图</a>' +
          '<a data-nav="apple" href="#">苹果地图</a>' +
          '<button type="button" data-nav="off">取消</button>' +
        "</div>";
    }

    var mask = U.sheet(
      "<h3>" + d.date + " " + d.week + (d.lunar ? " · " + U.esc(d.lunar) : "") + "</h3>" +
      '<div class="sub">' + (count ? count + " 单" : "当天还没有活") + "</div>" +
      '<div class="day-status-row"><button type="button" class="day-status' + (d.full ? " is-full" : "") + '" id="dxFull" aria-label="' + (d.full ? "已排满，点击取消" : "未排满，点击标记排满") + '" aria-pressed="' + !!d.full + '">' + (d.full ? "满" : "") + '</button><span id="dxFullText">' + (d.full ? "已排满 · 点击取消" : "未排满 · 点击标记") + "</span></div>" +
      wxRow() + secs + mapBlock +
      '<button class="btn ghost mt14" id="dxClose">关闭</button>'
    );

    /* 地图要等抽屉落位才有宽高。rAF 在被遮挡的 iframe / 后台标签页里会停摆，
       所以再挂一个定时兜底，谁先到算谁 */
    {
      var inited = false;
      var once = function () { if (inited) return; inited = true; initDayMap(route); };
      if (w.requestAnimationFrame) {
        w.requestAnimationFrame(function () { w.requestAnimationFrame(once); });
      }
      w.setTimeout(once, 340);
    }

    mask.addEventListener("click", function (e) {
      if (e.target.closest("#dxClose")) { U.closeSheet(); return; }
      if (e.target.closest("#dxFull")) {
        var statusButton = e.target.closest("#dxFull"); if (statusButton.disabled) return; statusButton.disabled = true;
        D.setDayFull(iso, !d.full).then(function () {
          statusButton.disabled = false; statusButton.classList.toggle("is-full", d.full);
          statusButton.textContent = d.full ? "满" : ""; statusButton.setAttribute("aria-pressed", String(!!d.full));
          statusButton.setAttribute("aria-label", d.full ? "已排满，点击取消" : "未排满，点击标记排满");
          var label = document.getElementById("dxFullText"); if (label) label.textContent = d.full ? "已排满 · 点击取消" : "未排满 · 点击标记";
          if (refreshSchedule) refreshSchedule();
        }).catch(function (err) { statusButton.disabled = false; U.toast(err.message); }); return;
      }
      var job = e.target.closest(".dx-job"), href = job && job.getAttribute("href");
      if (href && href.indexOf("#/order/") === 0) {
        e.preventDefault(); w.APP.openOrder(href.slice(8)); return;
      }
      var free = e.target.closest(".dx-free");
      if (free) {
        var day = free.getAttribute("data-day");
        var ampm = free.getAttribute("data-ampm");
        U.closeSheet();
        handleFree(day, ampm);
      }
    });
  }

  /* 点空档 → 排单：待定线索 / 已建档未排期 / 什么都没挑就走记一单 */
  function handleFree(date, ampm) {
    var p = forPending();
    if (p) { scheduleFor(p, date, ampm, nearOf(dayByDate(date))); return; }
    var o = forOrder();
    if (o) { scheduleExisting(o, date, ampm); return; }
    w.APP.createSlot = { day: state.month + "-" + date.slice(3), ampm: ampm };
    U.toast("已选择 " + date + " " + ampm + " · 去记一单");
    w.location.hash = "#/create";
  }

  /* ---------- 月份选择抽屉 ---------- */
  function monthSheet(year) {
    var y = Number(year) || Number(state.month.slice(0, 4)), cells = "";
    for (var m = 1; m <= 12; m++) {
      var key = y + "-" + (m < 10 ? "0" + m : m);
      var has = D.MONTHS[key] && D.MONTHS[key].days.some(function (d) { return d.slots.some(function (sl) { return sl.items && sl.items.length; }); });
      cells += '<button type="button" class="mcell' + (key === state.month ? " on" : "") + '" data-m="' + key + '">' + m + ' 月' + (has ? '<i class="mdot"></i>' : '') + '</button>';
    }
    var mask = U.sheet('<h3>选择月份</h3>' +
      '<div class="month-switch"><button type="button" class="icon-btn" id="monthYearPrev" aria-label="上一年">' + U.icon("arrowLeft", 16) + '</button><b>' + y + ' 年</b><button type="button" class="icon-btn" id="monthYearNext" aria-label="下一年">' + U.icon("chevronRight", 16) + '</button></div>' +
      '<div class="mgrid">' + cells + '</div><div class="t-xs mut mt12">带圆点的月份已有订单，所有月份均可查看和排期。</div>');
    mask.addEventListener("click", function (e) {
      if (e.target.closest("#monthYearPrev")) { if (y > 1900) monthSheet(y - 1); return; }
      if (e.target.closest("#monthYearNext")) { if (y < 9998) monthSheet(y + 1); return; }
      var b = e.target.closest("[data-m]"); if (!b) return;
      U.closeSheet(); switchMonth(b.getAttribute("data-m"));
    });
  }

  /* 把待定线索排进这个空档：选队 → 生成订单 → 写进档期 */
  function nearRow(n, p) {
    if (!n) return "";
    var ok = n.min <= GEO.NEAR_MIN;
    var g = p ? GEO.of(p) : null;
    /* 任一端不是高德坐标，车程就只能算估算，别让它看起来像实测 */
    var otherSeed = false;
    if (n.kind === "transfer" && n.oid) {
      var oo = D.byId(n.oid);
      var og2 = oo ? GEO.of(oo) : null;
      otherSeed = !!(og2 && (og2.source === "seed" || og2.source === "town"));
    }
    var coarse = (g && g.source !== "amap") || otherSeed;
    var b = GEO.baseGeo();
    var homeName = b ? b.name : "家";
    var srcTxt = n.source === "amap" ? "高德实测" : "按直线估算";
    var distTxt = n.km != null ? n.km + " km" : "距离不明";

    var head, body;
    if (n.kind === "home") {
      head = "当天还空着 · 从" + homeName + "过去约 " + GEO.fmtMin(n.min);
      body = "单程 " + distTxt + " · " + srcTxt +
        "，往返约 " + GEO.fmtMin(n.min * 2) + "。这天是专门为它跑一趟，谈不上顺路";
    } else {
      head = (ok ? "顺路 · 约 " : "不顺路 · 约 ") + GEO.fmtMin(n.min);
      body = "这天最近一单「" + U.esc(n.title) + "」· 转场 " + distTxt + " · " + srcTxt +
        (ok ? "。插进这天不用单独再跑一趟" : "");
    }

    return '<div class="geo-near-row' + (ok ? " ok" : "") + '" id="nearRow">' + U.icon("route", 15) +
      '<div class="col"><b>' + head + "</b>" +
      "<span>" + body +
      (coarse ? "<br>有一端是近似坐标，实际车程会有出入" : "") + "</span></div></div>";
  }

  function scheduleFor(p, day, ampm, near) {
    if (p.orderId) { w.location.hash = "#/order/" + p.orderId; return; }
    var picked = (p.teams || []).slice(), saving = false;
    var mask = U.sheet(
      "<h3>排进这个空档</h3>" +
      '<div class="sub">' + U.esc(p.title) + " · " + day + " " + ampm + "</div>" +
      nearRow(near, p) +
      '<div class="form-label" style="margin-bottom:7px">谁去干</div>' +
      '<div class="tagrow" id="pickTeam">' +
        D.TEAMS.map(function (t) {
          return '<button class="tagchip' + (picked.indexOf(t.id) >= 0 ? ' on' : '') + '" data-t="' + t.id + '">' + U.icon("check", 11) + t.name + "</button>";
        }).join("") +
      "</div>" +
      '<div class="t-xs mut mt10" style="line-height:1.6">可以只选一支，也可以几支一起上。</div>' +
      '<button class="btn primary mt14" id="doSchedule">确认排期</button>'
    );

    /* 先用直线估算秒出，再异步换成高德真实车程 */
    (function upgrade() {
      var g = GEO.of(p);
      var target;
      if (near && near.kind === "home") {
        target = GEO.baseGeo();
      } else {
        var o = near && near.oid ? D.byId(near.oid) : null;
        target = o ? GEO.of(o) : null;
      }
      if (!g || !target) return;
      GEO.route(g, target).then(function (r) {
        if (!r || r.min == null || r.source !== "amap") return;
        var box = document.getElementById("nearRow");
        if (!box) return;
        box.outerHTML = nearRow(
          { min: r.min, km: r.km, source: r.source, kind: near.kind, title: near.title }, p);
      });
    })();

    mask.addEventListener("click", function (e) {
      var chip = e.target.closest("#pickTeam .tagchip");
      if (chip) {
        var id = chip.getAttribute("data-t");
        var i = picked.indexOf(id);
        if (i >= 0) picked.splice(i, 1); else picked.push(id);
        chip.classList.toggle("on");
        return;
      }
      if (e.target.id !== "doSchedule") return;
      if (!picked.length) { U.toast("先选至少一个队"); return; }

      if (saving) return;
      saving = true;
      var o = {
        owner:p.owner, title:p.owner, town:p.town, village:p.village, addr:p.addr, phone:p.phone,
        main:p.main == null ? p.rooms : p.main, wing:p.wing || 0,
        mode:p.mode || (p.blocker.indexOf("纯人工") >= 0 ? "人工" : p.blocker.indexOf("大包") >= 0 ? "大包" : "待定"),
        quote:p.budget, paid:p.paid || 0, teams:picked.slice(), geo:p.geo || null,
        scheduledAt:day + " " + ampm, startedAt:null, doneAt:null, start:"", done:"",
        tags:(p.tags || []).slice(), note:"由待定池 " + p.id + " 转入", flows:(p.flows || []).slice()
      };
      var month = D.MONTHS[state.month];
      var fullDate = month.y + "-" + day.replace(/\./g, "-");
      return D.createOrder(o, fullDate, ampm, p.id).then(function (saved) {
        U.closeSheet(); U.toast("已排入 " + day + " " + ampm + " · " + D.teamNames(saved.teams));
        w.location.hash = "#/pending";
      }).catch(function (err) { saving = false; U.toast(err.message); });
    });
  }

  /* 把已建档施工单排进这个空档：确认即可，不再选队（班组在录单时已定） */
  function scheduleExisting(o, day, ampm) {
    var month = D.MONTHS[state.month];
    var fullDate = month.y + "-" + day.replace(/\./g, "-");
    var mask = U.sheet(
      "<h3>排进这个空档</h3>" +
      '<div class="sub">' + U.esc(o.owner || o.title) + " · " + day + " " + ampm + "</div>" +
      '<button class="btn primary mt14" id="doScheduleOrder">确认排期</button>'
    );
    var saving = false;
    mask.addEventListener("click", function (e) {
      if (e.target.id !== "doScheduleOrder") return;
      if (saving) return;
      saving = true;
      return D.scheduleOrder(o.id, fullDate, ampm).then(function (saved) {
        U.closeSheet(); U.toast("已排入 " + day + " " + ampm);
        w.location.hash = "#/order/" + saved.id;
      }).catch(function (err) { saving = false; U.toast(err.message); });
    });
  }

  /* 首屏先按直线估算出结果（不等网络），有 Key 再逐个换成高德真实车程 */
  function upgradeNear() {
    var g = pendingGeo();
    if (!g) return;
    GEO.health().then(function (h) {
      if (!h.online || !h.key) return;
      var nodes = [].slice.call(document.querySelectorAll(".ag-near[data-oid]"))
        .filter(function (n) { return n.getAttribute("data-oid"); })
        .slice(0, 10);
      nodes.reduce(function (chain, n) {
        return chain.then(function () {
          var kind = n.getAttribute("data-kind");
          var target;
          if (kind === "home") {
            target = GEO.baseGeo();
          } else {
            var o = D.byId(n.getAttribute("data-oid"));
            target = o ? GEO.of(o) : null;
          }
          if (!target) return;
          return GEO.route(g, target).then(function (r) {
            if (!r || r.min == null) return;
            var near = r.min <= GEO.NEAR_MIN;
            n.className = "ag-near" + (near ? "" : " far") + (kind === "home" ? " home" : "");
            n.setAttribute("data-src", r.source);
            n.textContent = (kind === "home" ? "单程 " : near ? "顺路 " : "") + GEO.fmtMin(r.min);
          });
        });
      }, Promise.resolve());
    });
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.schedule = function (params) {
    var restoringScroll = !!(params && params.restoreScroll);
    if (!restoringScroll || pendingFilter) state.filter = pendingFilter || "全部";
    pendingFilter = null;

    var bar =
      '<div class="appbar-row">' +
        '<div class="appbar-logo" id="btnMonth" role="button" tabindex="0" aria-label="选择月份">' +
          U.icon("calendarDays", 20) + "</div>" +
        '<div class="col"><div class="appbar-title">档期</div>' +
        '<div class="appbar-sub">' + label() + " · " + totalOrders() + " 单排程</div></div>" +
        '<div class="appbar-actions">' +
          '<button class="icon-btn" id="btnView" aria-label="' +
            (state.view === "month" ? "切到列表" : "切到月历") + '">' +
            U.icon(state.view === "month" ? "list" : "grid", 18) + "</button>" +
          (w.PROFILE ? w.PROFILE.html() : '<div class="avatar">王队</div>') +
        "</div>" +
      "</div>" +
      '<div class="month-switch" aria-label="月份切换">' +
        '<button type="button" class="icon-btn" id="monthPrev" aria-label="上个月">' + U.icon("arrowLeft", 16) + '</button>' +
        '<button type="button" class="month-select" id="monthPick">' + U.esc(label()) + U.icon("chevronDown", 13) + '</button>' +
        '<button type="button" class="icon-btn" id="monthNext" aria-label="下个月">' + U.icon("chevronRight", 16) + '</button></div>' +
      '<div class="chiprow" id="dayFilter">' +
        FILTERS.map(function (f) {
          var on = !f.jump && f.k === state.filter;
          return '<button class="chip' + (f.jump ? " jump" : "") + (on ? " on" : "") +
            '" data-k="' + f.k + '">' + f.t +
            (f.nocount ? "" : '<span class="n">' + countOf(f.k) + "</span>") + "</button>";
        }).join("") +
      "</div>";

    var fp = forPending();
    var fo = forOrder();
    var forBar = fp
      ? '<div class="for-bar">' + U.icon("target", 14) +
          '<div class="col"><b>正在为「' + U.esc(fp.title) + '」选时段</b>' +
          '<span>点任意时段即可排期 · 上下午不限单数</span></div>' +
          '<a class="fb-x" href="#/pending">取消</a>' +
        "</div>"
      : fo
      ? '<div class="for-bar">' + U.icon("calendarDays", 14) +
          '<div class="col"><b>正在为「' + U.esc(fo.owner || fo.title) + '」选档期</b>' +
          '<span>点任意时段即可排入 · 上下午不限单数</span></div>' +
          '<button class="fb-x" id="fbCancelOrder" type="button">取消</button>' +
        "</div>"
      : "";

    /* 待排的单不再在档期页另开托盘：出口已收到待定池「补充信息并推排期」那一个 */
    var body = forBar +
      (state.view === "month"
        ? '<div class="mt12 cal-pager" id="calWrap" aria-label="上下滑动切换月份">' + monthPagesHtml() + "</div>"
        : '<div class="mt12" id="listWrap">' + listHtml() + "</div>") +
      '<div style="height:8px"></div>';

    var deferredRefresh = 0;
    function refresh() {
      if (document.body && document.body.classList.contains("is-dragging")) {
        clearTimeout(deferredRefresh); deferredRefresh = setTimeout(refresh, 200); return;
      }
      var lw = document.getElementById("listWrap");
      if (lw) lw.innerHTML = listHtml();
      var cw = document.getElementById("calWrap");
      if (cw) [].forEach.call(cw.querySelectorAll(".cal-month-page"), function (page) {
        page.innerHTML = monthHtml(page.getAttribute("data-month"));
      });
      /* 改期会让某些天从「有活」变「空着」，筛选条上的数字要跟着走 */
      [].forEach.call(document.querySelectorAll("#dayFilter .chip"), function (b) {
        var n = b.querySelector(".n");
        if (n) n.textContent = countOf(b.getAttribute("data-k"));
      });
      if (lw) lw.classList.remove("masked");
    }

    /* 每条活按自己的施工坐标取天气；高德只覆盖未来 4 天，取不到的日期就不显示。
       只给「未来 4 天里真有活」的地点发请求，别为了整月的单打几十次逆地理 */
    function loadJobWeather() {
      var need = {}, base = new Date(D.TODAY.y, D.TODAY.m - 1, D.TODAY.d);
      Object.keys(D.MONTHS).forEach(function (k) {
        D.MONTHS[k].days.forEach(function (d) {
          var diff = Math.round((new Date(d.y, d.m - 1, d.day) - base) / 86400000);
          if (diff < 0 || diff > 3) return;
          d.slots.forEach(function (s) {
            (s.items || []).forEach(function (it) { if (it.oid) need[it.oid] = 1; });
          });
        });
      });

      var pts = [];
      D.ORDERS.forEach(function (o) {
        if (!need[o.id]) return;
        if (o.geo && o.geo.lat != null && o.geo.lng != null) pts.push({ lat: o.geo.lat, lng: o.geo.lng });
      });
      if (!pts.length) return;

      GEO.weatherPoints(pts).then(function (map) {
        if (!map || !Object.keys(map).length) return;
        var next = {};
        D.ORDERS.forEach(function (o) {
          if (!o.geo || o.geo.lat == null || o.geo.lng == null) return;
          var k = Number(o.geo.lat).toFixed(2) + "," + Number(o.geo.lng).toFixed(2);
          if (map[k]) next[o.id] = map[k];
        });
        if (!Object.keys(next).length) return;
        wxOf = next;
        refresh();
      });
    }

    /* 所有日期共用一次出发地查询，不按空档日重复请求。 */
    function loadCalWeather() {
      var host = document.getElementById("screen");
      var g = (w.GEO && w.GEO.baseGeo && w.GEO.baseGeo()) || D.BASE;
      if (!g || g.lat == null || g.lng == null) { calWxState = "请设置出发地"; refresh(); return; }
      calWxState = "正在获取天气";
      w.GEO.weather(g.lat, g.lng).then(function (res) {
        if (document.getElementById("screen") !== host) return;
        var map = {};
        ((res && res.items) || []).forEach(function (it) { if (it.date && it.day) map[it.date] = it; });
        calWx = map;
        var h = GEO.status(), hasKey = (h.online && h.key) || (GEO.directKey && GEO.directKey());
        calWxState = !hasKey ? "请配置地图 Key" : w.navigator && w.navigator.onLine === false ? "离线，暂无天气" : "天气暂不可用";
        refresh();
      }).catch(function () {
        if (document.getElementById("screen") !== host) return;
        calWxState = "天气暂不可用"; refresh();
      });
    }

    function mount() {
      var f = document.getElementById("dayFilter");
      f.addEventListener("click", function (e) {
        var b = e.target.closest(".chip");
        if (!b) return;
        var k = b.getAttribute("data-k");
        var isJump = k === "today";

        /* 「今天」是定位按钮：不筛选，只滚过去 */
        if (isJump) {
          b.classList.remove("ping");
          void b.offsetWidth;
          b.classList.add("ping");

          /* 翻到别的月份时，先把月份拉回今天所在月 */
          if (!hasToday()) {
            state.month = D.TODAY.key;
            w.APP.render();
            setTimeout(flashToday, 60);
            return;
          }
          /* 当前筛选把今天滤掉了，先恢复全部再滚 */
          if (state.filter !== "全部") {
            state.filter = "全部";
            [].forEach.call(f.children, function (c) {
              c.classList.toggle("on", c.getAttribute("data-k") === "全部");
            });
            refresh();
          }
          scrollToToday(true);
          setTimeout(flashToday, 60);
          return;
        }

        state.filter = k;
        [].forEach.call(f.children, function (c) { c.classList.toggle("on", c === b); });
        refresh();
        document.getElementById("screen").scrollTop = 0;
      });

      var listWrap = document.getElementById("listWrap");
      if (listWrap) listWrap.addEventListener("click", function (e) {
        if (Date.now() < suppressClickUntil) { e.preventDefault(); return; }   /* 刚拖拽落位，别把这个 click 当点击空档 */
        var full = e.target.closest("[data-full-day]");
        if (full) { var fd = dayByDate(full.getAttribute("data-full-day")); if (fd) D.setDayFull(state.month + "-" + fd.date.slice(3), !fd.full).then(refresh).catch(function (err) { U.toast(err.message); }); return; }
        var header = e.target.closest("[data-open-day]"); if (header) { openDay(header.getAttribute("data-open-day"), refresh); return; }
        var add = e.target.closest(".ag-add");
        if (add) { handleFree(add.getAttribute("data-day"), add.getAttribute("data-ampm")); return; }
        var s = e.target.closest(".ag-free");
        if (!s) return;
        openDay(s.getAttribute("data-day"), refresh);
      });

      /* 月历：点格子开当天详情（格子本身不接拖拽，改期仍在列表里做） */
      var calWrap = document.getElementById("calWrap");
      if (calWrap) calWrap.addEventListener("click", function (e) {
        var c = e.target.closest(".cal-cell");
        var day = c && c.getAttribute("data-day");   /* 补白格没有 data-day，点了不响应 */
        if (!day) return;
        var page = c.closest(".cal-month-page"), key = page && page.getAttribute("data-month");
        if (key && key !== state.month) switchMonth(key);
        openDay(day, refresh);
      });

      document.getElementById("btnView").addEventListener("click", function () {
        state.view = state.view === "month" ? "list" : "month";
        try { w.localStorage.setItem(VIEW_KEY, state.view); } catch (e) {}
        w.APP.render();
      });

      /* ---------- 已排期的活：在档期里直接拖动改期 ----------
         拖到任意空档松手 = 改期；拖回原位 = 什么都不写；
         靠近上下边缘自动滚屏，跨月也能拖到。 */
      (function bindMove() {
        var wrap = document.getElementById("listWrap"), screen = document.getElementById("screen");
        if (!wrap) return;
        var ghost = null, cur = null, job = null, pointer = null;
        var lx = 0, ly = 0, autoV = 0, rafId = 0, lastFrame = 0;
        var busy = false, candidate = null, holdTimer = 0, sx = 0, sy = 0;
        function bounds() {
          var r = screen.getBoundingClientRect(), nav = document.getElementById("tabbar");
          return {top: r.top, bottom: nav ? Math.min(r.bottom, nav.getBoundingClientRect().top - 8) : r.bottom};
        }
        function findSlot(x, y) {
          var r = bounds(); if (y < r.top || y > r.bottom) return null;
          var el = document.elementFromPoint(x, y), slot = el && el.closest(".ag-slot");
          return slot && wrap.contains(slot) ? slot : null;
        }
        function clearSlot() { if (cur) { cur.classList.remove("drop-on"); cur = null; } }
        function hit(x, y) {
          var slot = findSlot(x, y);
          if (slot !== cur) { clearSlot(); cur = slot; if (cur) cur.classList.add("drop-on"); }
        }
        function edgeSpeed(y) {
          var r = bounds(), pad = 64;
          if (y < r.top + pad) return -360 * Math.pow(Math.min(1, Math.max(0, (r.top + pad - y) / pad)), 2);
          if (y > r.bottom - pad) return 360 * Math.pow(Math.min(1, Math.max(0, (y - r.bottom + pad) / pad)), 2);
          return 0;
        }
        function loop(time) {
          rafId = 0; if (!job) return;
          var delta = lastFrame ? Math.min(32, time - lastFrame) : 16;
          lastFrame = time;
          if (autoV) { screen.scrollTop += autoV * delta / 1000; hit(lx, ly); }
          rafId = w.requestAnimationFrame(loop);
        }
        function killGhost(g) {
          if (!g) return;
          g.classList.add("drop-done");
          setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); }, 180);
        }
        function positionGhost() {
          var width = w.innerWidth || 320, half = Math.min(224, width - 24) / 2;
          ghost.style.left = Math.max(half + 12, Math.min(width - half - 12, lx)) + "px";
          ghost.style.top = Math.max(bounds().top + 70, ly - 16) + "px";
        }
        function move(e) {
          if (!job || e.pointerId !== pointer) return;
          e.preventDefault(); lx = e.clientX; ly = e.clientY;
          positionGhost();
          hit(lx, ly); autoV = edgeSpeed(ly);
        }
        function up(e) {
          if (!job || (e.pointerId != null && e.pointerId !== pointer)) return;
          var j = job, g = ghost, pid = pointer;
          var canceled = e.type !== "pointerup" && e.type !== "touchend";
          var slot = canceled ? null : findSlot(e.clientX, e.clientY);
          job = null; ghost = null; pointer = null; autoV = 0; lastFrame = 0;
          if (rafId) { w.cancelAnimationFrame(rafId); rafId = 0; }
          wrap.removeEventListener("pointermove", move);
          wrap.removeEventListener("pointerup", up);
          wrap.removeEventListener("pointercancel", up);
          wrap.removeEventListener("lostpointercapture", up);
          w.removeEventListener("blur", cancel);
          try { j.card.releasePointerCapture(pid); } catch (err) {}
          clearSlot(); document.body.classList.remove("is-dragging");
          j.card.classList.remove("dragging"); killGhost(g);
          suppressClickUntil = Date.now() + 350;
          if (!slot) return;
          var day = slot.getAttribute("data-day"), ampm = slot.getAttribute("data-ampm");
          if (j.day === day && j.ampm === ampm) return;
          var month = D.MONTHS[state.month], fullDate = month.y + "-" + day.replace(/\./g, "-");
          busy = true;
          D.moveOrder(j.id, fullDate, ampm).then(function (o) {
            if (!o) return;
            U.toast("已改到 " + day + " " + ampm);
            if (wrap.isConnected) refresh();
          }).catch(function (err) { U.toast(err.message || "改期没成功"); }).then(function () { busy = false; });
        }
        function stopCandidate() {
          clearTimeout(holdTimer); holdTimer = 0; candidate = null;
          if (!job) w.removeEventListener("blur", cancel);
        }
        function cancel() {
          stopCandidate();
          if (job) up({type: "cancel"});
          w.removeEventListener("blur", cancel);
        }
        function begin() {
          var c = candidate;
          if (!c || busy || !wrap.isConnected) { stopCandidate(); return; }
          clearTimeout(holdTimer); holdTimer = 0; candidate = null;
          var card = c.card, host = card.closest(".ag-slot");
          pointer = c.pointer;
          job = {id: card.getAttribute("data-order"), card: card,
            day: host.getAttribute("data-day"), ampm: host.getAttribute("data-ampm")};
          ghost = document.createElement("div"); ghost.className = "drag-ghost";
          ghost.innerHTML = card.querySelector(".ag-open").innerHTML;
          positionGhost(); document.body.appendChild(ghost);
          card.classList.add("dragging"); document.body.classList.add("is-dragging");
          hit(lx, ly);
          if (!c.touch) {
            try { card.setPointerCapture(pointer); } catch (err) {}
            wrap.addEventListener("pointermove", move, {passive: false});
            wrap.addEventListener("pointerup", up);
            wrap.addEventListener("pointercancel", up);
            wrap.addEventListener("lostpointercapture", up);
          }
          rafId = w.requestAnimationFrame(loop);
        }
        function arm(e, touch) {
          if (busy || job || candidate || Date.now() < suppressClickUntil) return;
          var card = e.target.closest(".ag-item[data-order][data-drag]");
          if (!card) return;
          lx = sx = e.clientX; ly = sy = e.clientY;
          candidate = {card: card, pointer: touch ? e.identifier : e.pointerId, touch: touch};
          holdTimer = setTimeout(begin, 220);
          w.addEventListener("blur", cancel);
        }
        wrap.addEventListener("contextmenu", function (e) { if (e.target.closest(".ag-item")) e.preventDefault(); });
        wrap.addEventListener("dragstart", function (e) { if (e.target.closest(".ag-item")) e.preventDefault(); });
        function openCard(e) {
          if (e.type === "keydown" && e.key !== "Enter" && e.key !== " ") return;
          var link = e.target.closest("[data-order-link]"); if (!link) return;
          e.preventDefault();
          var id = link.getAttribute("data-order-link");
          if (w.APP.openOrder) w.APP.openOrder(id); else w.location.hash = "#/order/" + id;
        }
        wrap.addEventListener("click", function (e) {
          if (job || Date.now() < suppressClickUntil) { e.preventDefault(); e.stopPropagation(); return; }
          openCard(e);
        }, true);
        wrap.addEventListener("keydown", openCard);
        wrap.addEventListener("pointerdown", function (e) {
          if (e.pointerType === "touch" || e.isPrimary === false || (e.button != null && e.button !== 0)) return;
          arm(e, false);
        });
        wrap.addEventListener("pointermove", function (e) {
          if (!candidate || candidate.touch || e.pointerId !== candidate.pointer) return;
          lx = e.clientX; ly = e.clientY;
          if (Math.hypot(lx - sx, ly - sy) >= 6) { e.preventDefault(); begin(); }
        });
        wrap.addEventListener("pointerup", function () { if (!job) stopCandidate(); });
        wrap.addEventListener("pointercancel", function () { if (!job) stopCandidate(); });
        wrap.addEventListener("pointerleave", function () { if (!job) stopCandidate(); });
        // Safari decides native scrolling on the first touchmove. Keep quick swipes
        // native; prevent that first move only after the stationary hold has armed.
        wrap.addEventListener("touchstart", function (e) {
          if (e.touches.length !== 1) { cancel(); return; }
          var t = e.touches[0];
          arm({target:e.target, clientX:t.clientX, clientY:t.clientY, identifier:t.identifier}, true);
        }, {passive: true});
        wrap.addEventListener("touchmove", function (e) {
          if (e.touches.length !== 1) { cancel(); return; }
          var t = e.touches[0];
          if (candidate && candidate.touch) {
            if (Math.hypot(t.clientX - sx, t.clientY - sy) >= 8) stopCandidate();
            return;
          }
          if (!job || t.identifier !== pointer) return;
          if (!e.cancelable) { cancel(); return; }
          e.preventDefault();
          move({pointerId:t.identifier, clientX:t.clientX, clientY:t.clientY, preventDefault:function(){}});
        }, {passive: false});
        wrap.addEventListener("touchend", function (e) {
          if (candidate) { stopCandidate(); return; }
          if (!job) return;
          var t = Array.prototype.find.call(e.changedTouches, function (x) { return x.identifier === pointer; });
          if (!t) return;
          if (e.cancelable) e.preventDefault();
          up({type:"touchend", pointerId:t.identifier, clientX:t.clientX, clientY:t.clientY});
          w.removeEventListener("blur", cancel);
        }, {passive: false});
        wrap.addEventListener("touchcancel", cancel, {passive: true});
      })();

      /* 排档期流程里点「取消」：这单退回待定池，不凭空消失 */
      var cancelOrder = document.getElementById("fbCancelOrder");
      if (cancelOrder) cancelOrder.addEventListener("click", function () {
        var o = forOrder(); if (!o) return;
        return D.toPending(o.id).then(function (p) {
          U.toast("已退回待定池 · " + p.id);
          w.location.hash = "#/pending";
        }).catch(function (err) { U.toast(err.message); });
      });

      document.getElementById("btnMonth").addEventListener("click", function () { monthSheet(); });
      document.getElementById("monthPick").addEventListener("click", function () { monthSheet(); });
      document.getElementById("monthPrev").addEventListener("click", function () { switchMonth(shiftedMonth(state.month, -1)); });
      document.getElementById("monthNext").addEventListener("click", function () { switchMonth(shiftedMonth(state.month, 1)); });
      if (calWrap) {
        var settleTimer = 0, touching = false;
        function settleMonth() {
          if (touching || !calWrap.isConnected || !calWrap.clientHeight) return;
          var index = Math.max(0, Math.min(2, Math.round(calWrap.scrollTop / calWrap.clientHeight)));
          var targetMonth = shiftedMonth(state.month, index - 1);
          if (targetMonth !== state.month) switchMonth(targetMonth);
          else if (Math.abs(calWrap.scrollTop - calWrap.clientHeight) > 1) calWrap.scrollTo({top: calWrap.clientHeight, behavior: "smooth"});
        }
        function queueSettle() { clearTimeout(settleTimer); settleTimer = setTimeout(settleMonth, 140); }
        calWrap.scrollTop = calWrap.clientHeight;
        w.requestAnimationFrame(function () { if (calWrap.isConnected) calWrap.scrollTop = calWrap.clientHeight; });
        calWrap.addEventListener("touchstart", function () { touching = true; clearTimeout(settleTimer); }, {passive: true});
        calWrap.addEventListener("touchend", function () { touching = false; queueSettle(); }, {passive: true});
        calWrap.addEventListener("touchcancel", function () { touching = false; queueSettle(); }, {passive: true});
        calWrap.addEventListener("scroll", queueSettle, {passive: true});
      }

      if (state.view === "list" && !restoringScroll) {
        w.requestAnimationFrame(function () { scrollToToday(false); });
      }
      loadJobWeather();
      loadCalWeather();
      if (forPending()) setTimeout(upgradeNear, 260);
      /* mask 与字体落定后高度会变，再定位一次 */
      if (state.view === "list" && !restoringScroll) setTimeout(function () { scrollToToday(false); }, 200);
      if (resizeHandler) w.removeEventListener("resize", resizeHandler);
      resizeHandler = function () {};
      w.addEventListener("resize", resizeHandler);
    }

    return { bar: bar, body: body, mount: mount, tab: "schedule" };
  };
})(window);
