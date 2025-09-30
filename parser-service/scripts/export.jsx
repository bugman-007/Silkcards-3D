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
  function normalizeSelectionToWhite() {
    try {
      app.executeMenuCommand("expandStyle");
    } catch (e) {}
    var sel = app.selection;
    if (!sel || !sel.length) return;

    function paintDeep(node) {
      if (!node) return;
      try {
        node.stroked = false;
      } catch (_) {}
      try {
        node.filled = true;
        node.fillColor = white();
      } catch (_) {}

      if (node.typename === "GroupItem" && node.pageItems) {
        for (var k = 0; k < node.pageItems.length; k++)
          paintDeep(node.pageItems[k]);
      }
      if (node.typename === "CompoundPathItem" && node.pathItems) {
        for (var p = 0; p < node.pathItems.length; p++) {
          try {
            node.pathItems[p].stroked = false;
            node.pathItems[p].filled = true;
            node.pathItems[p].fillColor = white();
          } catch (_) {}
        }
      }
    }

    for (var i = 0; i < sel.length; i++) paintDeep(sel[i]);
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
  function white() {
    var c = new RGBColor();
    c.red = 255;
    c.green = 255;
    c.blue = 255;
    return c;
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
  function mm2user(pt) {
    return pt2mm(pt);
  } // keep output in mm for manifest

  function toLowerStr(obj) {
    return (obj == null ? "" : String(obj)).toLowerCase();
  }
  // Recursively set visibility for a layer and its descendants (sublayers & groups)
  function setVisibleDeep(container, v) {
    try {
      container.visible = v;
    } catch (e) {}
    // sublayers
    if (container.layers) {
      for (var i = 0; i < container.layers.length; i++) {
        try {
          setVisibleDeep(container.layers[i], v);
        } catch (_e1) {}
      }
    }
    // pageItems: unlock + unhide; also recurse into groups
    if (container.pageItems) {
      for (var j = 0; j < container.pageItems.length; j++) {
        var it = container.pageItems[j];
        try {
          if (typeof it.hidden !== "undefined") it.hidden = !v ? true : false;
        } catch (_e2) {}
        try {
          if (typeof it.locked !== "undefined") it.locked = false;
        } catch (_e3) {}
        if (it.typename === "GroupItem") {
          try {
            setVisibleDeep(it, v);
          } catch (_e4) {}
        }
      }
    }
  }
  function classifySideFromName(name) {
    var s = toLowerStr(name);
    if (s.indexOf("front") >= 0) return "front";
    if (s.indexOf("back") >= 0) return "back";
    return null;
  }
  function cardIndexFromTopName(top) {
    var m = /_(\d+)/.exec(String(top).toLowerCase());
    return m ? Number(m[1]) : 0; // default 0 if none
  }
  function cardPrefix(side, idx) {
    return side + "_layer_" + idx; // e.g. "front_layer_0"
  }
  function classifyFinishFromName(name) {
    var s = toLowerStr(name);
    // Die / cut lines first
    if (
      s.indexOf("laser_cut") >= 0 ||
      s.indexOf("laser-cut") >= 0 ||
      s.indexOf("laser") >= 0
    )
      return "die";
    if (s.indexOf("cutline") >= 0 || s.indexOf("cut_line") >= 0) return "die";
    if (
      s.indexOf("die_cut") >= 0 ||
      s.indexOf("diecut") >= 0 ||
      s.indexOf("die-cut") >= 0
    )
      return "die";

    // Effects
    if (s.indexOf("emboss") >= 0) return "emboss";
    if (s.indexOf("deboss") >= 0) return "deboss";
    if (s.indexOf("foil") >= 0 || s.indexOf("_foil_") >= 0) return "foil";
    if (
      s.indexOf("raised_uv") >= 0 ||
      s.indexOf("spot_uv") >= 0 ||
      s.indexOf("spot-uv") >= 0 ||
      s.indexOf("spotuv") >= 0 ||
      /(^|[_\-\s])uv([_\-\s]|$)/.test(s) ||
      s.indexOf("varnish") >= 0 ||
      s.indexOf("gloss") >= 0 ||
      s.indexOf("matte") >= 0 ||
      s.indexOf("lamination") >= 0
    )
      return "uv";

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
  var buckets = { front: {}, back: {} };

  function ensureCardBucket(side, idx) {
    if (!buckets[side][idx]) {
      buckets[side][idx] = {
        print: [],
        foil: [],
        uv: [],
        emboss: [],
        deboss: [],
        die: [],
      };
    }
    return buckets[side][idx];
  }

  var abRect =
    doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect; // [L,T,R,B] in pt

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
    var side = decideSide(rec);
    if (!buckets[side]) buckets[side] = {};

    var top = (rec.layerPath && rec.layerPath[0]) || "";
    var idx = cardIndexFromTopName(top);

    // finish type is decided from TOP layer name
    var fin = rec.finish || "print";

    // but still keep die explicitly.
    if (!rec.visible) {
      // keep for crop if it’s a likely geometry carrier
      if (!(fin === "die" || fin === "print" || fin === "uv" || fin === "foil"))
        continue;
    }

    var card = ensureCardBucket(side, idx);
    if (fin === "foil") card.foil.push(rec);
    else if (fin === "uv") card.uv.push(rec);
    else if (fin === "emboss") card.emboss.push(rec);
    else if (fin === "deboss") card.deboss.push(rec);
    else if (fin === "die") card.die.push(rec);
    else card.print.push(rec);
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

  function pickCrop(sideCardBucket) {
    // Prefer die → then print → then union of effects
    var b = unionBoundsPt(sideCardBucket.print);
    if (!b) {
      b = unionBoundsPt(
        [].concat(
          sideCardBucket.foil,
          sideCardBucket.uv,
          sideCardBucket.emboss,
          sideCardBucket.deboss
        )
      );
    }
    if (!b) {
      // last resort: active artboard
      var AB =
        doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect; // [L,T,R,B]
      b = [AB[0], AB[1], AB[2], AB[3]];
    }
    return b;
  }

  // ---------- export area ----------
  var outFile = new File(outPath);
  var baseFolder = outFile.parent;
  var assetsDir = new Folder(baseFolder.fsName + "/assets");
  if (!assetsDir.exists) assetsDir.create();
  var jobDir = new Folder(assetsDir.fsName + "/" + jobId);
  if (!jobDir.exists) jobDir.create();

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
          if (shouldBe) {
            setVisibleDeep(L, true);
          } else {
            try {
              L.visible = false;
            } catch (_e4) {}
          }
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

  // true if any TOP layer name contains any token (optionally also contains 'sideName')
  function topHasTokens(sideName, tokensArray) {
    for (var i = 0; i < doc.layers.length; i++) {
      var top = (doc.layers[i].name || "").toLowerCase();
      var matchSide = sideName === "" ? true : top.indexOf(sideName) >= 0;
      if (!matchSide) continue;
      for (var t = 0; t < tokensArray.length; t++) {
        var tk = String(tokensArray[t] || "").toLowerCase();
        if (tk && top.indexOf(tk) >= 0) return true;
      }
    }
    return false;
  }

  // Show ONLY this card's non-effect top layers (exclude foil/uv/emboss/deboss/die)
  function withCardNonEffects(pref, fn) {
    var exclude = [
      "_foil",
      "_spot_uv",
      "_spot-uv",
      "_uv",
      "_emboss",
      "_deboss",
      "_laser_cut",
      "_laser-cut",
      "_die",
      "_die_cut",
      "_die-cut",
      "_diecut",
      "_cutline",
      "_cut_line",
    ];
    var changed = [];
    try {
      for (var i = 0; i < doc.layers.length; i++) {
        var L = doc.layers[i];
        if (!L) continue;
        var nm = (L.name || "").toLowerCase();
        var isCard = nm.indexOf(pref) >= 0;
        var isExcluded = false;
        for (var e = 0; e < exclude.length; e++) {
          if (nm.indexOf(pref + exclude[e]) >= 0) {
            isExcluded = true;
            break;
          }
        }
        var vis0 = !!L.visible,
          lock0 = !!L.locked;
        changed.push({ L: L, vis0: vis0, lock0: lock0 });
        try {
          if (lock0) L.locked = false;
        } catch (_) {}
        try {
          if (isCard && !isExcluded) {
            setVisibleDeep(L, true);
          } else {
            try {
              L.visible = false;
            } catch (_e) {}
          }
        } catch (_) {}
      }
      if (typeof fn === "function") fn();
    } finally {
      for (var j = 0; j < changed.length; j++) {
        var c = changed[j];
        try {
          c.L.visible = c.vis0;
        } catch (_) {}
        try {
          c.L.locked = c.lock0;
        } catch (_) {}
      }
    }
  }

  // ---------- per-card exporter (replaces exportSide) ----------
  function exportCard(sideName, idx, cardBucket) {
    var crop = pickCrop(cardBucket);
    if (!crop) return null;

    var leftPt = crop[0],
      topPt = crop[1],
      rightPt = crop[2],
      bottomPt = crop[3];
    var widthPt = rightPt - leftPt,
      heightPt = topPt - bottomPt;

    var dpi = 600;
    var scalePercent = (dpi / 72.0) * 100.0;

    var rel = {};
    var pref = cardPrefix(sideName, Number(idx)); // e.g. "front_layer_0"

    // ---- Albedo (print) ----
    var printTokens = [
      pref + "_print",
      pref + "_front_print",
      pref + "_back_print",
    ];

    // Export all non-effect layers for this card prefix (robust to naming)
    withCardNonEffects(pref, function () {
      addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
      pngExport(doc, absPath(pref + "_albedo.png"), scalePercent, true, true);
      rel.albedo = relPath(pref + "_albedo.png");
    });

    // ---- Foil ----
    if (cardBucket.foil.length > 0) {
      withLayers("", [pref + "_foil"], function () {
        // Same artboard/crop for both exports
        addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);

        // A) COLOR: export the visible foil art as-is (keeps designer colors)
        app.executeMenuCommand("deselectall");
        app.executeMenuCommand("selectall");
        pngExport(
          doc,
          absPath(pref + "_foil_color.png"),
          scalePercent,
          true,
          true
        );

        // B) MASK: whiten selection, export white-on-transparent mask
        app.executeMenuCommand("deselectall");
        app.executeMenuCommand("selectall");
        normalizeSelectionToWhite();
        pngExport(doc, absPath(pref + "_foil.png"), scalePercent, true, true);

        // Manifest paths
        rel.foil = relPath(pref + "_foil.png"); // mask
        rel.foil_color = relPath(pref + "_foil_color.png"); // color
      });
    }
    // ---- Spot UV ----
    if (cardBucket.uv.length > 0) {
      withLayers(
        "",
        [pref + "_spot_uv", pref + "_spot-uv", pref + "_uv"],
        function () {
          addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
          app.executeMenuCommand("deselectall");
          app.executeMenuCommand("selectall");
          normalizeSelectionToWhite();
          pngExport(doc, absPath(pref + "_uv.png"), scalePercent, true, true);
          rel.uv = relPath(pref + "_uv.png");
        }
      );
    }

    // ---- Emboss/Deboss ----
    if (cardBucket.emboss.length > 0 || cardBucket.deboss.length > 0) {
      withLayers("", [pref + "_emboss", pref + "_deboss"], function () {
        addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);
        app.executeMenuCommand("deselectall");
        app.executeMenuCommand("selectall");
        normalizeSelectionToWhite();
        pngExport(doc, absPath(pref + "_emboss.png"), scalePercent, true, true);
        rel.emboss = relPath(pref + "_emboss.png");
      });
    }

    // ---- Die-cut (svg + mask png) ----
    // ---- Die-cut (svg + mask png) ----
    if (cardBucket.die.length > 0) {
      withLayers(
        "",
        [
          pref + "_laser_cut",
          pref + "_laser-cut",
          pref + "_die",
          pref + "_die_cut",
          pref + "_die-cut",
          pref + "_diecut",
          pref + "_cutline",
          pref + "_cut_line",
        ],
        function () {
          addArtboard(doc, [leftPt, topPt, rightPt, bottomPt]);

          // 1) SVG export of the visible die art
          svgExport(doc, absPath(pref + "_diecut.svg"));

          // 2) Build the white-on-transparent mask on the same canvas
          app.executeMenuCommand("deselectall");
          app.executeMenuCommand("selectall");
          try {
            app.executeMenuCommand("expandStyle");
          } catch (e) {}
          normalizeSelectionToWhite();

          // CRITICAL FIX: Always export PNG mask with proper naming
          pngExport(
            doc,
            absPath(pref + "_diecut_mask.png"),
            scalePercent,
            true,
            true
          );

          // 3) Set BOTH SVG and PNG in manifest - frontend prefers PNG
          rel.die_svg = relPath(pref + "_diecut.svg");
          rel.die_png = relPath(pref + "_diecut_mask.png"); // This is what frontend needs

          console.log("Die-cut exports:", {
            svg: rel.die_svg,
            png: rel.die_png,
            card: pref,
          });
        }
      );
    }

    var size_mm = { w: pt2mm(widthPt), h: pt2mm(heightPt) };
    var origin_mm = { x: pt2mm(leftPt), y: pt2mm(-topPt) };
    var px = {
      w: Math.round(widthPt * (dpi / 72.0)),
      h: Math.round(heightPt * (dpi / 72.0)),
    };

    return {
      index: Number(idx),
      maps: rel,
      geometry: { size_mm: size_mm, origin_mm: origin_mm, px: px, dpi: dpi },
    };
  }

  function exportCards(sideName, sideBucketByIdx) {
    var out = [];
    for (var k in sideBucketByIdx) {
      if (!sideBucketByIdx.hasOwnProperty(k)) continue;
      var pkg = exportCard(sideName, k, sideBucketByIdx[k]);
      if (pkg) out.push(pkg);
    }
    out.sort(function (a, b) {
      return a.index - b.index;
    });
    return out;
  }

  // run per side
  var frontCards = exportCards("front", buckets.front);
  var backCards = exportCards("back", buckets.back);

  if (frontCards.length) {
    manifest.maps.front = frontCards[0].maps;
    manifest.geometry.front = frontCards[0].geometry;
  }
  if (backCards.length) {
    manifest.maps.back = backCards[0].maps;
    manifest.geometry.back = backCards[0].geometry;
  }

  // ---------- write manifest ----------
  manifest.maps.front_cards = [];
  manifest.geometry.front_cards = [];
  for (var iF = 0; iF < frontCards.length; iF++) {
    manifest.maps.front_cards.push({
      index: frontCards[iF].index,
      maps: frontCards[iF].maps,
    });
    manifest.geometry.front_cards.push({
      index: frontCards[iF].index,
      meta: frontCards[iF].geometry,
    });
  }
  manifest.maps.back_cards = [];
  manifest.geometry.back_cards = [];
  for (var iB = 0; iB < backCards.length; iB++) {
    manifest.maps.back_cards.push({
      index: backCards[iB].index,
      maps: backCards[iB].maps,
    });
    manifest.geometry.back_cards.push({
      index: backCards[iB].index,
      meta: backCards[iB].geometry,
    });
  }

  // Back-compat: if only one card on a side, also publish legacy fields
  if (frontCards.length) {
    manifest.maps.front = frontCards[0].maps;
    manifest.geometry.front = frontCards[0].geometry;
  }
  if (backCards.length) {
    manifest.maps.back = backCards[0].maps;
    manifest.geometry.back = backCards[0].geometry;
  }

  // Diagnostics (summed over cards)
  function summarize(sideBuckets) {
    var sum = { print: 0, foil: 0, uv: 0, emboss: 0, deboss: 0, die: 0 };
    for (var k in sideBuckets)
      if (sideBuckets.hasOwnProperty(k)) {
        var b = sideBuckets[k];
        sum.print += b.print.length;
        sum.foil += b.foil.length;
        sum.uv += b.uv.length;
        sum.emboss += b.emboss.length;
        sum.deboss += b.deboss.length;
        sum.die += b.die.length;
      }
    return sum;
  }
  manifest.diagnostics = {
    front: summarize(buckets.front),
    back: summarize(buckets.back),
  };

  manifest.assets_rel_base = "assets/" + jobId + "/";
  manifest.v = 3;

  writeJSONFile(outPath, manifest);

  try {
    doc.close(SaveOptions.DONOTSAVECHANGES);
  } catch (e) {}
  // avoid sticky-state between jobs
  try {
    app.quit();
  } catch (e) {}
})();
