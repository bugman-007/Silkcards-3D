// src/components/FileUploader.jsx - COMPLETE PRODUCTION VERSION
import { useState, useRef, useEffect, useCallback } from 'react';
import { uploadFile, parseFile, getParseStatus, getParseResult } from '../api/client';
import './FileUploader.css';

export default function FileUploader({ onFileUpload }) {
  // State management
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(''); // '', 'uploading', 'submitting', 'parsing', 'success', 'error'
  const [parseProgress, setParseProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [jobId, setJobId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingDetails, setProcessingDetails] = useState({});
  const [uploadProgress, setUploadProgress] = useState(0);
  const [retryCount, setRetryCount] = useState(0);
  const fileInputRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Constants
  const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
  const MAX_RETRY_COUNT = 3;
  const POLL_INTERVAL = 2000; // 2 seconds
  const MAX_POLL_ATTEMPTS = 90; // 3 minutes total

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

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
    console.log('📁 File selected:', file.name, `(${(file.size / (1024 * 1024)).toFixed(2)}MB)`);
    
    // Validate file type
    const validTypes = ['.ai', '.pdf'];
    const isValidType = validTypes.some(type => 
      file.name.toLowerCase().endsWith(type) || file.type === 'application/pdf'
    );

    if (!isValidType) {
      alert('❌ Invalid file type! Please select an Adobe Illustrator (.ai) or PDF (.pdf) file.');
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      alert(`❌ File too large! Maximum file size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(2)}MB.`);
      return;
    }

    // Reset all state for new file
    setSelectedFile(file);
    setUploadStatus('');
    setParseProgress(0);
    setUploadProgress(0);
    setCurrentStep('');
    setJobId(null);
    setErrorMessage('');
    setProcessingDetails({});
    setRetryCount(0);

    // Clear any existing polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // File input change handler
  const handleFileInputChange = useCallback((e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  }, [handleFileSelect]);

  // Main upload and processing workflow
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting complete processing workflow...');
      
      // Step 1: Upload file to backend
      setUploadStatus('uploading');
      setCurrentStep('Uploading file to server...');
      setUploadProgress(0);
      
      const uploadResult = await uploadFile(selectedFile);
      setUploadProgress(100);
      
      console.log('✅ File uploaded successfully:', uploadResult.data.fileId);
      
      // Step 2: Submit to EC2 parser service
      setUploadStatus('submitting');
      setCurrentStep('Submitting to AI parser service...');
      setParseProgress(10);
      
      const parseJob = await parseFile(uploadResult.data.fileId, {
        dpi: 600,
        extractVector: true,
        enableOCG: true
      });
      
      setJobId(parseJob.jobId);
      setParseProgress(20);
      
      console.log('✅ Parse job submitted:', parseJob.jobId);
      console.log('🏭 Parser service:', parseJob.parserService);
      
      // Step 3: Start polling for completion
      setUploadStatus('parsing');
      setCurrentStep('Processing file on EC2 server...');
      
      await startJobPolling(parseJob.jobId, uploadResult, startTime);
      
    } catch (error) {
      console.error('❌ Upload/Parse workflow failed:', error);
      handleProcessingError(error);
    }
  }, [selectedFile]);

  // Enhanced job polling with better error handling
  const startJobPolling = useCallback(async (jobId, uploadResult, startTime) => {
    let pollAttempts = 0;
    let lastProgress = 0;
    
    const poll = async () => {
      try {
        console.log(`📊 Polling attempt ${pollAttempts + 1}/${MAX_POLL_ATTEMPTS} for job: ${jobId}`);
        
        const status = await getParseStatus(jobId);
        pollAttempts++;
        
        // Update progress (ensure it only increases)
        const newProgress = Math.max(lastProgress, status.progress || 0);
        setParseProgress(Math.min(95, 20 + (newProgress * 0.75))); // Scale to 20-95%
        lastProgress = newProgress;
        
        // Update step description based on status
        updateStepDescription(status);
        
        if (status.status === 'completed') {
          console.log('🎉 Job completed successfully!');
          
          // Get final result
          setCurrentStep('Retrieving parsing results...');
          setParseProgress(95);
          
          const result = await getParseResult(jobId);
          
          setUploadStatus('success');
          setCurrentStep('Processing completed successfully!');
          setParseProgress(100);
          setProcessingDetails(result);
          
          const totalTime = Date.now() - startTime;
          
          console.log(`✅ Complete workflow finished in ${(totalTime / 1000).toFixed(2)}s`);
          console.log(`🎯 Parse confidence: ${(result.parsing?.confidence * 100 || 0).toFixed(1)}%`);
          console.log(`🎨 Effects detected: ${result.maps ? Object.keys(result.maps).length : 0}`);
          
          // Call parent component callback
          if (onFileUpload) {
            onFileUpload({
              file: selectedFile,
              uploadResult,
              parseResult: result,
              jobId,
              processingTime: totalTime
            });
          }
          
          return; // Stop polling
          
        } else if (status.status === 'failed') {
          console.error('❌ Job failed on EC2:', status.error);
          throw new Error(status.error || 'Processing failed on EC2 server');
          
        } else if (status.status === 'processing' || status.status === 'queued') {
          // Continue polling
          if (pollAttempts < MAX_POLL_ATTEMPTS) {
            pollIntervalRef.current = setTimeout(poll, POLL_INTERVAL);
          } else {
            throw new Error('Processing timeout - job took longer than expected');
          }
        } else {
          console.warn('⚠️ Unknown job status:', status.status);
          if (pollAttempts < MAX_POLL_ATTEMPTS) {
            pollIntervalRef.current = setTimeout(poll, POLL_INTERVAL);
          } else {
            throw new Error(`Unknown job status: ${status.status}`);
          }
        }
        
      } catch (error) {
        console.error(`❌ Polling error (attempt ${pollAttempts}):`, error);
        
        // Handle polling errors with exponential backoff
        if (pollAttempts < MAX_POLL_ATTEMPTS) {
          const backoffDelay = Math.min(POLL_INTERVAL * Math.pow(2, Math.floor(pollAttempts / 5)), 10000);
          console.log(`🔄 Retrying in ${backoffDelay}ms...`);
          pollIntervalRef.current = setTimeout(poll, backoffDelay);
        } else {
          handleProcessingError(error);
        }
      }
    };
    
    // Start polling
    poll();
  }, [onFileUpload, selectedFile]);

  // Update step description based on job status
  const updateStepDescription = useCallback((status) => {
    switch (status.status) {
      case 'queued':
        setCurrentStep(`Queued for processing... (${status.progress || 0}%)`);
        break;
      case 'processing':
        if (status.progress < 30) {
          setCurrentStep('Loading and validating PDF document...');
        } else if (status.progress < 50) {
          setCurrentStep('Extracting OCG layers from Illustrator file...');
        } else if (status.progress < 70) {
          setCurrentStep('Rendering high-resolution texture maps...');
        } else if (status.progress < 90) {
          setCurrentStep('Generating 3D material definitions...');
        } else {
          setCurrentStep('Finalizing parse results...');
        }
        break;
      default:
        setCurrentStep('Processing on EC2 server...');
    }
  }, []);

  // Handle processing errors with retry logic
  const handleProcessingError = useCallback((error) => {
    const isNetworkError = error.message.includes('network') || 
                          error.message.includes('timeout') ||
                          error.message.includes('unavailable');
    
    if (isNetworkError && retryCount < MAX_RETRY_COUNT) {
      console.log(`🔄 Network error detected, retrying (${retryCount + 1}/${MAX_RETRY_COUNT})...`);
      setRetryCount(prev => prev + 1);
      setCurrentStep(`Network error, retrying... (${retryCount + 1}/${MAX_RETRY_COUNT})`);
      
      // Retry after delay
      setTimeout(() => {
        handleUpload();
      }, 3000 * (retryCount + 1)); // Exponential backoff
      
      return;
    }
    
    // Final error state
    setUploadStatus('error');
    setErrorMessage(error.message || 'Processing failed');
    setCurrentStep('Processing failed');
    
    // Clear polling interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [retryCount, handleUpload]);

  // Manual retry handler
  const handleRetry = useCallback(() => {
    setRetryCount(0);
    setErrorMessage('');
    handleUpload();
  }, [handleUpload]);

  // Reset handler
  const handleReset = useCallback(() => {
    // Clear polling
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    
    // Reset all state
    setSelectedFile(null);
    setUploadStatus('');
    setParseProgress(0);
    setUploadProgress(0);
    setCurrentStep('');
    setJobId(null);
    setErrorMessage('');
    setProcessingDetails({});
    setRetryCount(0);
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Get file type icon
  const getFileIcon = useCallback(() => {
    if (!selectedFile) return '📁';
    
    if (selectedFile.name.endsWith('.ai')) {
      return '🎨'; // Illustrator icon
    } else if (selectedFile.name.endsWith('.pdf')) {
      return '📄'; // PDF icon
    }
    return '📄';
  }, [selectedFile]);

  // Get progress color based on status
  const getProgressColor = useCallback(() => {
    switch (uploadStatus) {
      case 'success':
        return '#28a745';
      case 'error':
        return '#dc3545';
      case 'parsing':
        return '#667eea';
      case 'submitting':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  }, [uploadStatus]);

  // Format file size
  const formatFileSize = useCallback((bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // Render component
  return (
    <div className="file-uploader">
      {!selectedFile ? (
        // Upload zone
        <div 
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
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
            style={{ display: 'none' }}
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
                {selectedFile.name.endsWith('.ai') ? 'Adobe Illustrator File' : 'PDF Document'}
              </p>
              {jobId && (
                <p className="job-id" title={jobId}>
                  Job ID: {jobId.substring(0, 8)}...
                </p>
              )}
            </div>
          </div>
          
          {/* Action buttons for unprocessed file */}
          {uploadStatus === '' && (
            <div className="upload-actions">
              <button className="upload-btn primary" onClick={handleUpload}>
                🚀 Process with AI Parser
              </button>
              <button className="cancel-btn" onClick={handleReset}>
                Choose Different File
              </button>
            </div>
          )}
          
          {/* Upload progress */}
          {uploadStatus === 'uploading' && (
            <div className="upload-progress">
              <div className="progress-header">
                <h4>📤 Uploading File</h4>
                <span className="progress-percentage">{Math.round(uploadProgress)}%</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${uploadProgress}%`,
                    backgroundColor: getProgressColor()
                  }}
                ></div>
              </div>
              <p className="progress-text">Uploading to server...</p>
            </div>
          )}
          
          {/* Submission progress */}
          {uploadStatus === 'submitting' && (
            <div className="upload-progress">
              <div className="progress-header">
                <h4>📡 Connecting to EC2</h4>
                <span className="progress-percentage">{Math.round(parseProgress)}%</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar pulse" 
                  style={{ 
                    width: `${parseProgress}%`,
                    backgroundColor: getProgressColor()
                  }}
                ></div>
              </div>
              <p className="progress-text">Submitting to AI parser service...</p>
              <div className="technical-details">
                <small>🖥️ Processing on EC2 instance 13.223.206.6</small>
              </div>
            </div>
          )}
          
          {/* Parsing progress */}
          {uploadStatus === 'parsing' && (
            <div className="upload-progress">
              <div className="progress-header">
                <h4>🔬 AI Analysis in Progress</h4>
                <span className="progress-percentage">{Math.round(parseProgress)}%</span>
              </div>
              <div className="progress-container">
                <div 
                  className="progress-bar parsing-animation" 
                  style={{ 
                    width: `${parseProgress}%`,
                    backgroundColor: getProgressColor()
                  }}
                ></div>
              </div>
              <p className="progress-text">{currentStep}</p>
              
              <div className="parsing-details">
                <div className="parsing-steps">
                  <div className={`step ${parseProgress >= 25 ? 'completed' : parseProgress >= 20 ? 'active' : ''}`}>
                    <span className="step-icon">📄</span>
                    <span>Load PDF</span>
                  </div>
                  <div className={`step ${parseProgress >= 45 ? 'completed' : parseProgress >= 30 ? 'active' : ''}`}>
                    <span className="step-icon">🎨</span>
                    <span>Extract OCG</span>
                  </div>
                  <div className={`step ${parseProgress >= 70 ? 'completed' : parseProgress >= 50 ? 'active' : ''}`}>
                    <span className="step-icon">🖼️</span>
                    <span>Render Maps</span>
                  </div>
                  <div className={`step ${parseProgress >= 95 ? 'completed' : parseProgress >= 80 ? 'active' : ''}`}>
                    <span className="step-icon">🎯</span>
                    <span>Build 3D Data</span>
                  </div>
                </div>
                
                <div className="technical-info">
                  <small>💡 Advanced OCG layer extraction + 600 DPI texture generation</small>
                  {retryCount > 0 && (
                    <small>🔄 Retry attempt: {retryCount}/{MAX_RETRY_COUNT}</small>
                  )}
                </div>
              </div>
            </div>
          )}
          
          {/* Success state */}
          {uploadStatus === 'success' && (
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
                        {Math.round(processingDetails.parsing.confidence * 100)}%
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Effects Found</span>
                      <span className="stat-value">
                        {processingDetails.maps ? Object.keys(processingDetails.maps).length : 0}
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Processing Time</span>
                      <span className="stat-value">
                        {processingDetails.parsing.parseTime ? 
                          `${(processingDetails.parsing.parseTime / 1000).toFixed(1)}s` : 
                          'N/A'
                        }
                      </span>
                    </div>
                    <div className="stat-item">
                      <span className="stat-label">Method</span>
                      <span className="stat-value method">
                        {processingDetails.parsing.method || 'OCG Extraction'}
                      </span>
                    </div>
                  </div>
                  
                  {processingDetails.maps && (
                    <div className="effects-preview">
                      <h5>🎨 Detected Effects:</h5>
                      <div className="effects-list">
                        {Object.entries(processingDetails.maps).map(([effect, data]) => (
                          <span key={effect} className={`effect-badge ${effect}`}>
                            {effect}: {Array.isArray(data) ? data.length : 1}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              <div className="success-actions">
                <button className="view-3d-btn" onClick={() => window.scrollTo(0, 0)}>
                  👁️ View 3D Preview
                </button>
                <button className="reset-btn" onClick={handleReset}>
                  🔄 Process Another File
                </button>
              </div>
            </div>
          )}
          
          {/* Error state */}
          {uploadStatus === 'error' && (
            <div className="upload-error">
              <div className="error-header">
                <div className="error-icon">❌</div>
                <h4>Processing Failed</h4>
              </div>
              
              <div className="error-details">
                <p className="error-message">{errorMessage}</p>
                
                {jobId && (
                  <div className="error-technical">
                    <small>Job ID: {jobId}</small>
                    <small>Retry attempts: {retryCount}/{MAX_RETRY_COUNT}</small>
                  </div>
                )}
                
                <div className="error-suggestions">
                  <h5>💡 Suggestions:</h5>
                  <ul>
                    <li>Ensure your file is a valid AI or PDF document</li>
                    <li>Check that the file size is under 100MB</li>
                    <li>Verify your internet connection is stable</li>
                    <li>Try again in a few moments - the EC2 server might be busy</li>
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