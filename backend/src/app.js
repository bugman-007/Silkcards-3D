import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

// Import routes
import uploadRoutes from './routes/upload.js';
import parseRoutes from './routes/parse.js';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - FIXED (removed trailing slash)
const allowedOrigins = [
  'http://localhost:5173',           // Local development
  'https://revolve360.vercel.app', // Production
  /https:\/\/.*\.vercel\.app$/       // Any vercel subdomain
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman)
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
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
fs.ensureDirSync(uploadsDir);

// Routes
app.use('/api/upload', uploadRoutes);
app.use('/api/parse', parseRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'SilkCards 3D Backend is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    port: PORT
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'SilkCards 3D Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      upload: '/api/upload',
      parse: '/api/parse/:fileId'
    }
  });
});

// Error handling middleware
app.use((err, req, res) => {
  console.error('Error:', err.message);
  
  // CORS errors
  if (err.message.includes('CORS policy')) {
    return res.status(403).json({ 
      error: 'CORS Error', 
      message: 'Origin not allowed'
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error', 
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 SilkCards 3D Backend running on port ${PORT}`);
  console.log(`📁 Uploads directory: ${uploadsDir}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
});

export default app;