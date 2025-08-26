// src/components/FileUploader.jsx - UPDATED FOR JOB QUEUE SYSTEM
import { useState, useRef, useEffect } from 'react';
import { processFile, getParseStatus, getParseResult } from '../api/client';
import './FileUploader.css';

export default function FileUploader({ onFileUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(''); // 'uploading', 'submitting', 'parsing', 'success', 'error'
  const [parseProgress, setParseProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [jobId, setJobId] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [processingDetails, setProcessingDetails] = useState({});
  const fileInputRef = useRef(null);

  // Handle drag events
  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Handle file selection
  const handleFileSelect = (file) => {
    // Validate file type
    const validTypes = ['.ai', '.pdf'];
    const isValidType = validTypes.some(type => 
      file.name.toLowerCase().endsWith(type) || file.type === 'application/pdf'
    );

    if (!isValidType) {
      alert('Please select a valid AI or PDF file');
      return;
    }

    // Validate file size (max 100MB for microservice)
    if (file.size > 100 * 1024 * 1024) {
      alert('File size must be less than 100MB');
      return;
    }

    setSelectedFile(file);
    setUploadStatus('');
    setParseProgress(0);
    setCurrentStep('');
    setJobId(null);
    setErrorMessage('');
    setProcessingDetails({});
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // Handle upload and processing
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    setErrorMessage('');
    setParseProgress(0);
    setCurrentStep('Preparing file...');
    
    try {
      // Process file with progress tracking
      const result = await processFile(
        selectedFile,
        {
          dpi: 600,
          extractVector: true,
          enableOCG: true
        },
        (progress) => {
          // Update UI based on processing step
          setParseProgress(progress.progress || 0);
          
          switch (progress.step) {
            case 'uploading':
              setUploadStatus('uploading');
              setCurrentStep('Uploading file to server...');
              break;
            case 'submitting':
              setUploadStatus('submitting');
              setCurrentStep('Submitting to parser service...');
              break;
            case 'parsing':
              setUploadStatus('parsing');
              if (progress.status === 'queued') {
                setCurrentStep('Job queued, waiting for processing...');
              } else if (progress.status === 'processing') {
                setCurrentStep('Analyzing file and extracting layers...');
              } else {
                setCurrentStep('Processing file...');
              }
              break;
            case 'completed':
              setUploadStatus('success');
              setCurrentStep('Processing completed!');
              break;
            case 'failed':
              setUploadStatus('error');
              setErrorMessage(progress.error || 'Processing failed');
              break;
          }
        }
      );
      
      setJobId(result.jobId);
      setProcessingDetails(result.parseResult);
      
      console.log('✅ Complete processing finished:', result);
      
      // Call parent component callback with full results
      if (onFileUpload) {
        onFileUpload(result);
      }
      
    } catch (error) {
      console.error('Upload/Parse failed:', error);
      setUploadStatus('error');
      setErrorMessage(error.message || 'Processing failed');
      setCurrentStep('Processing failed');
    }
  };

  // Manual retry for failed jobs
  const handleRetry = async () => {
    if (!jobId) {
      // If no job ID, restart the whole process
      handleUpload();
      return;
    }
    
    setUploadStatus('parsing');
    setErrorMessage('');
    setCurrentStep('Retrying...');
    
    try {
      // Check current job status
      const status = await getParseStatus(jobId);
      
      if (status.status === 'completed') {
        // Job actually completed, get result
        const result = await getParseResult(jobId);
        setUploadStatus('success');
        setCurrentStep('Processing completed!');
        setParseProgress(100);
        
        if (onFileUpload) {
          onFileUpload({
            file: selectedFile,
            parseResult: result,
            jobId
          });
        }
      } else if (status.status === 'failed') {
        // Job still failed, restart whole process
        handleUpload();
      } else {
        // Job is still processing, start polling
        setCurrentStep('Job found, resuming monitoring...');
        startPolling();
      }
      
    } catch (error) {
      console.error('Retry failed:', error);
      // If retry fails, restart whole process
      handleUpload();
    }
  };

  // Start polling for job completion
  const startPolling = async () => {
    if (!jobId) return;
    
    const maxAttempts = 60; // 2 minutes at 2s intervals
    let attempts = 0;
    
    const poll = async () => {
      try {
        const status = await getParseStatus(jobId);
        
        // Update progress
        setParseProgress(status.progress || parseProgress);
        
        if (status.status === 'completed') {
          // Get final result
          const result = await getParseResult(jobId);
          setUploadStatus('success');
          setCurrentStep('Processing completed!');
          setParseProgress(100);
          setProcessingDetails(result);
          
          if (onFileUpload) {
            onFileUpload({
              file: selectedFile,
              parseResult: result,
              jobId
            });
          }
          return;
        } else if (status.status === 'failed') {
          setUploadStatus('error');
          setErrorMessage(status.error || 'Processing failed');
          setCurrentStep('Processing failed');
          return;
        } else if (status.status === 'processing') {
          setCurrentStep('Analyzing file and extracting layers...');
        } else if (status.status === 'queued') {
          setCurrentStep('Job queued, waiting for processing...');
        }
        
        // Continue polling
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 2000); // Poll every 2 seconds
        } else {
          setUploadStatus('error');
          setErrorMessage('Processing timed out');
          setCurrentStep('Processing timed out');
        }
        
      } catch (error) {
        console.error('Polling error:', error);
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000); // Retry after 3 seconds on error
        } else {
          setUploadStatus('error');
          setErrorMessage('Connection lost during processing');
          setCurrentStep('Connection lost');
        }
      }
    };
    
    poll();
  };

  // Reset upload
  const handleReset = () => {
    setSelectedFile(null);
    setUploadStatus('');
    setParseProgress(0);
    setCurrentStep('');
    setJobId(null);
    setErrorMessage('');
    setProcessingDetails({});
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Get step description based on current status
  const getStepDescription = () => {
    if (currentStep) return currentStep;
    
    switch (uploadStatus) {
      case 'uploading':
        return 'Uploading file to server...';
      case 'submitting':
        return 'Submitting to parser service...';
      case 'parsing':
        return 'Analyzing file structure...';
      case 'success':
        return 'Processing completed successfully!';
      case 'error':
        return 'Processing failed';
      default:
        return '';
    }
  };

  // Get progress bar color
  const getProgressColor = () => {
    switch (uploadStatus) {
      case 'success':
        return '#28a745';
      case 'error':
        return '#dc3545';
      case 'parsing':
        return '#667eea';
      default:
        return '#6c757d';
    }
  };

  return (
    <div className="file-uploader">
      {!selectedFile ? (
        // Upload area
        <div 
          className={`upload-zone ${isDragging ? 'dragging' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="upload-icon">📁</div>
          <h3>Drop your AI or PDF file here</h3>
          <p>or click to browse</p>
          <div className="supported-formats">
            <span>Supported: .ai, .pdf</span>
            <span>Max size: 100MB</span>
            <span>High-precision OCG parsing</span>
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
        // File selected area
        <div className="file-selected">
          <div className="file-info">
            <div className="file-icon">
              {selectedFile.name.endsWith('.ai') ? '🎨' : '📄'}
            </div>
            <div className="file-details">
              <h4>{selectedFile.name}</h4>
              <p>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
              {jobId && <p className="job-id">Job ID: {jobId.substring(0, 8)}...</p>}
            </div>
          </div>
          
          {uploadStatus === '' && (
            <div className="upload-actions">
              <button className="upload-btn" onClick={handleUpload}>
                🚀 Process with AI Parser
              </button>
              <button className="cancel-btn" onClick={handleReset}>
                Choose Different File
              </button>
            </div>
          )}
          
          {(uploadStatus === 'uploading' || uploadStatus === 'submitting' || uploadStatus === 'parsing') && (
            <div className="upload-progress">
              <div className="progress-container">
                <div 
                  className="progress-bar" 
                  style={{ 
                    width: `${parseProgress}%`,
                    backgroundColor: getProgressColor()
                  }}
                ></div>
              </div>
              <p className="progress-text">
                {getStepDescription()} ({Math.round(parseProgress)}%)
              </p>
              {uploadStatus === 'parsing' && (
                <div className="parsing-details">
                  <div className="parsing-spinner"></div>
                  <small>Advanced OCG layer extraction in progress...</small>
                </div>
              )}
            </div>
          )}
          
          {uploadStatus === 'success' && (
            <div className="upload-success">
              <div className="success-icon">✅</div>
              <p>File processed successfully!</p>
              {processingDetails.confidence && (
                <div className="processing-stats">
                  <p>Parsing confidence: {Math.round(processingDetails.confidence * 100)}%</p>
                  {processingDetails.maps && (
                    <p>Effects found: {Object.keys(processingDetails.maps).length}</p>
                  )}
                  {processingDetails.parseTime && (
                    <p>Processing time: {(processingDetails.parseTime / 1000).toFixed(1)}s</p>
                  )}
                </div>
              )}
              <button className="reset-btn" onClick={handleReset}>
                Process Another File
              </button>
            </div>
          )}
          
          {uploadStatus === 'error' && (
            <div className="upload-error">
              <div className="error-icon">❌</div>
              <p className="error-message">{errorMessage}</p>
              <div className="error-actions">
                <button className="retry-btn" onClick={handleRetry}>
                  🔄 Retry Processing
                </button>
                <button className="cancel-btn" onClick={handleReset}>
                  Choose Different File
                </button>
              </div>
              {jobId && (
                <small className="error-details">
                  Job ID: {jobId} - Contact support if issue persists
                </small>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}