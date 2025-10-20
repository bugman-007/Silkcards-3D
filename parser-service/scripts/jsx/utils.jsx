// utils.jsx - ES3 ExtendScript utilities for Illustrator
// Shared helper functions for parser-service JSX scripts
// IMPORTANT: ES3 only - use var, no let/const, no arrow functions

/**
 * Token lists for finish detection (must match Python config.py)
 */
var TOKENS = {
  FOIL: ["foil", "metal", "metallic"],
  UV: ["uv", "spot_uv", "varnish", "gloss"],
  EMBOSS: ["emboss", "deboss", "height"],
  DIE: ["die", "diecut", "die_cut"]
};

/**
 * Detect finish type from layer or artboard name.
 * Case-insensitive, suffix-tolerant "contains" matching.
 * 
 * @param {String} name - Layer or artboard name
 * @return {String|null} - Finish type (FOIL, UV, EMBOSS, DIE) or null
 */

function snapshotLayerVisibility(doc) {
  var snap = [];
  for (var i = 0; i < doc.layers.length; i++) {
    snap.push({ layer: doc.layers[i], visible: !!doc.layers[i].visible });
  }
  return snap;
}

/**
 * Restore a snapshot created by snapshotLayerVisibility.
 */
function restoreLayerVisibility(snapshot) {
  if (!snapshot) return;
  for (var i = 0; i < snapshot.length; i++) {
    try { snapshot[i].layer.visible = snapshot[i].visible; } catch (_) {}
  }
}

function findSwatch(doc, name) {
  if (!doc || !name) return null;

  // 1) Look in Spots first (correct object for SpotColor.spot)
  for (var i = 0; i < doc.spots.length; i++) {
    if (doc.spots[i].name === name) return doc.spots[i];
  }

  // 2) If not found, create a Spot
  return ensureSwatch(doc, name, "spot"); // returns a Spot
}

function detectFinishFromName(name) {
  if (!name) return null;
  
  var nameLower = String(name).toLowerCase();
  
  // Check each finish type's tokens
  for (var finishType in TOKENS) {
    if (!TOKENS.hasOwnProperty(finishType)) continue;
    
    var tokens = TOKENS[finishType];
    for (var i = 0; i < tokens.length; i++) {
      if (nameLower.indexOf(tokens[i]) !== -1) {
        return finishType;
      }
    }
  }
  
  return null;
}

/**
 * Check if two bounding boxes overlap (with tolerance).
 * Illustrator coordinate system: Y increases downward (top > bottom).
 * 
 * @param {Array} bounds1 - [left, top, right, bottom]
 * @param {Array} bounds2 - [left, top, right, bottom]
 * @param {Number} tolerance - Overlap tolerance in points (default: 0.5)
 * @return {Boolean} - true if bounds overlap
 */
function boundsOverlap(bounds1, bounds2, tolerance) {
  if (!bounds1 || bounds1.length !== 4) return false;
  if (!bounds2 || bounds2.length !== 4) return false;
  if (typeof tolerance === "undefined") tolerance = 0.5;
  
  // Normalize bounds (handle reversed coordinates)
  var b1_left = Math.min(bounds1[0], bounds1[2]);
  var b1_right = Math.max(bounds1[0], bounds1[2]);
  var b1_top = Math.max(bounds1[1], bounds1[3]);
  var b1_bottom = Math.min(bounds1[1], bounds1[3]);
  
  var b2_left = Math.min(bounds2[0], bounds2[2]);
  var b2_right = Math.max(bounds2[0], bounds2[2]);
  var b2_top = Math.max(bounds2[1], bounds2[3]);
  var b2_bottom = Math.min(bounds2[1], bounds2[3]);
  
  // Check overlap with tolerance
  var overlapX = (b1_right >= b2_left - tolerance) && (b1_left <= b2_right + tolerance);
  var overlapY = (b1_top >= b2_bottom - tolerance) && (b1_bottom <= b2_top + tolerance);
  
  return overlapX && overlapY;
}

/**
 * Calculate overlap area between two bounds.
 * 
 * @param {Array} bounds1 - [left, top, right, bottom]
 * @param {Array} bounds2 - [left, top, right, bottom]
 * @return {Number} - Overlap area in square points
 */
function calculateOverlapArea(bounds1, bounds2) {
  if (!boundsOverlap(bounds1, bounds2, 0)) return 0;
  
  var b1_left = Math.min(bounds1[0], bounds1[2]);
  var b1_right = Math.max(bounds1[0], bounds1[2]);
  var b1_top = Math.max(bounds1[1], bounds1[3]);
  var b1_bottom = Math.min(bounds1[1], bounds1[3]);
  
  var b2_left = Math.min(bounds2[0], bounds2[2]);
  var b2_right = Math.max(bounds2[0], bounds2[2]);
  var b2_top = Math.max(bounds2[1], bounds2[3]);
  var b2_bottom = Math.min(bounds2[1], bounds2[3]);
  
  var overlapLeft = Math.max(b1_left, b2_left);
  var overlapRight = Math.min(b1_right, b2_right);
  var overlapTop = Math.min(b1_top, b2_top);
  var overlapBottom = Math.max(b1_bottom, b2_bottom);
  
  var width = overlapRight - overlapLeft;
  var height = overlapTop - overlapBottom;
  
  return Math.max(0, width) * Math.max(0, height);
}

/**
 * Find or create a swatch by name.
 * 
 * @param {Document} doc - Illustrator document
 * @param {String} name - Swatch name
 * @param {String} type - "spot" or "process"
 * @return {Swatch} - Found or created swatch
 */
function ensureSwatch(doc, name, type) {
  if (!doc || !name) return null;
  if (!type) type = "spot";
  
  var swatches = doc.swatches;
  
  // Try to find existing swatch
  for (var i = 0; i < swatches.length; i++) {
    if (swatches[i].name === name) {
      return swatches[i];
    }
  }
  
  // Create new spot swatch
  var newSwatch = doc.spots.add();
  newSwatch.name = name;
  
  // Set color (100% K for spot separations)
  var spotColor = new SpotColor();
  spotColor.spot = newSwatch;
  spotColor.tint = 100;
  
  return newSwatch;
}

/**
 * Find or create a layer by name.
 * 
 * @param {Document} doc - Illustrator document
 * @param {String} name - Layer name
 * @return {Layer} - Found or created layer
 */
function ensureLayer(doc, name) {
  if (!doc || !name) return null;
  
  var layers = doc.layers;
  
  // Try to find existing layer
  for (var i = 0; i < layers.length; i++) {
    if (layers[i].name === name) {
      return layers[i];
    }
  }
  
  // Create new layer
  var newLayer = doc.layers.add();
  newLayer.name = name;
  
  return newLayer;
}

/**
 * Recursively collect all page items from a layer (including sublayers).
 * 
 * @param {Layer} layer - Illustrator layer
 * @param {Array} items - Accumulator array (optional)
 * @return {Array} - Array of PageItems
 */
function collectLayerItems(layer, items) {
  if (!layer) return [];
  if (!items) items = [];
  
  // Add direct page items
  for (var i = 0; i < layer.pageItems.length; i++) {
    items.push(layer.pageItems[i]);
  }
  
  // Recurse into sublayers
  for (var j = 0; j < layer.layers.length; j++) {
    collectLayerItems(layer.layers[j], items);
  }
  
  return items;
}

/**
 * Write JSON file (ES3-compatible).
 * 
 * @param {String} filePath - Absolute file path
 * @param {Object} data - Data to serialize
 */
function writeJSON(filePath, data) {
  var file = new File(filePath);
  file.encoding = "UTF-8";
  
  if (!file.open("w")) {
    throw new Error("Cannot open file for writing: " + filePath);
  }
  
  // Simple JSON serialization (ES3)
  file.write(stringifyJSON(data));
  file.close();
}

/**
 * Simple JSON stringify for ES3 (limited support).
 * For complex objects, consider using json2.js library.
 * 
 * @param {*} obj - Object to stringify
 * @return {String} - JSON string
 */
function stringifyJSON(obj) {
  if (obj === null) return "null";
  if (obj === undefined) return "undefined";
  
  var type = typeof obj;
  
  if (type === "string") {
    return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r") + '"';
  }
  
  if (type === "number" || type === "boolean") {
    return String(obj);
  }
  
  if (obj instanceof Array) {
    var parts = [];
    for (var i = 0; i < obj.length; i++) {
      parts.push(stringifyJSON(obj[i]));
    }
    return "[" + parts.join(",") + "]";
  }
  
  if (type === "object") {
    var parts = [];
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        parts.push(stringifyJSON(key) + ":" + stringifyJSON(obj[key]));
      }
    }
    return "{" + parts.join(",") + "}";
  }
  
  return "null";
}

/**
 * Convert Windows path to forward slashes for ExtendScript.
 * 
 * @param {String} path - Windows path
 * @return {String} - Path with forward slashes
 */
function normalizePathForES(path) {
  if (!path) return "";
  return String(path).replace(/\\/g, "/");
}

/**
 * Get Illustrator version string.
 * 
 * @return {String} - Version string (e.g., "25.0" for Illustrator 2025)
 */
function getIllustratorVersion() {
  try {
    return app.version || "unknown";
  } catch (e) {
    return "unknown";
  }
}

/**
 * Determine side (front/back) from artboard index or name.
 * 
 * @param {Artboard} artboard - Illustrator artboard
 * @param {Number} index - Artboard index
 * @return {String} - "front" or "back"
 */
function determineSide(artboard, index) {
  if (!artboard) return index === 0 ? "front" : "back";
  
  var name = String(artboard.name || "").toLowerCase();
  
  // Check name first
  if (name.indexOf("back") !== -1 || name.indexOf("rear") !== -1) {
    return "back";
  }
  
  if (name.indexOf("front") !== -1) {
    return "front";
  }
  
  // Default: even indices = front, odd = back
  return (index % 2 === 0) ? "front" : "back";
}

/**
 * Create a temporary artboard for clipping exports.
 * 
 * @param {Document} doc - Illustrator document
 * @param {Number} left - Left coordinate
 * @param {Number} top - Top coordinate
 * @param {Number} right - Right coordinate
 * @param {Number} bottom - Bottom coordinate
 * @return {Object} - Object with index, restoreIndex, and remove() method
 */
function createTempArtboard(doc, left, top, right, bottom) {
  if (!doc) return null;
  
  var currentIndex = doc.artboards.getActiveArtboardIndex();
  var newArtboard = doc.artboards.add([left, top, right, bottom]);
  var newIndex = doc.artboards.length - 1;
  
  return {
    index: newIndex,
    restoreIndex: currentIndex,
    artboard: newArtboard,
    remove: function() {
      try {
        doc.artboards.setActiveArtboardIndex(this.restoreIndex);
        doc.artboards.remove(this.index);
        app.redraw();
      } catch (e) {
        // Ignore errors during cleanup
      }
    }
  };
}

/**
 * Export artboard to PNG.
 * 
 * @param {Document} doc - Illustrator document
 * @param {Number} artboardIndex - Artboard index
 * @param {String} outputPath - Output PNG path
 * @param {Number} resolution - DPI (default: 300)
 */
function exportArtboardToPNG(doc, artboardIndex, outputPath, resolution) {
  if (!doc || !outputPath) return;
  if (typeof resolution === "undefined") resolution = 300;
  
  doc.artboards.setActiveArtboardIndex(artboardIndex);
  
  var exportOptions = new ExportOptionsPNG24();
  exportOptions.antiAliasing = true;
  exportOptions.artBoardClipping = true;
  exportOptions.horizontalScale = (resolution / 72) * 100;
  exportOptions.verticalScale = (resolution / 72) * 100;
  exportOptions.transparency = true;
  
  var file = new File(outputPath);
  doc.exportFile(file, ExportType.PNG24, exportOptions);
}

/**
 * Log message (writes to stderr for debugging).
 * 
 * @param {String} message - Log message
 */
function log(message) {
  try {
    $.writeln("[JSX] " + message);
  } catch (e) {
    // Ignore
  }
}

/**
 * Error handling wrapper.
 * 
 * @param {Function} fn - Function to execute
 * @param {String} context - Context description for errors
 * @return {*} - Function return value or null on error
 */
function tryCatch(fn, context) {
  try {
    return fn();
  } catch (e) {
    log("ERROR in " + (context || "unknown") + ": " + e.message);
    return null;
  }
}

