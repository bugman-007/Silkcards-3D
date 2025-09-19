// src/api/adapter.js
/**
 * Adapt the Windows parser/Illustrator manifest into what the viewer expects.
 * - Prefer geometry.front/back.size_mm for card size
 * - Flatten maps to simple keys: albedo_front, foil_front, uv_front, emboss_front (+ _back variants)
 * - Retain original items and compute light-weight per-side groupings for debugging
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

  // ----- flatten maps -----
  const flatMaps = {};
  const flattenSide = (side, obj) => {
    if (!obj || typeof obj !== "object") return;
    Object.entries(obj).forEach(([k, v]) => {
      if (!v) return;
      flatMaps[`${k}_${side}`] = v; // e.g. 'albedo_front': 'assets/front_albedo.png'
    });
  };
  flattenSide("front", data?.maps?.front);
  flattenSide("back", data?.maps?.back);

  // ----- light-weight grouping of items (optional for debugger/UI) -----
  const artboardBounds = data?.doc?.artboards?.[0]?.bounds || null; // mm
  const items = Array.isArray(data?.items) ? data.items : [];

  const grouped = separateCardsFromItems(items, artboardBounds);

  // Build the final adapted shape
  const adapted = {
    jobId,
    id: jobId,
    dimensions: dims,
    maps: flatMaps, // legacy convenience (ok to keep)
    geometry: data?.geometry || {},
    parseResult: { ...data }, // <-- retain full v3 manifest here
    cards: separateCardsFromItems(
      data?.items || [],
      data?.doc?.artboards?.[0]?.bounds || null
    ),
    layers: {}, // optional
    original: data,
  };
  return adapted;
}

/* ----------------------------- helpers below ----------------------------- */

/**
 * Separate items into card "front"/"back" buckets and effect arrays.
 * Each bucket has: print[], foil[], spot_uv[], emboss[], die_cut[], __meta.size_mm
 */
function separateCardsFromItems(items, artboardBounds) {
  const buckets = {
    front: mkBucket(),
    back: mkBucket(),
  };

  // Pre-compute artboard center X in mm for fallback side detection
  const abCenterMm =
    artboardBounds && typeof artboardBounds.x === "number"
      ? (artboardBounds.x +
          (artboardBounds.x2 ?? artboardBounds.x + (artboardBounds.w || 0))) /
        2
      : null;

  // Collect union bounds per side to compute size_mm later
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

  // Attach per-side size_mm meta (if we saw anything)
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
    case "foil":
      return "foil";
    case "uv":
    case "spot_uv":
    case "spot-uv":
    case "spotuv":
      return "spot_uv";
    case "emboss":
      return "emboss";
    case "deboss":
      return "deboss";
    case "die":
    case "die_cut":
    case "die-cut":
    case "diecut":
      return "die_cut";
    default:
      return "print";
  }
}

function normalizeBounds(b) {
  if (!b || typeof b !== "object") return null;
  const x = num(b.x),
    y = num(b.y);
  const w = num(b.w ?? b.width),
    h = num(b.h ?? b.height);
  const x2 = num(b.x2 ?? (isFinite(x) && isFinite(w) ? x + w : undefined));
  const y2 = num(b.y2 ?? (isFinite(y) && isFinite(h) ? y + h : undefined));
  return { x, y, w, h, x2, y2, width: w, height: h };
}

function num(v) {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function finishFromLayer(layerPath) {
  const lp = (
    Array.isArray(layerPath) ? layerPath.join("_") : String(layerPath || "")
  ).toLowerCase();
  if (lp.includes("foil")) return "foil";
  if (
    lp.includes("spot_uv") ||
    lp.includes("spot-uv") ||
    lp.includes("spotuv") ||
    lp.includes("uv")
  )
    return "spot_uv";
  if (lp.includes("emboss")) return "emboss";
  if (lp.includes("deboss")) return "deboss";
  if (lp.includes("die") && lp.includes("cut")) return "die_cut";
  return "print";
}

function sideOf(item, abCenterMm) {
  // Prefer explicit side token on the TOP layer (first in path)
  const top =
    Array.isArray(item?.layerPath) && item.layerPath.length
      ? String(item.layerPath[0]).toLowerCase()
      : "";
  if (top.includes("front")) return "front";
  if (top.includes("back")) return "back";

  // Fallback: compare item left to artboard center
  const left =
    item?.bounds && typeof item.bounds.x === "number"
      ? item.bounds.x
      : undefined;
  if (typeof left === "number" && typeof abCenterMm === "number") {
    return left < abCenterMm ? "front" : "back";
  }
  // Default
  return "front";
}
