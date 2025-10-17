// test_open.jsx - Health check script for Illustrator
// Creates a minimal 1x1 document and exports a test PNG
// IMPORTANT: ES3 only - use var, no let/const, no arrow functions

#target illustrator

(function testOpen() {
  try {
    $.writeln("[TEST] Starting Illustrator health check...");
    
    // Get Illustrator version
    var version = app.version || "unknown";
    $.writeln("[TEST] Illustrator version: " + version);
    
    // Create a new document (1x1 inch at 72 dpi)
    var doc = app.documents.add(
      DocumentColorSpace.CMYK,
      72, // width in points
      72  // height in points
    );
    
    $.writeln("[TEST] Created test document");
    
    // Add a simple rectangle
    var rect = doc.pathItems.rectangle(72, 0, 72, 72);
    rect.filled = true;
    rect.stroked = false;
    
    var color = new CMYKColor();
    color.cyan = 100;
    color.magenta = 0;
    color.yellow = 0;
    color.black = 0;
    rect.fillColor = color;
    
    $.writeln("[TEST] Added test rectangle");
    
    // Export to temp PNG
    var tempPath = Folder.temp + "/illustrator_health_check.png";
    var file = new File(tempPath);
    
    var exportOptions = new ExportOptionsPNG24();
    exportOptions.antiAliasing = true;
    exportOptions.transparency = false;
    exportOptions.horizontalScale = 100;
    exportOptions.verticalScale = 100;
    
    doc.exportFile(file, ExportType.PNG24, exportOptions);
    
    $.writeln("[TEST] Exported test PNG: " + tempPath);
    
    // Close document without saving
    doc.close(SaveOptions.DONOTSAVECHANGES);
    
    $.writeln("[TEST] Health check PASSED");
    
    // Write success file
    var successPath = Folder.temp + "/illustrator_health_check_success.txt";
    var successFile = new File(successPath);
    successFile.open("w");
    successFile.write("OK:" + version);
    successFile.close();
    
    $.writeln("[TEST] Success file written: " + successPath);
    
  } catch (e) {
    $.writeln("[TEST] ERROR: " + e.message);
    $.writeln("[TEST] Stack: " + (e.stack || "no stack trace"));
    
    // Write error file
    try {
      var errorPath = Folder.temp + "/illustrator_health_check_error.txt";
      var errorFile = new File(errorPath);
      errorFile.open("w");
      errorFile.write("ERROR:" + e.message);
      errorFile.close();
    } catch (e2) {
      $.writeln("[TEST] Cannot write error file: " + e2.message);
    }
  }
})();

