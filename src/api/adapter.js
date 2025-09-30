// src/api/adapter.js
/**
 * Adapt the Windows parser/Illustrator manifest into what the viewer expects.
 * NEW: Output arrays per effect type for per-image overlay rendering
 */
export function adaptParserJsonToViewer(data) {
  if (!data || typeof data !== "object") {
    throw new Error("adaptParserJsonToViewer: invalid input");
  }

  // ----- jobId -----
  const jobId = data?.job_id || data?.jobId || data?.id || null;

  // ----- geometry preferred size (mm) -----
  const geomFront = data?.geometry?.front?.size_mm;
  const geomBack = data?.geometry?.back?.size_mm;
  const primary = geomFront || geomBack;

  // Fallback size from artboard[0] bounds (mm) if geometry missing
  const ab = data?.doc?.artboards?.[0]?.bounds || {};
  const widthMmAb = typeof ab.w === "number" ? ab.w : null;
  const heightMmAb = typeof ab.h === "number" ? ab.h : null;

  const dims = primary
    ? { width: primary.w, height: primary.h, thickness: 0.35, units: "mm" }
    : {
        width: widthMmAb ?? 90,
        height: heightMmAb ?? 54,
        thickness: 0.35,
        units: "mm",
      };

  // ----- NEW: Collect all PNGs into arrays per effect type -----
  const buildSideData = (side) => {
    const result = {
      albedoUrl: null,
      dieCutUrl: null,
      foilLayers: [], // { colorUrl, maskUrl }
      uvLayers: [],   // { maskUrl }
      embossLayers: [], // { maskUrl, type: 'emboss'|'deboss' }
    };

    // Helper to extract URLs from maps or geometry cards
    const extractUrls = (obj) => {
      if (!obj || typeof obj !== "object") return;
      
      Object.entries(obj).forEach(([key, value]) => {
        if (typeof value !== "string") return;
        
        const filename = value.toLowerCase();
        const isThisSide = filename.includes(`${side}_`) || 
                          (side === 'front' && !filename.includes('back_')) ||
                          (side === 'back' && !filename.includes('front_'));
        
        if (!isThisSide) return;

        // Albedo detection
        if (!result.albedoUrl && (filename.includes('_albedo.') || filename.includes('_print.'))) {
          result.albedoUrl = value;
        }
        // Die-cut detection
        else if (!result.dieCutUrl && (
          filename.includes('_die.') || 
          filename.includes('diecut') || 
          filename.includes('laser_cut') ||
          filename.includes('_cut.')
        )) {
          result.dieCutUrl = value;
        }
        // Foil detection
        else if (filename.includes('_foil')) {
          result.foilLayers.push({
            colorUrl: value,
            maskUrl: value, // Same file for both initially
            id: `${side}_foil_${result.foilLayers.length}`
          });
        }
        // UV detection
        else if (filename.includes('_uv') || filename.includes('spot_uv') || filename.includes('spot-uv')) {
          result.uvLayers.push({
            maskUrl: value,
            id: `${side}_uv_${result.uvLayers.length}`
          });
        }
        // Emboss/Deboss detection
        else if (filename.includes('emboss') || filename.includes('deboss')) {
          result.embossLayers.push({
            maskUrl: value,
            type: filename.includes('deboss') ? 'deboss' : 'emboss',
            id: `${side}_emboss_${result.embossLayers.length}`
          });
        }
      });
    };

    // Extract from multiple possible locations
    extractUrls(data?.maps?.[side]);
    extractUrls(data?.geometry?.[side]);
    
    // Also check geometry cards arrays (v3 format)
    if (Array.isArray(data?.geometry?.[`${side}_cards`])) {
      data.geometry[`${side}_cards`].forEach(card => extractUrls(card?.maps));
    }

    return result;
  };

  const frontData = buildSideData('front');
  const backData = buildSideData('back');

  // ----- Keep original items for fallback -----
  const artboardBounds = data?.doc?.artboards?.[0]?.bounds || null;
  const items = Array.isArray(data?.items) ? data.items : [];
  const grouped = separateCardsFromItems(items, artboardBounds);

  // Build the final adapted shape
  const adapted = {
    jobId,
    id: jobId,
    dimensions: dims,
    // NEW: Structured data for per-image rendering
    cards: {
      front: frontData,
      back: backData
    },
    // Legacy: keep for fallback
    maps: {}, // deprecated but kept for compatibility
    geometry: data?.geometry || {},
    parseResult: { ...data },
    items: grouped, // for debug/fallback
    layers: grouped, // alias
    original: data,
  };
  return adapted;
}

/* ----------------------------- helpers below ----------------------------- */

/**
 * Separate items into card "front"/"back" buckets and effect arrays.
 * (Maintained for fallback rendering)
 */
function separateCardsFromItems(items, artboardBounds) {
  const buckets = {
    front: mkBucket(),
    back: mkBucket(),
  };

  const abCenterMm = artboardBounds && typeof artboardBounds.x === "number"
    ? (artboardBounds.x + (artboardBounds.x2 ?? artboardBounds.x + (artboardBounds.w || 0))) / 2
    : null;

  const union = { front: null, back: null };
  const addToUnion = (side, b) => {
    if (!b) return;
    const u = union[side];
    if (!u) {
      union[side] = {
        minX: b.x,
        minY: b.y,
        maxX: b.x2 ?? b.x + b.w,
        maxY: b.y2 ?? b.y + b.h,
      };
    } else {
      u.minX = Math.min(u.minX, b.x);
      u.minY = Math.min(u.minY, b.y);
      u.maxX = Math.max(u.maxX, b.x2 ?? b.x + b.w);
      u.maxY = Math.max(u.maxY, b.y2 ?? b.y + b.h);
    }
  };

  for (const raw of items) {
    const side = sideOf(raw, abCenterMm);
    const fin = (raw?.finish || finishFromLayer(raw?.layerPath)).toLowerCase();
    const bucket = buckets[side] || buckets.front;

    const b = normalizeBounds(raw?.bounds);
    addToUnion(side, b);

    bucket[getEffectKey(fin)].push({
      id: raw?.id ?? undefined,
      name: raw?.name || "",
      bounds: b,
      layerPath: Array.isArray(raw?.layerPath) ? raw.layerPath : [],
      finish: fin,
    });
  }

  ["front", "back"].forEach((side) => {
    const u = union[side];
    if (u)
      buckets[side].__meta = {
        size_mm: { w: u.maxX - u.minX, h: u.maxY - u.minY },
        origin_mm: { x: u.minX, y: u.minY },
      };
  });

  return buckets;
}

function mkBucket() {
  return {
    print: [],
    foil: [],
    spot_uv: [],
    emboss: [],
    deboss: [],
    die_cut: [],
    __meta: null,
  };
}

function getEffectKey(fin) {
  switch (fin) {
    case "foil": return "foil";
    case "uv": case "spot_uv": case "spot-uv": case "spotuv": return "spot_uv";
    case "emboss": return "emboss";
    case "deboss": return "deboss";
    case "die": case "die_cut": case "die-cut": case "diecut": return "die_cut";
    default: return "print";
  }
}

function normalizeBounds(b) {
  if (!b || typeof b !== "object") return null;
  const x = num(b.x), y = num(b.y);
  const w = num(b.w ?? b.width), h = num(b.h ?? b.height);
  const x2 = num(b.x2 ?? (isFinite(x) && isFinite(w) ? x + w : undefined));
  const y2 = num(b.y2 ?? (isFinite(y) && isFinite(h) ? y + h : undefined));
  return { x, y, w, h, x2, y2, width: w, height: h };
}

function num(v) {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function finishFromLayer(layerPath) {
  const lp = (Array.isArray(layerPath) ? layerPath.join("_") : String(layerPath || "")).toLowerCase();
  if (lp.includes("foil")) return "foil";
  if (lp.includes("spot_uv") || lp.includes("spot-uv") || lp.includes("spotuv") || lp.includes("uv")) return "spot_uv";
  if (lp.includes("emboss")) return "emboss";
  if (lp.includes("deboss")) return "deboss";
  if (lp.includes("die") && lp.includes("cut")) return "die_cut";
  return "print";
}

function sideOf(item, abCenterMm) {
  const top = Array.isArray(item?.layerPath) && item.layerPath.length ? String(item.layerPath[0]).toLowerCase() : "";
  if (top.includes("front")) return "front";
  if (top.includes("back")) return "back";

  const left = item?.bounds && typeof item.bounds.x === "number" ? item.bounds.x : undefined;
  if (typeof left === "number" && typeof abCenterMm === "number") {
    return left < abCenterMm ? "front" : "back";
  }
  return "front";
}

