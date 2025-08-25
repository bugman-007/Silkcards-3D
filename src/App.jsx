// src/App.jsx - UPDATED WITH SHARE MODAL
import { useState } from 'react'
import './App.css'
import FileUploader from './components/FileUploader'
import HealthCheck from './components/HealthCheck'
import ThreeViewer from './components/ThreeViewer'
import ShareModal from './components/ShareModal'

function App() {
  const [uploadedData, setUploadedData] = useState(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  const handleFileUpload = (data) => {
    console.log('File processing completed:', data);
    setUploadedData(data);
    setShowAnalysis(false); // Start with 3D view
  };

  const resetUpload = () => {
    setUploadedData(null);
    setShowAnalysis(false);
    setShowShareModal(false);
  };

  const handleGenerateShare = () => {
    setShowShareModal(true);
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>SilkCards 3D Preview Tool</h1>
        <p>Upload your AI/PDF file to see a realistic 3D preview</p>
      </header>
      
      <main className="main-content">
        {!uploadedData ? (
          // Upload Phase
          <div className="upload-area">
            <HealthCheck />
            <FileUploader onFileUpload={handleFileUpload} />
          </div>
        ) : (
          // Preview Phase
          <div className="preview-area">
            {/* Navigation */}
            <div className="preview-nav">
              <button
                className={`nav-btn ${!showAnalysis ? 'active' : ''}`}
                onClick={() => setShowAnalysis(false)}
              >
                🎯 3D Preview
              </button>
              <button
                className={`nav-btn ${showAnalysis ? 'active' : ''}`}
                onClick={() => setShowAnalysis(true)}
              >
                📊 Analysis
              </button>
              <button
                className="nav-btn reset-btn"
                onClick={resetUpload}
              >
                🔄 Upload New File
              </button>
            </div>

            {/* Content */}
            {!showAnalysis ? (
              // 3D Preview View
              <div className="preview-content">
                <ThreeViewer cardData={uploadedData.parseResult} />
                
                <div className="preview-actions">
                  <button 
                    className="action-btn primary"
                    onClick={handleGenerateShare}
                  >
                    🔗 Generate Share Link
                  </button>
                  <button className="action-btn">
                    📤 Export Preview
                  </button>
                </div>
              </div>
            ) : (
              // Analysis View
              <div className="analysis-content">
                <div className="analysis-card">
                  <h3>File Analysis Results</h3>
                  <div className="analysis-details">
                    <div className="detail-group">
                      <h4>📁 File Information</h4>
                      <p><strong>Name:</strong> {uploadedData.file.name}</p>
                      <p><strong>Size:</strong> {(uploadedData.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      <p><strong>Type:</strong> {uploadedData.parseResult.fileType.toUpperCase()}</p>
                      <p><strong>File ID:</strong> {uploadedData.uploadResult.data.fileId}</p>
                    </div>

                    <div className="detail-group">
                      <h4>📐 Card Specifications</h4>
                      <p><strong>Dimensions:</strong> {uploadedData.parseResult.cardDimensions.width} × {uploadedData.parseResult.cardDimensions.height} mm</p>
                      <p><strong>Thickness:</strong> {uploadedData.parseResult.cardDimensions.thickness} mm</p>
                      <p><strong>Color Mode:</strong> {uploadedData.parseResult.metadata.colorMode}</p>
                      <p><strong>Resolution:</strong> {uploadedData.parseResult.metadata.resolution} DPI</p>
                    </div>

                    <div className="detail-group">
                      <h4>🎨 Layers Found</h4>
                      <p><strong>Total Layers:</strong> {uploadedData.parseResult.layers.length}</p>
                      <div className="layers-list">
                        {uploadedData.parseResult.layers.map((layer, index) => (
                          <div key={layer.id} className="layer-item">
                            <span className={`layer-type ${layer.type}`}>
                              {layer.type}
                            </span>
                            <span className="layer-name">{layer.name}</span>
                            {layer.effectType && (
                              <span className={`effect-type ${layer.effectType}`}>
                                {layer.effectType} {layer.effectSubtype && `(${layer.effectSubtype})`}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-group">
                      <h4>✨ Effects Summary</h4>
                      {Object.entries(uploadedData.parseResult.effects).map(([effect, items]) => (
                        items.length > 0 && (
                          <div key={effect} className="effect-summary">
                            <span className={`effect-badge ${effect}`}>
                              {effect}: {items.length} instance{items.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Share Modal */}
        {showShareModal && (
          <ShareModal 
            cardData={uploadedData.parseResult}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </main>
    </div>
  )
}

export default App