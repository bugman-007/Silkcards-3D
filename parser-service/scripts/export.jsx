// C:\parser_service\scripts\export.jsx
#target illustrator
(function () {
  // ---------- tiny utils ----------
  function _isArray(a) {
    return Object.prototype.toString.call(a) === "[object Array]";
  }
  function _esc(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n");
  }
  function stringify(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "string") return '"' + _esc(v) + '"';
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (_isArray(v)) {
      var a = [];
      for (var i = 0; i < v.length; i++) a.push(stringify(v[i]));
      return "[" + a.join(",") + "]";
    }
    if (t === "object") {
      var a = [],
        k;
      for (k in v)
        if (v.hasOwnProperty(k) && typeof v[k] !== "undefined")
          a.push('"' + _esc(k) + '":' + stringify(v[k]));
      return "{" + a.join(",") + "}";
    }
    return "null";
  }
  function writeJSONFile(absPath, obj) {
    var f = new File(absPath);
    try {
      if (!f.parent.exists) f.parent.create();
    } catch (e) {}
    f.encoding = "UTF-8";
    f.open("w");
    f.write(stringify(obj));
    f.close();
  }
  function firstVisibleLayer(docX) {
    for (var i = 0; i < docX.layers.length; i++) {
      if (docX.layers[i].visible) return docX.layers[i];
    }
    return docX.layers[0];
  }
  function getenv(k) {
    try {
      return $.getenv(k) || "";
    } catch (e) {
      return "";
    }
  }
  function pt2mm(pt) {
    return (pt * 25.4) / 72.0;
  }
  function mm2pt(mm) {
    return (mm * 72.0) / 25.4;
  }

  // ---------- job IO ----------
  var inPath = "",
    outPath = "",
    jobId = "unknown";
  try {
    if (typeof __JOB !== "undefined" && __JOB && __JOB.input && __JOB.output) {
      inPath = String(__JOB.input);
      outPath = String(__JOB.output);
      jobId = (__JOB.job_id && String(__JOB.job_id)) || "unknown";
    }
  } catch (e) {}
  if (!inPath || !outPath) {
    inPath = getenv("INPUT_AI");
    outPath = getenv("OUTPUT_JSON");
    jobId = getenv("JOB_ID") || jobId;
  }
  if (!inPath || !outPath) throw new Error("Missing input/output path");
  var inFile = new File(inPath);
  if (!inFile.exists) throw new Error("Input file not found: " + inPath);

  // ---------- open safely ----------
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var doc = app.open(inFile);

  // ---------- helpers over Illustrator DOM ----------
  function boundsInfo(b) {
    return {
      x: mm2user(b[0]),
      y: mm2user(-b[1]),
      x2: mm2user(b[2]),
      y2: mm2user(-b[3]),
      w: mm2user(b[2] - b[0]),
      h: mm2user(b[1] - b[3]),
    };
  }
  function mm2user(pt) {
    return pt2mm(pt);
  } // keep output in mm for manifest

  function toLowerStr(obj) {
    return (obj == null ? "" : String(obj)).toLowerCase();
  }
  function classifySideFromName(name) {
    var s = toLowerStr(name);
    if (s.indexOf("front") >= 0) return "front";
    if (s.indexOf("back") >= 0) return "back";
    return null;
  }
  function classifyFinishFromName(name) {
    var s = toLowerStr(name);
    if (s.indexOf("_foil_") >= 0 || s.indexOf("foil") >= 0) return "foil";
    if (s.indexOf("spot_uv") >= 0 || s.indexOf("uv") >= 0) return "uv";
    if (
      s.indexOf("spot_uv") >= 0 ||
      s.indexOf("spotuv") >= 0 ||
      s.indexOf("spot-uv") >= 0 ||
      s.indexOf("uv") >= 0 ||
      s.indexOf("varnish") >= 0 ||
      s.indexOf("gloss") >= 0 ||
      s.indexOf("matte") >= 0 ||
      s.indexOf("lamination") >= 0 ||
      s.indexOf("raised_uv") >= 0
    )
      return "uv";
    if (s.indexOf("foil") >= 0) return "foil";
    if (s.indexOf("emboss") >= 0) return "emboss";
    if (s.indexOf("deboss") >= 0) return "deboss";
    if (
      s.indexOf("die_cut") >= 0 ||
      s.indexOf("diecut") >= 0 ||
      s.indexOf("die-cut") >= 0
    )
      return "die";
    return "print";
  }
  function pushItem(manifest, layerPath, it) {
    var b = it.geometricBounds; // [L,T,R,B] in pt
    var rec = {
      layerPath: layerPath.slice(0),
      name: it.name || "",
      typename: it.typename,
      visible: it.visible,
      locked: it.locked,
      clipping: !!it.clipping,
      bounds: {
        x: pt2mm(b[0]),
        y: pt2mm(-b[1]),
        x2: pt2mm(b[2]),
        y2: pt2mm(-b[3]),
        w: pt2mm(b[2] - b[0]),
        h: pt2mm(b[1] - b[3]),
      },
      opacity: it.opacity || 100,
    };
    var fin = classifyFinishFromName(layerPath[0] || "");
    rec.finish = fin;
    manifest.items.push(rec);
  }

  function crawl(manifest, container, layerPath) {
    // pageItems (include groups as items only if not exploring their children)
    for (var i = 0; i < container.pageItems.length; i++) {
      var it = container.pageItems[i];
      if (it.typename === "GroupItem") {
        var lp = layerPath.slice(0);
        lp.push(it.name || "Group");
        crawl(manifest, it, lp);
      } else {
        pushItem(manifest, layerPath, it);
      }
    }
    // sublayers
    if (container.layers) {
      for (var j = 0; j < container.layers.length; j++) {
        var sub = container.layers[j];
        var lp2 = layerPath.slice(0);
        lp2.push(sub.name || "Layer");
        crawl(manifest, sub, lp2);
      }
    }
  }

  // ---------- manifest base ----------
  function abInfo(ab) {
    return {
      name: ab.name,
      index: ab.index,
      bounds: (function (R) {
        return {
          x: pt2mm(R[0]),
          y: pt2mm(-R[1]),
          x2: pt2mm(R[2]),
          y2: pt2mm(-R[3]),
          w: pt2mm(R[2] - R[0]),
          h: pt2mm(R[1] - R[3]),
        };
      })(ab.artboardRect),
    };
  }
  var artboards = (function () {
    var arr = [],
      i;
    for (i = 0; i < doc.artboards.length; i++) {
      var ab = doc.artboards[i];
      ab.index = i;
      arr.push(abInfo(ab));
    }
    return arr;
  })();

  var manifest = {
    job_id: jobId,
    doc: {
      name: doc.name,
      fullName: doc.fullName ? String(doc.fullName.fsName || doc.fullName) : "",
      units: "mm",
      artboards: artboards,
    },
    items: [],
    maps: {}, // will be filled below
    geometry: {}, // per-side geometry/meta
  };

  // ---------- collect structure for export decisions ----------
  // Walk only top-level layers and sublayers; we rely on naming conventions at the top
  for (var L = 0; L < doc.layers.length; L++) {
    var layer = doc.layers[L];
    crawl(manifest, layer, [layer.name]);
  }

  // Build side buckets from items
  var buckets = {
    front: { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] },
    back: { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] },
  };
  var abRect =
    doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect; // [L,T,R,B] in pt
  var abCenterX = (abRect[0] + abRect[2]) / 2;

  function decideSide(rec) {
    var top = toLowerStr((rec.layerPath && rec.layerPath[0]) || "");
    var side = classifySideFromName(top);
    if (side) return side;

    var leftMm = rec.bounds.x; // mm
    var abRect =
      doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect; // pt
    var abCenterMm = pt2mm((abRect[0] + abRect[2]) / 2.0);
    return leftMm < abCenterMm ? "front" : "back";
  }

  // place recs into buckets
  for (var i = 0; i < manifest.items.length; i++) {
    var rec = manifest.items[i];
    var fin = rec.finish || "print";
    var side = decideSide(rec);
    if (!buckets[side])
      buckets[side] = {
        print: [],
        foil: [],
        uv: [],
        emboss: [],
        deboss: [],
        die: [],
      };
    if (fin === "foil") buckets[side].foil.push(rec);
    else if (fin === "uv") buckets[side].uv.push(rec);
    else if (fin === "emboss") buckets[side].emboss.push(rec);
    else if (fin === "deboss") buckets[side].deboss.push(rec);
    else if (fin === "die") buckets[side].die.push(rec);
    else buckets[side].print.push(rec);
  }

  function unionBoundsPt(list) {
    if (!list || list.length === 0) return null;
    var L = 1e9,
      T = -1e9,
      R = -1e9,
      B = 1e9;
    for (var k = 0; k < list.length; k++) {
      var b = list[k].bounds; // mm
      var l = mm2pt(b.x),
        t = -mm2pt(b.y),
        r = mm2pt(b.x2),
        btm = -mm2pt(b.y2);
      if (l < L) L = l;
      if (t > T) T = t;
      if (r > R) R = r;
      if (btm < B) B = btm;
    }
    return [L, T, R, B];
  }

  function pickCrop(sideBucket) {
    // Prefer print; else union of foil/uv/emboss/deboss; else die; else null
    var b = unionBoundsPt(sideBucket.print);
    if (!b)
      b = unionBoundsPt(
        [].concat(
          sideBucket.foil,
          sideBucket.uv,
          sideBucket.emboss,
          sideBucket.deboss
        )
      );
    if (!b) b = unionBoundsPt(sideBucket.die);
    return b; // [L,T,R,B] in pt or null
  }

  // ---------- export area ----------
  var outFile    = new File(outPath);
  var baseFolder = outFile.parent;
  var jobDir     = new Folder(baseFolder.fsName + "/assets/" + jobId);
  if (!jobDir.exists) jobDir.create();

function relPath(name) { return "assets/" + jobId + "/" + name; }
function absPath(name) { return jobDir.fsName + "/" + name; }


  function relPath(name) {
    return "assets/" + jobId + "/" + name;
  }
  function absPath(name) {
    return jobDir.fsName + "/" + name;
  }

  function pngExport(
    docToExport,
    fileAbsPath,
    scalePercent,
    transparent,
    clipToArtboard
  ) {
    var f = new File(fileAbsPath);
    var opt = new ExportOptionsPNG24();
    opt.antiAliasing = true;
    opt.transparency = !!transparent;
    opt.interlaced = false;
    opt.artBoardClipping = !!clipToArtboard;
    // upscale for effective DPI
    opt.horizontalScale = scalePercent;
    opt.verticalScale = scalePercent;
    docToExport.exportFile(f, ExportType.PNG24, opt);
  }
  function svgExport(docToExport, fileAbsPath) {
    var f = new File(fileAbsPath);
    var opt = new ExportOptionsSVG();
    opt.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
    opt.coordinatePrecision = 2;
    opt.embedRasterImages = true;
    docToExport.exportFile(f, ExportType.SVG, opt);
  }

  // Hide all layers except those whose top name contains tokens
  function keepOnly(docX, side, tokensArray) {
    var i;
    for (i = 0; i < docX.layers.length; i++) {
      var L = docX.layers[i];
      var top = toLowerStr(L.name);
      var matchSide = top.indexOf(side) >= 0; // 'front' or 'back'
      var matchToken = false;
      for (var t = 0; t < tokensArray.length; t++) {
        if (top.indexOf(tokensArray[t]) >= 0) {
          matchToken = true;
          break;
        }
      }
      L.visible = matchSide && matchToken;
    }
  }

  function addArtboard(docX, rectPt) {
    // rectPt must be [L, T, R, B] in pt, with L<R and T>B
    if (!rectPt || rectPt.length !== 4)
      throw new Error("addArtboard: bad rect");
    var L = Number(rectPt[0]),
      T = Number(rectPt[1]),
      R = Number(rectPt[2]),
      B = Number(rectPt[3]);

    if (!isFinite(L) || !isFinite(T) || !isFinite(R) || !isFinite(B)) {
      throw new Error("addArtboard: NaN/undefined in rect");
    }
    if (R <= L) R = L + 1; // pad 1pt to avoid zero/negative width
    if (T <= B) T = B + 1; // pad 1pt to avoid zero/negative height

    var newIdx = docX.artboards.length; // index of the artboard that will be added
    docX.artboards.add([L, T, R, B]);
    docX.artboards.setActiveArtboardIndex(newIdx);
  }

  // Only toggle what we touch; restore only those, coercing booleans safely.
  function withLayers(sideName, tokensArray, fn) {
    var changed = []; // [{layer, prevVisible, prevLocked}]
    try {
      for (var i = 0; i < doc.layers.length; i++) {
        var L = doc.layers[i];
        if (!L) continue;

        var top = (L.name || "").toLowerCase();
        // Empty sideName means "ignore side, just token-filter" (used for die-cut)
        var matchSide = sideName === "" ? true : top.indexOf(sideName) >= 0;
        var matchToken = false;
        for (var t = 0; t < tokensArray.length; t++) {
          var tk = String(tokensArray[t] || "").toLowerCase();
          if (tk && top.indexOf(tk) >= 0) {
            matchToken = true;
            break;
          }
        }
        var shouldBe = matchSide && matchToken;

        var prevVis = false,
          prevLock = false;
        try {
          prevVis = !!L.visible;
        } catch (_e1) {}
        try {
          prevLock = !!L.locked;
        } catch (_e2) {}

        // Record and unlock if needed
        changed.push({ layer: L, prevVisible: prevVis, prevLocked: prevLock });
        try {
          if (prevLock) L.locked = false;
        } catch (_e3) {}

        // Apply target visibility
        try {
          L.visible = shouldBe;
        } catch (_e4) {}
      }

      if (typeof fn === "function") fn();
    } catch (_outer) {
      // swallow; we still restore below
    } finally {
      for (var j = 0; j < changed.length; j++) {
        var ch = changed[j];
        if (!ch || !ch.layer) continue;
        try {
          ch.layer.visible = !!ch.prevVisible;
        } catch (_r1) {}
        try {
          ch.layer.locked = !!ch.prevLocked;
        } catch (_r2) {}
      }
    }
  }

  // build side package exporter
  function exportSide(sideName, sideBucket) {
    var crop = pickCrop(sideBucket);
    if (!crop) return null; // nothing to export on this side
    var leftPt = crop[0],
      topPt = crop[1],
      rightPt = crop[2],
      bottomPt = crop[3];

    var widthPt = rightPt - leftPt,
      heightPt = topPt - bottomPt;
    var dpi = 600;
    var scalePercent = (dpi / 72.0) * 100.0; // upscale on export
    var rel = {}; // relative asset paths written to manifest

    // ---- Albedo (always export if crop exists) ----
    // Show ONLY side layers that are NOT effects, regardless of buckets.
    // Save/restore both visibility and locked state to avoid cross-bleed.
    (function () {
      var changed = []; // [{layer, vis, lock}]
      try {
        for (var i = 0; i < doc.layers.length; i++) {
          var layer = doc.layers[i];
          if (!layer) continue;
          var nm = (layer.name || "").toLowerCase();
          var matchSide = nm.indexOf(sideName) >= 0;
          var isEffect =
            nm.indexOf("foil") >= 0 ||
            nm.indexOf("uv") >= 0 ||
            nm.indexOf("emboss") >= 0 ||
            nm.indexOf("deboss") >= 0 ||
            nm.indexOf("die") >= 0;

          var prevVis = false,
            prevLock = false;
          try {
            prevVis = !!layer.visible;
          } catch (_e1) {}
          try {
            prevLock = !!layer.locked;
          } catch (_e2) {}

          changed.push({ layer: layer, vis: prevVis, lock: prevLock });

          try {
            if (prevLock) layer.locked = false;
          } catch (_e3) {}
          try {
            layer.visible = matchSide && !isEffect;
          } catch (_e4) {}
        }

        addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
        pngExport(
          doc,
          absPath(sideName + "_albedo.png"),
          scalePercent,
          true,
          true
        );
        rel.albedo = relPath(sideName + "_albedo.png");
      } finally {
        for (var j = 0; j < changed.length; j++) {
          var ch = changed[j];
          try {
            ch.layer.visible = ch.vis;
          } catch (_r1) {}
          try {
            ch.layer.locked = ch.lock;
          } catch (_r2) {}
        }
      }
    })();

    // ---- Foil mask ----
    if (sideBucket.foil.length > 0) {
      withLayers(sideName, ["foil"], function () {
        addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
        // Export with transparency; viewer uses alpha as mask.
        pngExport(
          doc,
          absPath(sideName + "_foil.png"),
          scalePercent,
          true,
          true
        );
        rel.foil = relPath(sideName + "_foil.png");
      });
    }

    // ---- Spot UV mask ----
    if (sideBucket.uv.length > 0) {
      withLayers(
        sideName,
        ["uv", "spot_uv", "spot-uv", "spotuv", "spot"],
        function () {
          addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
          pngExport(
            doc,
            absPath(sideName + "_uv.png"),
            scalePercent,
            true,
            true
          );
          rel.uv = relPath(sideName + "_uv.png");
        }
      );
    }

    // ---- Emboss/Deboss height mask (monochrome) ----
    if (sideBucket.emboss.length > 0 || sideBucket.deboss.length > 0) {
      withLayers(sideName, ["emboss", "deboss"], function () {
        addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
        pngExport(
          doc,
          absPath(sideName + "_emboss.png"),
          scalePercent,
          true,
          true
        );
        rel.emboss = relPath(sideName + "_emboss.png");
      });
    }

    // ---- Die-cut SVG (across sides, export once later) ----

    // geometry meta
    var size_mm = { w: pt2mm(widthPt), h: pt2mm(heightPt) };
    var origin_mm = { x: pt2mm(leftPt), y: pt2mm(-topPt) }; // artboard origin within document (for reference)
    var px = {
      w: Math.round(widthPt * (dpi / 72.0)),
      h: Math.round(heightPt * (dpi / 72.0)),
    };

    return {
      maps: rel,
      geometry: { size_mm: size_mm, origin_mm: origin_mm, px: px, dpi: dpi },
    };
  }

  var frontPkg = exportSide("front", buckets.front);
  var backPkg = exportSide("back", buckets.back);

  if (frontPkg) {
    manifest.maps.front = frontPkg.maps;
    manifest.geometry.front = frontPkg.geometry;
  }
  if (backPkg) {
    manifest.maps.back = backPkg.maps;
    manifest.geometry.back = backPkg.geometry;
  }

  // ---- Die cut (single export if any side has die) ----
  if (
    (buckets.front.die && buckets.front.die.length) ||
    (buckets.back.die && buckets.back.die.length)
  ) {
    // crop region: prefer union of both crops if both exist, else whichever exists
    var cropForDie = null;
    if (frontPkg && backPkg) {
      var wpt = Math.max(
        mm2pt(frontPkg.geometry.size_mm.w),
        mm2pt(backPkg.geometry.size_mm.w)
      );
      var hpt = Math.max(
        mm2pt(frontPkg.geometry.size_mm.h),
        mm2pt(backPkg.geometry.size_mm.h)
      );
      var Ld = mm2pt(frontPkg.geometry.origin_mm.x),
        Td = -mm2pt(frontPkg.geometry.origin_mm.y);
      cropForDie = [Ld, Td, Ld + wpt, Td - hpt];
    } else if (frontPkg) {
      var Lf = mm2pt(frontPkg.geometry.origin_mm.x),
        Tf = -mm2pt(frontPkg.geometry.origin_mm.y);
      cropForDie = [
        Lf,
        Tf,
        Lf + mm2pt(frontPkg.geometry.size_mm.w),
        Tf - mm2pt(frontPkg.geometry.size_mm.h),
      ];
    } else if (backPkg) {
      var Lb = mm2pt(backPkg.geometry.origin_mm.x),
        Tb = -mm2pt(backPkg.geometry.origin_mm.y);
      cropForDie = [
        Lb,
        Tb,
        Lb + mm2pt(backPkg.geometry.size_mm.w),
        Tb - mm2pt(backPkg.geometry.size_mm.h),
      ];
    }

    // Show ANY top layer that contains a die token (ignore side)
    withLayers("", ["die", "die_cut", "die-cut", "diecut"], function () {
      if (cropForDie) addArtboard(doc, cropForDie);
      // ✅ write into the per-job dir and record the per-job relative path
      svgExport(doc, absPath("diecut.svg"));
      pngExport(doc, absPath("diecut_mask.png"), (600 / 72) * 100, true, true);

    });

    manifest.geometry.diecut_svg = relPath("diecut.svg");
    manifest.geometry.diecut_png = relPath("diecut_mask.png");
  }

  // ---------- write manifest ----------
  manifest.diagnostics = {
    front: {
      print: buckets.front.print.length,
      foil: buckets.front.foil.length,
      uv: buckets.front.uv.length,
      emboss: buckets.front.emboss.length,
      deboss: buckets.front.deboss.length,
      die: buckets.front.die.length,
    },
    back: {
      print: buckets.back.print.length,
      foil: buckets.back.foil.length,
      uv: buckets.back.uv.length,
      emboss: buckets.back.emboss.length,
      deboss: buckets.back.deboss.length,
      die: buckets.back.die.length,
    },
  };

  manifest.assets_rel_base = "assets/" + jobId + "/";
  manifest.v = 2;

  writeJSONFile(outPath, manifest);

  try {
    doc.close(SaveOptions.DONOTSAVECHANGES);
  } catch (e) {}
  // avoid sticky-state between jobs
  try {
    app.quit();
  } catch (e) {}
})();
