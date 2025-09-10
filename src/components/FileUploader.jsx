// src/components/FileUploader.jsx - COMPLETE FIXED VERSION
import { useState, useRef, useEffect, useCallback } from "react";
import { processFile } from "../api/client";
import { adaptParserJsonToViewer } from "../api/adapter";
import "./FileUploader.css";

export default function FileUploader({ onFileUpload }) {
  // State management
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(""); // '', 'processing', 'success', 'error'
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [processingDetails, setProcessingDetails] = useState({});
  const [retryCount, setRetryCount] = useState(0);
  const fileInputRef = useRef(null);

  // Constants
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_RETRY_COUNT = 3;

  // File drag and drop handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, []);

  // File selection and validation
  const handleFileSelect = useCallback((file) => {
    console.log(
      "📁 File selected:",
      file.name,
      `(${(file.size / (1024 * 1024)).toFixed(2)}MB)`
    );

    // Validate file type
    const validTypes = [".ai", ".pdf"];
    const isValidType = validTypes.some(
      (type) =>
        file.name.toLowerCase().endsWith(type) ||
        file.type === "application/pdf"
    );

    if (!isValidType) {
      alert(
        "❌ Invalid file type! Please select an Adobe Illustrator (.ai) or PDF (.pdf) file."
      );
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      alert(
        `❌ File too large! Maximum file size is ${
          MAX_FILE_SIZE / (1024 * 1024)
        }MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`
      );
      return;
    }

    // Reset all state for new file
    setSelectedFile(file);
    setUploadStatus("");
    setProgress(0);
    setCurrentStep("");
    setErrorMessage("");
    setProcessingDetails({});
    setRetryCount(0);
  }, []);

  // File input change handler
  const handleFileInputChange = useCallback(
    (e) => {
      if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
      }
    },
    [handleFileSelect]
  );

  // Main upload and processing workflow using integrated processFile
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    const startTime = Date.now();

    try {
      console.log("🚀 Starting complete processing workflow...");

      setUploadStatus("processing");
      setCurrentStep("Starting file processing...");
      setProgress(0);

      // Use processFile which handles the entire workflow
      const result = await processFile(
        selectedFile,
        {
          dpi: 600,
          extractVector: true,
          enableOCG: true,
        },
        (progressUpdate) => {
          // Handle progress updates from the integrated workflow
          console.log("📊 Progress update:", progressUpdate);

          setProgress(progressUpdate.progress || 0);

          // Update step description based on progress
          switch (progressUpdate.step) {
            case "uploading":
              setCurrentStep("Uploading file to server...");
              break;
            case "submitting":
              setCurrentStep("Submitting to AI parser service...");
              break;
            case "parsing":
              if (progressUpdate.progress < 30) {
                setCurrentStep("Loading and validating PDF document...");
              } else if (progressUpdate.progress < 50) {
                setCurrentStep(
                  "Extracting OCG layers from Illustrator file..."
                );
              } else if (progressUpdate.progress < 70) {
                setCurrentStep("Rendering high-resolution texture maps...");
              } else if (progressUpdate.progress < 90) {
                setCurrentStep("Generating 3D material definitions...");
              } else {
                setCurrentStep("Finalizing parse results...");
              }
              break;
            case "completed":
              setCurrentStep("Processing completed successfully!");
              break;
            case "failed":
              setCurrentStep("Processing failed");
              break;
            default:
              setCurrentStep(progressUpdate.status || "Processing...");
          }
        }
      );

      // Success!
      setUploadStatus("success");
      setCurrentStep("Processing completed successfully!");
      setProgress(100);
      setProcessingDetails(result.parseResult);

      const totalTime = Date.now() - startTime;

      console.log(
        `✅ Complete workflow finished in ${(totalTime / 1000).toFixed(2)}s`
      );
      console.log(
        `🎯 Parse confidence: ${(
          result.parseResult.parsing?.confidence * 100 || 0
        ).toFixed(1)}%`
      );

      // Call parent component callback
      if (onFileUpload) {
        // result is the object returned by processFile()
        // result.parseResult is the raw parser JSON from Windows
        const adapted = adaptParserJsonToViewer(result.parseResult);
        onFileUpload({ ...adapted, processingTime: totalTime });
      }
    } catch (error) {
      console.error("❌ Upload/Parse workflow failed:", error);
      handleProcessingError(error);
    }
  }, [selectedFile, onFileUpload]);

  // Handle processing errors with retry logic
  const handleProcessingError = useCallback(
    (error) => {
      const isNetworkError =
        error.message.includes("network") ||
        error.message.includes("timeout") ||
        error.message.includes("unavailable") ||
        error.message.includes("ECONNREFUSED");

      if (isNetworkError && retryCount < MAX_RETRY_COUNT) {
        console.log(
          `🔄 Network error detected, retrying (${
            retryCount + 1
          }/${MAX_RETRY_COUNT})...`
        );
        setRetryCount((prev) => prev + 1);
        setCurrentStep(
          `Network error, retrying... (${retryCount + 1}/${MAX_RETRY_COUNT})`
        );

        // Retry after delay
        setTimeout(() => {
          handleUpload();
        }, 3000 * (retryCount + 1)); // Exponential backoff

        return;
      }

      // Final error state
      setUploadStatus("error");
      setErrorMessage(error.message || "Processing failed");
      setCurrentStep("Processing failed");
    },
    [retryCount, handleUpload]
  );

  // Manual retry handler
  const handleRetry = useCallback(() => {
    setRetryCount(0);
    setErrorMessage("");
    handleUpload();
  }, [handleUpload]);

  // Reset handler
  const handleReset = useCallback(() => {
    // Reset all state
    setSelectedFile(null);
    setUploadStatus("");
    setProgress(0);
    setCurrentStep("");
    setErrorMessage("");
    setProcessingDetails({});
    setRetryCount(0);

    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Get file type icon
  const getFileIcon = useCallback(() => {
    if (!selectedFile) return "📁";

    if (selectedFile.name.endsWith(".ai")) {
      return "🎨"; // Illustrator icon
    } else if (selectedFile.name.endsWith(".pdf")) {
      return "📄"; // PDF icon
    }
    return "📄";
  }, [selectedFile]);

  // Format file size
  const formatFileSize = useCallback((bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }, []);

  // Render component
  return (
    <div className="file-uploader">
      {!selectedFile ? (
        // Upload zone
        <div
          className={`upload-zone ${isDragging ? "dragging" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">🎨</div>
          <h3>Drop your Illustrator or PDF file here</h3>
          <p>or click to browse files</p>

          <div className="supported-formats">
            <span>✅ Adobe Illustrator (.ai)</span>
            <span>✅ PDF files (.pdf)</span>
            <span>📊 Max size: 100MB</span>
            <span>🔬 Advanced OCG parsing</span>
          </div>

          <div className="upload-features">
            <div className="feature-item">
              <span className="feature-icon">🎯</span>
              <span>95%+ accuracy with OCG layer extraction</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">🖼️</span>
              <span>600 DPI texture maps for perfect 3D rendering</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Real-time processing on dedicated EC2 server</span>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".ai,.pdf,application/pdf"
            onChange={handleFileInputChange}
            style={{ display: "none" }}
          />
        </div>
      ) : (
        // File processing area
        <div className="file-selected">
          {/* File information */}
          <div className="file-info">
            <div className="file-icon-large">{getFileIcon()}</div>
            <div className="file-details">
              <h4 title={selectedFile.name}>{selectedFile.name}</h4>
              <p className="file-size">{formatFileSize(selectedFile.size)}</p>
              <p className="file-type">
                {selectedFile.name.endsWith(".ai")
                  ? "Adobe Illustrator File"
                  : "PDF Document"}
              </p>
            </div>
          </div>

          {/* Action buttons for unprocessed file */}
          {uploadStatus === "" && (
            <div className="upload-actions">
              <button className="upload-btn primary" onClick={handleUpload}>
                🚀 Process with AI Parser
              </button>
              <button className="cancel-btn" onClick={handleReset}>
                Choose Different File
              </button>
            </div>
          )}

          {/* Processing progress */}
          {uploadStatus === "processing" && (
            <div className="upload-progress">
              <div className="progress-header">
                <h4>🔬 AI Analysis in Progress</h4>
                <span className="progress-percentage">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="progress-container">
                <div
                  className="progress-bar parsing-animation"
                  style={{
                    width: `${progress}%`,
                    backgroundColor: "#667eea",
                  }}
                ></div>
              </div>
              <p className="progress-text">{currentStep}</p>

              <div className="parsing-details">
                <div className="parsing-steps">
                  <div
                    className={`step ${
                      progress >= 25
                        ? "completed"
                        : progress >= 10
                        ? "active"
                        : ""
                    }`}
                  >
                    <span className="step-icon">📤</span>
                    <span>Upload</span>
                  </div>
                  <div
                    className={`step ${
                      progress >= 50
                        ? "completed"
                        : progress >= 25
                        ? "active"
                        : ""
                    }`}
                  >
                    <span className="step-icon">🎨</span>
                    <span>Parse OCG</span>
                  </div>
                  <div
                    className={`step ${
                      progress >= 80
                        ? "completed"
                        : progress >= 50
                        ? "active"
                        : ""
                    }`}
                  >
                    <span className="step-icon">🖼️</span>
                    <span>Generate 3D</span>
                  </div>
                  <div
                    className={`step ${
                      progress >= 95
                        ? "completed"
                        : progress >= 80
                        ? "active"
                        : ""
                    }`}
                  >
                    <span className="step-icon">✨</span>
                    <span>Complete</span>
                  </div>
                </div>

                <div className="technical-info">
                  <small>
                    💡 Advanced OCG layer extraction + 600 DPI texture
                    generation
                  </small>
                  {retryCount > 0 && (
                    <small>
                      🔄 Retry attempt: {retryCount}/{MAX_RETRY_COUNT}
                    </small>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Success state */}
          {uploadStatus === "success" && (
            <div className="upload-success">
              <div className="success-header">
                <div className="success-icon">🎉</div>
                <h4>Processing Completed Successfully!</h4>
              </div>

              {processingDetails.parsing && (
                <div className="processing-stats">
                  <div className="stat-grid">
                    <div className="stat-item">
                      <span className="stat-label">Parse Confidence</span>
                      <span className="stat-value confidence">
                        {Math.round(processingDetails.parsing.confidence * 100)}
                        %
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Effects Found</span>
                      <span className="stat-value">
                        {processingDetails.maps
                          ? Object.keys(processingDetails.maps).length
                          : 0}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Processing Time</span>
                      <span className="stat-value">
                        {processingDetails.parsing.parseTime
                          ? `${(
                              processingDetails.parsing.parseTime / 1000
                            ).toFixed(1)}s`
                          : "N/A"}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Method</span>
                      <span className="stat-value method">
                        {processingDetails.parsing.method || "OCG Extraction"}
                      </span>
                    </div>
                  </div>

                  {processingDetails.maps && (
                    <div className="effects-preview">
                      <h5>🎨 Detected Effects:</h5>
                      <div className="effects-list">
                        {Object.entries(processingDetails.maps).map(
                          ([effect, data]) => (
                            <span
                              key={effect}
                              className={`effect-badge ${effect}`}
                            >
                              {effect}: {Array.isArray(data) ? data.length : 1}
                            </span>
                          )
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="success-actions">
                <button
                  className="view-3d-btn"
                  onClick={() => window.scrollTo(0, 0)}
                >
                  👁️ View 3D Preview
                </button>
                <button className="reset-btn" onClick={handleReset}>
                  🔄 Process Another File
                </button>
              </div>
            </div>
          )}

          {/* Error state */}
          {uploadStatus === "error" && (
            <div className="upload-error">
              <div className="error-header">
                <div className="error-icon">❌</div>
                <h4>Processing Failed</h4>
              </div>

              <div className="error-details">
                <p className="error-message">{errorMessage}</p>

                {retryCount > 0 && (
                  <div className="error-technical">
                    <small>
                      Retry attempts: {retryCount}/{MAX_RETRY_COUNT}
                    </small>
                  </div>
                )}

                <div className="error-suggestions">
                  <h5>💡 Suggestions:</h5>
                  <ul>
                    <li>Ensure your file is a valid AI or PDF document</li>
                    <li>Check that the file size is under 100MB</li>
                    <li>Verify your internet connection is stable</li>
                    <li>
                      Try again in a few moments - the EC2 server might be busy
                    </li>
                  </ul>
                </div>
              </div>

              <div className="error-actions">
                <button className="retry-btn primary" onClick={handleRetry}>
                  🔄 Retry Processing
                </button>
                <button className="cancel-btn" onClick={handleReset}>
                  📁 Choose Different File
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
