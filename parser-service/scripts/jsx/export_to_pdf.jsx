// export_to_pdf.jsx - Main export script for parser-service
// Handles detection, recoloring, and PDF/X + PNG/SVG export
// IMPORTANT: ES3 only - use var, no let/const, no arrow functions

#target illustrator
#include "utils.jsx"

// Main execution function
(function main() {
  // Load job configuration from runtime/job.jsx
  try {
    #include "../runtime/job.jsx"
  } catch (e) {
    writeErrorAndExit("JOB_CONFIG_MISSING", "Cannot load runtime/job.jsx: " + e.message);
    return;
  }
  
  // Validate job config
  if (!__JOB || !__JOB.input || !__JOB.output || !__JOB.job_id) {
    writeErrorAndExit("JOB_CONFIG_INVALID", "Invalid job configuration in runtime/job.jsx");
    return;
  }
  
  var jobId = __JOB.job_id;
  var inputPath = normalizePathForES(__JOB.input);
  var outputDir = normalizePathForES(__JOB.output); // Working directory
  
  log("Starting job " + jobId);
  log("Input: " + inputPath);
  log("Output: " + outputDir);
  
  // Open document
  var doc = openDocument(inputPath);
  if (!doc) {
    writeErrorAndExit("AI_OPEN_FAILED", "Failed to open .ai file: " + inputPath);
    return;
  }
  
  try {
    // Duplicate document (never modify original)
    var tempDoc = duplicateDocument(doc);
    if (!tempDoc) {
      throw new Error("Failed to duplicate document");
    }
    
    // Close original
    doc.close(SaveOptions.DONOTSAVECHANGES);
    doc = tempDoc;
    
    // Validate document has artboards
    if (!doc.artboards || doc.artboards.length === 0) {
      throw new Error("Document has no artboards");
    }
    
    log("Document opened: " + doc.artboards.length + " artboard(s)");
    
    // Phase 1: Detection
    log("Phase 1: Detection");
    var detectionResult = detectFinishes(doc);
    
    // Phase 2: Create spot swatches
    log("Phase 2: Creating spot swatches");
    createSpotSwatches(doc, detectionResult.finishesUsed);
    
    // Phase 3: Recolor items to spots
    log("Phase 3: Recoloring items to spot colors");
    recolorItemsToSpots(doc, detectionResult);
    
    // Phase 4: Save to PDF/X
    log("Phase 4: Saving to PDF/X");
    var pdfPath = outputDir + "/" + jobId + ".pdf";
    saveToPDFX(doc, pdfPath);
    
    // Phase 5: Export albedo PNGs per side
    log("Phase 5: Exporting albedo PNGs");
    exportAlbedoPNGs(doc, outputDir, detectionResult);
    
    // Phase 6: Export die SVGs per side
    log("Phase 6: Exporting die SVGs");
    exportDieSVGs(doc, outputDir, detectionResult);
    
    // Phase 7: Write scratch JSON
    log("Phase 7: Writing scratch JSON");
    var scratchPath = outputDir + "/" + jobId + "_scratch.json";
    writeScratchJSON(scratchPath, doc, detectionResult);
    
    // Success
    log("Job completed successfully");
    doc.close(SaveOptions.DONOTSAVECHANGES);
    
    // Write success sentinel
    writeSentinel(outputDir + "/" + jobId + "_jsx_done.txt", "success");
    
  } catch (e) {
    log("ERROR: " + e.message);
    try {
      doc.close(SaveOptions.DONOTSAVECHANGES);
    } catch (e2) {
      // Ignore
    }
    writeErrorAndExit("PDF_SAVE_FAILED", e.message);
  }
})();

// ============================================================================
// Phase 1: Detection
// ============================================================================

/**
 * Detect finishes via union of layer names and artboard names.
 * Returns object with side/finish buckets.
 */
function detectFinishes(doc) {
  var result = {
    artboards: [],
    sides: {},
    finishesUsed: {},
    warnings: []
  };
  
  // Collect artboard info
  for (var i = 0; i < doc.artboards.length; i++) {
    var ab = doc.artboards[i];
    var abInfo = {
      index: i,
      name: ab.name || ("Artboard " + (i + 1)),
      bounds: [ab.artboardRect[0], ab.artboardRect[1], ab.artboardRect[2], ab.artboardRect[3]],
      side: determineSide(ab, i)
    };
    
    // Check if artboard name itself indicates a finish (Case B)
    abInfo.finish = detectFinishFromName(abInfo.name);
    
    result.artboards.push(abInfo);
  }
  
  // Initialize side buckets (front/back, layer 0)
  result.sides.front_layer_0 = {
    PRINT: [],
    FOIL: [],
    UV: [],
    EMBOSS: [],
    DIE: []
  };
  result.sides.back_layer_0 = {
    PRINT: [],
    UV: [],
    FOIL: [],
    EMBOSS: [],
    DIE: []
  };
  
  // Process all layers (Case A: layer/sublayer names)
  processLayersForFinishes(doc, result);
  
  // Process artboard-based finishes (Case B: artboard names)
  processArtboardsForFinishes(doc, result);
  
  return result;
}

/**
 * Process layers and sublayers for finish detection (Case A).
 */
function processLayersForFinishes(doc, result) {
  for (var i = 0; i < doc.layers.length; i++) {
    var layer = doc.layers[i];
    processLayerRecursive(doc, layer, result);
  }
}

/**
 * Recursively process layer and its sublayers.
 */
function processLayerRecursive(doc, layer, result) {
  if (!layer.visible || layer.locked) {
    return; // Skip hidden/locked layers
  }
  
  // Detect finish from layer name
  var layerFinish = detectFinishFromName(layer.name);
  
  // Process all page items in this layer
  var items = collectLayerItems(layer, []);
  
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    
    // Determine which side this item belongs to
    var itemSide = determineItemSide(doc, item, result.artboards);
    var sideKey = itemSide + "_layer_0";
    
    if (!result.sides[sideKey]) {
      continue; // Unknown side
    }
    
    // Classify item into finish bucket
    var finishType = layerFinish || "PRINT";
    
    if (!result.sides[sideKey][finishType]) {
      result.sides[sideKey][finishType] = [];
    }
    
    result.sides[sideKey][finishType].push(item);
    
    // Track which finishes are used
    if (finishType !== "PRINT") {
      result.finishesUsed[finishType] = true;
    }
  }
}

/**
 * Process artboard-based finishes (Case B).
 */
function processArtboardsForFinishes(doc, result) {
  // If an artboard name carries a finish token, all content on it is for that finish
  for (var i = 0; i < result.artboards.length; i++) {
    var abInfo = result.artboards[i];
    
    if (!abInfo.finish) {
      continue; // No finish detected from artboard name
    }
    
    // Get all items on this artboard
    var items = getItemsOnArtboard(doc, abInfo.index);
    
    for (var j = 0; j < items.length; j++) {
      var item = items[j];
      
      // Determine side
      var itemSide = determineSide(doc.artboards[abInfo.index], abInfo.index);
      var sideKey = itemSide + "_layer_0";
      
      if (!result.sides[sideKey]) {
        continue;
      }
      
      // Add to finish bucket
      var finishType = abInfo.finish;
      
      if (!result.sides[sideKey][finishType]) {
        result.sides[sideKey][finishType] = [];
      }
      
      result.sides[sideKey][finishType].push(item);
      
      // Track which finishes are used
      result.finishesUsed[finishType] = true;
    }
  }
}

/**
 * Determine which side (front/back) an item belongs to based on geometric overlap.
 */
function determineItemSide(doc, item, artboards) {
  try {
    var itemBounds = item.geometricBounds;
    
    var maxOverlap = 0;
    var bestSide = "front";
    
    for (var i = 0; i < artboards.length; i++) {
      var ab = artboards[i];
      var overlap = calculateOverlapArea(itemBounds, ab.bounds);
      
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestSide = ab.side;
      }
    }
    
    return bestSide;
  } catch (e) {
    return "front"; // Default
  }
}

/**
 * Get all page items that overlap with a specific artboard.
 */
function getItemsOnArtboard(doc, artboardIndex) {
  var items = [];
  var abBounds = doc.artboards[artboardIndex].artboardRect;
  
  for (var i = 0; i < doc.pageItems.length; i++) {
    var item = doc.pageItems[i];
    
    try {
      if (boundsOverlap(item.geometricBounds, abBounds, 1.0)) {
        items.push(item);
      }
    } catch (e) {
      // Skip items that can't be checked
    }
  }
  
  return items;
}

// ============================================================================
// Phase 2: Create Spot Swatches
// ============================================================================

/**
 * Create spot color swatches for detected finishes.
 */
function createSpotSwatches(doc, finishesUsed) {
  var finishNames = ["UV", "FOIL", "EMBOSS", "DIE"];
  
  for (var i = 0; i < finishNames.length; i++) {
    var finishName = finishNames[i];
    
    if (finishesUsed[finishName]) {
      log("Creating spot swatch: " + finishName);
      ensureSwatch(doc, finishName, "spot");
    }
  }
}

// ============================================================================
// Phase 3: Recolor Items to Spots
// ============================================================================

/**
 * Recolor all items in finish buckets to their corresponding spot colors.
 */
function recolorItemsToSpots(doc, detectionResult) {
  var finishTypes = ["UV", "FOIL", "EMBOSS", "DIE"];
  
  for (var sideKey in detectionResult.sides) {
    if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
    
    var buckets = detectionResult.sides[sideKey];
    
    for (var i = 0; i < finishTypes.length; i++) {
      var finishType = finishTypes[i];
      var items = buckets[finishType];
      
      if (!items || items.length === 0) continue;
      
      log("Recoloring " + items.length + " items to " + finishType + " (" + sideKey + ")");
      
      // Get spot swatch
      var swatch = findSwatch(doc, finishType);
      if (!swatch) {
        log("WARNING: Swatch not found for " + finishType);
        continue;
      }
      
      // Recolor each item
      for (var j = 0; j < items.length; j++) {
        recolorItemToSpot(items[j], swatch);
      }
    }
  }
}

/**
 * Find swatch by name.
 */
function findSwatch(doc, name) {
  for (var i = 0; i < doc.swatches.length; i++) {
    if (doc.swatches[i].name === name) {
      return doc.swatches[i];
    }
  }
  
  // Try spots
  for (var j = 0; j < doc.spots.length; j++) {
    if (doc.spots[j].name === name) {
      return doc.spots[j];
    }
  }
  
  return null;
}

/**
 * Recolor a single item to a spot color at 100% tint.
 */
function recolorItemToSpot(item, spot) {
  try {
    var spotColor = new SpotColor();
    spotColor.spot = spot;
    spotColor.tint = 100;
    
    // Set fill if present
    if (item.filled) {
      item.fillColor = spotColor;
    }
    
    // Set stroke if present
    if (item.stroked) {
      item.strokeColor = spotColor;
    }
  } catch (e) {
    log("WARNING: Cannot recolor item: " + e.message);
  }
}

// ============================================================================
// Phase 4: Save to PDF/X
// ============================================================================

/**
 * Save document to PDF/X-4 with spot colors preserved.
 */
function saveToPDFX(doc, pdfPath) {
  var file = new File(pdfPath);
  
  // PDF save options
  var pdfOptions = new PDFSaveOptions();
  pdfOptions.compatibility = PDFCompatibility.PDFX42010;
  pdfOptions.preserveEditability = false;
  pdfOptions.viewAfterSaving = false;
  pdfOptions.colorConversionID = ColorConversion.None;
  pdfOptions.colorDestinationID = ColorDestination.None;
  pdfOptions.pdfXStandard = PDFXStandard.PDFX42010;
  
  doc.saveAs(file, pdfOptions);
  
  log("Saved PDF/X: " + pdfPath);
}

// ============================================================================
// Phase 5: Export Albedo PNGs
// ============================================================================

/**
 * Export albedo PNG per side/index (composite CMYK preview).
 */
function exportAlbedoPNGs(doc, outputDir, detectionResult) {
  var artboards = detectionResult.artboards;
  
  for (var i = 0; i < artboards.length; i++) {
    var ab = artboards[i];
    var side = ab.side;
    var filename = side + "_layer_0_albedo.png";
    var outputPath = outputDir + "/" + filename;
    
    log("Exporting albedo: " + filename);
    
    exportArtboardToPNG(doc, ab.index, outputPath, 300);
  }
}

// ============================================================================
// Phase 6: Export Die SVGs
// ============================================================================

/**
 * Export die SVG per side/index.
 * Isolates DIE items, outlines strokes, and exports to SVG.
 */
function exportDieSVGs(doc, outputDir, detectionResult) {
  for (var sideKey in detectionResult.sides) {
    if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
    
    var buckets = detectionResult.sides[sideKey];
    var dieItems = buckets.DIE;
    
    if (!dieItems || dieItems.length === 0) continue;
    
    // Parse side name
    var sideName = sideKey.split("_")[0]; // "front" or "back"
    var filename = sideName + "_layer_0_diecut.svg";
    var outputPath = outputDir + "/" + filename;
    
    log("Exporting die SVG: " + filename);
    
    try {
      exportDieSVG(doc, dieItems, outputPath);
    } catch (e) {
      log("WARNING: Cannot export die SVG: " + e.message);
    }
  }
}

/**
 * Export die items to SVG.
 */
function exportDieSVG(doc, dieItems, outputPath) {
  // Create temporary layer for die export
  var tempLayer = ensureLayer(doc, "__DIE_EXPORT_TEMP__");
  tempLayer.visible = true;
  
  // Duplicate die items to temp layer
  var duplicates = [];
  for (var i = 0; i < dieItems.length; i++) {
    var item = dieItems[i];
    var dup = item.duplicate(tempLayer, ElementPlacement.PLACEATEND);
    duplicates.push(dup);
  }
  
  // Outline strokes
  for (var j = 0; j < duplicates.length; j++) {
    try {
      if (duplicates[j].stroked) {
        duplicates[j].stroked = false; // Simplified: remove strokes
      }
    } catch (e) {
      // Ignore
    }
  }
  
  // Hide all other layers
  var originalVisibility = [];
  for (var k = 0; k < doc.layers.length; k++) {
    originalVisibility.push(doc.layers[k].visible);
    if (doc.layers[k] !== tempLayer) {
      doc.layers[k].visible = false;
    }
  }
  
  // Export to SVG
  var file = new File(outputPath);
  var svgOptions = new ExportOptionsSVG();
  svgOptions.embedRasterImages = false;
  svgOptions.cssProperties = SVGCSSPropertyLocation.STYLEELEMENTS;
  svgOptions.fontSubsetting = SVGFontSubsetting.None;
  
  doc.exportFile(file, ExportType.SVG, svgOptions);
  
  // Cleanup: restore visibility and remove temp layer
  for (var m = 0; m < doc.layers.length; m++) {
    doc.layers[m].visible = originalVisibility[m];
  }
  
  tempLayer.remove();
  
  log("Exported die SVG: " + outputPath);
}

// ============================================================================
// Phase 7: Write Scratch JSON
// ============================================================================

/**
 * Write scratch JSON with detection results and metadata.
 */
function writeScratchJSON(scratchPath, doc, detectionResult) {
  var data = {
    illustrator: {
      version: getIllustratorVersion(),
      pdf_preset: "PDF/X-4",
      doc_color: "CMYK"
    },
    artboards: detectionResult.artboards,
    sides: buildSidesInfo(detectionResult),
    warnings: detectionResult.warnings || []
  };
  
  writeJSON(scratchPath, data);
  
  log("Wrote scratch JSON: " + scratchPath);
}

/**
 * Build sides info for scratch JSON.
 */
function buildSidesInfo(detectionResult) {
  var sides = [];
  
  for (var sideKey in detectionResult.sides) {
    if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
    
    var buckets = detectionResult.sides[sideKey];
    var sideName = sideKey.split("_")[0];
    var finishes = ["albedo"]; // Always present
    var hasDie = false;
    
    if (buckets.UV && buckets.UV.length > 0) finishes.push("uv");
    if (buckets.FOIL && buckets.FOIL.length > 0) finishes.push("foil");
    if (buckets.EMBOSS && buckets.EMBOSS.length > 0) finishes.push("emboss");
    if (buckets.DIE && buckets.DIE.length > 0) {
      finishes.push("diecut_mask");
      hasDie = true;
    }
    
    sides.push({
      side: sideName,
      index: 0,
      finishes: finishes,
      die: hasDie
    });
  }
  
  return sides;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Open document with error handling.
 */
function openDocument(path) {
  try {
    var file = new File(path);
    if (!file.exists) {
      log("ERROR: File does not exist: " + path);
      return null;
    }
    
    return app.open(file);
  } catch (e) {
    log("ERROR: Cannot open document: " + e.message);
    return null;
  }
}

/**
 * Duplicate document.
 */
function duplicateDocument(doc) {
  try {
    // Save temp copy
    var tempPath = Folder.temp + "/parser_temp_" + new Date().getTime() + ".ai";
    var tempFile = new File(tempPath);
    
    doc.saveAs(tempFile);
    
    // Open temp copy
    var tempDoc = app.open(tempFile);
    
    // Delete temp file from disk (doc is now in memory)
    try {
      tempFile.remove();
    } catch (e) {
      // Ignore
    }
    
    return tempDoc;
  } catch (e) {
    log("ERROR: Cannot duplicate document: " + e.message);
    return null;
  }
}

/**
 * Write error JSON and exit.
 */
function writeErrorAndExit(code, message) {
  try {
    var errorData = {
      success: false,
      error: {
        code: code,
        message: message
      }
    };
    
    // Try to write to working directory if __JOB is available
    if (typeof __JOB !== "undefined" && __JOB.output && __JOB.job_id) {
      var errorPath = normalizePathForES(__JOB.output) + "/" + __JOB.job_id + "_error.json";
      writeJSON(errorPath, errorData);
    }
  } catch (e) {
    log("ERROR: Cannot write error JSON: " + e.message);
  }
}

/**
 * Write sentinel file to signal completion.
 */
function writeSentinel(path, content) {
  try {
    var file = new File(path);
    file.open("w");
    file.write(content);
    file.close();
  } catch (e) {
    log("ERROR: Cannot write sentinel: " + e.message);
  }
}

