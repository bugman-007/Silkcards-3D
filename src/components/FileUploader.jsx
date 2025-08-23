// src/components/FileUploader.jsx - Create this new file
import { useState, useRef } from 'react';
import './FileUploader.css';

export default function FileUploader({ onFileUpload }) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState(''); // 'uploading', 'success', 'error'
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
    const validTypes = ['.ai', 'application/pdf', 'application/postscript'];
    const isValidType = validTypes.some(type => 
      file.type === type || file.name.toLowerCase().endsWith('.ai')
    );

    if (!isValidType) {
      alert('Please select a valid AI or PDF file');
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert('File size must be less than 50MB');
      return;
    }

    setSelectedFile(file);
    setUploadStatus('');
  };

  // Handle file input change
  const handleFileInputChange = (e) => {
    if (e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    
    try {
      // Simulate upload for now - we'll connect to backend later
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setUploadStatus('success');
      
      // Call parent component callback
      if (onFileUpload) {
        onFileUpload(selectedFile);
      }
      
    } catch (error) {
      console.error('Upload failed:', error);
      setUploadStatus('error');
    }
  };

  // Reset upload
  const handleReset = () => {
    setSelectedFile(null);
    setUploadStatus('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
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
            <span>Max size: 50MB</span>
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
            <div className="file-icon">📄</div>
            <div className="file-details">
              <h4>{selectedFile.name}</h4>
              <p>{(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
            </div>
          </div>
          
          {uploadStatus === '' && (
            <div className="upload-actions">
              <button className="upload-btn" onClick={handleUpload}>
                Upload & Process
              </button>
              <button className="cancel-btn" onClick={handleReset}>
                Choose Different File
              </button>
            </div>
          )}
          
          {uploadStatus === 'uploading' && (
            <div className="upload-progress">
              <div className="spinner"></div>
              <p>Uploading and processing...</p>
            </div>
          )}
          
          {uploadStatus === 'success' && (
            <div className="upload-success">
              <div className="success-icon">✅</div>
              <p>File uploaded successfully!</p>
              <button className="reset-btn" onClick={handleReset}>
                Upload Another File
              </button>
            </div>
          )}
          
          {uploadStatus === 'error' && (
            <div className="upload-error">
              <div className="error-icon">❌</div>
              <p>Upload failed. Please try again.</p>
              <button className="retry-btn" onClick={handleUpload}>
                Retry
              </button>
              <button className="cancel-btn" onClick={handleReset}>
                Choose Different File
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}