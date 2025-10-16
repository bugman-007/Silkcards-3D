// C:\parser_service\scripts\export.jsx
#target illustrator
(function () {
  function createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt) {
    var ab = doc.artboards.add([leftPt, topPt, rightPt, bottomPt]);
    var idx = doc.artboards.getActiveArtboardIndex();
    var newIdx = doc.artboards.length - 1;
    doc.artboards.setActiveArtboardIndex(newIdx);
    app.redraw();
    return {
      index: newIdx,
      restoreIndex: idx,
      remove: function () {
        // restore previous active and remove temp
        doc.artboards.setActiveArtboardIndex(idx);
        // Illustrator cannot remove the currently-active AB
        doc.artboards.remove(newIdx);
        app.redraw();
      },
    };
  }

  function ensureLayer(doc, name) {
    var lname = String(name || "");
    for (var i = 0; i < doc.layers.length; i++) {
      if ((doc.layers[i].name || "") === lname) return doc.layers[i];
    }
    var L = doc.layers.add();
    L.name = lname;
    return L;
  }

  function dieTokenMatch(name) {
    var s = String(name || "").toLowerCase();
    return (
      s.indexOf("laser_cut") >= 0 ||
      s.indexOf("laser-cut") >= 0 ||
      s.indexOf("cutline") >= 0 ||
      s.indexOf("cut_line") >= 0 ||
      s.indexOf("die_cut") >= 0 ||
      s.indexOf("die-cut") >= 0 ||
      s.indexOf("diecut") >= 0 ||
      s === "die"
    );
  }

  function duplicateDieItemsInto(
    doc,
    targetLayer,
    cardLeft,
    cardTop,
    cardRight,
    cardBottom
  ) {
    // Duplicate any visible pageItem whose name (or any ancestor’s name) has die tokens
    // and whose bounds overlap the card rect.
    function overlaps(b) {
      if (!b) return false; // b = [L,T,R,B] in pt
      var eps = 0.5;

      // normalize item rect
      var l = Math.min(b[0], b[2]);
      var r = Math.max(b[0], b[2]);
      var t = Math.max(b[1], b[3]); // Illustrator: top is the larger Y
      var bt = Math.min(b[1], b[3]);

      // normalize card rect
      var cl = Math.min(cardLeft, cardRight);
      var cr = Math.max(cardLeft, cardRight);
      var ct = Math.max(cardTop, cardBottom);
      var cb = Math.min(cardTop, cardBottom);

      // standard AABB overlap with a tiny tolerance
      if (r < cl - eps) return false;
      if (l > cr + eps) return false;
      if (bt > ct + eps) return false;
      if (t < cb - eps) return false;
      return true;
    }
    var dupCount = 0;
    // Walk all layers/items shallowly; use ancestor names to detect die.
    for (var li = 0; li < doc.layers.length; li++) {
      var layer = doc.layers[li];
      var stack = [{ node: layer, dieCtx: dieTokenMatch(layer.name) }];
      while (stack.length) {
        var cur = stack.pop();
        var node = cur.node;
        var dieCtx = cur.dieCtx || dieTokenMatch(node.name);
        // enqueue children
        if (node.layers) {
          for (var k = 0; k < node.layers.length; k++) {
            stack.push({ node: node.layers[k], dieCtx: dieCtx });
          }
        }
        if (node.pageItems) {
          for (var j = 0; j < node.pageItems.length; j++) {
            var it = node.pageItems[j];
            var itDie = dieCtx || dieTokenMatch(it.name);
            // visible & unlocked only
            var isVisible = true,
              isLocked = false;
            try {
              isVisible = it.hidden ? false : true;
            } catch (e) {}
            try {
              isLocked = it.locked ? true : false;
            } catch (e) {}
            if (!itDie || !isVisible || isLocked) continue;
            var b;
            try {
              b = it.geometricBounds;
            } catch (e) {
              b = null;
            }
            if (!overlaps(b)) continue;
            try {
              var dup = it.duplicate(
                targetLayer,
                ElementPlacement.PLACEATBEGINNING
              );
              try {
                dup.hidden = false;
              } catch (e) {}
              try {
                dup.locked = false;
              } catch (e) {}
              try {
                if (typeof dup.printable !== "undefined") dup.printable = true;
              } catch (e) {}
              try {
                if (typeof dup.guides !== "undefined") dup.guides = false;
              } catch (e) {}
              try {
                if (typeof dup.template !== "undefined") dup.template = false;
              } catch (e) {}
              dupCount++;
            } catch (e) {}
          }
        }
      }
    }
    return dupCount;
  }

  function _white() {
    var c = new RGBColor();
    c.red = 255;
    c.green = 255;
    c.blue = 255;
    return c;
  }
  function _try(cmd) {
    try {
      app.executeMenuCommand(cmd);
    } catch (e) {}
  }

  // Convert the duplicated die items (now isolated) into a filled cut-out white card
  function buildFilledCutoutFromCurrentSelection(
    doc,
    leftPt,
    topPt,
    rightPt,
    bottomPt
  ) {
    _try("deselectall");
    _try("selectall");
    app.redraw();

    // Outline strokes → filled geometry; Unite into one region
    _try("expandStyle");
    _try("outline");
    app.redraw();
    _try("Live Pathfinder Unite");
    _try("expandStyle");
    app.redraw();

    // Create full-card white rect behind
    var rect = doc.pathItems.rectangle(
      topPt,
      leftPt,
      rightPt - leftPt,
      topPt - bottomPt
    );
    rect.stroked = false;
    rect.filled = true;
    rect.fillColor = _white();
    rect.move(doc.activeLayer, ElementPlacement.PLACEATEND);

    // Subtract die region from full card (makes the hole), then expand to finalize
    _try("deselectall");
    _try("selectall");
    $.writeln(
      "Die mask selection count: " + (doc.selection ? doc.selection.length : 0)
    );
    _try("Live Pathfinder Subtract");
    _try("expandStyle");
    app.redraw();

    // Normalize to solid white fill, no stroke
    _try("deselectall");
    _try("selectall");
    var sel = doc.selection || [];
    for (var i = 0; i < sel.length; i++) {
      var it = sel[i];
      try {
        it.stroked = false;
      } catch (e) {}
      try {
        it.filled = true;
        it.fillColor = _white();
      } catch (e) {}
    }
  }

  // Guarantee a file gets written (workaround for Illustrator skipping empty exports)
  function write1x1TransparentPng(absPath) {
    // Minimal 1x1 PNG binary is not trivial to synthesize here; safest is:
    // create a 1x1 rect on a temp artboard and export—kept simple for robustness.
    // (We only call this if the main export failed.)
  }

  // --- finish token checks ---
  function hasFoilToken(s) {
    s = String(s || "").toLowerCase();
    return s.indexOf("foil") >= 0;
  }
  function hasUvToken(s) {
    s = String(s || "").toLowerCase();
    return (
      s.indexOf("spot_uv") >= 0 ||
      s.indexOf("spot-uv") >= 0 ||
      s.indexOf("spotuv") >= 0 ||
      /(^|[_\-\s])uv([_\-\s]|$)/.test(s) ||
      s.indexOf("varnish") >= 0
    );
  }
  function hasEmbossToken(s) {
    s = String(s || "").toLowerCase();
    return s.indexOf("emboss") >= 0 || s.indexOf("deboss") >= 0;
  }

  // Deep token match against an item and its ancestors
  function finishTokenMatch(node, kind) {
    var f =
      kind === "foil"
        ? hasFoilToken
        : kind === "uv"
        ? hasUvToken
        : kind === "emboss"
        ? hasEmbossToken
        : function () {
            return false;
          };
    var cur = node;
    while (cur) {
      try {
        if (f(cur.name)) return true;
      } catch (e) {}
      try {
        cur = cur.parent;
      } catch (e) {
        break;
      }
    }
    return false;
  }

  // Duplicate all visible, unlocked items matching a finish token into targetLayer (nested-safe)
  // === PATCH J: REPLACE the entire duplicateFinishItemsInto(...) with this ===
function duplicateFinishItemsInto(
  doc,
  targetLayer,
  kind,             // "foil" | "uv" | "emboss"
  cardLeft,
  cardTop,
  cardRight,
  cardBottom
) {
  function _hasToken(node) {
    return kind === "foil"
      ? finishTokenMatch(node, "foil")
      : kind === "uv"
      ? finishTokenMatch(node, "uv")
      : finishTokenMatch(node, "emboss");
  }

  // normalized AABB overlap (Illustrator Y: top is larger)
  function overlaps(b) {
    if (!b) return false;
    var eps = 0.5;

    var L = Math.min(b[0], b[2]);
    var R = Math.max(b[0], b[2]);
    var T = Math.max(b[1], b[3]);
    var B = Math.min(b[1], b[3]);

    var cl = Math.min(cardLeft,  cardRight);
    var cr = Math.max(cardLeft,  cardRight);
    var ct = Math.max(cardTop,   cardBottom);
    var cb = Math.min(cardTop,   cardBottom);

    if (R < cl - eps) return false;
    if (L > cr + eps) return false;
    if (B > ct + eps) return false;
    if (T < cb - eps) return false;
    return true;
  }

  function _isSkippable(it) {
    try { if (it.guides) return true; } catch (e) {}
    try { if (it.template) return true; } catch (e) {}
    return false;
  }

  var dup = 0;
  for (var li = 0; li < doc.layers.length; li++) {
    var layer = doc.layers[li];
    var stack = [layer];
    while (stack.length) {
      var node = stack.pop();

      if (node.layers) {
        for (var i = 0; i < node.layers.length; i++) stack.push(node.layers[i]);
      }
      if (node.pageItems) {
        for (var j = 0; j < node.pageItems.length; j++) {
          var it = node.pageItems[j];

          // token can live on ancestors; use finishTokenMatch
          if (!_hasToken(it)) continue;

          if (_isSkippable(it)) continue;

          var b = null;
          try { b = it.geometricBounds; } catch (e) {}
          if (!overlaps(b)) continue;

          // duplicate regardless of current visibility/lock state
          try { if (it.locked) it.locked = false; } catch (e) {}
          try {
            var d = it.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
            try { d.hidden = false; } catch (e) {}
            try { d.locked = false; } catch (e) {}
            dup++;
          } catch (e) {}
        }
      }
    }
  }
  return dup;
}


  // On current selection: normalize to a fill mask (stroke/curve-proof)
  function normalizeSelectionToWhiteMask() {
    _try("expandStyle");
    _try("outline");
    app.redraw();
    _try("Live Pathfinder Unite");
    _try("expandStyle");
    app.redraw();
    _try("deselectall");
    _try("selectall");
    var sel = app.activeDocument.selection || [];
    for (var i = 0; i < sel.length; i++) {
      var it = sel[i];
      try {
        it.stroked = false;
      } catch (e) {}
      try {
        it.filled = true;
        it.fillColor = _white();
      } catch (e) {}
    }
  }

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
      var sel = app.activeDocument.selection;
      if (!sel || sel.length === 0) return;

      function applyWhite(item) {
        if (!item) return;

        try {
          if ("stroked" in item) {
            item.stroked = false;
          }
        } catch (e) {}

        try {
          if ("filled" in item) {
            item.filled = true;
            item.fillColor = getWhiteColor();
          }
        } catch (e) {}

        // Recursively process groups
        if (item.typename === "GroupItem" && item.pageItems) {
          for (var i = 0; i < item.pageItems.length; i++) {
            applyWhite(item.pageItems[i]);
          }
        }

        // Process compound paths
        if (item.typename === "CompoundPathItem" && item.pathItems) {
          for (var j = 0; j < item.pathItems.length; j++) {
            applyWhite(item.pathItems[j]);
          }
        }
      }

      for (var k = 0; k < sel.length; k++) {
        applyWhite(sel[k]);
      }
    } catch (error) {
      $.writeln("White normalization error: " + error);
    }
  }

  // --- helpers for robust die mask export ---
  function _try(cmd) {
    try {
      app.executeMenuCommand(cmd);
    } catch (e) {}
  }

  function parseSideIndexFromPath(layerPath) {
    var side = null,
      idx = null;
    for (var i = layerPath.length - 1; i >= 0; i--) {
      var nm = String(layerPath[i] || "").toLowerCase();
      // Look for full pattern first: front_layer_#  /  back_layer_#
      var m = /(front|back)[_\-\s]*layer[_\-\s]*(\d+)/.exec(nm);
      if (m) {
        side = m[1];
        idx = Number(m[2]);
        break;
      }
      // As a weaker signal: plain "front" / "back" if index not embedded here
      if (!side) {
        if (nm.indexOf("front") >= 0) side = "front";
        else if (nm.indexOf("back") >= 0) side = "back";
      }
    }
    // Default index when we got side but no explicit number
    if (side && (idx === null || isNaN(idx))) idx = 0;
    return { side: side, index: idx };
  }

  function parseFinishFromPath(layerPath) {
    // Scan deepest-first; return first explicit finish token found
    for (var i = layerPath.length - 1; i >= 0; i--) {
      var s = String(layerPath[i] || "").toLowerCase();
      if (
        s.indexOf("laser_cut") >= 0 ||
        s.indexOf("laser-cut") >= 0 ||
        s.indexOf("cutline") >= 0 ||
        s.indexOf("cut_line") >= 0 ||
        s.indexOf("die_cut") >= 0 ||
        s.indexOf("die-cut") >= 0 ||
        s.indexOf("diecut") >= 0 ||
        s === "die"
      )
        return "die";
      if (s.indexOf("emboss") >= 0) return "emboss";
      if (s.indexOf("deboss") >= 0) return "deboss";
      if (s.indexOf("foil") >= 0) return "foil";
      if (
        s.indexOf("spot_uv") >= 0 ||
        s.indexOf("spot-uv") >= 0 ||
        s.indexOf("spotuv") >= 0 ||
        /(^|[_\-\s])uv([_\-\s]|$)/.test(s) ||
        s.indexOf("varnish") >= 0
      )
        return "uv";
    }
    return "print";
  }

  function _normalizeSelToWhite() {
    function paint(item) {
      if (!item.visible) return;
      if ("stroked" in item) item.stroked = false;
      if ("filled" in item) {
        item.filled = true;
        item.fillColor = getWhiteColor();
      }
      if (item.typename === "GroupItem")
        for (var i = 0; i < item.pageItems.length; i++)
          paint(item.pageItems[i]);
      if (item.typename === "CompoundPathItem")
        for (var j = 0; j < item.pathItems.length; j++)
          paint(item.pathItems[j]);
    }
    var sel = app.activeDocument.selection || [];
    for (var k = 0; k < sel.length; k++) paint(sel[k]);
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
    // Ensure only die layers are visible/selected BEFORE calling this.
    _try("deselectall");
    _try("selectall");
    app.redraw();

    // Expand effects, then convert strokes to filled geometry
    _try("expandStyle");
    _try("outline");
    app.redraw();

    // Unite all die shapes into one region
    _try("Live Pathfinder Unite");
    _try("expandStyle");
    app.redraw();

    // Create an artboard-sized white rectangle behind the die region
    var rect = doc.pathItems.rectangle(
      topPt,
      leftPt,
      rightPt - leftPt,
      topPt - bottomPt
    );
    rect.stroked = false;
    rect.filled = true;
    rect.fillColor = getWhiteColor();
    rect.move(doc.activeLayer, ElementPlacement.PLACEATEND);

    // Subtract die region from the full card rectangle (creates the "hole")
    _try("deselectall");
    _try("selectall");
    _try("Live Pathfinder Subtract");
    _try("expandStyle");
    app.redraw();

    // Normalize fill (solid white), no stroke
    _try("deselectall");
    _try("selectall");
    _normalizeSelToWhite();
    app.redraw();

    // Guard: if selection collapsed (rare Illustrator quirk), leave at least the full card rect
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
  function getWhiteColor() {
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

    // Handle sublayers recursively
    if (container.layers) {
      for (var i = 0; i < container.layers.length; i++) {
        try {
          setVisibleDeep(container.layers[i], v);
        } catch (_e1) {}
      }
    }

    // Handle pageItems and groups recursively - ENHANCED
    if (container.pageItems) {
      for (var j = 0; j < container.pageItems.length; j++) {
        var it = container.pageItems[j];
        try {
          if (typeof it.hidden !== "undefined") it.hidden = !v;
        } catch (_e2) {}
        try {
          if (typeof it.locked !== "undefined") it.locked = false;
        } catch (_e3) {}

        // Recursive handling for nested groups - CRITICAL FIX
        if (it.typename === "GroupItem") {
          try {
            setVisibleDeep(it, v); // Recursively process nested groups
          } catch (_e4) {}
        }
        // Handle compound paths
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

    // NEW: derive side/index/finish from the full ancestor chain
    var ctx = parseSideIndexFromPath(layerPath);
    rec.sideHint = ctx.side || null;
    rec.idxHint =
      typeof ctx.index === "number" && !isNaN(ctx.index) ? ctx.index : null;
    rec.finish = parseFinishFromPath(layerPath); // "print" if nothing matched

    manifest.items.push(rec);
  }

  function processFinishMask(finishType) {
    try {
      app.executeMenuCommand("deselectall");
      app.executeMenuCommand("selectall");

      // Only apply minimal processing based on finish type
      switch (finishType) {
        case "foil":
        case "uv":
          // Light processing for foil/UV - just ensure visibility
          try {
            app.executeMenuCommand("expandStyle");
          } catch (e) {}
          break;

        case "emboss":
        case "deboss":
          // Medium processing for emboss - outline strokes
          try {
            app.executeMenuCommand("expandStyle");
          } catch (e) {}
          try {
            app.executeMenuCommand("outline");
          } catch (e) {}
          break;

        case "die":
          // Heavy processing only for die-cut (uses separate function)
          // Don't process here - die has its own specialized function
          break;
      }

      // Always apply white fill for masks
      normalizeSelectionToWhite();
    } catch (error) {
      $.writeln("Finish mask processing error: " + error);
    }
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
  // 1) If the layer path already hints front/back, honor it.
  if (rec.sideHint) return rec.sideHint;

  // 2) Compute overlap area with each artboard
  var b = rec.bounds; // in mm
  var l = mm2pt(b.x), t = -mm2pt(b.y), r = mm2pt(b.x2), bb = -mm2pt(b.y2);

  var overlaps = [];
  for (var i = 0; i < doc.artboards.length; i++) {
    var R = doc.artboards[i].artboardRect; // [L,T,R,B] pt
    var L = Math.max(l, R[0]);
    var T = Math.min(t, R[1]);
    var Rr = Math.min(r, R[2]);
    var Bb = Math.max(bb, R[3]);
    var w = Math.max(0, Rr - L);
    var h = Math.max(0, T - Bb);
    overlaps.push({ i: i, area: w * h, rect: R, name: String(doc.artboards[i].name || "") });
  }
  // Choose the most-overlapped artboard
  overlaps.sort(function(a,b){ return b.area - a.area; });
  var best = overlaps.length ? overlaps[0] : null;
  if (!best) return "front";

  // 3) If the artboard name explicitly says "back", use back; if "front", use front
  var abName = best.name.toLowerCase();
  if (abName.indexOf("back") >= 0) return "back";
  if (abName.indexOf("front") >= 0) return "front";

  // 4) Otherwise: infer by LEFT/RIGHT ordering (common two-AB layout).
  //    Leftmost artboard => FRONT, rightmost => BACK.
  //    (If there are more ABs, we still compare by center X.)
  var centers = doc.artboards.length;
  var xs = [];
  for (var j = 0; j < centers; j++) {
    var RR = doc.artboards[j].artboardRect;
    xs.push({ j: j, cx: (RR[0] + RR[2]) * 0.5 });
  }
  xs.sort(function(a,b){ return a.cx - b.cx; });
  var leftmostIndex  = xs[0].j;
  var rightmostIndex = xs[xs.length - 1].j;

  if (best.i === rightmostIndex) return "back";
  if (best.i === leftmostIndex)  return "front";

  // Fallback: if nothing decisive, default to front.
  return "front";
}

  // place recs into buckets
  for (var i = 0; i < manifest.items.length; i++) {
    var rec = manifest.items[i];

    // SIDE: prefer hint from path; fallback to geometric heuristic
    var side = rec.sideHint || decideSide(rec);
    if (!buckets[side]) buckets[side] = {};

    // INDEX: prefer hint from path; fallback to any top-name index pattern; else 0
    var idx =
      rec.idxHint != null
        ? rec.idxHint
        : cardIndexFromTopName((rec.layerPath && rec.layerPath[0]) || "");

    // FINISH already resolved from full path
    var fin = rec.finish || "print";

    // Keep only useful invisible items (same rule as before)
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
    // Prefer DIE → then PRINT → then union of effects → else active artboard
    var b = unionBoundsPt(sideCardBucket.die);
    if (!b) b = unionBoundsPt(sideCardBucket.print);
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

  // REPLACE the conflicting withLayers/withEnhancedLayers with this single robust version
  function withIsolatedLayers(tokensArray, fn) {
    // Makes only the layers that match ANY token visible,
    // and also turns ON the entire descendant tree of each match.
    // Parents of the match are also made visible (so the tree path is visible).
    // Everything else is hidden. All states are restored afterwards.

    // Helper: case-insensitive “does name include any token?”
    function nameHasToken(nm, toks) {
      nm = String(nm || "").toLowerCase();
      for (var t = 0; t < toks.length; t++) {
        var tk = String(toks[t] || "").toLowerCase();
        if (!tk) continue;
        // allow both exact tokens and common variants
        if (nm.indexOf(tk) >= 0) return true;
        if (
          tk === "_uv" &&
          (/(^|[_\-\s])uv([_\-\s]|$)/.test(nm) ||
            nm.indexOf("spot_uv") >= 0 ||
            nm.indexOf("spot-uv") >= 0)
        )
          return true;
        if (tk === "_foil" && nm.indexOf("foil") >= 0) return true;
      }
      return false;
    }

    // Collect all layers (and sublayers)
    var all = [];
    (function walk(layer) {
      if (!layer) return;
      all.push(layer);
      if (layer.layers) {
        for (var i = 0; i < layer.layers.length; i++) walk(layer.layers[i]);
      }
    })(app.activeDocument); // Illustrator lets us iterate via doc.layers below

    // Snapshot original states and hide everything
    var saved = [];
    for (var L = 0; L < app.activeDocument.layers.length; L++) {
      (function hideTree(node) {
        if (!node) return;
        saved.push({ node: node, vis: !!node.visible, lock: !!node.locked });
        try {
          if (node.locked) node.locked = false;
        } catch (e) {}
        try {
          node.visible = false;
        } catch (e) {}

        if (node.layers) {
          for (var i = 0; i < node.layers.length; i++) hideTree(node.layers[i]);
        }
      })(app.activeDocument.layers[L]);
    }

    // Helper we already have elsewhere: turns a container AND all descendants visible
    function setVisibleDeep(container, v) {
      try {
        container.visible = v;
      } catch (e) {}
      if (container.layers) {
        for (var i = 0; i < container.layers.length; i++)
          setVisibleDeep(container.layers[i], v);
      }
      if (container.pageItems) {
        for (var j = 0; j < container.pageItems.length; j++) {
          var it = container.pageItems[j];
          try {
            if (typeof it.hidden !== "undefined") it.hidden = !v;
          } catch (e) {}
          try {
            if (typeof it.locked !== "undefined") it.locked = false;
          } catch (e) {}
          if (it.typename === "GroupItem") setVisibleDeep(it, v);
          if (it.typename === "CompoundPathItem" && it.pathItems) {
            for (var p = 0; p < it.pathItems.length; p++) {
              try {
                if (typeof it.pathItems[p].hidden !== "undefined")
                  it.pathItems[p].hidden = !v;
              } catch (e) {}
            }
          }
        }
      }
    }

    // Find all matching layers (by token match in the layer name)
    var matches = [];
    for (var r = 0; r < app.activeDocument.layers.length; r++) {
      (function collect(node) {
        if (!node) return;
        if (nameHasToken(node.name, tokensArray)) matches.push(node);
        if (node.layers) {
          for (var i = 0; i < node.layers.length; i++) collect(node.layers[i]);
        }
      })(app.activeDocument.layers[r]);
    }

    // Show each match + its ancestors + its whole descendant tree
    for (var m = 0; m < matches.length; m++) {
      var cur = matches[m];
      // turn on the entire matched subtree
      setVisibleDeep(cur, true);
      // ensure all ancestors are also visible
      var parent = cur.parent;
      while (parent && parent !== app.activeDocument) {
        try {
          parent.visible = true;
        } catch (e) {}
        parent = parent.parent;
      }
    }

    try {
      if (typeof fn === "function") fn();
    } finally {
      // restore states
      for (var s = 0; s < saved.length; s++) {
        try {
          saved[s].node.visible = saved[s].vis;
        } catch (e) {}
        try {
          saved[s].node.locked = saved[s].lock;
        } catch (e) {}
      }
    }
  }

  function withAlbedoIsolationForCardForPrefix(cardPrefix, fn) {
  // effect tokens we must hide
  var effectTokens = [
    "foil","_foil","spot_uv","spot-uv","spotuv","_uv",
    "emboss","deboss",
    "laser_cut","laser-cut","die","die_cut","die-cut","diecut",
    "cutline","cut_line"
  ];
  function hasAnyToken(nm) {
    nm = String(nm||"").toLowerCase();
    for (var i=0;i<effectTokens.length;i++) {
      var tk = effectTokens[i];
      if (nm.indexOf(tk) >= 0) return true;
      if (tk === "_uv" && /(^|[_\-\s])uv([_\-\s]|$)/.test(nm)) return true;
    }
    return false;
  }

  var saved = [];
  try {
    for (var L = 0; L < doc.layers.length; L++) {
      (function walk(layer){
        if (!layer) return;
        var vis0 = !!layer.visible, lock0 = !!layer.locked;
        saved.push({ node: layer, vis: vis0, lock: lock0 });

        // unlock so we can toggle
        try { if (layer.locked) layer.locked = false; } catch(e){}

        var name = String(layer.name||"").toLowerCase();
        if (hasAnyToken(name)) {
          // hide effect layers globally
          try { layer.visible = false; } catch(e){}
        } else if (name.indexOf(String(cardPrefix).toLowerCase()) >= 0) {
          // ensure target card's print infrastructure is ON
          try { layer.visible = true; } catch(e){}
        }
        // recurse
        if (layer.layers) for (var i=0;i<layer.layers.length;i++) walk(layer.layers[i]);
      })(doc.layers[L]);
    }

    if (typeof fn === "function") fn();
  } finally {
    for (var s = 0; s < saved.length; s++) {
      var st = saved[s];
      try { st.node.visible = st.vis; } catch(e){}
      try { st.node.locked  = st.lock; } catch(e){}
    }
  }
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

    // === PATCH H (ADD): tiny helpers to isolate ISO layer visibility ===
    function _snapshotLayers() {
      var st = [];
      for (var i = 0; i < doc.layers.length; i++) {
        var L = doc.layers[i];
        st.push({ L: L, vis: !!L.visible, lock: !!L.locked });
      }
      return st;
    }
    function _hideAllExcept(layer, snap) {
      for (var i = 0; i < snap.length; i++) {
        var s = snap[i];
        try {
          if (s.L.locked) s.L.locked = false;
        } catch (e) {}
        try {
          s.L.visible = s.L === layer;
        } catch (e) {}
      }
    }
    function _restoreLayers(snap) {
      for (var i = 0; i < snap.length; i++) {
        var s = snap[i];
        try {
          s.L.visible = s.vis;
        } catch (e) {}
        try {
          s.L.locked = s.lock;
        } catch (e) {}
      }
    }
    // Export all non-effect layers for this card prefix (robust to naming)
    withAlbedoIsolationForCardForPrefix(pref, function () {
  var AB = createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt);
  try {
    pngExport(doc, absPath(pref + "_albedo.png"), scalePercent, true, true);
    rel.albedo = relPath(pref + "_albedo.png");
  } finally {
    AB.remove();
  }
});

    // REPLACE all finish effect export blocks with this consistent pattern

    // ---- Foil ----
    if (cardBucket.foil.length > 0) {
      var iso = ensureLayer(doc, "__EXPORT_ISO__");
  var snap = _snapshotLayers();
  try {
    var dup = duplicateFinishItemsInto(
      doc,
      iso,
      "foil",
      leftPt,
      topPt,
      rightPt,
      bottomPt
    );

    _hideAllExcept(iso, snap);
    doc.activeLayer = iso;

    var AB = createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt);
    _try("deselectall"); _try("selectall"); app.redraw();

    if (dup > 0 && doc.selection && doc.selection.length > 0) {
      // Optional color preview
      pngExport(doc, absPath(pref + "_foil_color.png"), scalePercent, true, true);
      rel.foil_color = relPath(pref + "_foil_color.png");

      // White mask
      normalizeSelectionToWhiteMask();
      pngExport(doc, absPath(pref + "_foil.png"), scalePercent, true, true);
      rel.foil = relPath(pref + "_foil.png");
    }
    AB.remove();
  } finally {
    try { iso.remove(); } catch (e) {}
    _restoreLayers(snap);
  }
    }

    // ---- UV ----
    if (cardBucket.uv.length > 0) {
       var isoUV = ensureLayer(doc, "__EXPORT_ISO__");
  var snapUV = _snapshotLayers();
  try {
    var dupUV = duplicateFinishItemsInto(
      doc,
      isoUV,
      "uv",
      leftPt,
      topPt,
      rightPt,
      bottomPt
    );

    _hideAllExcept(isoUV, snapUV);
    doc.activeLayer = isoUV;

    var ABuv = createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt);
    _try("deselectall"); _try("selectall"); app.redraw();

    if (dupUV > 0 && doc.selection && doc.selection.length > 0) {
      normalizeSelectionToWhiteMask();
      pngExport(doc, absPath(pref + "_uv.png"), scalePercent, true, true);
      rel.uv = relPath(pref + "_uv.png");
    }
    ABuv.remove();
  } finally {
    try { isoUV.remove(); } catch (e) {}
    _restoreLayers(snapUV);
  }
    }
    // ---- Emboss/Deboss ----
    if (cardBucket.emboss.length > 0 || cardBucket.deboss.length > 0) {
      var isoEmb = ensureLayer(doc, "__EXPORT_ISO__");
  var snapEmb = _snapshotLayers();
  try {
    var dupEmb = duplicateFinishItemsInto(
      doc,
      isoEmb,
      "emboss",
      leftPt,
      topPt,
      rightPt,
      bottomPt
    );

    _hideAllExcept(isoEmb, snapEmb);
    doc.activeLayer = isoEmb;

    var ABemb = createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt);
    _try("deselectall"); _try("selectall"); app.redraw();

    if (dupEmb > 0 && doc.selection && doc.selection.length > 0) {
      normalizeSelectionToWhiteMask();
      pngExport(doc, absPath(pref + "_emboss.png"), scalePercent, true, true);
      rel.emboss = relPath(pref + "_emboss.png");
    }
    ABemb.remove();
  } finally {
    try { isoEmb.remove(); } catch (e) {}
    _restoreLayers(snapEmb);
  }
    }

    // ---- Die-cut (robust isolation via duplication ONLY) ----
    if (cardBucket.die.length > 0) {
      var isoLayer = ensureLayer(doc, "__EXPORT_ISO__");
      var state = [];

      // helper: hide all layers except our iso layer, snapshot states
      function hideAllExceptIso() {
        for (var i = 0; i < doc.layers.length; i++) {
          var L = doc.layers[i];
          var vis0 = !!L.visible,
            lock0 = !!L.locked;
          state.push({ L: L, vis0: vis0, lock0: lock0 });
          try {
            if (lock0) L.locked = false;
          } catch (e) {}
          try {
            L.visible = L === isoLayer;
          } catch (e) {}
        }
      }
      function restoreLayerStates() {
        for (var j = 0; j < state.length; j++) {
          var s = state[j];
          try {
            s.L.visible = s.vis0;
          } catch (e) {}
          try {
            s.L.locked = s.lock0;
          } catch (e) {}
        }
      }

      try {
        // 1) Duplicate *only* die items that overlap this card
        var dupCount = duplicateDieItemsInto(
          doc,
          isoLayer,
          leftPt,
          topPt,
          rightPt,
          bottomPt
        );

        // 2) Isolate: only __EXPORT_ISO__ layer visible
        hideAllExceptIso();
        doc.activeLayer = isoLayer;

        // 3) Clip to exact card bounds with a temp artboard
        var AB = createTempArtboard(doc, leftPt, topPt, rightPt, bottomPt);

        // 4) Export SVG of the raw designer vectors (before whitening/subtraction)
        //    (If nothing duplicated, we still create a 1×1 dot so the file isn't empty.)
        app.executeMenuCommand("deselectall");
        app.executeMenuCommand("selectall");
        if (!doc.selection || doc.selection.length === 0) {
          var dot = doc.pathItems.rectangle(topPt, leftPt, 1, 1);
          dot.stroked = false;
          dot.filled = true;
          dot.fillColor = getWhiteColor();
          doc.selection = [dot];
        }
        svgExport(doc, absPath(pref + "_diecut.svg"));

        // 5) Build the FILLED cut mask from the duplicated selection
        //    (white keep, transparent hole)
        buildFilledCutoutFromCurrentSelection(
          doc,
          leftPt,
          topPt,
          rightPt,
          bottomPt
        );

        // 6) Export white-on-transparent PNG
        pngExport(
          doc,
          absPath(pref + "_diecut_mask.png"),
          scalePercent,
          true,
          true
        );

        // 7) Cleanup
        AB.remove();

        // 8) Register
        rel.die_svg = relPath(pref + "_diecut.svg");
        rel.die_png = relPath(pref + "_diecut_mask.png");
      } finally {
        try {
          isoLayer.remove();
        } catch (e) {}
        restoreLayerStates();
      }
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
