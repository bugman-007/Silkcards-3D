// src/api/client.js - Updated for production
import axios from 'axios';

// Use environment variable or fallback to production URL
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://your-render-app-name.onrender.com/api';

// For development, you can set VITE_API_URL=http://localhost:3001/api in .env file

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000, // Increased timeout for production (60 seconds)
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('Request error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('Response error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Upload file
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    console.log('Uploading file:', file.name);
    const response = await apiClient.post('/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log('Upload progress:', percentCompleted + '%');
      },
    });
    
    console.log('Upload response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Upload error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Upload failed');
  }
};

// Parse uploaded file
export const parseFile = async (fileId) => {
  try {
    console.log('Parsing file:', fileId);
    const response = await apiClient.post(`/parse/${fileId}`);
    console.log('Parse response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Parse error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.message || 'Parsing failed');
  }
};

// Get parse results
export const getParseResults = async (fileId) => {
  try {
    const response = await apiClient.get(`/parse/${fileId}`);
    return response.data;
  } catch (error) {
    console.error('Get parse results error:', error);
    throw new Error(error.response?.data?.message || 'Failed to get results');
  }
};

// Get file status
export const getFileStatus = async (fileId) => {
  try {
    const response = await apiClient.get(`/parse/${fileId}/status`);
    return response.data;
  } catch (error) {
    console.error('Status check error:', error);
    throw new Error(error.response?.data?.message || 'Status check failed');
  }
};

export default apiClient;