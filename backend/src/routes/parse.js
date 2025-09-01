// backend/src/routes/parse.js - COMPLETE FIXED VERSION
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

// Parser service configuration - PRODUCTION SETTINGS
const PARSER_SERVICE_URL = process.env.PARSER_SERVICE_URL || 'http://44.203.155.170:8000';
const PARSER_API_KEY = process.env.PARSER_API_KEY || 'sk_parser_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2';
const PARSER_HMAC_SECRET = process.env.PARSER_HMAC_SECRET || 'hmac_secret_9876543210abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz';

console.log('🔧 Parser Service Configuration:');
console.log(`  URL: ${PARSER_SERVICE_URL}`);
console.log(`  API Key: ${PARSER_API_KEY ? 'Configured' : 'Missing'}`);
console.log(`  HMAC Secret: ${PARSER_HMAC_SECRET ? 'Configured' : 'Missing'}`);

// Axios instance with optimized settings for EC2
const parserAPI = axios.create({
  baseURL: PARSER_SERVICE_URL,
  timeout: 180000, // 3 minutes timeout
  headers: {
    'X-API-Key': PARSER_API_KEY
  },
  maxContentLength: Infinity,
  maxBodyLength: Infinity
});

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

// Generate HMAC signature for secure communication
function signRequest(fileBuffer, options, timestamp) {
  try {
    const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const payload = `${fileHash}${JSON.stringify(options)}${timestamp}`;
    return crypto.createHmac('sha256', PARSER_HMAC_SECRET).update(payload).digest('hex');
  } catch (error) {
    console.error('HMAC signing error:', error);
    return null;
  }
}

// Submit parse job to EC2 microservice - MAIN ENDPOINT
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
    
    console.log('🚀 Starting parse workflow for:', fileId);
    console.log('⚙️ Parse options:', options);
    
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

    const fileName = path.basename(filePath);
    console.log('📁 Processing file:', fileName);

    // Validate file exists and get stats
    const fileStats = await fs.stat(filePath);
    if (!fileStats.isFile()) {
      return res.status(400).json({
        success: false,
        error: 'Invalid file',
        fileId,
        message: 'The specified path is not a valid file'
      });
    }

    console.log(`📊 File size: ${(fileStats.size / (1024 * 1024)).toFixed(2)}MB`);
    
    // Generate job ID and read file
    const jobId = uuidv4();
    const fileBuffer = await fs.readFile(filePath);
    const timestamp = Date.now().toString();
    
    // Create HMAC signature for security
    const signature = signRequest(fileBuffer, options, timestamp);
    if (!signature) {
      throw new Error('Failed to create request signature');
    }
    
    // Create form data for EC2 upload
    const formData = new FormData();
    formData.append('file', fileBuffer, {
      filename: fileName,
      contentType: fileName.endsWith('.pdf') ? 'application/pdf' : 'application/illustrator',
      knownLength: fileBuffer.length
    });
    formData.append('options', JSON.stringify(options));
    formData.append('timestamp', timestamp);
    
    console.log('📤 Submitting to EC2 parser service...');
    console.time(`EC2_SUBMISSION_${fileId}`);
    
    // Submit to EC2 microservice
    const response = await parserAPI.post(`/jobs?jobId=${jobId}`, formData, {
      headers: {
        'X-Signature': signature,
        ...formData.getHeaders()
      },
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        if (percent % 20 === 0) { // Log every 20%
          console.log(`📤 Upload progress: ${percent}%`);
        }
      }
    });

    console.timeEnd(`EC2_SUBMISSION_${fileId}`);
    
    const totalTime = Date.now() - startTime;
    
    console.log('✅ Job submitted to EC2 successfully');
    console.log(`🆔 Job ID: ${jobId}`);
    console.log(`⏱️ Submission time: ${totalTime}ms`);
    
    // Return comprehensive job information
    res.json({
      success: true,
      jobId: response.data.jobId || jobId,
      status: response.data.status || 'queued',
      fileId,
      originalFile: fileName,
      fileSize: fileStats.size,
      submittedAt: response.data.submittedAt || new Date().toISOString(),
      estimatedTime: response.data.estimatedTime || '30-120 seconds',
      processingTime: totalTime,
      options: options,
      parserService: PARSER_SERVICE_URL
    });

  } catch (error) {
    const totalTime = Date.now() - startTime;
    
    console.error('❌ Parse submission error:', error.message);
    if (error.response) {
      console.error('EC2 Response Status:', error.response.status);
      console.error('EC2 Response Data:', error.response.data);
    }
    
    // Handle different error types with specific messages
    let errorMessage = 'Failed to submit parse job';
    let statusCode = 500;
    
    if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable - EC2 instance may be down';
      statusCode = 503;
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Cannot reach parser service - check network configuration';
      statusCode = 503;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Parser service timeout - file may be too large';
      statusCode = 504;
    } else if (error.response?.status === 401) {
      errorMessage = 'Parser service authentication failed';
      statusCode = 401;
    } else if (error.response?.status === 413) {
      errorMessage = 'File too large for parser service';
      statusCode = 413;
    } else if (error.response?.status === 429) {
      errorMessage = 'Parser service rate limit exceeded';
      statusCode = 429;
    }
    
    res.status(statusCode).json({ 
      success: false,
      error: errorMessage,
      message: error.message,
      fileId: req.params.fileId,
      processingTime: totalTime,
      errorType: error.constructor.name,
      parserService: PARSER_SERVICE_URL,
      suggestion: getErrorSuggestion(statusCode)
    });
  }
});

// Get job status with enhanced monitoring - POLLING ENDPOINT
router.get('/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log('📊 Checking status for job:', jobId);
    
    const response = await parserAPI.get(`/status/${jobId}`, {
      timeout: 15000 // Shorter timeout for status checks
    });
    
    const statusData = response.data;
    console.log(`📈 Job ${jobId} status: ${statusData.status} (${statusData.progress || 0}%)`);
    
    // Add backend metadata
    const enhancedStatus = {
      success: true,
      jobId,
      status: statusData.status,
      progress: Math.round(statusData.progress || 0),
      submittedAt: statusData.submittedAt,
      originalFile: statusData.originalFile,
      fileSize: statusData.fileSize,
      checkedAt: new Date().toISOString(),
      parserService: PARSER_SERVICE_URL
    };
    
    // Add timing information if available
    if (statusData.processingStartedAt) {
      enhancedStatus.processingStartedAt = statusData.processingStartedAt;
    }
    
    if (statusData.completedAt) {
      enhancedStatus.completedAt = statusData.completedAt;
      enhancedStatus.processingTime = statusData.processingTime;
    }
    
    if (statusData.error) {
      enhancedStatus.error = statusData.error;
    }
    
    res.json(enhancedStatus);
    
  } catch (error) {
    console.error('❌ Status check failed:', error.message);
    
    let errorMessage = 'Status check failed';
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      errorMessage = 'Job not found - may have been cleaned up';
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      jobId: req.params.jobId,
      parserService: PARSER_SERVICE_URL
    });
  }
});

// Get complete parse result with 3D rendering data - RESULT ENDPOINT
router.get('/result/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    
    console.log('📖 Fetching complete result for job:', jobId);
    
    const response = await parserAPI.get(`/jobs/${jobId}/result.json`, {
      timeout: 30000
    });
    
    const resultData = response.data;
    
    console.log('✅ Parse result retrieved successfully');
    console.log(`🎯 Confidence: ${(resultData.parsing?.confidence * 100 || 0).toFixed(1)}%`);
    console.log(`🎨 Effects found: ${resultData.maps ? Object.keys(resultData.maps).length : 0}`);
    
    // Enhance result with backend metadata and asset URLs
    const enhancedResult = {
      success: true,
      jobId,
      fetchedAt: new Date().toISOString(),
      parserService: PARSER_SERVICE_URL,
      assetBaseUrl: `${PARSER_SERVICE_URL}/jobs/${jobId}/assets`,
      ...resultData
    };
    
    // Add asset URL helpers for frontend
    if (resultData.maps) {
      enhancedResult.assetUrls = {};
      
      for (const [mapType, mapData] of Object.entries(resultData.maps)) {
        if (typeof mapData === 'string') {
          enhancedResult.assetUrls[mapType] = `/api/parse/assets/${jobId}/${mapData}`;
        } else if (Array.isArray(mapData)) {
          enhancedResult.assetUrls[mapType] = mapData.map(item => ({
            ...item,
            assetUrl: `/api/parse/assets/${jobId}/${item.mask || item.file}`
          }));
        }
      }
    }
    
    res.json(enhancedResult);
    
  } catch (error) {
    console.error('❌ Result fetch failed:', error.message);
    
    let errorMessage = 'Failed to fetch parse result';
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      errorMessage = 'Parse result not found - job may not be completed';
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Parser service unavailable';
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: errorMessage,
      message: error.message,
      jobId: req.params.jobId,
      parserService: PARSER_SERVICE_URL
    });
  }
});

// Proxy asset files from EC2 with caching - ASSET PROXY
router.get('/assets/:jobId/:filename', async (req, res) => {
  try {
    const { jobId, filename } = req.params;
    
    console.log('🖼️ Proxying asset:', jobId, filename);
    
    const response = await parserAPI.get(`/jobs/${jobId}/assets/${filename}`, {
      responseType: 'stream',
      timeout: 60000 // Longer timeout for large assets
    });
    
    // Set appropriate headers for asset serving with caching
    const contentType = response.headers['content-type'] || getContentType(filename);
    
    res.set({
      'Content-Type': contentType,
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'public, max-age=31536000, immutable', // 1 year cache
      'ETag': response.headers['etag'] || `"${jobId}-${filename}"`,
      'Last-Modified': response.headers['last-modified'] || new Date().toUTCString(),
      'Access-Control-Allow-Origin': '*',
      'Cross-Origin-Resource-Policy': 'cross-origin'
    });
    
    // Check if client has cached version
    const ifNoneMatch = req.headers['if-none-match'];
    const etag = response.headers['etag'] || `"${jobId}-${filename}"`;
    
    if (ifNoneMatch === etag) {
      return res.status(304).end();
    }
    
    // Stream the asset
    response.data.pipe(res);
    
    console.log('✅ Asset served successfully');
    
  } catch (error) {
    console.error('❌ Asset proxy failed:', error.message);
    
    let statusCode = 500;
    
    if (error.response?.status === 404) {
      statusCode = 404;
    } else if (error.code === 'ECONNREFUSED') {
      statusCode = 503;
    }
    
    res.status(statusCode).json({
      success: false,
      error: 'Asset not available',
      message: error.message,
      jobId: req.params.jobId,
      filename: req.params.filename,
      parserService: PARSER_SERVICE_URL
    });
  }
});

// Parser service health check - MONITORING
router.get('/health/parser', async (req, res) => {
  try {
    console.log('🔍 Checking parser service health...');
    
    const response = await parserAPI.get('/health', {
      timeout: 10000
    });
    
    console.log('✅ Parser service is healthy');
    
    res.json({
      success: true,
      parserService: {
        status: 'healthy',
        url: PARSER_SERVICE_URL,
        responseTime: response.headers['x-response-time'],
        lastChecked: new Date().toISOString(),
        details: response.data
      }
    });
    
  } catch (error) {
    console.error('❌ Parser service health check failed:', error.message);
    
    res.status(503).json({
      success: false,
      parserService: {
        status: 'unhealthy',
        url: PARSER_SERVICE_URL,
        error: error.message,
        lastChecked: new Date().toISOString(),
        suggestion: 'Check EC2 instance status and network connectivity'
      }
    });
  }
});

// Utility functions
function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.json': 'application/json'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

function getErrorSuggestion(statusCode) {
  const suggestions = {
    503: 'Check if EC2 instance is running and accessible',
    504: 'Try with a smaller file or increase timeout settings',
    413: 'File is too large - maximum size is 100MB',
    429: 'Too many requests - please wait before retrying',
    401: 'Authentication failed - check API key configuration'
  };
  return suggestions[statusCode] || 'Please try again or contact support';
}

export default router;