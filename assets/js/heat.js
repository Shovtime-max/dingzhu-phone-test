/* ==========================================================================
   天气场（IDW 反距离加权 + 气温色带）—— 叠在真地图上的那一层
   --------------------------------------------------------------------------
   分工：
     · 密度场只算一次（跟缩放无关），存成一张离屏图；
     · 缩放/拖动时只做 drawImage + 重投影描边，不重算插值。

   三条硬坑（踩过，别再踩）：
     1. ctx.putImageData 不吃 ctx.clip()，要裁剪必须先画到离屏再 drawImage；
     2. 取 alpha 是 data[i+3]，写成 data[i] 会整张透明且不报错；
     3. 单点权重别太大，否则缓冲区 alpha 就裁到 255，各镇强弱差异全没了。
   ========================================================================== */
(function (w) {
  "use strict";

  var RAMP = [
    [0.00, [ 58,  76, 192]],
    [0.16, [ 47, 143, 216]],
    [0.32, [ 53, 194, 201]],
    [0.46, [126, 217,  87]],
    [0.60, [255, 225,  77]],
    [0.76, [255, 159,  46]],
    [0.90, [242,  65,  46]],
    [1.00, [179,  18,  26]]
  ];
  var POWER = 2.6;
  var GAMMA = 0.95;
  var RES = 340;          /* 密度场长边像素：够平滑，算得也快 */

  function mix(t) {
    if (!(t > 0)) return RAMP[0][1];
    if (t >= 1) return RAMP[RAMP.length - 1][1];
    for (var i = 0; i < RAMP.length - 1; i++) {
      var a = RAMP[i], b = RAMP[i + 1];
      if (t >= a[0] && t <= b[0]) {
        var k = (t - a[0]) / ((b[0] - a[0]) || 1);
        return [
          Math.round(a[1][0] + (b[1][0] - a[1][0]) * k),
          Math.round(a[1][1] + (b[1][1] - a[1][1]) * k),
          Math.round(a[1][2] + (b[1][2] - a[1][2]) * k)
        ];
      }
    }
    return RAMP[RAMP.length - 1][1];
  }

  /* 与 tilemap 共用同一套墨卡托换算，避免两处漂移 */
  function wX(lng) {
    var T = w.TILEMAP;
    return T ? T.lngToX(lng, 9) : (lng + 180) / 360 * 131072;
  }
  function wY(lat) {
    var T = w.TILEMAP;
    if (T) return T.latToY(lat, 9);
    var s = Math.sin(lat * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 131072;
  }

  /* ==========================================================================
     field(points, opt) → { canvas, bb, min, max, w, h }
       bb = [minLng, minLat, maxLng, maxLat]，密度图覆盖的地理范围
       opt.minSpanLng / opt.minSpanLat：保证场至少铺这么宽，调用方按当前视口给
       —— 场必须比视口大一圈，边缘才不会在屏幕上露出来
     ========================================================================== */
  function field(points, opt) {
    var list = (points || []).filter(function (p) {
      return p && isFinite(p.lat) && isFinite(p.lng) && p.v > 0;
    });
    if (!list.length) return null;

    var minLng = 1e9, maxLng = -1e9, minLat = 1e9, maxLat = -1e9;
    list.forEach(function (p) {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    });
    /* 场至少要有调用方指定的跨度（一般＝视口地理跨度×1.5），
       否则一缩放就会在屏幕边缘看到密度图的矩形边 */
    opt = opt || {};
    var needW = Math.max(opt.minSpanLng || 0, maxLng - minLng, 0.34);
    var needH = Math.max(opt.minSpanLat || 0, maxLat - minLat, 0.26);
    var cxLng = (minLng + maxLng) / 2, cxLat = (minLat + maxLat) / 2;
    minLng = cxLng - needW / 2; maxLng = cxLng + needW / 2;
    minLat = cxLat - needH / 2; maxLat = cxLat + needH / 2;

    /* 视野并进 bbox：放大到某个镇边上时，色场必须跟过去，否则屏幕一侧是空白 */
    if (opt.view) {
      minLng = Math.min(minLng, opt.view[0]);
      minLat = Math.min(minLat, opt.view[1]);
      maxLng = Math.max(maxLng, opt.view[2]);
      maxLat = Math.max(maxLat, opt.view[3]);
      var padW = (maxLng - minLng) * 0.16, padH = (maxLat - minLat) * 0.16;
      minLng -= padW; maxLng += padW; minLat -= padH; maxLat += padH;
    }
    var power = opt.power || POWER;

    var x0 = wX(minLng), x1 = wX(maxLng);
    var y0 = wY(maxLat), y1 = wY(minLat);
    var aspect = Math.abs(x1 - x0) / (Math.abs(y1 - y0) || 1e-9);
    var fw, fh;
    if (aspect >= 1) { fw = RES; fh = Math.max(40, Math.round(RES / aspect)); }
    else { fh = RES; fw = Math.max(40, Math.round(RES * aspect)); }

    var src = list.map(function (p) {
      return {
        x: (wX(p.lng) - x0) / (x1 - x0) * fw,
        y: (wY(p.lat) - y0) / (y1 - y0) * fh,
        v: p.v
      };
    });

    var data = new Float32Array(fw * fh);
    var min = 1e9, max = -1e9, i, j, k, n = src.length;
    for (j = 0; j < fh; j++) {
      for (i = 0; i < fw; i++) {
        var sw = 0, sv = 0;
        for (k = 0; k < n; k++) {
          var dx = i - src[k].x, dy = j - src[k].y;
          var wgt = 1 / Math.pow(dx * dx + dy * dy + 6, power / 2);
          sw += wgt; sv += wgt * src[k].v;
        }
        var v = sw ? sv / sw : 0;
        data[j * fw + i] = v;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (max - min < 1e-6) max = min + 1;

    var off = document.createElement("canvas");
    off.width = fw; off.height = fh;
    var oc = off.getContext("2d");
    var img = oc.createImageData(fw, fh);
    var edgeX = Math.max(1, Math.round(fw * 0.05));
    var edgeY = Math.max(1, Math.round(fh * 0.05));
    for (j = 0; j < fh; j++) {
      for (i = 0; i < fw; i++) {
        var idx = j * fw + i, o = idx * 4;
        var t = (data[idx] - min) / (max - min);
        t = Math.pow(t < 0 ? 0 : t > 1 ? 1 : t, GAMMA);
        var c = mix(t);
        /* 四周 14% 柔性淡出，避免看到密度图那条矩形边 */
        var ex = Math.min(i, fw - 1 - i) / edgeX;
        var ey = Math.min(j, fh - 1 - j) / edgeY;
        var fade = Math.min(1, Math.min(ex, ey));
        img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2];
        img.data[o + 3] = Math.round(fade * fade * 252);
      }
    }
    oc.putImageData(img, 0, 0);
    return { canvas: off, bb: [minLng, minLat, maxLng, maxLat], min: min, max: max,
             w: maxLng - minLng, h: maxLat - minLat };
  }

  /* 把密度图画到当前投影上；alpha 控制整体透明度，好让底图路网透出来 */
  function paint(ctx, layer, proj, alpha) {
    if (!layer) return;
    var p0 = proj(layer.bb[0], layer.bb[3]);
    var p1 = proj(layer.bb[2], layer.bb[1]);
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.82 : alpha;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(layer.canvas, 0, 0, layer.canvas.width, layer.canvas.height,
      p0[0], p0[1], p1[0] - p0[0], p1[1] - p0[1]);
    ctx.restore();
  }

  /* 轮廓 → Path2D（按当前投影重算，每帧 500 来个点，不吃力） */
  function pathOf(shapes, proj) {
    if (!shapes || !shapes.length) return null;
    var p = new Path2D();
    (shapes || []).forEach(function (s) {
      (s.rings || []).forEach(function (r) {
        if (r.length < 3) return;
        for (var i = 0; i < r.length; i++) {
          var q = proj(r[i][0], r[i][1]);
          if (i === 0) p.moveTo(q[0], q[1]); else p.lineTo(q[0], q[1]);
        }
        p.closePath();
      });
    });
    return p;
  }

  /* 区县描白边：让分布有个地理参照，不至于只是一坨颜色 */
  function strokeShapes(ctx, shapes, proj, dpr) {
    if (!shapes || !shapes.length) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,.72)";
    ctx.lineWidth = Math.max(0.8, 1.1 * (dpr || 1));
    (shapes || []).forEach(function (s) {
      (s.rings || []).forEach(function (r) {
        if (r.length < 3) return;
        ctx.beginPath();
        for (var i = 0; i < r.length; i++) {
          var q = proj(r[i][0], r[i][1]);
          if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]);
        }
        ctx.closePath();
        ctx.stroke();
      });
    });
    ctx.restore();
  }

  w.HEAT = { field: field, paint: paint, pathOf: pathOf, strokeShapes: strokeShapes, RAMP: RAMP };
})(window);
