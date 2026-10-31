/* ==========================================================================
   极简瓦片地图（零依赖 · 高德瓦片 · Web Mercator）
   --------------------------------------------------------------------------
   为什么自己写：项目一直是零依赖原生 JS，塞 Leaflet 等于多 42KB 和一套
   自己的手势/生命周期。这里只留「看分布」需要的四件事 ——
   拖拽、缩放（滚轮/按钮/双指）、覆盖层绘制、点标记。

   瓦片来源：高德 webrd 路网图（中文标注、浅底，适合垫天气场）。
   高德瓦片是 GCJ-02 偏移的底图，本项目的村镇坐标做分布示意足够，
   不用于定位/导航，所以不做坐标纠偏。
   ========================================================================== */
(function (w) {
  "use strict";

  var TILE = 256;
  /* 两层：路网底图 + 透明标注层。
     标注必须压在色场之上，否则天气场一盖地名就没了 —— 天气 App 都是这么叠的。 */
  var TPL = "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}";
  var TPL_LABEL = "https://wprd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scl=1&style=8&ltype=11&x={x}&y={y}&z={z}";

  function worldSize(z) { return TILE * Math.pow(2, z); }

  function lngToX(lng, z) { return (lng + 180) / 360 * worldSize(z); }

  function latToY(lat, z) {
    var la = Math.max(-85.05, Math.min(85.05, lat));
    var s = Math.sin(la * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * worldSize(z);
  }

  function xToLng(x, z) { return x / worldSize(z) * 360 - 180; }

  function yToLat(y, z) {
    var n = Math.PI - 2 * Math.PI * y / worldSize(z);
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  }

  function tileUrl(tpl, z, x, y) {
    return tpl.replace("{s}", (Math.abs(x + y) % 4) + 1)
      .replace("{x}", x).replace("{y}", y).replace("{z}", z);
  }

  /* ==========================================================================
     create(el, opt)
       opt.center [lng, lat] / opt.zoom / opt.minZoom / opt.maxZoom
       opt.onDraw(ctx, proj, z, vw, vh, dpr)  覆盖层回调，proj(lng,lat) → 屏幕 CSS px
       opt.onMove(lng, lat, z)                视野变化回调
     ========================================================================== */
  function create(el, opt) {
    opt = opt || {};
    var st = {
      lng: (opt.center && opt.center[0]) || 119.0,
      lat: (opt.center && opt.center[1]) || 35.75,
      z: opt.zoom || 9
    };
    var minZ = opt.minZoom || 6;
    var maxZ = opt.maxZoom || 14;
    var bounds = opt.bounds || null;   /* [minLng, minLat, maxLng, maxLat]，限制可去范围 */
    var focus = opt.focus || null;      /* 有内容的点：缩放后视野全空时自动贴过去 */
    var vw = 0, vh = 0, dpr = 1;
    var frame = 0, alive = true, moved = false;
    var tileEls = Object.create(null);
    var labEls = Object.create(null);
    var markers = [];

    /* 同一个容器被二次初始化时先收掉上一份，否则手势监听会叠成两套 */
    if (el.__tm) { try { el.__tm.destroy(); } catch (e) {} }

    var ac = w.AbortController ? new w.AbortController() : null;
    var sig = ac ? { signal: ac.signal } : false;

    el.classList.add("tm");
    el.innerHTML = '';
    var layer = document.createElement("div");
    layer.className = "tm-tiles";
    var cv = document.createElement("canvas");
    cv.className = "tm-canvas";
    var labs = document.createElement("div");
    labs.className = "tm-tiles tm-labs";
    var mk = document.createElement("div");
    mk.className = "tm-markers";
    var ctrl = document.createElement("div");
    ctrl.className = "tm-ctrl";
    ctrl.innerHTML = (opt.onLocate
        ? '<button type="button" data-tmz="loc" class="tm-loc" aria-label="回到我的位置">' +
          '<i></i></button>'
        : '') +
      '<button type="button" data-tmz="1" aria-label="放大">+</button>' +
      '<button type="button" data-tmz="-1" aria-label="缩小">−</button>';
    /* 我的位置：独立一层，不参与 setMarkers，视图切换时不会被清掉 */
    var meEl = document.createElement("div");
    meEl.className = "tm-me";
    meEl.innerHTML = "<i></i>";
    var me = null;
    var at = document.createElement("div");
    at.className = "tm-attrib";
    at.textContent = "© 高德地图";
    el.appendChild(layer);
    el.appendChild(cv);
    el.appendChild(labs);
    el.appendChild(mk);
    el.appendChild(meEl);
    el.appendChild(ctrl);
    el.appendChild(at);

    var ctx = cv.getContext("2d");

    function measure() {
      vw = el.clientWidth;
      vh = el.clientHeight;
      dpr = Math.min(2, w.devicePixelRatio || 1);
      if (!vw || !vh) return false;
      cv.width = Math.round(vw * dpr);
      cv.height = Math.round(vh * dpr);
      return true;
    }

    /* 把中心钳在 bounds 内：视口比范围大就居中，否则不许拖出界 */
    function clampCenter() {
      if (!bounds || !vw || !vh) return;
      var x0 = lngToX(bounds[0], st.z), x1 = lngToX(bounds[2], st.z);
      var y0 = latToY(bounds[3], st.z), y1 = latToY(bounds[1], st.z);
      var cx = lngToX(st.lng, st.z), cy = latToY(st.lat, st.z);
      cx = (x1 - x0 <= vw) ? (x0 + x1) / 2 : Math.max(x0 + vw / 2, Math.min(x1 - vw / 2, cx));
      cy = (y1 - y0 <= vh) ? (y0 + y1) / 2 : Math.max(y0 + vh / 2, Math.min(y1 - vh / 2, cy));
      st.lng = xToLng(cx, st.z);
      st.lat = yToLat(cy, st.z);
    }

    /* 当前视野：左上角的世界像素 + 投影函数 */
    function view() {
      var cx = lngToX(st.lng, st.z), cy = latToY(st.lat, st.z);
      var left = cx - vw / 2, top = cy - vh / 2;
      return {
        left: left, top: top,
        proj: function (lng, lat) {
          return [lngToX(lng, st.z) - left, latToY(lat, st.z) - top];
        }
      };
    }

    /* 通用瓦片铺贴：同一套逻辑跑两遍（底图 / 标注），各自维护 DOM 池 */
    function tilePass(container, store, tpl) {
      var v = view();
      var n = Math.pow(2, st.z);
      var x0 = Math.floor(v.left / TILE), x1 = Math.floor((v.left + vw) / TILE);
      var y0 = Math.floor(v.top / TILE), y1 = Math.floor((v.top + vh) / TILE);
      var keep = Object.create(null), i, j;

      for (j = y0; j <= y1; j++) {
        if (j < 0 || j >= n) continue;
        for (i = x0; i <= x1; i++) {
          var wx = ((i % n) + n) % n;
          var key = st.z + "/" + wx + "/" + j;
          keep[key] = 1;
          var img = store[key];
          if (!img) {
            img = document.createElement("img");
            img.className = "tm-tile";
            img.alt = "";
            img.decoding = "async";
            img.draggable = false;
            img.onload = function () { this.classList.add("on"); };
            img.src = tileUrl(tpl, st.z, wx, j);
            store[key] = img;
            container.appendChild(img);
          }
          img.style.transform = "translate(" + Math.round(i * TILE - v.left) + "px," +
            Math.round(j * TILE - v.top) + "px)";
        }
      }
      Object.keys(store).forEach(function (k) {
        if (!keep[k]) { container.removeChild(store[k]); delete store[k]; }
      });
    }

    function drawTiles() {
      tilePass(layer, tileEls, TPL);
      tilePass(labs, labEls, TPL_LABEL);
    }

    function drawOverlay() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      if (!opt.onDraw) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      opt.onDraw(ctx, view().proj, st.z, vw, vh, dpr);
      ctx.restore();
    }

    /* 镇挨得近时标签会叠成一坨：按主次排队占位，撞上的直接隐藏文字只留圆点 */
    function drawMarkers() {
      var v = view();
      if (me) {
        var mp = v.proj(me.lng, me.lat);
        meEl.style.transform = "translate(" + Math.round(mp[0]) + "px," + Math.round(mp[1]) + "px)";
        meEl.classList.add("on");
      } else {
        meEl.classList.remove("on");
      }
      var placed = [];
      var order = markers.map(function (m, i) { return i; }).sort(function (a, b) {
        return (markers[b].major ? 2 : 1) - (markers[a].major ? 2 : 1);
      });
      order.forEach(function (i) {
        var m = markers[i];
        var p = v.proj(m.lng, m.lat);
        m.el.style.transform = "translate(" + Math.round(p[0] + m.dx) + "px," +
          Math.round(p[1] + m.dy) + "px)";
        if (m._w == null) {
          var sp = m.el.querySelector("span");
          m._w = (sp && sp.offsetWidth) || 54;
        }
        var box = { x: p[0] + m.dx + 9, y: p[1] + m.dy - 10, w: m._w, h: 16 };
        var hit = placed.some(function (t) {
          return !(box.x + box.w < t.x || box.x > t.x + t.w ||
                   box.y + box.h < t.y || box.y > t.y + t.h);
        });
        if (hit) m.el.classList.add("nolab");
        else { m.el.classList.remove("nolab"); placed.push(box); }
      });
    }

    /* 重绘合并到一帧里；再挂一个看门狗 ——
       rAF 在后台标签页、被遮挡的 iframe 里会停摆，光靠它会让画面卡死在上一帧 */
    var watchdog = 0;
    function run() {
      frame = 0;
      if (watchdog) { w.clearTimeout(watchdog); watchdog = 0; }
      if (!alive || el.isConnected === false) { alive = false; return; }
      if (!measure()) return;
      clampCenter();
      drawTiles();
      drawOverlay();
      drawMarkers();
      if (opt.onMove) opt.onMove(st.lng, st.lat, st.z);
    }
    function schedule() {
      if (frame) return;
      frame = w.requestAnimationFrame(run);
      if (watchdog) w.clearTimeout(watchdog);
      watchdog = w.setTimeout(function () {
        watchdog = 0;
        if (frame) { frame = 0; run(); }
      }, 260);
    }

    /* ---------- 缩放 ---------- */
    function pointInView() {
      if (!focus || !focus.length || !vw) return true;
      var v = view();
      return focus.some(function (p) {
        var q = v.proj(p.lng, p.lat);
        return q[0] >= 0 && q[0] <= vw && q[1] >= 0 && q[1] <= vh;
      });
    }
    function snapToNearest() {
      if (!focus || !focus.length) return;
      var best = null, bd = Infinity;
      focus.forEach(function (p) {
        var d = (p.lng - st.lng) * (p.lng - st.lng) + (p.lat - st.lat) * (p.lat - st.lat);
        if (d < bd) { bd = d; best = p; }
      });
      if (best) { st.lng = best.lng; st.lat = best.lat; }
    }

    function setZoom(z, anchor) {
      var nz = Math.max(minZ, Math.min(maxZ, z));
      if (nz === st.z) return;
      /* 以锚点（手指/鼠标位置）为不动点缩放，否则会飘 */
      if (anchor && vw && vh) {
        var v = view();
        var lng = xToLng(v.left + anchor[0], st.z);
        var lat = yToLat(v.top + anchor[1], st.z);
        st.z = nz;
        var cx = lngToX(lng, nz) - (anchor[0] - vw / 2);
        var cy = latToY(lat, nz) - (anchor[1] - vh / 2);
        st.lng = xToLng(cx, nz);
        st.lat = yToLat(cy, nz);
      } else {
        st.z = nz;
      }
      /* 放大后视野可能落到几个镇中间的空地，一片纯色什么都看不到 —— 贴到最近的点 */
      if (!anchor && !pointInView()) snapToNearest();
      schedule();
    }

    function pan(dx, dy) {
      var cx = lngToX(st.lng, st.z) - dx;
      var cy = latToY(st.lat, st.z) - dy;
      st.lng = xToLng(cx, st.z);
      st.lat = yToLat(cy, st.z);
      schedule();
    }

    /* ---------- 手势：单指拖动 / 双指捏合 ---------- */
    var pts = Object.create(null), dragging = false, last = null, pinch = null;
    var downAt = null, movedFar = false;

    function local(e) {
      var r = el.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    }
    function count() { return Object.keys(pts).length; }
    function pinchDist() {
      var k = Object.keys(pts);
      if (k.length < 2) return 0;
      var a = pts[k[0]], b = pts[k[1]];
      return Math.hypot(a[0] - b[0], a[1] - b[1]);
    }
    function pinchMid() {
      var k = Object.keys(pts);
      var a = pts[k[0]], b = pts[k[1]];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    }

    el.addEventListener("pointerdown", function (e) {
      if (e.target.closest(".tm-ctrl") || e.target.closest(".tm-mk")) return;
      var p = local(e);
      pts[e.pointerId] = p;
      el.setPointerCapture && el.setPointerCapture(e.pointerId);
      if (count() === 1) {
        dragging = true; last = p; movedFar = false;
        downAt = p;
        el.classList.add("grabbing");
      } else if (count() === 2) {
        dragging = false;
        pinch = { d: pinchDist() };
      }
    }, sig || undefined);

    el.addEventListener("pointermove", function (e) {
      if (!pts[e.pointerId]) return;
      var p = local(e);
      pts[e.pointerId] = p;
      if (count() === 2 && pinch) {
        var d = pinchDist();
        if (pinch.d > 0) {
          var dz = Math.log2(d / pinch.d);
          if (Math.abs(dz) > 0.16) {
            setZoom(st.z + (dz > 0 ? 1 : -1), pinchMid());
            pinch.d = d;
          }
        }
        movedFar = true;
        return;
      }
      if (dragging && last) {
        var dx = p[0] - last[0], dy = p[1] - last[1];
        if (Math.abs(p[0] - downAt[0]) + Math.abs(p[1] - downAt[1]) > 6) movedFar = true;
        if (dx || dy) pan(dx, dy);
        last = p;
      }
    }, sig || undefined);

    function release(e) {
      if (!pts[e.pointerId]) return;
      delete pts[e.pointerId];
      if (count() < 2) pinch = null;
      if (count() === 0) { dragging = false; last = null; el.classList.remove("grabbing"); }
    }
    el.addEventListener("pointerup", release, sig || undefined);
    el.addEventListener("pointercancel", release, sig || undefined);

    el.addEventListener("wheel", function (e) {
      e.preventDefault();
      var p = local(e);
      setZoom(st.z + (e.deltaY > 0 ? -1 : 1), p);
    }, sig ? { passive: false, signal: ac.signal } : { passive: false });

    el.addEventListener("click", function (e) {
      var b = e.target.closest("[data-tmz]");
      if (b) {
        var act = b.getAttribute("data-tmz");
        if (act === "loc") {
          if (b.classList.contains("busy")) return;
          b.classList.add("busy");
          Promise.resolve(opt.onLocate()).then(function () {
            b.classList.remove("busy");
          }, function () { b.classList.remove("busy"); });
          return;
        }
        setZoom(st.z + Number(act));
        return;
      }
      var t = e.target.closest(".tm-mk");
      if (t && !movedFar) {
        var m = markers.filter(function (x) { return x.el === t; })[0];
        if (m && m.onClick) m.onClick(m);
      }
    }, sig || undefined);

    /* ---------- 标记 ---------- */
    function setMarkers(list) {
      while (mk.firstChild) mk.removeChild(mk.firstChild);
      markers = (list || []).map(function (m) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "tm-mk" + (m.major ? " major" : "") +
                      (m.state ? " " + m.state : "");
        b.innerHTML = '<i></i><span>' + m.label + "</span>";
        if (m.title) b.title = m.title;
        mk.appendChild(b);
        return { lng: m.lng, lat: m.lat, label: m.label, el: b, onClick: m.onClick,
                 data: m.data, major: !!m.major, dx: m.dx || 0, dy: m.dy || 0 };
      });
      schedule();
    }

    /* ---------- 视野 ---------- */
    function fitBounds(bb, pad) {
      if (!bb) return;
      pad = pad || 28;
      if (!measure()) return;
      var z = maxZ;
      for (; z > minZ; z--) {
        var x0 = lngToX(bb[0], z), x1 = lngToX(bb[2], z);
        var y0 = latToY(bb[3], z), y1 = latToY(bb[1], z);
        if (x1 - x0 <= vw - pad * 2 && y1 - y0 <= vh - pad * 2) break;
      }
      st.z = Math.max(minZ, Math.min(maxZ, z));
      st.lng = (bb[0] + bb[2]) / 2;
      st.lat = (bb[1] + bb[3]) / 2;
      schedule();
    }

    function resize() { if (measure()) schedule(); }

    var ro = w.ResizeObserver ? new w.ResizeObserver(resize) : null;
    if (ro) ro.observe(el);
    else w.addEventListener("resize", resize);

    /* 首帧万一容器还没宽度，补一次 */
    setTimeout(function () { if (measure()) schedule(); }, 60);

    var api = {
      setMarkers: setMarkers,
      fitBounds: fitBounds,
      resize: resize,
      zoom: function () { return st.z; },
      center: function () { return { lng: st.lng, lat: st.lat }; },
      zoomIn: function () { setZoom(st.z + 1); },
      /* 我的位置蓝点：null 收起 */
      setMe: function (pt) { me = pt || null; schedule(); },
      /* 视野飞过去（z 可选，不给就保持当前级别） */
      panTo: function (lng, lat, z) {
        if (z != null) st.z = Math.max(minZ, Math.min(maxZ, z));
        st.lng = lng; st.lat = lat;
        clampCenter(); schedule();
      },
      zoomOut: function () { setZoom(st.z - 1); },
      project: function (lng, lat) { return view().proj(lng, lat); },
      /* 当前视野覆盖的经纬度范围 [西, 南, 东, 北]，覆盖层用它保证「铺满」 */
      viewGeo: function () {
        var v = view();
        return [xToLng(v.left, st.z), yToLat(v.top + vh, st.z),
                xToLng(v.left + vw, st.z), yToLat(v.top, st.z)];
      },
      redraw: schedule,
      destroy: function () {
        alive = false;
        if (ac) { try { ac.abort(); } catch (e) {} }
        if (ro) ro.disconnect();
        if (frame) w.cancelAnimationFrame(frame);
        el.innerHTML = "";
        el.__tm = null;
      }
    };
    el.__tm = api;
    return api;
  }

  w.TILEMAP = {
    create: create,
    lngToX: lngToX, latToY: latToY, xToLng: xToLng, yToLat: yToLat
  };
})(window);
