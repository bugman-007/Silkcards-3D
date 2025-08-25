// backend/src/app.js - UPDATED WITH SHARE AND EMBED ROUTES
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

// Import routes
import uploadRoutes from './routes/upload.js';
import parseRoutes from './routes/parse.js';
import shareRoutes from './routes/share.js';
import embedRoutes from './routes/embed.js';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - ENHANCED
const allowedOrigins = [
  'http://localhost:5173',           // Local development
  'http://localhost:3000',           // Alternative local port
  'https://revolve360.vercel.app',   // Production frontend
  /https:\/\/.*\.vercel\.app$/,      // Any vercel subdomain
  /https:\/\/.*\.netlify\.app$/,     // Netlify deployments
  /http:\/\/localhost:\d+$/,         // Any local port
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, embeds)
    if (!origin) return callback(null, true);
    
    // Check if origin matches allowed origins
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (typeof allowedOrigin === 'string') {
        return allowedOrigin === origin;
      } else if (allowedOrigin instanceof RegExp) {
        return allowedOrigin.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    const msg = `CORS policy blocked origin: ${origin}`;
    return callback(new Error(msg), false);
  },
  credentials: true,
  // Allow embedding in iframes
  optionsSuccessStatus: 200
}));

// Enhanced middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Create required directories
const requiredDirs = ['uploads', 'shares'];
for (const dir of requiredDirs) {
  const dirPath = path.join(__dirname, `../${dir}`);
  fs.ensureDirSync(dirPath);
  console.log(`📁 Ensured directory exists: ${dir}/`);
}

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const ip = req.ip || req.connection.remoteAddress;
  
  console.log(`${timestamp} | ${method} ${url} | IP: ${ip}`);
  
  // Log request body for debugging (only in development)
  if (process.env.NODE_ENV === 'development' && req.body && Object.keys(req.body).length > 0) {
    console.log(`📤 Request body:`, JSON.stringify(req.body, null, 2).substring(0, 500));
  }
  
  next();
});

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/parse', parseRoutes);
app.use('/api/share', shareRoutes);
app.use('/embed', embedRoutes);

// Standalone share viewer route (for direct browser access)
app.get('/share/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const sharesPath = path.join(__dirname, '../shares');
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);
    
    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html><head><title>Share Not Found</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>🔍 Share Not Found</h1>
          <p>This 3D preview share could not be found.</p>
          <p><code>${shareId}</code></p>
        </body></html>
      `);
    }
    
    const shareData = await fs.readJson(shareFilePath);
    
    // Check expiration
    if (new Date(shareData.expiresAt) < new Date()) {
      return res.status(410).send(`
        <!DOCTYPE html>
        <html><head><title>Share Expired</title></head>
        <body style="font-family: system-ui; text-align: center; padding: 50px;">
          <h1>⏰ Share Expired</h1>
          <p>This share link expired on ${new Date(shareData.expiresAt).toLocaleDateString()}</p>
        </body></html>
      `);
    }
    
    // Redirect to embed view
    const embedUrl = `/embed/${shareId}?showControls=true&autoRotate=false`;
    res.redirect(embedUrl);
    
  } catch (error) {
    console.error('Share viewer error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html><head><title>Error</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>❌ Error</h1>
        <p>Something went wrong loading this share.</p>
      </body></html>
    `);
  }
});

// Health check - ENHANCED
app.get('/api/health', (req, res) => {
  const uptime = process.uptime();
  const memUsage = process.memoryUsage();
  
  res.json({ 
    status: 'OK', 
    service: 'SilkCards 3D Backend',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT,
    uptime: {
      seconds: Math.floor(uptime),
      human: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`
    },
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024) + ' MB',
      total: Math.round(memUsage.heapTotal / 1024 / 1024) + ' MB',
      rss: Math.round(memUsage.rss / 1024 / 1024) + ' MB'
    },
    features: {
      fileUpload: true,
      aiParsing: true,
      shareLinks: true,
      embedding: true
    }
  });
});

// System status endpoint
app.get('/api/status', async (req, res) => {
  try {
    const uploadsPath = path.join(__dirname, '../uploads');
    const sharesPath = path.join(__dirname, '../shares');
    
    // Count files
    const uploadFiles = await fs.readdir(uploadsPath);
    const shareFiles = await fs.readdir(sharesPath);
    
    const parsedFiles = uploadFiles.filter(f => f.endsWith('_parsed.json')).length;
    const originalFiles = uploadFiles.filter(f => !f.endsWith('_parsed.json')).length;
    const activeShares = shareFiles.filter(f => f.endsWith('.json')).length;
    
    // Calculate storage usage
    let totalStorage = 0;
    for (const file of uploadFiles) {
      try {
        const stats = await fs.stat(path.join(uploadsPath, file));
        totalStorage += stats.size;
      } catch (e) {
        console.log(e);
      }
    }
    
    res.json({
      success: true,
      statistics: {
        files: {
          uploaded: originalFiles,
          parsed: parsedFiles,
          shares: activeShares
        },
        storage: {
          totalBytes: totalStorage,
          totalMB: Math.round(totalStorage / 1024 / 1024),
          avgFileSize: originalFiles > 0 ? Math.round(totalStorage / originalFiles / 1024) + ' KB' : '0 KB'
        },
        server: {
          uptime: Math.floor(process.uptime()),
          environment: process.env.NODE_ENV || 'development',
          nodeVersion: process.version
        }
      },
      generatedAt: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get system status',
      message: error.message
    });
  }
});

// Root endpoint - ENHANCED
app.get('/', (req, res) => {
  res.json({ 
    service: 'SilkCards 3D Backend API',
    version: '2.0.0',
    documentation: 'https://docs.silkcards3d.com',
    status: 'running',
    endpoints: {
      health: 'GET /api/health',
      status: 'GET /api/status',
      upload: 'POST /api/upload',
      parse: 'POST /api/parse/:fileId',
      parseStatus: 'GET /api/parse/:fileId/status',
      createShare: 'POST /api/share',
      getShare: 'GET /api/share/:shareId',
      embedViewer: 'GET /embed/:shareId',
      embedScript: 'GET /embed/js/silkcards-embed.js'
    },
    features: [
      'AI/PDF file parsing',
      '3D preview generation',
      'Shareable links',
      'Embeddable widgets',
      'Real-time processing'
    ],
    limits: {
      maxFileSize: '50MB',
      shareExpiry: '30 days',
      supportedFormats: ['.ai', '.pdf']
    }
  });
});

// Global error handling middleware
app.use((err, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`${timestamp} | ERROR:`, err.message);
  console.error('Stack:', err.stack);
  
  // CORS errors
  if (err.message.includes('CORS policy')) {
    return res.status(403).json({ 
      success: false,
      error: 'CORS Error', 
      message: 'Origin not allowed',
      origin: req.get('Origin'),
      allowedOrigins: allowedOrigins.map(o => o.toString())
    });
  }
  
  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      error: 'File too large',
      message: 'Maximum file size is 50MB',
      limit: '50MB'
    });
  }
  
  // Generic error response
  res.status(err.status || 500).json({ 
    success: false,
    error: err.name || 'Internal Server Error', 
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message,
    timestamp,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableRoutes: [
      'GET /',
      'GET /api/health',
      'GET /api/status',
      'POST /api/upload',
      'POST /api/parse/:fileId',
      'GET /api/parse/:fileId/status',
      'POST /api/share',
      'GET /api/share/:shareId',
      'GET /embed/:shareId',
      'GET /share/:shareId'
    ]
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('👋 SIGINT received, shutting down gracefully...');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 SilkCards 3D Backend v2.0.0 running!');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`📁 Uploads: ${path.join(__dirname, '../uploads')}`);
  console.log(`🔗 Shares: ${path.join(__dirname, '../shares')}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📊 Status: http://localhost:${PORT}/api/status`);
  console.log('✅ All systems ready!');
});

export default app;