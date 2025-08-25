// backend/src/routes/parse.js - UPDATED WITH ENHANCED PARSER
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import AIParserV2 from '../parsers/AIParserV2.js';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const parser = new AIParserV2();

// Helper function to find uploaded file
async function findUploadedFile(fileId) {
  try {
    const uploadsPath = path.join(__dirname, '../../uploads');
    const files = await fs.readdir(uploadsPath);
    const matchingFile = files.find(file => 
      path.parse(file).name === fileId
    );
    
    if (matchingFile) {
      return path.join(uploadsPath, matchingFile);
    }
    return null;
  } catch (error) {
    console.error('Error finding uploaded file:', error);
    return null;
  }
}

// Parse uploaded file - ENHANCED VERSION
router.post('/:fileId', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { fileId } = req.params;
    
    console.log('🔄 Starting enhanced parse for file:', fileId);
    
    // Find the uploaded file
    const filePath = await findUploadedFile(fileId);
    if (!filePath) {
      return res.status(404).json({ 
        error: 'File not found',
        fileId,
        suggestion: 'Please check the file ID or re-upload the file'
      });
    }

    console.log('📁 Found file:', path.basename(filePath));

    // Validate file exists and is readable
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) {
      return res.status(400).json({
        error: 'Invalid file',
        fileId,
        message: 'The specified path is not a valid file'
      });
    }

    console.log(`📊 File info: ${(fileStats.size / 1024).toFixed(1)}KB, modified: ${fileStats.mtime}`);
    
    // Parse the file with enhanced parser
    console.time(`PARSING_${fileId}`);
    const parseResult = await parser.parseFile(filePath);
    console.timeEnd(`PARSING_${fileId}`);
    
    // Save parse result for caching
    const resultPath = path.join(path.dirname(filePath), `${fileId}_parsed.json`);
    await fs.writeJson(resultPath, parseResult, { spaces: 2 });
    
    const totalTime = Date.now() - startTime;
    
    console.log('💾 Parse result saved to:', path.basename(resultPath));
    console.log(`✅ Total processing time: ${totalTime}ms`);
    console.log(`📈 Parsing confidence: ${(parseResult.confidence * 100).toFixed(1)}%`);
    console.log(`🎨 Effects found: ${Object.keys(parseResult.effects).filter(key => 
      parseResult.effects[key].length > 0
    ).join(', ') || 'None'}`);
    
    // Return comprehensive result
    res.json({
      success: true,
      fileId,
      originalFile: path.basename(filePath),
      processingTime: totalTime,
      ...parseResult
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    console.error('❌ Parse error:', error);
    console.log(`⏱️ Failed after: ${totalTime}ms`);
    
    // Return detailed error information
    res.status(500).json({ 
      success: false,
      error: 'Parsing failed', 
      message: error.message,
      fileId: req.params.fileId,
      processingTime: totalTime,
      errorType: error.constructor.name,
      suggestion: 'Try uploading a different file format or check if the file is corrupted'
    });
  }
});

// Get previously parsed result - ENHANCED
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const uploadsPath = path.join(__dirname, '../../uploads');
    const resultPath = path.join(uploadsPath, `${fileId}_parsed.json`);
    
    if (await fs.pathExists(resultPath)) {
      const parseResult = await fs.readJson(resultPath);
      const stats = await fs.stat(resultPath);
      
      console.log('📖 Serving cached parse result for:', fileId);
      
      res.json({
        success: true,
        cached: true,
        cachedAt: stats.mtime,
        cacheAge: Date.now() - stats.mtime.getTime(),
        ...parseResult
      });
    } else {
      res.status(404).json({ 
        error: 'No parsing result found for this file',
        fileId,
        suggestion: 'Parse the file first with POST /api/parse/:fileId'
      });
    }

  } catch (error) {
    console.error('❌ Get parse result error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to retrieve parse result', 
      message: error.message,
      fileId: req.params.fileId
    });
  }
});

// Get detailed parsing status - ENHANCED
router.get('/:fileId/status', async (req, res) => {
  try {
    const { fileId } = req.params;
    const uploadsPath = path.join(__dirname, '../../uploads');
    
    // Check if original file exists
    const originalFilePath = await findUploadedFile(fileId);
    if (!originalFilePath) {
      return res.json({
        status: 'not_found',
        message: 'Original file not found',
        fileId
      });
    }

    const originalStats = await fs.stat(originalFilePath);
    const fileExtension = path.extname(originalFilePath).toLowerCase();
    const fileName = path.basename(originalFilePath);

    // Check if parsing result exists
    const resultPath = path.join(uploadsPath, `${fileId}_parsed.json`);
    const hasResult = await fs.pathExists(resultPath);

    if (hasResult) {
      const result = await fs.readJson(resultPath);
      const resultStats = await fs.stat(resultPath);
      
      // Calculate effect statistics
      const totalEffects = Object.values(result.effects).flat().length;
      const effectTypes = Object.keys(result.effects).filter(key => 
        result.effects[key].length > 0
      );

      res.json({
        status: 'completed',
        fileId,
        fileName,
        fileExtension,
        fileSize: originalStats.size,
        uploadedAt: originalStats.birthtime,
        parsedAt: result.parsedAt,
        parsingMethod: result.parsingMethod,
        parsingTime: result.parsingTime,
        confidence: result.confidence,
        cacheAge: Date.now() - resultStats.mtime.getTime(),
        statistics: {
          layerCount: result.layers.length,
          effectCount: totalEffects,
          effectTypes: effectTypes,
          hasText: result.metadata?.hasText || false,
          hasImages: result.metadata?.hasImages || false,
          colorMode: result.metadata?.colorMode || 'Unknown',
          resolution: result.metadata?.resolution || 'Unknown'
        }
      });
    } else {
      res.json({
        status: 'uploaded',
        fileId,
        fileName,
        fileExtension,
        fileSize: originalStats.size,
        uploadedAt: originalStats.birthtime,
        message: 'File uploaded but not yet parsed',
        suggestion: 'Use POST /api/parse/:fileId to parse the file'
      });
    }

  } catch (error) {
    console.error('❌ Status check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Status check failed', 
      message: error.message,
      fileId: req.params.fileId
    });
  }
});

// Reparse file with different options - NEW ENDPOINT
router.post('/:fileId/reparse', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { forceFallback = false, clearCache = false } = req.body;
    
    console.log('🔄 Reparsing file:', fileId, { forceFallback, clearCache });
    
    const filePath = await findUploadedFile(fileId);
    if (!filePath) {
      return res.status(404).json({ 
        error: 'File not found',
        fileId
      });
    }

    // Clear cache if requested
    if (clearCache) {
      const resultPath = path.join(path.dirname(filePath), `${fileId}_parsed.json`);
      if (await fs.pathExists(resultPath)) {
        await fs.remove(resultPath);
        console.log('🗑️ Cleared cached result');
      }
    }

    // Force fallback parsing if requested
    let parseResult;
    if (forceFallback) {
      console.log('🧠 Forcing fallback parsing mode');
      parseResult = await parser.intelligentFallbackParse(filePath);
      parseResult.parsingMethod = 'forced_fallback';
      parseResult.confidence = Math.max(parseResult.confidence - 0.2, 0.1);
    } else {
      parseResult = await parser.parseFile(filePath);
    }

    // Save new result
    const resultPath = path.join(path.dirname(filePath), `${fileId}_parsed.json`);
    await fs.writeJson(resultPath, parseResult, { spaces: 2 });
    
    res.json({
      success: true,
      fileId,
      reparsed: true,
      originalFile: path.basename(filePath),
      ...parseResult
    });

  } catch (error) {
    console.error('❌ Reparse error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Reparse failed', 
      message: error.message,
      fileId: req.params.fileId
    });
  }
});

// Get parsing statistics - NEW ENDPOINT
router.get('/stats/summary', async (req, res) => {
  try {
    const uploadsPath = path.join(__dirname, '../../uploads');
    const files = await fs.readdir(uploadsPath);
    
    const parseResults = [];
    const jsonFiles = files.filter(f => f.endsWith('_parsed.json'));
    
    for (const jsonFile of jsonFiles) {
      try {
        const result = await fs.readJson(path.join(uploadsPath, jsonFile));
        parseResults.push(result);
      } catch (error) {
        // Skip invalid JSON files
      }
    }

    const stats = {
      totalParsed: parseResults.length,
      parsingMethods: {},
      averageConfidence: 0,
      averageParsingTime: 0,
      effectsStats: {
        foil: 0,
        spotUV: 0,
        emboss: 0,
        diecut: 0,
        edge: 0
      },
      fileTypes: {}
    };

    // Calculate statistics
    if (parseResults.length > 0) {
      let totalConfidence = 0;
      let totalParsingTime = 0;

      parseResults.forEach(result => {
        // Parsing methods
        const method = result.parsingMethod || 'unknown';
        stats.parsingMethods[method] = (stats.parsingMethods[method] || 0) + 1;
        
        // Confidence
        totalConfidence += result.confidence || 0;
        
        // Parsing time
        totalParsingTime += result.parsingTime || 0;
        
        // File types
        const fileType = result.fileType || 'unknown';
        stats.fileTypes[fileType] = (stats.fileTypes[fileType] || 0) + 1;
        
        // Effects
        if (result.effects) {
          Object.keys(stats.effectsStats).forEach(effect => {
            if (result.effects[effect] && result.effects[effect].length > 0) {
              stats.effectsStats[effect]++;
            }
          });
        }
      });

      stats.averageConfidence = totalConfidence / parseResults.length;
      stats.averageParsingTime = totalParsingTime / parseResults.length;
    }

    res.json({
      success: true,
      statistics: stats,
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Stats error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to generate statistics', 
      message: error.message
    });
  }
});

export default router;