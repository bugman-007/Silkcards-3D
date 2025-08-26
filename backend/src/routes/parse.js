// backend/src/routes/parse.js - COMPLETE REWRITE FOR MICROSERVICE
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import crypto from 'crypto';
import FormData from 'form-data';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Parser service configuration
const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'https://parser.yourdomain.com';
const PARSER_API_KEY = process.env.PARSER_API_KEY;
const PARSER_HMAC_SECRET = process.env.PARSER_HMAC_SECRET;

if (!PARSER_API_KEY || !PARSER_HMAC_SECRET) {
  console.warn('⚠️ Parser service credentials not configured');
}

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

// Generate HMAC signature for request
function signRequest(fileBuffer, options, timestamp) {
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
  const payload = `${fileHash}${JSON.stringify(options)}${timestamp}`;
  return crypto.createHmac('sha256', PARSER_HMAC_SECRET).update(payload).digest('hex');
}

// Submit parse job to microservice - MAIN ENDPOINT
router.post('/:fileId', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { fileId } = req.params;
    const options = {
      dpi: req.body.dpi || 600,
      extractVector: req.body.extractVector !== false,
      enableOCG: req.body.enableOCG !== false,
      ...req.body
    };
    
    console.log('🔄 Submitting parse job for file:', fileId);
    
    // Find the uploaded file
    const filePath = await findUploadedFile(fileId);
    if (!filePath) {
      return res.status(404).json({ 
        success: false,
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
        success: false,
        error: 'Invalid file',
        fileId,
        message: 'The specified path is not a valid file'
      });
    }

    // Generate job ID and read file
    const jobId = uuidv4();
    const fileBuffer = await fs.readFile(filePath);
    const timestamp = Date.now().toString();
    
    console.log(`📊 File info: ${(fileStats.size / 1024).toFixed(1)}KB`);
    
    // Create HMAC signature
    const signature = signRequest(fileBuffer, options, timestamp);
    
    // Create form data for multipart upload
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: path.basename(filePath),
      contentType: filePath.endsWith('.pdf') ? 'application/pdf' : 'application/illustrator'
    });
    formData.append('options', JSON.stringify(options));
    formData.append('timestamp', timestamp);
    
    console.log('🚀 Submitting to parser microservice...');
    console.time(`PARSE_SUBMISSION_${fileId}`);
    
    // Submit to parser microservice
    const response = await axios.post(`${PARSER_SERVICE_URL}/jobs?jobId=${jobId}`, formData, {
      headers: {
        'X-API-Key': PARSER_API_KEY,
        'X-Signature': signature,
        ...formData.getHeaders()
      },
      timeout: 60000, // 60s timeout for upload
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    });

    console.timeEnd(`PARSE_SUBMISSION_${fileId}`);
    
    const totalTime = Date.now() - startTime;
    
    console.log('✅ Job submitted successfully:', jobId);
    console.log(`⏱️ Submission time: ${totalTime}ms`);
    
    // Return job information
    res.json({
      success: true,
      jobId: response.data.jobId,
      status: response.data.status,
      fileId,
      originalFile: path.basename(filePath),
      submittedAt: response.data.submittedAt || new Date().toISOString(),
      processingTime: totalTime,
      options: options
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    console.error('❌ Parse submission error:', error.message);
    console.log(`⏱️ Failed after: ${totalTime}ms`);
    
    // Handle different error types
    let errorMessage = 'Failed to submit parse job';
    let statusCode = 500;
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable';
      statusCode = 503;
    } else if (error.response?.status === 401) {
      errorMessage = 'Parser service authentication failed';
      statusCode = 401;
    } else if (error.response?.status === 413) {
      errorMessage = 'File too large for parser service';
      statusCode = 413;
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Parser service not found';
      statusCode = 503;
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      message: error.message,
      fileId: req.params.fileId,
      processingTime: totalTime,
      errorType: error.constructor.name,
      suggestion: statusCode === 503 ? 'Parser service may be starting up, please try again in a few minutes' : 'Please try uploading a different file'
    });
  }
});

// Get job status - PROXY TO MICROSERVICE
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log('📊 Checking status for job:', jobId);
    
    const response = await axios.get(`${PARSER_SERVICE_URL}/status/${jobId}`, {
      headers: { 'X-API-Key': PARSER_API_KEY },
      timeout: 10000
    });
    
    console.log(`✅ Status check successful: ${response.data.status}`);
    
    res.json({
      success: true,
      ...response.data
    });
    
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    
    let errorMessage = 'Status check failed';
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      errorMessage = 'Job not found';
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      jobId: req.params.jobId
    });
  }
});

// Get parse result - PROXY TO MICROSERVICE
router.get('/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log('📖 Fetching result for job:', jobId);
    
    const response = await axios.get(`${PARSER_SERVICE_URL}/jobs/${jobId}/result.json`, {
      headers: { 'X-API-Key': PARSER_API_KEY },
      timeout: 15000
    });
    
    console.log('✅ Result fetched successfully');
    
    // Add job ID and backend metadata
    const result = {
      success: true,
      jobId,
      cached: false,
      fetchedAt: new Date().toISOString(),
      ...response.data
    };
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Result fetch failed:', error.message);
    
    let errorMessage = 'Failed to fetch parse result';
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      errorMessage = 'Parse result not found';
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      jobId: req.params.jobId
    });
  }
});

// Get asset files (textures, masks) - STREAM PROXY
router.get('/assets/:jobId/:filename', async (req, res) => {
  try {
    const { jobId, filename } = req.params;
    
    console.log('🖼️ Serving asset:', jobId, filename);
    
    const response = await axios.get(`${PARSER_SERVICE_URL}/jobs/${jobId}/assets/${filename}`, {
      headers: { 'X-API-Key': PARSER_API_KEY },
      responseType: 'stream',
      timeout: 30000
    });
    
    // Set appropriate headers for asset serving
    res.set({
      'Content-Type': response.headers['content-type'] || (
        filename.endsWith('.png') ? 'image/png' :
        filename.endsWith('.svg') ? 'image/svg+xml' :
        filename.endsWith('.jpg') || filename.endsWith('.jpeg') ? 'image/jpeg' :
        'application/octet-stream'
      ),
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
      'ETag': response.headers['etag'],
      'Last-Modified': response.headers['last-modified']
    });
    
    // Stream the response
    response.data.pipe(res);
    
    console.log('✅ Asset served successfully');
    
  } catch (error) {
    console.error('❌ Asset serving failed:', error.message);
    
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: 'Asset not found',
      message: error.message,
      jobId: req.params.jobId,
      filename: req.params.filename
    });
  }
});

// Legacy endpoint support - Get previously parsed result
router.get('/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    // This endpoint is deprecated but kept for backward compatibility
    console.log('⚠️ Legacy endpoint called:', fileId);
    
    res.status(410).json({ 
      success: false,
      error: 'Legacy endpoint deprecated',
      message: 'This endpoint has been replaced by the job-based parsing system',
      fileId,
      migration: {
        'old': `GET /api/parse/${fileId}`,
        'new': 'POST /api/parse/:fileId -> GET /api/parse/result/:jobId'
      }
    });

  } catch (error) {
    console.error('❌ Legacy endpoint error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Legacy endpoint failed', 
      message: error.message,
      fileId: req.params.fileId
    });
  }
});

// Health check for parser service
router.get('/health/parser', async (req, res) => {
  try {
    const response = await axios.get(`${PARSER_SERVICE_URL}/health`, {
      headers: { 'X-API-Key': PARSER_API_KEY },
      timeout: 5000
    });
    
    res.json({
      success: true,
      parserService: {
        status: 'healthy',
        url: PARSER_SERVICE_URL,
        response: response.data
      }
    });
    
  } catch (error) {
    console.error('❌ Parser service health check failed:', error.message);
    
    res.status(503).json({
      success: false,
      parserService: {
        status: 'unhealthy',
        url: PARSER_SERVICE_URL,
        error: error.message
      }
    });
  }
});

export default router;