import axios from 'axios';

// Get API URL from environment variables with fallback
const getApiUrl = () => {
  // Try environment variable first
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  
  // Fallback based on current location
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3001/api';
    }
  }
  
  return 'https://revolve360-backend.onrender.com/api';
};

const API_BASE_URL = getApiUrl();

console.log('🔗 API Base URL:', API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000, // 2 minutes timeout for cold starts
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`📤 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`);
    return config;
  },
  (error) => {
    console.error('❌ Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`✅ API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('❌ Response error:', {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message
    });
    
    // Handle specific error cases
    if (error.code === 'ECONNABORTED') {
      throw new Error('Request timeout - server might be starting up');
    }
    
    if (error.response?.status === 403) {
      throw new Error('CORS error - frontend domain not allowed');
    }
    
    return Promise.reject(error);
  }
);

// Upload file
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    console.log('📤 Uploading file:', file.name, `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`);
    
    const response = await apiClient.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`📤 Upload progress: ${percentCompleted}%`);
      },
    });
    
    console.log('✅ Upload successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Upload error:', error);
    
    if (error.code === 'ERR_NETWORK') {
      throw new Error('Cannot connect to server. Is the backend running?');
    }
    
    throw new Error(error.response?.data?.message || error.message || 'Upload failed');
  }
};

// Parse uploaded file
export const parseFile = async (fileId) => {
  try {
    console.log('🔍 Parsing file:', fileId);
    const response = await apiClient.post(`/parse/${fileId}`);
    console.log('✅ Parse successful:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Parse error:', error);
    throw new Error(error.response?.data?.message || error.message || 'Parsing failed');
  }
};

// Get parse results
export const getParseResults = async (fileId) => {
  try {
    const response = await apiClient.get(`/parse/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('❌ Get parse results error:', error);
    throw new Error(error.response?.data?.message || error.message || 'Failed to get results');
  }
};

// Get file status
export const getFileStatus = async (fileId) => {
  try {
    const response = await apiClient.get(`/parse/${fileId}/status`);
    return response.data;
  } catch (error) {
    console.error('❌ Status check error:', error);
    throw new Error(error.response?.data?.message || error.message || 'Status check failed');
  }
};

// Health check for testing connection
export const healthCheck = async () => {
  try {
    console.log('🔍 Checking backend health...');
    const response = await apiClient.get('/health');
    console.log('✅ Backend healthy:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Health check failed:', error);
    throw error;
  }
};

// Create shareable link
export const createShareLink = async (cardData) => {
  try {
    console.log('🔗 Creating share link...');
    const response = await apiClient.post('/share', { cardData });
    console.log('✅ Share link created:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Share link creation failed:', error);
    throw new Error(error.response?.data?.message || error.message || 'Failed to create share link');
  }
};

// Get shared card data
export const getSharedCard = async (shareId) => {
  try {
    console.log('📖 Getting shared card:', shareId);
    const response = await apiClient.get(`/share/${shareId}`);
    console.log('✅ Shared card retrieved:', response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Failed to get shared card:', error);
    throw new Error(error.response?.data?.message || error.message || 'Failed to get shared card');
  }
};

export default apiClient;