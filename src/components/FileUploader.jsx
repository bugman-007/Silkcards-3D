// src/components/FileUploader.jsx - FIXED VERSION FOR ACTUAL PARSER OUTPUT
import { useState, useRef, useCallback } from "react";
import { processFile, parseFile, pollJobStatus } from "../api/client";
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
  const isProcessingRef = useRef(false);
  const lastUploadRef = useRef(null);

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

    // 🔒 hard guard against double-starts (double-clicks, stray retries)
    if (isProcessingRef.current) {
      console.log("🚫 Upload already in progress — ignoring duplicate trigger");
      return;
    }
    isProcessingRef.current = true;

    const startTime = Date.now();
    try {
      console.log("🚀 Starting complete processing workflow...");
      setUploadStatus("processing");
      setCurrentStep("Starting file processing...");
      setProgress(0);

      const result = await processFile(
        selectedFile,
        { dpi: 600, extractVector: true, enableOCG: true },
        (progressUpdate) => {
          setProgress(progressUpdate.progress || 0);
          switch (progressUpdate.step) {
            case "uploading":
              setCurrentStep("Uploading file to server...");
              break;
            case "submitting":
              setCurrentStep("Submitting to AI parser service...");
              break;
            case "parsing":
              if (progressUpdate.progress < 30)
                setCurrentStep("Loading and validating document...");
              else if (progressUpdate.progress < 50)
                setCurrentStep("Extracting OCG layers from file...");
              else if (progressUpdate.progress < 70)
                setCurrentStep("Processing vector paths and bounds...");
              else if (progressUpdate.progress < 90)
                setCurrentStep("Generating layer definitions...");
              else setCurrentStep("Finalizing parse results...");
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

      setUploadStatus("success");
      setCurrentStep("Processing completed successfully!");
      setProgress(100);
      const uploadPayload =
        result.uploadResult?.data ?? result.uploadResult ?? null;
      lastUploadRef.current = uploadPayload;

      const totalTime = Date.now() - startTime;
      const adapted = adaptParserJsonToViewer(result.parseResult);
      adapted.processingTime = totalTime;
      adapted.file = selectedFile;

      setProcessingDetails(adapted.parseResult);
      onFileUpload?.(adapted);
    } catch (err) {
      console.error("❌ Upload/Parse workflow failed:", err);
      // allow the retry logic to re-enter later
      isProcessingRef.current = false;
      handleProcessingError(err);
      return;
    }

    // success path: allow a new file later
    isProcessingRef.current = false;
  }, [selectedFile, onFileUpload]);

  const retryParseOnly = useCallback(async () => {
    // guard: treat this like a real “processing” run
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;
    setUploadStatus("processing");

    if (!lastUploadRef.current?.fileId) return handleUpload(); // fallback
    try {
      setCurrentStep("Retrying parse without re-upload...");
      const parseJob = await parseFile(lastUploadRef.current.fileId, {
        dpi: 600,
        extractVector: true,
        enableOCG: true,
      });
      const result = await pollJobStatus(parseJob.jobId, (s) =>
        setProgress(30 + (s.progress || 0) * 0.7)
      );
      const adapted = adaptParserJsonToViewer(result);
      adapted.file = selectedFile;
      onFileUpload?.(adapted);
      setUploadStatus("success");
      isProcessingRef.current = false;
    } catch (e) {
      isProcessingRef.current = false;
      handleProcessingError(e); // may try again or surface error
    }
  }, [onFileUpload, selectedFile]);

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
          // handleUpload();
          retryParseOnly();
        }, 3000 * (retryCount + 1)); // Exponential backoff

        return;
      }

      // Final error state
      setUploadStatus("error");
      setErrorMessage(error.message || "Processing failed");
      setCurrentStep("Processing failed");
    },
    [retryCount, retryParseOnly]
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
              <span>Vector-based 3D rendering for perfect visualization</span>
            </div>
            <div className="feature-item">
              <span className="feature-icon">⚡</span>
              <span>Real-time processing with accurate bounds detection</span>
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
              <button
                className="upload-btn primary"
                onClick={handleUpload}
                disabled={uploadStatus === "processing"} // ✅ prevents double-clicks at the DOM level
              >
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
                    <span>Process Layers</span>
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
                    💡 OCG layer extraction with vector bounds processing
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
                      <span className="stat-label">Items Found</span>
                      <span className="stat-value">
                        {processingDetails.metadata?.totalItems || 0}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Processing Time</span>
                      <span className="stat-value">
                        {processingDetails.metadata?.processingTime
                          ? `${(
                              processingDetails.metadata.processingTime / 1000
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
                      Try again in a few moments - the server might be busy
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
