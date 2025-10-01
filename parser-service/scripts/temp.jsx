////////
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

  // ---------- IMPROVED: Unified White Function ----------
  function getWhiteColor() {
    var c = new RGBColor();
    c.red = 255;
    c.green = 255;
    c.blue = 255;
    return c;
  }

  // ---------- IMPROVED: Safe Selection Management ----------
  function safeSelectAll() {
    try {
      app.executeMenuCommand("deselectall");
      $.sleep(50);
      app.executeMenuCommand("selectall");
      $.sleep(50);
      return app.activeDocument.selection && app.activeDocument.selection.length > 0;
    } catch (error) {
      $.writeln("Selection error: " + error);
      return false;
    }
  }

  // ---------- IMPROVED: Iterative White Normalization ----------
  function normalizeSelectionToWhite() {
    try {
      var sel = app.activeDocument.selection;
      if (!sel || sel.length === 0) {
        $.writeln("No selection to normalize");
        return;
      }
      
      var whiteColor = getWhiteColor();
      var processedCount = 0;
      var processStack = sel.slice();
      
      while (processStack.length > 0) {
        var item = processStack.pop();
        if (!item) continue;
        
        try {
          if ("stroked" in item) {
            item.stroked = false;
          }
          if ("filled" in item) {
            item.filled = true;
            item.fillColor = whiteColor;
            processedCount++;
          }
        } catch(itemError) {
          $.writeln("Item processing error: " + itemError);
        }
        
        if (item.typename === "GroupItem" && item.pageItems) {
          for (var i = 0; i < item.pageItems.length; i++) {
            processStack.push(item.pageItems[i]);
          }
        }
        
        if (item.typename === "CompoundPathItem" && item.pathItems) {
          for (var j = 0; j < item.pathItems.length; j++) {
            processStack.push(item.pathItems[j]);
          }
        }
      }
      
      $.writeln("Normalized " + processedCount + " items to white");
      
    } catch (error) {
      $.writeln("White normalization error: " + error);
    }
  }

  // ---------- IMPROVED: Safe Artboard Management ----------
  function withTemporaryArtboard(rectPt, fn) {
    var originalArtboardIndex = doc.artboards.getActiveArtboardIndex();
    var newArtboardIndex = -1;
    
    try {
      if (!rectPt || rectPt.length !== 4) {
        throw new Error("Invalid artboard rectangle");
      }
      
      var L = Number(rectPt[0]), T = Number(rectPt[1]), 
          R = Number(rectPt[2]), B = Number(rectPt[3]);
          
      if (!isFinite(L) || !isFinite(T) || !isFinite(R) || !isFinite(B)) {
        throw new Error("Artboard coordinates must be finite numbers");
      }
      
      if (R <= L) R = L + 10;
      if (T <= B) T = B + 10;
      
      newArtboardIndex = doc.artboards.length;
      doc.artboards.add([L, T, R, B]);
      doc.artboards.setActiveArtboardIndex(newArtboardIndex);
      
      if (typeof fn === "function") {
        fn();
      }
      
    } catch (error) {
      $.writeln("Artboard error: " + error);
      throw error;
    } finally {
      try {
        if (newArtboardIndex !== -1 && doc.artboards.length > newArtboardIndex) {
          doc.artboards.remove(newArtboardIndex);
        }
        if (originalArtboardIndex >= 0 && originalArtboardIndex < doc.artboards.length) {
          doc.artboards.setActiveArtboardIndex(originalArtboardIndex);
        }
      } catch (cleanupError) {
        $.writeln("Artboard cleanup error: " + cleanupError);
      }
    }
  }

  // ---------- IMPROVED: Iterative Layer Isolation ----------
  function withIsolatedLayers(tokensArray, fn) {
    var originalStates = [];
    var visitedElements = new Set();
    
    try {
      // Phase 1: Collect all layers and save states (ITERATIVE)
      var stack = [];
      for (var i = 0; i < doc.layers.length; i++) {
        stack.push(doc.layers[i]);
      }
      
      while (stack.length > 0) {
        var container = stack.pop();
        if (!container || visitedElements.has(container)) continue;
        
        visitedElements.add(container);
        
        originalStates.push({
          element: container,
          visible: !!container.visible,
          locked: !!container.locked
        });
        
        try { 
          if (container.locked) container.locked = false; 
          container.visible = false;
        } catch(e) {}
        
        if (container.layers) {
          for (var j = 0; j < container.layers.length; j++) {
            stack.push(container.layers[j]);
          }
        }
      }
      
      // Phase 2: Find and show matching layers (ITERATIVE)
      var showStack = [];
      for (var k = 0; k < doc.layers.length; k++) {
        showStack.push({container: doc.layers[k], path: [doc.layers[k].name]});
      }
      
      var layersToShow = [];
      
      while (showStack.length > 0) {
        var item = showStack.pop();
        var container = item.container;
        var path = item.path;
        
        if (!container || visitedElements.has(container)) continue;
        
        var containerName = (container.name || "").toLowerCase();
        
        var hasToken = false;
        for (var t = 0; t < tokensArray.length; t++) {
          var token = String(tokensArray[t] || "").toLowerCase();
          if (token && containerName.indexOf(token) >= 0) {
            hasToken = true;
            break;
          }
        }
        
        if (hasToken) {
          layersToShow.push(container);
        }
        
        if (container.layers) {
          for (var l = 0; l < container.layers.length; l++) {
            var newPath = path.slice();
            newPath.push(container.layers[l].name || "");
            showStack.push({
              container: container.layers[l], 
              path: newPath
            });
          }
        }
      }
      
      // Show matching layers and their hierarchy
      for (var m = 0; m < layersToShow.length; m++) {
        var layerToShow = layersToShow[m];
        var current = layerToShow;
        
        var shownElements = new Set();
        while (current && !shownElements.has(current)) {
          shownElements.add(current);
          try { 
            current.visible = true; 
          } catch(e) {}
          current = current.parent;
        }
      }
      
      app.redraw();
      
      if (typeof fn === "function") {
        fn();
      }
      
    } catch (error) {
      $.writeln("Layer isolation error: " + error);
      throw error;
    } finally {
      for (var n = 0; n < originalStates.length; n++) {
        var state = originalStates[n];
        try {
          if (state.element && typeof state.element.visible !== "undefined") {
            state.element.visible = state.visible;
          }
          if (state.element && typeof state.element.locked !== "undefined") {
            state.element.locked = state.locked;
          }
        } catch(restoreError) {
          $.writeln("Restore error for element: " + restoreError);
        }
      }
      app.redraw();
    }
  }

  // ---------- IMPROVED: Safe Finish Effect Processing ----------
  function processFinishMask(finishType) {
    var originalSelection = [];
    
    try {
      if (app.activeDocument.selection) {
        for (var i = 0; i < app.activeDocument.selection.length; i++) {
          originalSelection.push(app.activeDocument.selection[i]);
        }
      }
      
      if (!safeSelectAll()) {
        $.writeln("No elements selected for " + finishType + " processing");
        return;
      }
      
      if (app.activeDocument.selection.length === 0) {
        $.writeln("No visible elements found for " + finishType);
        return;
      }
      
      switch (finishType) {
        case "foil":
        case "uv":
          try { 
            app.executeMenuCommand("expandStyle"); 
            $.sleep(30);
          } catch(e) {
            $.writeln("Expand style failed: " + e);
          }
          break;
          
        case "emboss":
        case "deboss":
          try { 
            app.executeMenuCommand("expandStyle");
            $.sleep(30);
            app.executeMenuCommand("outline");
            $.sleep(30);
          } catch(e) {
            $.writeln("Emboss processing failed: " + e);
          }
          break;
      }
      
      normalizeSelectionToWhite();
      app.redraw();
      
    } catch (error) {
      $.writeln("Finish mask processing error: " + error);
    } finally {
      try {
        if (originalSelection.length > 0) {
          app.activeDocument.selection = originalSelection;
        } else {
          app.executeMenuCommand("deselectall");
        }
      } catch(restoreError) {
        $.writeln("Selection restore error: " + restoreError);
      }
    }
  }

  // --- helpers for robust die mask export ---
  function _try(cmd) {
    try {
      app.executeMenuCommand(cmd);
    } catch (e) {}
  }

  function _boundsOK(b) {
    if (!b || b.length !== 4) return false;
    const w = Math.abs(b[2] - b[0]);
    const h = Math.abs(b[1] - b[3]);
    return w > 0.5 && h > 0.5;
  }

  /**
   * Build a FILLED cut-out (white keep / transparent hole) from current die art.
   * Works for stroke-only shapes (including curves): outline → unite → subtract.
   */
  function buildFilledDieMaskOnArtboard(doc, leftPt, topPt, rightPt, bottomPt) {
    _try("deselectall");
    _try("selectall");
    app.redraw();

    _try("expandStyle");
    _try("outline");
    app.redraw();

    _try("Live Pathfinder Unite");
    _try("expandStyle");
    app.redraw();

    var rect = doc.pathItems.rectangle(
      topPt,
      leftPt,
      rightPt - leftPt,
      topPt - bottomPt
    );
    rect.stroked = false;
    rect.filled = true;
    rect.fillColor = getWhiteColor();
    rect.move(doc, ElementPlacement.PLACEATBEGINNING);

    _try("deselectall");
    _try("selectall");
    _try("Live Pathfinder Subtract");
    _try("expandStyle");
    app.redraw();

    _try("deselectall");
    _try("selectall");
    normalizeSelectionToWhite();
    app.redraw();

    if (
      !app.activeDocument.selection ||
      app.activeDocument.selection.length === 0 ||
      !_boundsOK(app.activeDocument.selection[0].geometricBounds)
    ) {
      _try("deselectall");
      var fallback = doc.pathItems.rectangle(
        topPt,
        leftPt,
        rightPt - leftPt,
        topPt - bottomPt
      );
      fallback.stroked = false;
      fallback.filled = true;
      fallback.fillColor = getWhiteColor();
      app.activeDocument.selection = [fallback];
      app.redraw();
    }
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
  }

  function toLowerStr(obj) {
    return (obj == null ? "" : String(obj)).toLowerCase();
  }

  function setVisibleDeep(container, v) {
    try {
      container.visible = v;
    } catch (e) {}

    if (container.layers) {
      for (var i = 0; i < container.layers.length; i++) {
        try {
          setVisibleDeep(container.layers[i], v);
        } catch (_e1) {}
      }
    }

    if (container.pageItems) {
      for (var j = 0; j < container.pageItems.length; j++) {
        var it = container.pageItems[j];
        try {
          if (typeof it.hidden !== "undefined") it.hidden = !v;
        } catch (_e2) {}
        try {
          if (typeof it.locked !== "undefined") it.locked = false;
        } catch (_e3) {}

        if (it.typename === "GroupItem") {
          try {
            setVisibleDeep(it, v);
          } catch (_e4) {}
        }
        if (it.typename === "CompoundPathItem" && it.pathItems) {
          for (var p = 0; p < it.pathItems.length; p++) {
            try {
              if (typeof it.pathItems[p].hidden !== "undefined")
                it.pathItems[p].hidden = !v;
            } catch (_e5) {}
          }
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
    return m ? Number(m[1]) : 0;
  }

  function cardPrefix(side, idx) {
    return side + "_layer_" + idx;
  }

  function classifyFinishFromName(name) {
    var s = toLowerStr(name);
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
    var b = it.geometricBounds;
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
    maps: {},
    geometry: {},
  };

  // ---------- collect structure for export decisions ----------
  for (var L = 0; L < doc.layers.length; L++) {
    var layer = doc.layers[L];
    crawl(manifest, layer, [layer.name]);
  }

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
    doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;

  function decideSide(rec) {
    var top = toLowerStr((rec.layerPath && rec.layerPath[0]) || "");
    var side = classifySideFromName(top);
    if (side) return side;

    var leftMm = rec.bounds.x;
    var abRect =
      doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
    var abCenterMm = pt2mm((abRect[0] + abRect[2]) / 2.0);
    return leftMm < abCenterMm ? "front" : "back";
  }

  for (var i = 0; i < manifest.items.length; i++) {
    var rec = manifest.items[i];
    var side = decideSide(rec);
    if (!buckets[side]) buckets[side] = {};

    var top = (rec.layerPath && rec.layerPath[0]) || "";
    var idx = cardIndexFromTopName(top);

    var fin = rec.finish || "print";

    if (!rec.visible) {
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
      var b = list[k].bounds;
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
      var AB =
        doc.artboards[doc.artboards.getActiveArtboardIndex()].artboardRect;
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

  // ---------- IMPROVED: Safe PNG Export ----------
  function safePngExport(filePath, scalePercent, transparent, clipToArtboard) {
    try {
      var f = new File(filePath);
      if (f.exists) f.remove();
      
      var opt = new ExportOptionsPNG24();
      opt.antiAliasing = true;
      opt.transparency = !!transparent;
      opt.interlaced = false;
      opt.artBoardClipping = !!clipToArtboard;
      opt.horizontalScale = scalePercent;
      opt.verticalScale = scalePercent;
      
      doc.exportFile(f, ExportType.PNG24, opt);
      
      $.sleep(100);
      if (f.exists) {
        $.writeln("Successfully exported: " + filePath);
        return true;
      } else {
        $.writeln("Failed to export: " + filePath);
        return false;
      }
    } catch (error) {
      $.writeln("PNG export error: " + error);
      return false;
    }
  }

  function svgExport(docToExport, fileAbsPath) {
    var f = new File(fileAbsPath);
    var opt = new ExportOptionsSVG();
    opt.fontSubsetting = SVGFontSubsetting.GLYPHSUSED;
    opt.coordinatePrecision = 2;
    opt.embedRasterImages = true;
    docToExport.exportFile(f, ExportType.SVG, opt);
  }

  // Show ONLY this card's non-effect top layers
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

  // ---------- IMPROVED: Export Card Function ----------
  function exportCard(sideName, idx, cardBucket) {
    var crop = pickCrop(cardBucket);
    if (!crop) {
      $.writeln("No crop bounds for " + sideName + " card " + idx);
      return null;
    }

    var leftPt = crop[0], topPt = crop[1], rightPt = crop[2], bottomPt = crop[3];
    
    if (rightPt <= leftPt || topPt <= bottomPt) {
      $.writeln("Invalid crop bounds for " + sideName + " card " + idx);
      return null;
    }

    var dpi = 600;
    var scalePercent = (dpi / 72.0) * 100.0;
    var rel = {};
    var pref = cardPrefix(sideName, Number(idx));

    try {
      // ---- Albedo (print) ----
      withCardNonEffects(pref, function() {
        withTemporaryArtboard([leftPt, topPt, rightPt, bottomPt], function() {
          if (safePngExport(absPath(pref + "_albedo.png"), scalePercent, true, true)) {
            rel.albedo = relPath(pref + "_albedo.png");
          }
        });
      });

      // ---- Foil ----
      if (cardBucket.foil.length > 0) {
        withIsolatedLayers([pref + "_foil"], function() {
          withTemporaryArtboard([leftPt, topPt, rightPt, bottomPt], function() {
            if (safeSelectAll()) {
              safePngExport(absPath(pref + "_foil_color.png"), scalePercent, true, true);
            }
            
            processFinishMask("foil");
            if (safePngExport(absPath(pref + "_foil.png"), scalePercent, true, true)) {
              rel.foil = relPath(pref + "_foil.png");
              rel.foil_color = relPath(pref + "_foil_color.png");
            }
          });
        });
      }

      // ---- UV ----
      if (cardBucket.uv.length > 0) {
        withIsolatedLayers(
          [pref + "_spot_uv", pref + "_spot-uv", pref + "_uv"],
          function() {
            withTemporaryArtboard([leftPt, topPt, rightPt, bottomPt], function() {
              processFinishMask("uv");
              if (safePngExport(absPath(pref + "_uv.png"), scalePercent, true, true)) {
                rel.uv = relPath(pref + "_uv.png");
              }
            });
          }
        );
      }

      // ---- Emboss/Deboss ----
      if (cardBucket.emboss.length > 0 || cardBucket.deboss.length > 0) {
        withIsolatedLayers([pref + "_emboss", pref + "_deboss"], function() {
          withTemporaryArtboard([leftPt, topPt, rightPt, bottomPt], function() {
            processFinishMask("emboss");
            if (safePngExport(absPath(pref + "_emboss.png"), scalePercent, true, true)) {
              rel.emboss = relPath(pref + "_emboss.png");
            }
          });
        });
      }

      // ---- Die-cut ----
      if (cardBucket.die.length > 0) {
        withIsolatedLayers(
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
          function() {
            withTemporaryArtboard([leftPt, topPt, rightPt, bottomPt], function() {
              svgExport(doc, absPath(pref + "_diecut.svg"));
              buildFilledDieMaskOnArtboard(doc, leftPt, topPt, rightPt, bottomPt);
              if (safePngExport(absPath(pref + "_diecut_mask.png"), scalePercent, true, true)) {
                rel.die_svg = relPath(pref + "_diecut.svg");
                rel.die_png = relPath(pref + "_diecut_mask.png");
              }
            });
          }
        );
      }

    } catch (error) {
      $.writeln("Export card error for " + pref + ": " + error);
    }

    var size_mm = { w: pt2mm(rightPt - leftPt), h: pt2mm(topPt - bottomPt) };
    var origin_mm = { x: pt2mm(leftPt), y: pt2mm(-topPt) };
    
    return {
      index: Number(idx),
      maps: rel,
      geometry: { size_mm: size_mm, origin_mm: origin_mm, dpi: dpi }
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

  // Back-compat
  if (frontCards.length) {
    manifest.maps.front = frontCards[0].maps;
    manifest.geometry.front = frontCards[0].geometry;
  }
  if (backCards.length) {
    manifest.maps.back = backCards[0].maps;
    manifest.geometry.back = backCards[0].geometry;
  }

  // Diagnostics
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
  try {
    app.quit();
  } catch (e) {}
})();