// export_to_pdf.jsx - Main export script for parser-service
// Handles detection, recoloring, and PDF/X + PNG/SVG export
// IMPORTANT: ES3 only - use var, no let/const, no arrow functions

#target illustrator
#include "utils.jsx"

// Disable dialogs to prevent blocking
app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;

// Main execution function
(function main() {
  // Load job configuration from runtime/job.jsx at RUNTIME (not preprocessor)
  var __JOB = null;
  try {
    // Get the path to runtime/job.jsx - USE .fsName to get filesystem string!
    var scriptFile = new File($.fileName);                    // scripts/jsx/export_to_pdf.jsx
    var jsxFolder = scriptFile.parent;                        // scripts/jsx/
    var scriptsFolder = jsxFolder.parent;                     // scripts/
    var runtimeJobPath = scriptsFolder.fsName + "/runtime/job.jsx";
    
    // Normalize path separators for cross-platform compatibility
    runtimeJobPath = runtimeJobPath.replace(/\\/g, "/");
    
    $.writeln("[JSX] Script file: " + scriptFile.fsName);
    $.writeln("[JSX] Scripts folder: " + scriptsFolder.fsName);
    $.writeln("[JSX] Looking for job config at: " + runtimeJobPath);
    
    var jobFile = new File(runtimeJobPath);
    
    if (!jobFile.exists) {
      $.writeln("[JSX] ERROR: Job config file not found at: " + runtimeJobPath);
      // Write emergency error to temp folder so Python can diagnose
      try {
        var tempError = new File(Folder.temp.fsName + "/parser_job_config_error.txt");
        tempError.open("w");
        tempError.writeln("Job config file not found");
        tempError.writeln("Expected at: " + runtimeJobPath);
        tempError.writeln("Script location: " + scriptFile.fsName);
        tempError.close();
        $.writeln("[JSX] Wrote emergency error to: " + tempError.fsName);
      } catch (tempErr) {
        $.writeln("[JSX] Could not write temp error: " + tempErr.message);
      }
      throw new Error("Job config file not found at: " + runtimeJobPath);
    }
    
    $.writeln("[JSX] Job config file found, reading...");
    
    // Read and evaluate the job config
    jobFile.open("r");
    var jobScript = jobFile.read();
    jobFile.close();
    
    $.writeln("[JSX] Job config read, length: " + jobScript.length + " bytes");
    
    // Evaluate the script to load __JOB variable
    eval(jobScript);
    
    if (!__JOB) {
      throw new Error("Job config evaluated but __JOB is null");
    }
    
    $.writeln("[JSX] Job config loaded successfully");
    $.writeln("[JSX] Job ID: " + __JOB.job_id);
    
  } catch (e) {
    $.writeln("[JSX] FATAL: Cannot load job config: " + e.message);
    // Write emergency error to temp folder
    try {
      var tempError = new File(Folder.temp.fsName + "/parser_job_config_error.txt");
      tempError.open("w");
      tempError.writeln("ERROR: " + e.message);
      tempError.writeln("Line: " + (e.line || "unknown"));
      tempError.writeln("Script: " + $.fileName);
      tempError.close();
    } catch (tempErr) {
      // Ignore
    }
    // This will fail gracefully if __JOB is not loaded
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
  
  // Write debug log
  try {
    var debugLog = new File(outputDir + "/" + jobId + "_jsx_debug.log");
    debugLog.open("w");
    debugLog.writeln("=== JSX Debug Log ===");
    debugLog.writeln("Job ID: " + jobId);
    debugLog.writeln("Input: " + inputPath);
    debugLog.writeln("Output: " + outputDir);
    debugLog.writeln("Illustrator Version: " + app.version);
    debugLog.writeln("Script started: " + new Date());
    debugLog.close();
  } catch (e) {
    log("WARNING: Could not write debug log: " + e.message);
  }
  
  // Open document
  var doc = openDocument(inputPath);
  if (!doc) {
    writeErrorAndExit("AI_OPEN_FAILED", "Failed to open .ai file: " + inputPath);
    return;
  }
  
  // Log successful open
  try {
    var debugLog = new File(outputDir + "/" + jobId + "_jsx_debug.log");
    debugLog.open("a");
    debugLog.writeln("Document opened successfully: " + doc.name);
    debugLog.writeln("Artboards: " + doc.artboards.length);
    debugLog.close();
  } catch (e) {
    // Ignore logging errors
  }
  
  try {
    // Instead of duplicating, we'll work directly with the document
    // and close it at the end without saving
    logToDebugFile(outputDir, jobId, "Working with document directly (no duplication needed)");
    
    // Validate document has artboards FIRST
    if (!doc.artboards || doc.artboards.length === 0) {
      throw new Error("Document has no artboards");
    }
    
    log("Document opened: " + doc.artboards.length + " artboard(s)");
    logToDebugFile(outputDir, jobId, "Validated: " + doc.artboards.length + " artboard(s)");
    
    // Force redraw to ensure document is ready
    app.redraw();
    logToDebugFile(outputDir, jobId, "Document ready for processing");
    
    // Phase 1: Detection
    log("Phase 1: Detection");
    logToDebugFile(outputDir, jobId, "===== Phase 1: Detection =====");
    var detectionResult = detectFinishes(doc);
    logToDebugFile(outputDir, jobId, "Detection completed. Finishes found: " + stringifySimple(detectionResult.finishesUsed));
    
    // Phase 2: Create spot swatches
    log("Phase 2: Creating spot swatches");
    logToDebugFile(outputDir, jobId, "===== Phase 2: Creating spot swatches =====");
    createSpotSwatches(doc, detectionResult.finishesUsed, outputDir, jobId);
    logToDebugFile(outputDir, jobId, "Spot swatches created");
    logToDebugFile(outputDir, jobId, "Total spots in document: " + doc.spots.length);
    logToDebugFile(outputDir, jobId, "Total swatches in document: " + doc.swatches.length);
    
    // Phase 3: Detect rectangles & decide export mode
    log("Phase 3: Detecting card rectangles");
    logToDebugFile(outputDir, jobId, "===== Phase 3: Detect Card Rectangles =====");
    var frames = detectCardFrames(doc);
    logToDebugFile(outputDir, jobId, "Card frames detected: " + (frames ? frames.length : 0));
    var classifiedRects = classifyFramesIfMultiPanel(doc, frames, detectionResult);
    var isMultiPanel = classifiedRects && classifiedRects.length >= 4; // heuristic
    
    if (isMultiPanel) {
      logToDebugFile(outputDir, jobId, "Layout: multiPanel");
      exportMultiPanel(doc, classifiedRects, detectionResult, outputDir, jobId);
    } else {
      log("Phase 3b: Calculating per-side bounds (twoPanel)");
      logToDebugFile(outputDir, jobId, "===== Phase 3b: Per-Side Bounds (twoPanel) =====");
      var cardBoundsPerSide = calculateCardBoundsForAllSides(doc, detectionResult);
      logToDebugFile(outputDir, jobId, "Card bounds calculated (twoPanel)");
      
      log("Phase 4: Processing each side separately");
      logToDebugFile(outputDir, jobId, "===== Phase 4: Per-Side Processing =====");
      for (var sideKey in detectionResult.sides) {
        if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
        var sideName = sideKey.split("_")[0];
        var sideIndex = 0;
        logToDebugFile(outputDir, jobId, "--- Processing side: " + sideName + " ---");
        var cardBounds = cardBoundsPerSide[sideKey];
        if (!cardBounds) { logToDebugFile(outputDir, jobId, "No card bounds for " + sideKey + ", skipping"); continue; }
        exportSideAlbedo(doc, sideName, sideIndex, cardBounds, outputDir);
        var recoloredCount = recolorSideItemsToSpots(doc, sideKey, detectionResult, outputDir, jobId);
        logToDebugFile(outputDir, jobId, "Recolored " + recoloredCount + " sub-items for " + sideName);
        exportSidePDF(doc, sideName, sideIndex, cardBounds, outputDir, jobId);
        if (detectionResult.sides[sideKey].DIE && detectionResult.sides[sideKey].DIE.length > 0) {
          exportSideDieSVG(doc, sideName, sideIndex, cardBounds, detectionResult.sides[sideKey].DIE, outputDir);
        }
        logToDebugFile(outputDir, jobId, "Completed processing for " + sideName);
      }
      logToDebugFile(outputDir, jobId, "All sides processed");
    }
    
    // Phase 5: Write scratch JSON
    log("Phase 5: Writing scratch JSON");
    logToDebugFile(outputDir, jobId, "===== Phase 5: Writing scratch JSON =====");
    var scratchPath = outputDir + "/" + jobId + "_scratch.json";
    writeScratchJSON(scratchPath, doc, detectionResult, cardBoundsPerSide);
    logToDebugFile(outputDir, jobId, "Scratch JSON written");
    
    // Success
    log("Job completed successfully");
    logToDebugFile(outputDir, jobId, "===== JOB COMPLETED SUCCESSFULLY =====");
    
    // Close document without saving (this is safe - doesn't modify original file)
    try {
      doc.close(SaveOptions.DONOTSAVECHANGES);
      logToDebugFile(outputDir, jobId, "Document closed without saving");
    } catch (closeErr) {
      logToDebugFile(outputDir, jobId, "Warning: Could not close document cleanly: " + closeErr.message);
      // Continue anyway - the important work is done
    }
    
    // Write success sentinel
    writeSentinel(outputDir + "/" + jobId + "_jsx_done.txt", "success");
    logToDebugFile(outputDir, jobId, "Success sentinel written");
    logToDebugFile(outputDir, jobId, "Script completed at: " + new Date());
    
    // CRITICAL: Quit Illustrator so Python can continue
    logToDebugFile(outputDir, jobId, "Quitting Illustrator...");
    app.quit();
    
  } catch (e) {
    log("ERROR: " + e.message);
    logToDebugFile(outputDir, jobId, "===== FATAL ERROR =====");
    logToDebugFile(outputDir, jobId, "Error: " + e.message);
    logToDebugFile(outputDir, jobId, "Line: " + (e.line || "unknown"));
    logToDebugFile(outputDir, jobId, "File: " + (e.fileName || "unknown"));
    logToDebugFile(outputDir, jobId, "Stack: " + (e.stack || "no stack trace"));
    
    // Try to close document
    try {
      if (doc) {
        doc.close(SaveOptions.DONOTSAVECHANGES);
        logToDebugFile(outputDir, jobId, "Document closed after error");
      }
    } catch (e2) {
      logToDebugFile(outputDir, jobId, "Could not close document: " + e2.message);
      // Not critical - process will clean up
    }
    
    writeErrorAndExit("PDF_SAVE_FAILED", e.message);
    
    // Quit Illustrator even on error so Python can continue
    logToDebugFile(outputDir, jobId, "Quitting Illustrator after error...");
    app.quit();
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
function createSpotSwatches(doc, finishesUsed, outputDir, jobId) {
  var finishNames = ["UV", "FOIL", "EMBOSS", "DIE"];
  
  for (var i = 0; i < finishNames.length; i++) {
    var finishName = finishNames[i];
    
    if (finishesUsed[finishName]) {
      logToDebugFile(outputDir, jobId, "  Creating spot swatch: " + finishName);
      var swatch = ensureSwatch(doc, finishName, "spot");
      if (swatch) {
        logToDebugFile(outputDir, jobId, "    Created: " + swatch.name + " (color: " + getColorInfo(swatch) + ")");
      } else {
        logToDebugFile(outputDir, jobId, "    ERROR: Failed to create spot for " + finishName);
      }
    }
  }
}

function getColorInfo(swatch) {
  try {
    if (swatch.color && swatch.color.typename === "CMYKColor") {
      var c = swatch.color;
      return "C" + Math.round(c.cyan) + " M" + Math.round(c.magenta) + " Y" + Math.round(c.yellow) + " K" + Math.round(c.black);
    }
    return swatch.color ? swatch.color.typename : "no color";
  } catch (e) {
    return "error getting color";
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
  var totalRecolored = 0;
  
  log("==== Starting Recoloring Phase ====");
  
  for (var sideKey in detectionResult.sides) {
    if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
    
    var buckets = detectionResult.sides[sideKey];
    log("Processing side: " + sideKey);
    
    for (var i = 0; i < finishTypes.length; i++) {
      var finishType = finishTypes[i];
      var items = buckets[finishType];
      
      if (!items || items.length === 0) {
        log("  " + finishType + ": 0 items (skipping)");
        continue;
      }
      
      log("  " + finishType + ": " + items.length + " items to recolor");
      
      // Get spot swatch
      var swatch = findSwatch(doc, finishType);
      if (!swatch) {
        log("  ❌ ERROR: Swatch not found for " + finishType);
        log("  CRITICAL: Cannot recolor without spot swatch!");
        continue;
      }
      
      log("  ✓ Found spot swatch: " + swatch.name);
      
      // Recolor each item recursively
      var successCount = 0;
      for (var j = 0; j < items.length; j++) {
        var recoloredCount = recolorItemToSpotRecursive(items[j], swatch);
        if (recoloredCount > 0) {
          successCount += recoloredCount;
        }
      }
      
      log("  ✓ Recolored " + successCount + " sub-items from " + items.length + " top-level items to " + finishType);
      totalRecolored += successCount;
    }
  }
  
  log("==== Recoloring Complete ====");
  log("Total sub-items recolored: " + totalRecolored);
  
  if (totalRecolored === 0) {
    log("⚠️  WARNING: NO items were recolored! PDF will have NO spot plates!");
    log("⚠️  This means detection found items but recoloring failed.");
    log("⚠️  Check: 1) Spot swatch creation, 2) Item types, 3) Locked/hidden items");
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
 * Recursively recolor an item and all its children to a spot color.
 * Returns the number of atomic items successfully recolored.
 * 
 * This handles:
 * - GroupItems (recurse into children)
 * - CompoundPathItems (recolor all pathItems)
 * - TextFrames (recolor characters)
 * - PathItems, RasterItems, etc. (direct recolor)
 */
function recolorItemToSpotRecursive(item, spot) {
  var count = 0;
  
  try {
    var itemType = item.typename;
    
    // Handle GroupItems - recurse into children
    if (itemType === "GroupItem") {
      for (var i = 0; i < item.pageItems.length; i++) {
        count += recolorItemToSpotRecursive(item.pageItems[i], spot);
      }
      return count;
    }
    
    // Handle CompoundPathItems - recurse into pathItems
    if (itemType === "CompoundPathItem") {
      for (var j = 0; j < item.pathItems.length; j++) {
        count += recolorItemToSpotRecursive(item.pathItems[j], spot);
      }
      return count;
    }
    
    // Handle TextFrames - recolor text characters
    if (itemType === "TextFrame") {
      return recolorTextFrame(item, spot);
    }
    
    // Handle atomic items (PathItem, RasterItem, etc.)
    return recolorAtomicItem(item, spot);
    
  } catch (e) {
    log("    WARNING: Cannot process item type " + (itemType || "unknown") + ": " + e.message);
    return 0;
  }
}

/**
 * Recolor an atomic item (PathItem, RasterItem, PluginItem, etc.)
 */
function recolorAtomicItem(item, spot) {
  try {
    var spotColor = new SpotColor();
    spotColor.spot = spot;
    spotColor.tint = 100;
    
    var recolored = false;
    
    // Set fill if present
    if (item.filled) {
      item.fillColor = spotColor;
      recolored = true;
    }
    
    // Set stroke if present
    if (item.stroked) {
      item.strokeColor = spotColor;
      recolored = true;
    }
    
    return recolored ? 1 : 0;
  } catch (e) {
    log("    WARNING: Cannot recolor atomic item: " + e.message);
    return 0;
  }
}

/**
 * Recolor text frame to spot color.
 * Text frames need special handling.
 */
function recolorTextFrame(textFrame, spot) {
  try {
    var spotColor = new SpotColor();
    spotColor.spot = spot;
    spotColor.tint = 100;
    
    // Try to recolor all text characters
    if (textFrame.textRange && textFrame.textRange.characterAttributes) {
      textFrame.textRange.characterAttributes.fillColor = spotColor;
      textFrame.textRange.characterAttributes.strokeColor = spotColor;
      return 1;
    }
    
    return 0;
  } catch (e) {
    log("    WARNING: Cannot recolor text frame: " + e.message);
    return 0;
  }
}

// ============================================================================
// Card Bounds Calculation (NEW - for per-side export)
// ============================================================================

/**
 * Calculate card-sized bounds for all sides.
 * Returns object like: {front_layer_0: [x0,y0,x1,y1], back_layer_0: [...]}
 */
function calculateCardBoundsForAllSides(doc, detectionResult) {
  var boundsPerSide = {};
  
  // 0) Try rectangle/frame detection first (DIE or trim frames)
  try {
    var frames = detectCardFrames(doc);
    if (frames && frames.length >= 1) {
      var chosen = chooseSideRectanglesFromFrames(frames, detectionResult);
      if (chosen && (chosen.front || chosen.back)) {
        if (chosen.front) boundsPerSide.front_layer_0 = chosen.front.bounds;
        if (chosen.back) boundsPerSide.back_layer_0 = chosen.back.bounds;
      }
    }
  } catch (e) {
    // Non-fatal: fall back to content-based detection
  }
  
  for (var sideKey in detectionResult.sides) {
    if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
    
    // If we already filled from frame detection, skip fallback for that side
    if (boundsPerSide[sideKey]) continue;

    var buckets = detectionResult.sides[sideKey];
    var allItems = [];
    
    // Priority 1: Use DIE bounds if available (most accurate for card size)
    if (buckets.DIE && buckets.DIE.length > 0) {
      allItems = buckets.DIE;
      log("Using DIE bounds for " + sideKey);
    } else {
      // Priority 2: Use all content bounds
      for (var finish in buckets) {
        if (buckets[finish] && buckets[finish].length > 0) {
          allItems = allItems.concat(buckets[finish]);
        }
      }
      log("Using content bounds for " + sideKey + " (" + allItems.length + " items)");
    }
    
    if (allItems.length > 0) {
      boundsPerSide[sideKey] = getItemsBounds(allItems);
    }
  }
  
  return boundsPerSide;
}

/**
 * Detect card frames (DIE or trim rectangles) in the document.
 * Returns an array of { bounds:[l,t,r,b], isDie:true/false, layerName:string }.
 */
function detectCardFrames(doc) {
  var frames = [];
  // Scan all pathItems
  var paths = doc.pathItems;
  for (var i = 0; i < paths.length; i++) {
    var p = paths[i];
    try {
      if (!p.closed) continue;
      // Stroke-only rectangle-like path
      if (!p.stroked) continue;
      if (p.filled) continue;
      // Quick size sanity
      var b = p.geometricBounds; // [l,t,r,b]
      var w = Math.abs(b[2] - b[0]);
      var h = Math.abs(b[1] - b[3]);
      if (w < 50 || h < 50) continue; // too small to be a card
      var aspect = w / h;
      if (aspect < 1.40 || aspect > 2.10) continue; // business card-ish
      // 4 corners check: Illustrator may approximate; allow 4 points or more
      if (p.pathPoints.length < 4) continue;
      // Prefer DIE spot or layer hints
      var isDie = false;
      try {
        var sc = p.strokeColor;
        if (sc && sc.typename === 'SpotColor' && sc.spot && sc.spot.name) {
          var n = String(sc.spot.name).toLowerCase();
          if (n.indexOf('die') !== -1 || n.indexOf('cut') !== -1) isDie = true;
        }
      } catch (e2) {}
      var layerName = '';
      try { layerName = p.layer ? String(p.layer.name) : ''; } catch (e3) {}
      if (!isDie && layerName) {
        var ln = layerName.toLowerCase();
        if (ln.indexOf('die') !== -1 || ln.indexOf('cut') !== -1) isDie = true;
      }
      frames.push({ bounds: [b[0], b[1], b[2], b[3]], isDie: isDie, layerName: layerName });
    } catch (e1) {
      // ignore malformed
    }
  }
  return frames;
}

/**
 * From detected frames choose one for front and one for back using overlap with PRINT buckets.
 */
function chooseSideRectanglesFromFrames(frames, detectionResult) {
  // Prefer DIE frames
  var dieFrames = [];
  for (var i = 0; i < frames.length; i++) if (frames[i].isDie) dieFrames.push(frames[i]);
  var candidate = (dieFrames.length >= 1) ? dieFrames : frames;
  
  function scoreFrameForSide(frame, sideKey) {
    var buckets = detectionResult.sides[sideKey];
    var items = buckets && buckets.PRINT ? buckets.PRINT : [];
    var s = 0;
    for (var i = 0; i < items.length; i++) {
      try { s += rectOverlapArea(frame.bounds, items[i].geometricBounds); } catch (e) {}
    }
    return s;
  }
  
  var bestFront = null, bestFrontScore = -1;
  var bestBack = null, bestBackScore = -1;
  for (var i = 0; i < candidate.length; i++) {
    var f = candidate[i];
    var fs = scoreFrameForSide(f, 'front_layer_0');
    if (fs > bestFrontScore) { bestFrontScore = fs; bestFront = f; }
    var bs = scoreFrameForSide(f, 'back_layer_0');
    if (bs > bestBackScore) { bestBackScore = bs; bestBack = f; }
  }
  // If both chose the same and we have at least two, split by x (left→front, right→back)
  if (bestFront && bestBack && bestFront === bestBack && candidate.length >= 2) {
    var left = candidate[0];
    for (var j = 1; j < candidate.length; j++) {
      if (candidate[j].bounds[0] < left.bounds[0]) left = candidate[j];
    }
    var right = left;
    var maxX = -999999;
    for (var k = 0; k < candidate.length; k++) {
      if (candidate[k].bounds[2] > maxX) { maxX = candidate[k].bounds[2]; right = candidate[k]; }
    }
    bestFront = left; bestBack = right;
  }
  return { front: bestFront, back: bestBack };
}

/** Rectangle intersection area helper */
function rectOverlapArea(a, b) {
  var l = Math.max(a[0], b[0]);
  var t = Math.min(a[1], b[1]);
  var r = Math.min(a[2], b[2]);
  var bt = Math.max(a[3], b[3]);
  var w = r - l;
  var h = t - bt;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

/**
 * Calculate union bounding box of multiple items.
 * Returns [left, top, right, bottom] in points.
 */
function getItemsBounds(items) {
  if (!items || items.length === 0) return null;
  
  var left = 999999;
  var top = -999999;
  var right = -999999;
  var bottom = 999999;
  
  for (var i = 0; i < items.length; i++) {
    try {
      var bounds = items[i].geometricBounds; // [left, top, right, bottom]
      if (bounds[0] < left) left = bounds[0];
      if (bounds[1] > top) top = bounds[1];
      if (bounds[2] > right) right = bounds[2];
      if (bounds[3] < bottom) bottom = bounds[3];
    } catch (e) {
      // Skip items that can't provide bounds
    }
  }
  
  return [left, top, right, bottom];
}

// ============================================================================
// Multi-Panel (Case B) helpers
// ============================================================================

/**
 * Classify frames into (side,effect) rectangles using overlap votes.
 * Returns array of {bounds, sideKey, effect}
 */
function classifyFramesIfMultiPanel(doc, frames, detectionResult) {
  if (!frames || frames.length === 0) return [];
  // Heuristic: if many similar sized frames exist, treat as multi-panel
  if (frames.length < 3) return [];
  
  var rects = [];
  for (var i = 0; i < frames.length; i++) {
    var f = frames[i];
    var best = { sideKey: null, effect: null, score: -1 };
    for (var sideKey in detectionResult.sides) {
      if (!detectionResult.sides.hasOwnProperty(sideKey)) continue;
      var buckets = detectionResult.sides[sideKey];
      var effects = ["PRINT","UV","FOIL","EMBOSS","DIE"];
      for (var e = 0; e < effects.length; e++) {
        var eff = effects[e];
        var items = buckets[eff] || [];
        var s = 0;
        for (var j = 0; j < items.length; j++) {
          try { s += rectOverlapArea(f.bounds, items[j].geometricBounds); } catch (e1) {}
        }
        if (s > best.score) best = { sideKey: sideKey, effect: eff, score: s };
      }
    }
    if (best.sideKey) rects.push({ bounds: f.bounds, sideKey: best.sideKey, effect: best.effect });
  }
  return rects;
}

/**
 * Export for multi-panel: one export per rectangle/effect.
 */
function exportMultiPanel(doc, rects, detectionResult, outputDir, jobId) {
  var perEffectPDF = true; // default on for verification across both cases
  for (var i = 0; i < rects.length; i++) {
    var r = rects[i];
    var sideName = r.sideKey.indexOf('front') === 0 ? 'front' : 'back';
    var sideIndex = 0;
    if (r.effect === 'PRINT') {
      exportSideAlbedo(doc, sideName, sideIndex, r.bounds, outputDir);
    } else {
      // Duplicate only overlapping items to a temp layer and recolor
      recolorAndExportEffectRect(doc, detectionResult, r, outputDir, jobId, perEffectPDF);
    }
  }
}

/**
 * Recolor duplicates within a rectangle and export a PDF for that effect.
 */
function recolorAndExportEffectRect(doc, detectionResult, rectInfo, outputDir, jobId, perEffectPDF) {
  var sideName = rectInfo.sideKey.indexOf('front')===0 ? 'front':'back';
  var sideIndex = 0;
  var effect = rectInfo.effect; // UV/FOIL/EMBOSS/DIE
  
  var tempLayer = doc.layers.add();
  tempLayer.name = "__temp_" + sideName + "_" + effect;
  
  try {
    // Collect items overlapping this rectangle from the side/effect bucket
    var buckets = detectionResult && detectionResult.sides ? detectionResult.sides[rectInfo.sideKey] : null;
    var items = buckets ? (buckets[effect]||[]) : [];
    var dupCount = 0;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      try {
        if (rectOverlapArea(rectInfo.bounds, it.geometricBounds) > 0) {
          it.duplicate(tempLayer, ElementPlacement.PLACEATEND);
          dupCount++;
        }
      } catch (e) {}
    }
    
    // Recolor duplicates to the spot swatch
    var sw = findSwatch(doc, effect);
    if (sw) {
      for (var k = 0; k < tempLayer.pageItems.length; k++) {
        recolorItemToSpotRecursive(tempLayer.pageItems[k], sw);
      }
    }
    
    // Export PDF clipped to rect
    if (perEffectPDF) {
      var filename = jobId + "_" + sideName + "_layer_" + sideIndex + "_" + effect.toLowerCase() + ".pdf";
      var pdfPath = outputDir + "/" + filename;
      var ab = doc.artboards.add(rectInfo.bounds);
      var idx = doc.artboards.length - 1;
      try {
        doc.artboards.setActiveArtboardIndex(idx);
        saveToPDFX(doc, pdfPath);
      } finally {
        doc.artboards.remove(idx);
      }
    }
  } finally {
    try { tempLayer.remove(); } catch (e2) {}
  }
}

/** Create bounds map from chosen rects for twoPanel */
function calculateCardBoundsFromRects(classified) {
  var out = {};
  for (var i = 0; i < classified.length; i++) {
    var c = classified[i];
    if (c.effect === 'PRINT') out[c.sideKey] = c.bounds;
  }
  return out;
}
// ============================================================================
// Per-Side Export Functions (NEW)
// ============================================================================

/**
 * Export albedo PNG for one side at card size (before recoloring).
 */
function exportSideAlbedo(doc, sideName, sideIndex, cardBounds, outputDir) {
  var filename = sideName + "_layer_" + sideIndex + "_albedo.png";
  var outputPath = outputDir + "/" + filename;
  
  log("Exporting card-sized albedo: " + filename);
  
  // Create temp artboard at card bounds
  var tempAB = doc.artboards.add(cardBounds);
  var tempABIndex = doc.artboards.length - 1;
  
  try {
    // Set as active
    doc.artboards.setActiveArtboardIndex(tempABIndex);
    
    // Export PNG clipped to this artboard
    exportArtboardToPNG(doc, tempABIndex, outputPath, 300);
    
  } finally {
    // Remove temp artboard
    doc.artboards.remove(tempABIndex);
  }
}

/**
 * Recolor items for ONE side only.
 */
function recolorSideItemsToSpots(doc, sideKey, detectionResult, outputDir, jobId) {
  var buckets = detectionResult.sides[sideKey];
  var finishTypes = ["UV", "FOIL", "EMBOSS", "DIE"];
  var totalRecolored = 0;
  
  logToDebugFile(outputDir, jobId, "  Starting recoloring for " + sideKey);
  
  // Log buckets structure (ES3-compatible, no JSON.stringify)
  var bucketKeys = [];
  if (buckets) {
    for (var key in buckets) {
      if (buckets.hasOwnProperty(key)) {
        bucketKeys.push(key);
      }
    }
  }
  logToDebugFile(outputDir, jobId, "  Buckets: [" + bucketKeys.join(", ") + "]");
  
  for (var i = 0; i < finishTypes.length; i++) {
    var finishType = finishTypes[i];
    var items = buckets[finishType];
    
    logToDebugFile(outputDir, jobId, "  Checking " + finishType + ": " + (items ? items.length : 0) + " items");
    
    if (!items || items.length === 0) continue;
    
    var swatch = findSwatch(doc, finishType);
    if (!swatch) {
      logToDebugFile(outputDir, jobId, "  ERROR: Swatch not found for " + finishType + "!");
      logToDebugFile(outputDir, jobId, "  Available swatches: " + getSwatchNames(doc));
      continue;
    }
    
    logToDebugFile(outputDir, jobId, "  Found swatch: " + swatch.name);
    
    // Recolor each item recursively
    var itemsRecolored = 0;
    for (var j = 0; j < items.length; j++) {
      var count = recolorItemToSpotRecursive(items[j], swatch);
      itemsRecolored += count;
      totalRecolored += count;
    }
    
    logToDebugFile(outputDir, jobId, "  Recolored " + itemsRecolored + " sub-items for " + finishType);
  }
  
  logToDebugFile(outputDir, jobId, "  Total recolored: " + totalRecolored + " sub-items");
  return totalRecolored;
}

function getSwatchNames(doc) {
  var names = [];
  for (var i = 0; i < doc.swatches.length; i++) {
    names.push(doc.swatches[i].name);
  }
  for (var j = 0; j < doc.spots.length; j++) {
    names.push(doc.spots[j].name + "(spot)");
  }
  return names.join(", ");
}

/**
 * Export PDF for one side with card-sized artboard and spot colors.
 */
function exportSidePDF(doc, sideName, sideIndex, cardBounds, outputDir, jobId) {
  var filename = jobId + "_" + sideName + "_layer_" + sideIndex + ".pdf";
  var pdfPath = outputDir + "/" + filename;
  
  log("Exporting card-sized PDF: " + filename);
  
  // Create temp artboard at card bounds
  var tempAB = doc.artboards.add(cardBounds);
  var tempABIndex = doc.artboards.length - 1;
  
  try {
    // Set as active
    doc.artboards.setActiveArtboardIndex(tempABIndex);
    
    // Save PDF with spots preserved (will only include visible content on this artboard)
    saveToPDFX(doc, pdfPath);
    
  } finally {
    // Remove temp artboard
    doc.artboards.remove(tempABIndex);
  }
}

/**
 * Export die SVG for one side at card size.
 */
function exportSideDieSVG(doc, sideName, sideIndex, cardBounds, dieItems, outputDir) {
  var filename = sideName + "_layer_" + sideIndex + "_diecut.svg";
  var outputPath = outputDir + "/" + filename;
  
  log("Exporting card-sized die SVG: " + filename);
  
  // Use existing die export function
  try {
    exportDieSVG(doc, dieItems, outputPath);
  } catch (e) {
    log("WARNING: Cannot export die SVG: " + e.message);
  }
}

// ============================================================================
// Phase 4: Save to PDF/X
// ============================================================================

/**
 * Save document to PDF with spot colors preserved.
 */
function saveToPDFX(doc, pdfPath) {
  var file = new File(pdfPath);
  
  // PDF save options - using PDF 1.4 (Acrobat 5) for maximum compatibility
  var pdfOptions = new PDFSaveOptions();
  
  // Use ACROBAT5 (PDF 1.4) which is universally supported and preserves spot colors
  pdfOptions.compatibility = PDFCompatibility.ACROBAT5;
  
  // Preserve spot colors - do NOT convert to process
  pdfOptions.colorConversionID = ColorConversion.None;
  pdfOptions.colorDestinationID = ColorDestination.None;
  
  // Don't preserve editability - we just need the plates
  pdfOptions.preserveEditability = false;
  
  // Don't open PDF after saving
  pdfOptions.viewAfterSaving = false;
  
  // Embed fonts
  pdfOptions.fontSubsetThreshold = 100;
  
  // High quality
  pdfOptions.optimization = false;
  
  try {
    doc.saveAs(file, pdfOptions);
    log("Saved PDF: " + pdfPath);
  } catch (saveErr) {
    log("ERROR saving PDF: " + saveErr.message);
    throw new Error("PDF save failed: " + saveErr.message);
  }
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
function writeScratchJSON(scratchPath, doc, detectionResult, cardBoundsPerSide) {
  var data = {
    illustrator: {
      version: getIllustratorVersion(),
      pdf_preset: "PDF/X-4",
      doc_color: "CMYK"
    },
    artboards: detectionResult.artboards,
    sides: buildSidesInfo(detectionResult, cardBoundsPerSide),
    warnings: detectionResult.warnings || [],
    cardBounds: cardBoundsPerSide || {}
  };
  
  writeJSON(scratchPath, data);
  
  log("Wrote scratch JSON: " + scratchPath);
}

/**
 * Build sides info for scratch JSON.
 */
function buildSidesInfo(detectionResult, cardBoundsPerSide) {
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
    
    var sideInfo = {
      side: sideName,
      index: 0,
      finishes: finishes,
      die: hasDie
    };
    
    // Add card bounds if available
    if (cardBoundsPerSide && cardBoundsPerSide[sideKey]) {
      sideInfo.cardBounds = cardBoundsPerSide[sideKey];
    }
    
    sides.push(sideInfo);
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
  log("FATAL ERROR [" + code + "]: " + message);
  
  try {
    var errorData = {
      success: false,
      error: {
        code: code,
        message: message
      }
    };
    
    // Try to write to working directory if __JOB is available
    if (typeof __JOB !== "undefined" && __JOB && __JOB.output && __JOB.job_id) {
      var errorPath = normalizePathForES(__JOB.output) + "/" + __JOB.job_id + "_error.json";
      writeJSON(errorPath, errorData);
      log("Error JSON written to: " + errorPath);
      
      // Also write to debug log
      try {
        var debugLog = new File(normalizePathForES(__JOB.output) + "/" + __JOB.job_id + "_jsx_debug.log");
        debugLog.open("a");
        debugLog.writeln("ERROR: " + code);
        debugLog.writeln("Message: " + message);
        debugLog.writeln("Time: " + new Date());
        debugLog.close();
      } catch (e2) {
        // Ignore
      }
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

/**
 * Log to debug file (helper function).
 */
function logToDebugFile(outputDir, jobId, message) {
  try {
    var debugLog = new File(outputDir + "/" + jobId + "_jsx_debug.log");
    debugLog.open("a");  // Append mode
    debugLog.writeln("[" + new Date().toTimeString() + "] " + message);
    debugLog.close();
  } catch (e) {
    // Silently ignore logging errors
    $.writeln("Log error: " + e.message);
  }
}

/**
 * Simple stringify for objects (ES3-compatible).
 */
function stringifySimple(obj) {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  
  var type = typeof obj;
  if (type === "string") return obj;
  if (type === "number" || type === "boolean") return String(obj);
  
  if (obj instanceof Array) {
    return "[Array:" + obj.length + "]";
  }
  
  if (type === "object") {
    var keys = [];
    for (var k in obj) {
      if (obj.hasOwnProperty(k)) {
        keys.push(k);
      }
    }
    return "{" + keys.join(",") + "}";
  }
  
  return String(obj);
}

