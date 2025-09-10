// Replace the entire content with:
export function adaptParserJsonToViewer(data) {
  if (!data || typeof data !== "object") {
    throw new Error("adaptParserJsonToViewer: invalid input");
  }

  // Extract dimensions from artboard bounds (in mm)
  const artboard = data?.doc?.artboards?.[0]?.bounds;
  const cardDimensions = {
    width: artboard?.w || 89,
    height: artboard?.h || 51,
    thickness: 0.35, // Standard thickness in mm
    units: "mm",
  };

  // Extract job ID
  const jobId = data?.job_id || data?._meta?.job_id || null;

  // Process items to create effect layers
  const items = Array.isArray(data.items) ? data.items : [];

  // Group items by finish type and side
  const effectLayers = {
    foil: [],
    spot_uv: [],
    emboss: [],
    print: [],
    die_cut: [],
  };

  // Process each item
  items.forEach((item, index) => {
    const layerPath = item.layerPath || [];
    const finish = item.finish || "print";
    const itemData = {
      id: `item_${index}`,
      name: item.name || `Layer ${index}`,
      bounds: item.bounds || null,
      layerPath: layerPath,
      finish: finish,
      side: layerPath[0]?.toLowerCase().includes("front")
        ? "front"
        : layerPath[0]?.toLowerCase().includes("back")
        ? "back"
        : "front",
    };

    // Categorize by finish type
    if (finish === "print") {
      effectLayers.print.push(itemData);
    } else {
      // Extract finish type from layer path
      const layerName = layerPath.join("_").toLowerCase();
      if (layerName.includes("foil")) {
        effectLayers.foil.push({
          ...itemData,
          color: extractFoilColor(layerName),
        });
      } else if (layerName.includes("uv") || layerName.includes("spot")) {
        effectLayers.spot_uv.push(itemData);
      } else if (layerName.includes("emboss") || layerName.includes("deboss")) {
        effectLayers.emboss.push({
          ...itemData,
          mode: layerName.includes("deboss") ? "deboss" : "emboss",
        });
      }
    }
  });

  // Create the expected structure
  const adapted = {
    jobId,
    id: jobId,
    dimensions: cardDimensions,

    // For compatibility with existing code
    parseResult: {
      jobId,
      dimensions: cardDimensions,
      maps: {}, // No texture maps from this parser
      parsing: {
        method: "OCG Layer Extraction",
        confidence: items.length > 0 ? 0.95 : 0.5,
      },
      metadata: {
        originalFile: data?._meta?.input_file || "Unknown file",
        totalItems: items.length,
        processingTime: data?._meta?.elapsed_sec * 1000 || 0,
      },
    },

    // Processed layer data for 3D rendering
    layers: effectLayers,

    // Keep original for debugging
    original: data,
  };

  return adapted;
}

function extractFoilColor(layerName) {
  if (layerName.includes("gold")) return "gold";
  if (layerName.includes("silver")) return "silver";
  if (layerName.includes("copper")) return "copper";
  if (layerName.includes("rose")) return "rose_gold";
  if (layerName.includes("hot_pink")) return "hot_pink";
  if (layerName.includes("teal")) return "teal";
  return "gold"; // default
}
