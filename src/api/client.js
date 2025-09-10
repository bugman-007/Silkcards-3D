// src/api/client.js - COMPLETE FIXED VERSION WITH INTEGRATED WORKFLOW
import axios from "axios";

// Get API URL from environment variables with fallback
const getApiUrl = () => {
  // Try environment variable first
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }

  // Fallback based on current location
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;

    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://44.203.155.170:8000";
    }
  }

  return "http://44.203.155.170:8000";
};

const API_BASE_URL = getApiUrl();

console.log("🔗 API Base URL:", API_BASE_URL);

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 180000, // 3 minutes timeout for job operations
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    console.log(
      `📤 API Request: ${config.method?.toUpperCase()} ${config.baseURL}${
        config.url
      }`
    );
    return config;
  },
  (error) => {
    console.error("❌ Request error:", error);
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
    console.error("❌ Response error:", {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      message: error.message,
    });

    // Handle specific error cases
    if (error.code === "ECONNABORTED") {
      throw new Error("Request timeout - parser service might be busy");
    }

    if (error.response?.status === 403) {
      throw new Error("CORS error - frontend domain not allowed");
    }

    if (error.response?.status === 503) {
      throw new Error(
        "Parser service unavailable - please try again in a few minutes"
      );
    }

    return Promise.reject(error);
  }
);

// Upload file
export const uploadFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  try {
    console.log(
      "📤 Uploading file:",
      file.name,
      `(${(file.size / (1024 * 1024)).toFixed(2)} MB)`
    );

    const response = await apiClient.post("/upload", formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
      onUploadProgress: (progressEvent) => {
        const percentCompleted = Math.round(
          (progressEvent.loaded * 100) / progressEvent.total
        );
        console.log(`📤 Upload progress: ${percentCompleted}%`);
      },
      timeout: 120000, // 2 minutes for upload
    });

    console.log("✅ Upload successful:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Upload error:", error);

    if (error.code === "ERR_NETWORK") {
      throw new Error("Cannot connect to server. Is the backend running?");
    }

    throw new Error(
      error.response?.data?.message || error.message || "Upload failed"
    );
  }
};

// Submit parse job to microservice
export const parseFile = async (fileId, options = {}) => {
  try {
    console.log("🔍 Submitting parse job for file:", fileId);

    const response = await apiClient.post(`/parse/${fileId}`, {
      dpi: options.dpi || 600,
      extractVector: options.extractVector !== false,
      enableOCG: options.enableOCG !== false,
      ...options,
    });

    console.log("✅ Parse job submitted:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Parse submission error:", error);
    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Failed to submit parse job"
    );
  }
};

// Get job status
export const getParseStatus = async (jobId) => {
  try {
    const response = await apiClient.get(`/parse/status/${jobId}`);
    return response.data;
  } catch (error) {
    console.error("❌ Status check error:", error);
    throw new Error(
      error.response?.data?.message || error.message || "Status check failed"
    );
  }
};

// Get final parse result
export const getParseResult = async (jobId) => {
  try {
    console.log("📖 Fetching parse result for job:", jobId);
    const response = await apiClient.get(`/parse/result/${jobId}`);
    console.log("✅ Parse result retrieved:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Result fetch error:", error);
    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Failed to get parse result"
    );
  }
};

// Get asset URL for textures
export const getAssetUrl = (jobId, filename) => {
  return `${API_BASE_URL}/parse/assets/${jobId}/${filename}`;
};

// Health check for testing connection
export const healthCheck = async () => {
  try {
    console.log("🔍 Checking backend health...");
    const response = await apiClient.get("/health");
    console.log("✅ Backend healthy:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Health check failed:", error);
    throw error;
  }
};

// Check parser service health
export const parserHealthCheck = async () => {
  try {
    console.log("🔍 Checking parser service health...");
    const response = await apiClient.get("/parse/health/parser");
    console.log("✅ Parser service healthy:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Parser health check failed:", error);
    throw error;
  }
};

// Create shareable link
export const createShareLink = async (cardData) => {
  try {
    console.log("🔗 Creating share link...");
    const response = await apiClient.post("/share", { cardData });
    console.log("✅ Share link created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Share link creation failed:", error);
    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Failed to create share link"
    );
  }
};

// Get shared card data
export const getSharedCard = async (shareId) => {
  try {
    console.log("📖 Getting shared card:", shareId);
    const response = await apiClient.get(`/share/${shareId}`);
    console.log("✅ Shared card retrieved:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Failed to get shared card:", error);
    throw new Error(
      error.response?.data?.message ||
        error.message ||
        "Failed to get shared card"
    );
  }
};

// Polling utility for job status
export const pollJobStatus = async (
  jobId,
  onProgress = null,
  maxAttempts = 60,
  interval = 2000
) => {
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const status = await getParseStatus(jobId);

      if (onProgress) {
        onProgress(status);
      }

      if (status.status === "completed") {
        console.log("✅ Job completed successfully");
        return await getParseResult(jobId);
      } else if (status.status === "failed") {
        console.error("❌ Job failed:", status.error);
        throw new Error(status.error || "Job failed");
      }

      // Job still processing, wait and try again
      await new Promise((resolve) => setTimeout(resolve, interval));
      attempts++;
    } catch (error) {
      console.error("❌ Polling error:", error);
      throw error;
    }
  }

  throw new Error("Job timed out - exceeded maximum polling attempts");
};

// TOPIC: src/api/client.js — replace the whole processFile() export
export const processFile = async (file, options = {}, onProgress = null) => {
  try {
    // 1) Upload
    if (onProgress)
      onProgress({
        step: "uploading",
        progress: 0,
        status: "Uploading file...",
      });
    const uploadResult = await uploadFile(file);

    // Normalize the shape from axios (some servers respond as {data:...}, some as the object itself)
    const uploadPayload = uploadResult?.data ?? uploadResult;

    // 2) FAST-PATH: backend already returned the final parser manifest (no job flow)
    const looksLikeFinal =
      uploadPayload?.maps || // your exporter returns maps
      uploadPayload?.doc || // original doc block
      uploadPayload?.metadata || // metadata with originalFile, etc.
      Array.isArray(uploadPayload?.items); // some variants

    if (looksLikeFinal) {
      if (onProgress)
        onProgress({
          step: "completed",
          progress: 100,
          status: "Completed (direct parse).",
        });
      return {
        file,
        uploadResult,
        parseResult: uploadPayload,
        jobId:
          uploadPayload.jobId ||
          uploadPayload.job_id ||
          uploadPayload.id ||
          null,
      };
    }

    // 3) JOB-PATH: legacy/job microservice
    if (onProgress)
      onProgress({
        step: "submitting",
        progress: 20,
        status: "Submitting to parser service...",
      });

    const fileId = uploadPayload?.fileId || uploadPayload?.data?.fileId;
    if (!fileId) {
      throw new Error(
        "Unexpected /upload response: missing fileId and no final manifest"
      );
    }

    const parseJob = await parseFile(fileId, options);

    // 4) Poll
    if (onProgress)
      onProgress({
        step: "parsing",
        progress: 30,
        status: "Starting AI analysis...",
      });

    const result = await pollJobStatus(parseJob.jobId, (status) => {
      if (onProgress) {
        onProgress({
          step: "parsing",
          progress: 30 + (status.progress || 0) * 0.7,
          status: status.status,
          jobId: parseJob.jobId,
        });
      }
    });

    // 5) Done
    if (onProgress)
      onProgress({
        step: "completed",
        progress: 100,
        status: "Processing completed!",
      });

    return { file, uploadResult, parseResult: result, jobId: parseJob.jobId };
  } catch (error) {
    console.error("❌ Complete file processing failed:", error);
    if (onProgress) onProgress({ step: "failed", error: error.message });
    throw error;
  }
};

// Legacy functions - KEPT FOR BACKWARD COMPATIBILITY
export const getParseResults = async (fileId) => {
  try {
    console.warn("⚠️ Using deprecated getParseResults function");
    const response = await apiClient.get(`/parse/${fileId}`);
    return response.data;
  } catch (error) {
    console.error("❌ Legacy get parse results error:", error);
    throw new Error(
      "This endpoint is deprecated. Please use the new job-based parsing system."
    );
  }
};

export const getFileStatus = async (fileId) => {
  try {
    console.warn("⚠️ Using deprecated getFileStatus function");
    const response = await apiClient.get(`/parse/${fileId}/status`);
    return response.data;
  } catch (error) {
    console.error("❌ Legacy status check error:", error);
    throw new Error(
      "This endpoint is deprecated. Please use getParseStatus with jobId."
    );
  }
};

export default apiClient;
