// src/routes/parse.js - Updated with ES6 modules
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import AIParser from '../parsers/AIParser.js';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();
const parser = new AIParser();

// Parse uploaded file
router.post('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log('🔄 Starting parse for file:', fileId);
    
    // Find the file
    const uploadsPath = path.join(__dirname, '../uploads');
    const files = await fs.readdir(uploadsPath);
    const matchingFile = files.find(file => 
      path.parse(file).name === fileId
    );

    if (!matchingFile) {
      return res.status(404).json({ 
        error: 'File not found',
        fileId 
      });
    }

    const filePath = path.join(uploadsPath, matchingFile);
    
    // Parse the file
    const parseResult = await parser.parseFile(filePath);
    
    // Save parse result for future reference
    const resultPath = path.join(uploadsPath, `${fileId}_parsed.json`);
    await fs.writeJson(resultPath, parseResult, { spaces: 2 });
    
    console.log('💾 Parse result saved to:', resultPath);
    
    res.json({
      success: true,
      fileId,
      originalFile: matchingFile,
      ...parseResult
    });

  } catch (error) {
    console.error('Parse error:', error);
    res.status(500).json({ 
      error: 'Parsing failed', 
      message: error.message,
      fileId: req.params.fileId
    });
  }
});

// Get previously parsed result
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const uploadsPath = path.join(__dirname, '../uploads');
    const resultPath = path.join(uploadsPath, `${fileId}_parsed.json`);
    
    if (await fs.pathExists(resultPath)) {
      const parseResult = await fs.readJson(resultPath);
      res.json({
        success: true,
        cached: true,
        ...parseResult
      });
    } else {
      res.status(404).json({ 
        error: 'No parsing result found for this file',
        fileId,
        suggestion: 'Try parsing the file first with POST /api/parse/:fileId'
      });
    }

  } catch (error) {
    console.error('Get parse result error:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve parse result', 
      message: error.message 
    });
  }
});

// Get parsing status/progress (for future async processing)
router.get('/:fileId/status', async (req, res) => {
  try {
    const { fileId } = req.params;
    const uploadsPath = path.join(__dirname, '../uploads');
    
    // Check if original file exists
    const files = await fs.readdir(uploadsPath);
    const originalFile = files.find(file => 
      path.parse(file).name === fileId
    );

    if (!originalFile) {
      return res.json({
        status: 'not_found',
        message: 'File not found'
      });
    }

    // Check if parsing result exists
    const resultPath = path.join(uploadsPath, `${fileId}_parsed.json`);
    const hasResult = await fs.pathExists(resultPath);

    if (hasResult) {
      const result = await fs.readJson(resultPath);
      res.json({
        status: 'completed',
        parsedAt: result.parsedAt,
        layerCount: result.layers.length,
        effectsFound: Object.keys(result.effects).filter(key => 
          result.effects[key].length > 0
        )
      });
    } else {
      res.json({
        status: 'uploaded',
        message: 'File uploaded but not yet parsed'
      });
    }

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ 
      error: 'Status check failed', 
      message: error.message 
    });
  }
});

export default router;