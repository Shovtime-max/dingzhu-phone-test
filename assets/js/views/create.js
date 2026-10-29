/* ==========================================================================
   记一单（复刻 waymo_3 录入流程）
   ========================================================================== */
(function (w) {
  "use strict";
  var D = w.DATA, U = w.UI;

  var SCOPES = ["换瓦", "脊瓦加固", "红瓦换新", "防水卷材", "天沟检修", "拆除清运"];
  var MODELS = [
    { k: "pending", t: "待定", desc: "默认状态 · 待现场量尺看活确认后选定" },
    { k: "full", t: "双包", desc: "包工包料 · 含彩钢瓦、脊瓦、辅料与清运" },
    { k: "labor", t: "清工", desc: "纯人工 · 业主自行订购瓦料与配件" }
  ];

  var st = {
    main: 4, wing: 1, model: "pending", scope: [], custom: "",
    price: "", geo: null, decision: null
  };
  function resetForm() {
    st.main = 4; st.wing = 1;
    st.model = "pending"; st.scope = []; st.custom = "";
    st.price = ""; st.geo = null; st.decision = null;
  }

  /* 材料口径 → 订单字段（档期条目上显示「间 + 大包/人工」） */
  function modeText() {
    return st.model === "labor" ? "人工" : st.model === "full" ? "大包" : "待定";
  }

  /* 镇 / 村：优先取搜索选中项，其次反查本地村镇表，都没有就如实标「未标镇」。
     村名不能直接拿整串地址——那会让详情页出现「李家庄 5 排 2 号 · 李家庄 5 排 2 号」 */
  function placeOf(addrText) {
    var g = st.geo || {};
    var seed = null;
    try { seed = GEO.seedMatch(addrText); } catch (e) {}
    var town = g.town || (seed && seed.town) || "";
    var village = g.village || (seed && seed.village) || g.name ||
      String(addrText).split(/[\s,，]+/)[0] || addrText;
    return {
      town: town || "未标镇",
      village: village,
      lat: g.lat != null ? g.lat : (seed ? seed.lat : null),
      lng: g.lng != null ? g.lng : (seed ? seed.lng : null)
    };
  }

  /* ?for=PD-03：从待定池进来补信息，补完直接推排期（不是新录一单） */
  function forPending() {
    var m = (w.location.hash || "").match(/[?&]for=([A-Za-z0-9\-]+)/);
    if (!m) return null;
    for (var i = 0; i < D.PENDING.length; i++) if (D.PENDING[i].id === m[1]) return D.PENDING[i];
    return null;
  }

  w.VIEWS = w.VIEWS || {};
  w.VIEWS.create = function () {
    var src = forPending();
    if (src) {
      st.main = Number(src.main != null ? src.main : src.rooms) || 1;
      st.wing = Number(src.wing) || 0;
      st.model = (src.mode === "大包" || src.mode === "双包") ? "full"
               : (src.mode === "人工" || src.mode === "清工") ? "labor" : "pending";
      var tg = (src.tags || []).filter(Boolean);
      st.scope = tg.filter(function (x) { return SCOPES.indexOf(x) >= 0; });
      st.custom = tg.filter(function (x) { return SCOPES.indexOf(x) < 0; }).join(" ");
      st.geo = src.geo ? Object.assign({}, src.geo) : null;
      st.price = src.budget ? String(src.budget) : "";
    }

    var bar =
      '<div class="navline">' +
        '<a class="back" href="' + (src ? "#/pending" : "#/orders") + '" aria-label="返回">' + U.icon("arrowLeft", 18) + "</a>" +
        '<div class="col navline-mid"><div class="navline-title">' + (src ? "补充信息" : "记一单") + "</div></div>" +
        '<button class="icon-btn bare" id="btnHelp" aria-label="帮助">' + U.icon("info", 19) + "</button>" +
      "</div>";

    /* 从待定池进来：先把上次记的摊在上面，别让人从头再问一遍业主 */
    var resume = src
      ? '<div class="for-bar">' + U.icon("clock", 14) +
          '<div class="col"><b>正在补充 ' + U.esc(src.id) + " 的信息</b>" +
          "<span>" + U.esc(src.stage) + " · " + (src.rooms || 0) + " 间 · 预算 ¥" + U.n(src.budget) + "</span></div>" +
          '<a class="fb-x" href="#/pending">返回</a>' +
        "</div>"
      : "";

    var body = resume +
      /* 地址与业主：整张卡要抬到兄弟卡片之上，否则下拉会被下一张卡盖住 */
      '<section class="card addr-card mt12">' +
        '<div class="card-head" style="margin-bottom:12px">' +
          '<div class="card-title" style="font-size:13px">施工地址与业主</div>' +
          '<span class="pill xs brand">' + U.icon("zap", 10) + "极速录入</span>" +
        "</div>" +
        '<div class="addr-wrap">' +
          '<div class="addr-box">' +
            '<div class="ic">' + U.icon("search", 19) + "</div>" +
            '<div class="col"><div class="lbl">施工位置 / 详细门牌</div>' +
              '<input id="inAddr" type="text" value="' + (src ? U.esc(src.addr) : "") + '" autocomplete="off" ' +
                'placeholder="输入村名，如 孙家沟村"></div>' +
            '<button class="geo-btn" id="btnGeo" aria-label="定位">' + U.icon("pin", 15) + "</button>" +
            '<div class="geosug" id="geoSug" hidden></div>' +
          "</div>" +
          '<div class="geo-line" id="geoLine"></div>' +
        "</div>" +
        '<div class="fx g8 mt10">' +
          '<input class="inline-input" id="inOwner" type="text" placeholder="业主姓名" style="flex:1.1" value="' +
            (src ? U.esc(src.owner) : "") + '">' +
          '<input class="inline-input" id="inPhone" type="tel" inputmode="numeric" placeholder="联系电话" style="flex:1" value="' +
            (src ? U.esc(src.phone || "") : "") + '">' +
        "</div>" +
      "</section>" +

      /* 屋面规格 */
      '<section class="card mt12">' +
        '<div class="card-head" style="margin-bottom:12px">' +
          '<div class="card-title" style="font-size:13px">屋面规格与用料</div>' +
          '<span class="pill xs" id="roomSum">' + (st.main + st.wing) + " 间</span>" +
        "</div>" +
        '<div class="fx g10">' +
          '<div class="col" style="background:rgba(241,244,248,.7);border-radius:14px;padding:10px 12px">' +
            '<div class="t-xs mut b7">主房</div>' +
            '<div class="stepper mt6"><button class="stp-btn" id="decMain">' + U.icon("minus", 15) + '</button>' +
            '<div class="stp-val" id="valMain">' + st.main + '<small>间</small></div>' +
            '<button class="stp-btn" id="incMain">' + U.icon("plus", 15) + "</button></div>" +
          "</div>" +
          '<div class="col" style="background:rgba(241,244,248,.7);border-radius:14px;padding:10px 12px">' +
            '<div class="t-xs mut b7">偏房</div>' +
            '<div class="stepper mt6"><button class="stp-btn" id="decWing">' + U.icon("minus", 15) + '</button>' +
            '<div class="stp-val" id="valWing">' + st.wing + '<small>间</small></div>' +
            '<button class="stp-btn" id="incWing">' + U.icon("plus", 15) + "</button></div>" +
          "</div>" +
        "</div>" +
        '<div class="form-group"><div class="form-label">工序<span class="t-xs mut" style="text-transform:none;letter-spacing:0">可多选，也可在下面自定义追加</span></div>' +
          '<div class="tagrow" id="scopeRow">' +
            SCOPES.map(function (s) {
              return '<button class="tagchip' + (st.scope.indexOf(s) >= 0 ? " on" : "") + '" data-s="' + s + '">' +
                U.icon("check", 11) + s + "</button>";
            }).join("") +
          "</div>" +
          '<input class="inline-input" id="inScope" type="text" autocomplete="off" value="' + U.esc(st.custom) + '" ' +
            'placeholder="自定义工序，多个用空格或顿号分隔" style="width:100%;margin-top:8px">' +
        "</div>" +
        '<div class="form-group"><div class="form-label">材料口径</div>' +
          '<div class="tri" id="modelTri">' +
            MODELS.map(function (m) {
              return '<button class="' + (st.model === m.k ? "on" : "") + '" data-k="' + m.k + '">' + m.t + "</button>";
            }).join("") +
          "</div>" +
          '<div class="t-xs mut mt8 fx g4" id="modelHint" style="line-height:1.5">' +
            U.icon("info", 12) + "<span>" + MODELS[0].desc + "</span></div>" +
        "</div>" +
      "</section>" +

      /* 报价 */
      '<section class="card mt12">' +
        '<div class="card-head" style="margin-bottom:12px">' +
          '<div class="card-title" style="font-size:13px">整单报价</div>' +
          '<button class="pill xs line" id="btnEstimate">' + U.icon("sparkles", 10) + "按均价估算</button>" +
        "</div>" +
        '<div class="price-input"><span class="cur">¥</span>' +
          '<input id="inPrice" type="tel" inputmode="numeric" placeholder="0" value="' + U.esc(st.price) + '">' +
          '<button class="btn xs ghost" id="btnClear">清空</button>' +
        "</div>" +
        '<div class="presets" id="presetRow">' +
          ["1800", "2400", "3500", "5000"].map(function (p) {
            return '<button data-p="' + p + '">¥' + U.n(p) + "</button>";
          }).join("") +
        "</div>" +
      "</section>" +

      /* 备注 */
      '<section class="card mt12">' +
        '<div class="card-head" style="margin-bottom:12px">' +
          '<div class="card-title" style="font-size:13px">备注</div>' +
          '<span class="pill xs line">随手记</span>' +
        "</div>" +
        '<input class="inline-input" id="inNote" type="text" autocomplete="off" value="' + U.esc(src ? (src.note || "") : "") + '" ' +
          'placeholder="补充说明，如：业主周二才有空、材料已到" style="width:100%">' +
      "</section>" +

      '<div class="form-foot">' +
        '<button class="btn primary dest" id="btnToSchedule">' + U.icon("calendarDays", 18) +
          '<span class="dest-label">' + (src ? "补完并推排期" : "排档期") + "</span></button>" +
        (src ? "" :
        '<button class="btn ghost dest" id="btnToPending">' + U.icon("clock", 18) + '<span class="dest-label">进入待定池</span></button>') +
      "</div>" +
      '<span class="sr-only" id="destStatus" role="status" aria-live="polite"></span>' +
      '<div style="height:8px"></div>';

    function syncRooms() {
      document.getElementById("valMain").innerHTML = st.main + "<small>间</small>";
      document.getElementById("valWing").innerHTML = st.wing + "<small>间</small>";
      document.getElementById("roomSum").textContent = (st.main + st.wing) + " 间";
    }

    function mount() {
      /* ---------- 地址搜索（像地图软件：输入关键字 → 出真实地名） ----------
         有高德 Key 走高德，没 Key 走 OpenStreetMap；两条都是真搜索，
         不掺“你以前用过的地名”。本地库只在彻底搜不到 / 断网时兜底。
      */
      var addrEl = document.getElementById("inAddr");
      var sugEl = document.getElementById("geoSug");
      var lineEl = document.getElementById("geoLine");
      var sugTimer = null, sugItems = [], active = -1, seq = 0;

      function paintGeoLine() {
        if (!st.geo) {
          lineEl.className = "geo-line";
          lineEl.innerHTML = U.icon("search", 11) +
            "<span>搜到地名后自动定位，排期时才能算准车程</span>";
          return;
        }
        var src = st.geo.source;
        var tag, cls, showCoord = true, redo = false;
        if (src === "amap") { tag = "高德已定位"; cls = " ok"; }
        else if (src === "osm") { tag = "已定位"; cls = " ok"; }
        else if (src === "town") { tag = "按镇中心 · 差几公里"; cls = " warn"; showCoord = false; redo = true; }
        else { tag = "村镇坐标 · 近似"; cls = " warn"; redo = true; }

        lineEl.className = "geo-line" + cls;
        /* 线索带的坐标没有 name 字段，退回村名/镇名，别把 undefined 印到界面上 */
        var geoName = st.geo.name || st.geo.village || st.geo.town || "已定位位置";
        lineEl.innerHTML = U.icon("pin", 11) + "<span>" +
          U.esc((st.geo.addr ? st.geo.addr + " · " : "") + geoName) + " · " + tag +
          (showCoord ? " " + st.geo.lat.toFixed(4) + ", " + st.geo.lng.toFixed(4) : "") +
          "</span>" +
          (redo ? '<button class="geo-fix" id="btnRedo">重搜</button>' : "");
      }

      function hideSug() { sugEl.hidden = true; sugEl.innerHTML = ""; active = -1; }

      function showLoading(kw) {
        sugEl.innerHTML = '<div class="gs-loading"><i></i><span>正在搜索「' + U.esc(kw) + '」</span></div>';
        sugEl.hidden = false;
      }

      function renderSug(res) {
        sugItems = res.items || [];
        active = -1;

        if (!sugItems.length) {
          sugEl.innerHTML = '<div class="gs-empty">' + U.icon("search", 20) +
            "<b>没搜到「" + U.esc(addrEl.value.trim()) + "」</b>" +
            "<span>换个说法试试：只打村名（孙家沟），或加上镇名</span></div>";
          sugEl.hidden = false;
          return;
        }

        var rows = sugItems.map(function (it, i) {
          var sub = [];
          if (it.addr) sub.push(it.addr);
          if (it.dist != null) {
            sub.push(it.dist >= 1 ? Math.round(it.dist) + " km" : Math.round(it.dist * 1000) + " m");
          }
          return '<button class="gs-i" data-i="' + i + '">' +
            '<span class="gs-ic">' + U.icon(it.kind === "村" ? "home" : it.kind === "镇" ? "layers" : "pin", 15) + "</span>" +
            '<span class="gs-main">' +
              '<span class="gs-n">' + U.esc(it.name) + "</span>" +
              (sub.length ? '<span class="gs-sub">' + U.esc(sub.join(" · ")) + "</span>" : "") +
            "</span>" +
            (it.kind ? '<span class="gs-b">' + U.esc(it.kind) + "</span>" : "") +
            "</button>";
        }).join("");

        var src = res.source === "amap" ? "高德地图"
          : res.source === "osm" ? "OpenStreetMap · 免费源，精度不如高德"
          : res.source === "offline" ? "离线库 · 仅含已存村镇，配 Key 后才有全网搜索"
          : "";
        var tip = src ? '<div class="gs-tip">' + U.icon("info", 11) + "<span>" + src + "</span></div>" : "";

        sugEl.innerHTML = '<div class="gs-list">' + rows + "</div>" + tip;
        sugEl.hidden = false;
      }

      function doSuggest() {
        var q = addrEl.value.trim();
        if (!q) { hideSug(); return Promise.resolve(); }
        var mine = ++seq;
        showLoading(q);
        return GEO.searchPoi(q).then(function (res) {
          if (mine !== seq) return;   /* 已被后一次输入顶掉，丢弃旧结果 */
          renderSug(res);
        });
      }

      /* 地址还没打字时：按当前定位列附近的村（复用同一下拉，不加控件） */
      function doNearby() {
        var mine = ++seq;
        sugEl.innerHTML = '<div class="gs-loading"><i></i><span>正在找附近的村…</span></div>';
        sugEl.hidden = false;
        return GEO.nearby().then(function (res) {
          if (mine !== seq) return;
          renderSug(res);
        }).catch(function () { hideSug(); });
      }

      addrEl.addEventListener("input", function () {
        var t = addrEl.value.trim();
        if (st.geo && t.indexOf(st.geo.name) < 0) {
          st.geo = null;
          paintGeoLine();
        }
        clearTimeout(sugTimer);
        sugTimer = setTimeout(doSuggest, 320);
      });
      addrEl.addEventListener("focus", function () {
        if (addrEl.value.trim()) doSuggest(); else doNearby();
      });

      /* 键盘操作：↑↓ 选、回车确认、Esc 收起——PC 上像地图软件一样好用 */
      addrEl.addEventListener("keydown", function (e) {
        if (sugEl.hidden) {
          if (e.key === "Enter") { e.preventDefault(); doSuggest(); }
          return;
        }
        var rows = sugEl.querySelectorAll(".gs-i");
        if (!rows.length) return;
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          active = e.key === "ArrowDown"
            ? Math.min(active + 1, rows.length - 1)
            : Math.max(active - 1, 0);
          [].forEach.call(rows, function (r, i) { r.classList.toggle("active", i === active); });
          rows[active].scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter") {
          e.preventDefault();
          rows[active >= 0 ? active : 0].click();
        } else if (e.key === "Escape") {
          hideSug();
        }
      });

      /* 定位：先取设备位置当搜索圆心，再按"有输入就搜词 / 没输入就列附近村"分岔 */
      document.getElementById("btnGeo").addEventListener("click", function () {
        return GEO.locate().then(function (pos) {
          if (pos) U.toast("已按当前位置找村");
          return addrEl.value.trim() ? doSuggest() : doNearby();
        });
      });

      sugEl.addEventListener("click", function (e) {
        var b = e.target.closest(".gs-i");
        if (!b) return;
        var it = sugItems[parseInt(b.getAttribute("data-i"), 10)];
        if (!it) return;

        var src = it.source === "amap" ? "amap"
          : it.source === "seed" || it.source === "offline"
            ? (it.approx ? "town" : "seed")
            : "osm";

        st.geo = {
          name: it.name,
          addr: it.addr || "",
          lat: it.lat, lng: it.lng,
          source: src
        };
        GEO.setNear(it.lat, it.lng);          /* 下次搜索优先附近，减少同名村误选 */
        addrEl.value = it.name;

        hideSug();
        paintGeoLine();
        U.toast(src === "amap" || src === "osm"
          ? "已定位 · " + it.name
          : "离线估算 · " + it.name);
      });

      if (!w.__addrOutsideBound) {
        w.__addrOutsideBound = true;
        document.addEventListener("click", function (e) {
          if (e.target.closest(".addr-wrap")) return;
          var s2 = document.getElementById("geoSug");
          if (s2) { s2.hidden = true; s2.innerHTML = ""; }
        });
      }

      /* 坐标不够准时，一键回到搜索 */
      lineEl.addEventListener("click", function (e) {
        if (!e.target.closest("#btnRedo")) return;
        addrEl.focus();
        addrEl.select();
        doSuggest();
      });

      paintGeoLine();

      /* 间数步进 */
      function bind(decId, incId, key, min) {
        document.getElementById(decId).addEventListener("click", function () {
          if (st[key] > min) { st[key]--; syncRooms(); }
        });
        document.getElementById(incId).addEventListener("click", function () {
          if (st[key] < 20) { st[key]++; syncRooms(); }
        });
      }
      bind("decMain", "incMain", "main", 1);
      bind("decWing", "incWing", "wing", 0);

      /* 工序多选（预设词条） */
      document.getElementById("scopeRow").addEventListener("click", function (e) {
        var b = e.target.closest(".tagchip");
        if (!b) return;
        var s = b.getAttribute("data-s");
        var i = st.scope.indexOf(s);
        if (i >= 0) st.scope.splice(i, 1); else st.scope.push(s);
        b.classList.toggle("on");
      });

      /* 材料三态 */
      document.getElementById("modelTri").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-k]");
        if (!b) return;
        st.model = b.getAttribute("data-k");
        [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === b); });
        var m = MODELS.filter(function (x) { return x.k === st.model; })[0];
        document.getElementById("modelHint").innerHTML = U.icon("info", 12) + "<span>" + m.desc + "</span>";
      });

      /* 报价预设 */
      var priceEl = document.getElementById("inPrice");
      document.getElementById("presetRow").addEventListener("click", function (e) {
        var b = e.target.closest("button[data-p]");
        if (!b) return;
        priceEl.value = b.getAttribute("data-p");
        [].forEach.call(this.children, function (c) { c.classList.toggle("on", c === b); });
      });
      document.getElementById("btnClear").addEventListener("click", function () {
        priceEl.value = "";
        [].forEach.call(document.getElementById("presetRow").children, function (c) { c.classList.remove("on"); });
        priceEl.focus();
      });
      document.getElementById("btnEstimate").addEventListener("click", function () {
        var s = D.stats();
        var per = st.model === "labor" ? s.avgLabor : s.avgBag;
        if (!per) { U.toast("还没有可参考的均价"); return; }
        var total = Math.round((st.main + st.wing) * per / 100) * 100;
        priceEl.value = String(total);
        U.toast("按" + (st.model === "labor" ? "清工" : "双包") + "均价 ¥" + U.n(per) + "/间 估算 ¥" + U.n(total));
      });

      /* ---------- 保存：真写数据 ----------
         两条去向：排档期（先建档，去排期页选空档）/ 进入待定池
         去向一旦确定就不再切换；新增只叠加、不动演示基线，存 localStorage，刷新还在
      */
      function readForm() {
        var owner = document.getElementById("inOwner").value.trim();
        var addr = document.getElementById("inAddr").value.trim();
        var phone = document.getElementById("inPhone").value.trim();
        var custom = document.getElementById("inScope").value.split(/[、,，\s]+/).filter(function (s) { return s; });
        var scope = st.scope.concat(custom).filter(function (s, i, a) { return a.indexOf(s) === i; });
        var note = document.getElementById("inNote").value.trim();
        var price;
        try {
          price = D.parseMoney(document.getElementById("inPrice").value || "0");
        } catch (err) { U.toast(err.message); return null; }
        if (!owner) { U.toast("先填业主姓名"); return null; }
        if (!addr) { U.toast("先填施工位置"); return null; }
        return { owner: owner, addr: addr, phone: phone, price: price, scope: scope, note: note, place: placeOf(addr) };
      }

      function geoOf(f) {
        return st.geo ? Object.assign({}, st.geo) : f.place.lat != null ? {
          lat:f.place.lat, lng:f.place.lng, source:"seed", town:f.place.town, village:f.place.village
        } : null;
      }
      var saving = false;
      var DEST_LABEL = { schedule: "排档期", pending: "进入待定池" };
      var DEST_ICON = { schedule: "calendarDays", pending: "clock" };

      function destHtml(kind) {
        return U.icon(DEST_ICON[kind], 18) + '<span class="dest-label">' + DEST_LABEL[kind] + "</span>";
      }
      function checkSvg() {
        return '<svg class="check-svg" viewBox="0 0 24 24" aria-hidden="true">' +
          '<path d="M20 6.5L9.2 17.3 4 12.1"/></svg>';
      }
      /* 12 个粒子沿圆周均布，角度/距离走 CSS 变量，不逐个写样式 */
      function burstHtml(n) {
        var out = "";
        for (var i = 0; i < n; i++) {
          out += '<i style="--a:' + Math.round(i * (360 / n)) + 'deg;--d:' + (14 + (i % 3) * 6) + 'px"></i>';
        }
        return '<span class="burst" aria-hidden="true">' + out + "</span>";
      }
      function announce(msg) {
        var el = document.getElementById("destStatus");
        if (el) el.textContent = msg;
      }

      function lockDecision(kind) {
        st.decision = kind;
        var self = document.getElementById(kind === "schedule" ? "btnToSchedule" : "btnToPending");
        var other = document.getElementById(kind === "schedule" ? "btnToPending" : "btnToSchedule");
        if (other) { other.disabled = true; other.classList.add("locked"); }
        if (!self) return;
        self.classList.add("decided");
        if (self.setAttribute) self.setAttribute("aria-label", "已选择" + DEST_LABEL[kind]);
        announce("已选择" + DEST_LABEL[kind]);
        /* 收缩同时放勾与粒子：勾 80ms 后开画，粒子等勾画完再迸 */
        self.innerHTML = checkSvg() + burstHtml(12);
      }

      /* 失败：按钮变红抖两下，600ms 后回到可点、可重试 */
      function unlockDecision(kind, err) {
        saving = false;
        U.toast(err && err.message ? err.message : "保存失败，请重试");
        var self = document.getElementById(kind === "schedule" ? "btnToSchedule" : "btnToPending");
        var other = document.getElementById(kind === "schedule" ? "btnToPending" : "btnToSchedule");
        if (!self) return;
        self.classList.add("fail");
        announce("保存失败，可以重试");
        setTimeout(function () {
          self.classList.remove("decided", "fail");
          self.innerHTML = destHtml(kind);
          if (self.removeAttribute) self.removeAttribute("aria-label");
          if (other) { other.disabled = false; other.classList.remove("locked"); }
          st.decision = null;
        }, 600);
      }

      function saveToPending(f) {
        return D.addPending({
          title: f.owner + " · " + f.addr,
          owner: f.owner,
          town: f.place.town, village: f.place.village, addr: f.addr,
          phone: f.phone,
          rooms: st.main + st.wing,
          budget: f.price, paid: 0, flows: [],
          main: st.main, wing: st.wing, mode: modeText(), tags: f.scope,
          teams: ["t1"], geo: geoOf(f), note: f.note,
          stage: "待量尺",
          days: 0,
          blocker: "档期未定 · 待与业主确认上工日子",
          orderId: null
        });
      }

      function onDestination(kind) {
        if (saving) return;
        if (st.decision && kind !== st.decision) return;   // 去向已锁定，另一按钮不可再点
        var f = readForm(); if (!f) return;
        if (kind === "schedule" && f.price <= 0) {
          U.toast(src ? "推排期前请先填正数报价" : "施工单请先填写正数报价；未定价请进待定池");
          return;
        }
        if (!st.decision) lockDecision(kind);
        saving = true;

        if (kind === "pending") {
          return saveToPending(f).then(function (p) {
            U.toast("已存入待定池 · " + p.id); resetForm();
            setTimeout(function () { w.location.hash = "#/pending"; }, 620);
          }).catch(function (e) { unlockDecision(kind, e); });
        }

        var o = {
          owner:f.owner, title:f.owner, town:f.place.town, village:f.place.village,
          addr:f.addr, phone:f.phone, main:st.main, wing:st.wing, mode:modeText(),
          quote:f.price, paid:0, teams:["t1"], geo:geoOf(f),
          scheduledAt:null, startedAt:null, doneAt:null, start:"", done:"",
          tags:f.scope, note:f.note || "录单生成", flows:[]
        };
        /* 从待定池补信息：带上线索号，建单后线索自动关联，不会重复成单 */
        return D.createOrder(o, null, null, src ? src.id : null).then(function (saved) {
          resetForm();
          U.toast(src ? "信息已补全 " + saved.id + " · 去排期落位" : "已建档 " + saved.id + " · 去排期选档期");
          setTimeout(function () { w.location.hash = "#/schedule?order=" + saved.id; }, 620);
        }).catch(function (e) { unlockDecision(kind, e); });
      }

      document.getElementById("btnToSchedule").addEventListener("click", function () { return onDestination("schedule"); });
      var pendingBtn = document.getElementById("btnToPending");
      if (pendingBtn) pendingBtn.addEventListener("click", function () { return onDestination("pending"); });
      document.getElementById("btnHelp").addEventListener("click", function () {
        U.sheet("<h3>录单小提示</h3><div class=\"sub\">这单接下来去哪，由页面底部两个按钮决定</div>" +
          '<div class="rowline"><span class="k">' + (src ? "补完并推排期" : "排档期") + '</span><span class="v">先建档，再到排期页选空档</span></div>' +
          (src ? "" : '<div class="rowline"><span class="k">进入待定池</span><span class="v">口径 / 报价未定，先存线索</span></div>') +
          '<button class="btn primary mt14" onclick="UI.closeSheet()">知道了</button>');
      });
    }

    return { bar: bar, body: body, mount: mount, tab: "create" };
  };
})(window);
