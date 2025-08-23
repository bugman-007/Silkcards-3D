// src/routes/upload.js - Updated with ES6 modules
import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads');
    fs.ensureDirSync(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const fileId = uuidv4();
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `${fileId}${extension}`;
    cb(null, filename);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.ai', '.pdf'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only .ai and .pdf files are allowed.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// Upload endpoint
router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
      fileId: path.parse(req.file.filename).name, // UUID without extension
      originalName: req.file.originalname,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadedAt: new Date().toISOString(),
      filePath: req.file.path
    };

    console.log('📁 File uploaded:', fileInfo.originalName, '→', fileInfo.filename);

    res.json({
      success: true,
      message: 'File uploaded successfully',
      data: fileInfo
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ 
      error: 'Upload failed', 
      message: error.message 
    });
  }
});

// Get file info endpoint
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const uploadsPath = path.join(__dirname, '../uploads');
    
    // Find file with this ID (could be .ai or .pdf)
    const files = await fs.readdir(uploadsPath);
    const matchingFile = files.find(file => 
      path.parse(file).name === fileId
    );

    if (!matchingFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    const filePath = path.join(uploadsPath, matchingFile);
    const stats = await fs.stat(filePath);

    res.json({
      fileId,
      filename: matchingFile,
      size: stats.size,
      uploadedAt: stats.birthtime,
      exists: true
    });

  } catch (error) {
    console.error('File info error:', error);
    res.status(500).json({ 
      error: 'Failed to get file info', 
      message: error.message 
    });
  }
});

export default router;