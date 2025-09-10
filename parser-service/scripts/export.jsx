#target illustrator

(function () {
  // ---- Minimal JSON stringify (no JSON.parse needed) ----
  function _isArray(a){ return Object.prototype.toString.call(a)==='[object Array]'; }
  function _esc(s){ return String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\r/g,'\\r').replace(/\n/g,'\\n'); }
  function stringify(v){
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "string")  return "\"" + _esc(v) + "\"";
    if (t === "number")  return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    if (_isArray(v)) {
      var a = [];
      for (var i=0;i<v.length;i++) a.push(stringify(v[i]));
      return "[" + a.join(",") + "]";
    }
    if (t === "object") {
      var k, a = [];
      for (k in v) if (v.hasOwnProperty(k) && typeof v[k] !== "undefined") {
        a.push("\"" + _esc(k) + "\":" + stringify(v[k]));
      }
      return "{" + a.join(",") + "}";
    }
    return "null";
  }

  function getenv(k) { try { return $.getenv(k) || ""; } catch(e){ return ""; } }
  var inPath  = getenv("INPUT_AI");
  var outPath = getenv("OUTPUT_JSON");
  var jobId   = getenv("JOB_ID") || "unknown";

  function writeJSON(obj){
    var f = new File(outPath);
    f.encoding = "UTF-8";
    f.open("w");
    f.write(stringify(obj));
    f.close();
  }
  function fail(msg){
    writeJSON({ error:true, message:String(msg), job_id:jobId });
    throw new Error(msg);
  }

  if (!inPath || !outPath) fail("Missing INPUT_AI or OUTPUT_JSON");

  var inFile = new File(inPath);
  if (!inFile.exists) fail("INPUT_AI not found: " + inPath);

  // Open silently
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var doc = app.open(inFile);

  function pt2mm(pt){ return pt * 25.4 / 72.0; }
  function mm(v){ return pt2mm(v); }
  function boundsInfo(b){
    return { x:mm(b[0]), y:mm(-b[1]), x2:mm(b[2]), y2:mm(-b[3]),
             w:mm(b[2]-b[0]), h:mm(b[1]-b[3]) };
  }
  function spotName(c){
    if (!c) return null;
    if (c.typename === "SpotColor") return (c.spot && c.spot.name) ? String(c.spot.name) : null;
    return null;
  }
  function strokeInfo(it){
    if (!it.stroked) return null;
    return {
      present:true,
      weight_mm: pt2mm(it.strokeWidth || 0),
      overprint: !!it.overprintStroke,
      spot: spotName(it.strokeColor)
    };
  }
  function fillInfo(it){
    if (!it.filled) return null;
    return {
      present:true,
      overprint: !!it.overprintFill,
      spot: spotName(it.fillColor)
    };
  }

  var manifest = {
    job_id: jobId,
    doc: {
      name: doc.name,
      units: "mm",
      artboards: (function(){
        var arr=[], abs=doc.artboards;
        for (var i=0;i<abs.length;i++){
          var ab = abs[i];
          arr.push({ name: ab.name, index:i, bounds: boundsInfo(ab.artboardRect) });
        }
        return arr;
      })()
    },
    items: []
  };

  function classifyFinish(rec){
    var sf = (rec.fill && rec.fill.spot ? rec.fill.spot : "").toLowerCase();
    var ss = (rec.stroke && rec.stroke.spot ? rec.stroke.spot : "").toLowerCase();
    function has(p){ return sf.indexOf(p) === 0 || ss.indexOf(p) === 0; }
    if (has("foil")) return "foil";
    if (has("emboss")) return "emboss";
    if (has("deboss")) return "deboss";
    if (has("uv") || has("spot_uv")) return "uv";
    if (has("die") || has("die_cut")) return "die";
    return "print";
  }

  function pushItem(layerPath, it){
    var rec = {
      layerPath: layerPath.slice(0),
      typename: it.typename,
      name: it.name || "",
      visible: it.visible,
      locked: it.locked,
      clipping: !!it.clipping,
      bounds: boundsInfo(it.geometricBounds),
      opacity: it.opacity || 100,
      fill: fillInfo(it),
      stroke: strokeInfo(it)
    };
    rec.finish = classifyFinish(rec);
    manifest.items.push(rec);
  }

  function crawl(container, layerPath){
    // pageItems on groups/layers
    for (var i=0;i<container.pageItems.length;i++){
      var it = container.pageItems[i];
      if (it.typename === "GroupItem"){
        var lp = layerPath.slice(0); lp.push(it.name || "Group");
        crawl(it, lp);
      } else {
        pushItem(layerPath, it);
      }
    }
    // sublayers (if container is Layer)
    if (container.layers){
      for (var j=0;j<container.layers.length;j++){
        var sub = container.layers[j];
        var lp2 = layerPath.slice(0); lp2.push(sub.name || "Layer");
        crawl(sub, lp2);
      }
    }
  }

  for (var L=0; L<doc.layers.length; L++){
    var layer = doc.layers[L];
    crawl(layer, [layer.name]);
  }

  writeJSON(manifest);

  try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch(e) {}
})();
