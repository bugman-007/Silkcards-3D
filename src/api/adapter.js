// src/api/adapter.js
export function adaptParserJsonToViewer(data) {
  if (!data || typeof data !== "object") {
    throw new Error("adaptParserJsonToViewer: invalid input");
  }

  // Size from artboard 0 bounds (mm) – this exists in your parser JSON
  const ab = data?.doc?.artboards?.[0]?.bounds || {};
  const widthMm = typeof ab.w === "number" ? ab.w : null;
  const heightMm = typeof ab.h === "number" ? ab.h : null;

  // job id (your exporter returns job_id)
  const jobId = data?.job_id || data?.jobId || data?.id || null;

  const dims = { width: widthMm ?? 90, height: heightMm ?? 54, units: "mm" };

  // Minimal shape the viewer understands today
  const adapted = {
    jobId,
    id: jobId,
    dimensions: dims,
    maps: {}, // no textures yet
    parseResult: { jobId, dimensions: dims, maps: {} }, // keep legacy nesting happy
    original: data, // keep the raw payload for debugging / overlays
  };

  // Pre-group effects (front/back + finish) – safe to carry for future overlays
  const items = Array.isArray(data.items) ? data.items : [];
  const sideOf = (it) => {
    const t = String(it?.layerPath?.[0] || "").toLowerCase();
    if (t.startsWith("front")) return "front";
    if (t.startsWith("back")) return "back";
    return "front";
  };
  const fx = {
    front: { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] },
    back: { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] },
  };
  for (const it of items) {
    const side = sideOf(it);
    const f = (it?.finish || "print").toLowerCase();
    (fx[side][f] ?? fx[side].print).push({
      name: it?.name || "",
      bounds: it?.bounds || null,
      layerPath: it?.layerPath || [],
    });
  }
  adapted.effects = fx;
  return adapted;
}

// // src/api/adapter.js
// // Adapts the Windows parser JSON to the shape expected by the viewer.

// export function adaptParserJsonToViewer(data) {
//   if (!data || typeof data !== 'object') {
//     throw new Error('adaptParserJsonToViewer: invalid input');
//   }

//   // dimensions in mm from artboard 0 (your exporter already emits this)
//   const ab = data?.doc?.artboards?.[0]?.bounds || {};
//   const widthMm  = typeof ab.w === 'number' ? ab.w : null;
//   const heightMm = typeof ab.h === 'number' ? ab.h : null;

//   // job id aliases
//   const jobId =
//     data?.job_id ||
//     data?.jobId  ||
//     data?.id     ||
//     null;

//   // Fallback dims if missing (will still render a plane)
//   const dims = {
//     width:  widthMm ?? 90,  // mm
//     height: heightMm ?? 54, // mm
//     units: 'mm'
//   };

//   // Shape the object so existing viewer code is happy right away
//   const adapted = {
//     // preferred by viewer
//     jobId,
//     id: jobId,
//     dimensions: dims,
//     maps: {},                     // no textures yet (that’s v1)

//     // also provide the legacy-nested shape some code paths look for
//     parseResult: {
//       jobId,
//       dimensions: dims,
//       maps: {}
//     },

//     // keep the original payload for debugging/overlays later
//     original: data
//   };

//   // (Optional) pre-group items for future overlays — safe to include now
//   const items = Array.isArray(data.items) ? data.items : [];
//   const sideOf = (it) => {
//     const top = String(it?.layerPath?.[0] || '').toLowerCase();
//     if (top.startsWith('front')) return 'front';
//     if (top.startsWith('back'))  return 'back';
//     return 'front';
//   };
//   const fx = { front: { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] },
//                back:  { print: [], foil: [], uv: [], emboss: [], deboss: [], die: [] } };

//   for (const it of items) {
//     const side = sideOf(it);
//     const f = (it?.finish || 'print').toLowerCase();
//     const bucket = (fx[side][f] ?? fx[side].print);
//     bucket.push({
//       name: it?.name || '',
//       bounds: it?.bounds || null,
//       layerPath: it?.layerPath || []
//     });
//   }

//   adapted.effects = fx;
//   return adapted;
// }
