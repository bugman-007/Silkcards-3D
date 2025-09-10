// src/App.jsx - FIXED VERSION FOR ACTUAL PARSER OUTPUT
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

  // Safely extract data for analysis view - FIXED for actual parser structure
  const getAnalysisData = () => {
    if (!uploadedData) return null;

    const parseResult = uploadedData.parseResult || {};
    const layers = uploadedData.layers || {};
    const metadata = parseResult.metadata || {};
    const parsing = parseResult.parsing || {};
    
    // Count total items from all layer types
    const totalItems = Object.values(layers).reduce((total, items) => 
      total + (Array.isArray(items) ? items.length : 0), 0);
    
    return {
      file: {
        name: metadata.originalFile || uploadedData.file?.name || 'Unknown file',
        size: uploadedData.file?.size || 0
      },
      parseResult: {
        dimensions: parseResult.dimensions || { width: 0, height: 0, thickness: 0.35 },
        metadata: metadata,
        layers: layers,
        parsing: {
          confidence: parsing.confidence || 0,
          method: parsing.method || 'OCG Layer Extraction'
        },
        totalItems: totalItems,
        processingTime: uploadedData.processingTime || metadata.processingTime || 0
      }
    };
  };

  const analysisData = getAnalysisData();

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
                <ThreeViewer cardData={uploadedData} />
                
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
              // Analysis View - FIXED to handle actual parser structure
              <div className="analysis-content">
                <div className="analysis-card">
                  <h3>File Analysis Results</h3>
                  <div className="analysis-details">
                    <div className="detail-group">
                      <h4>📁 File Information</h4>
                      <p><strong>Name:</strong> {analysisData.file.name}</p>
                      <p><strong>Size:</strong> {(analysisData.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      <p><strong>Type:</strong> {analysisData.file.name?.endsWith('.ai') ? 'AI' : 'PDF'}</p>
                      <p><strong>Job ID:</strong> {uploadedData.jobId?.slice(0, 16) || 'N/A'}</p>
                    </div>

                    <div className="detail-group">
                      <h4>📐 Card Specifications</h4>
                      <p><strong>Dimensions:</strong> {Math.round(analysisData.parseResult.dimensions.width)} × {Math.round(analysisData.parseResult.dimensions.height)} mm</p>
                      <p><strong>Thickness:</strong> {analysisData.parseResult.dimensions.thickness} mm</p>
                      <p><strong>Total Items:</strong> {analysisData.parseResult.totalItems}</p>
                      <p><strong>Processing Time:</strong> {analysisData.parseResult.processingTime ? `${(analysisData.parseResult.processingTime / 1000).toFixed(1)}s` : 'N/A'}</p>
                    </div>

                    <div className="detail-group">
                      <h4>🎨 Detected Layers</h4>
                      <p><strong>Layer Types:</strong> {Object.keys(analysisData.parseResult.layers).length}</p>
                      <div className="layers-list">
                        {Object.entries(analysisData.parseResult.layers).map(([layerType, items], index) => (
                          <div key={index} className="layer-item">
                            <span className={`layer-type ${layerType}`}>
                              {layerType.replace('_', ' ')}
                            </span>
                            <span className="layer-name">{layerType}</span>
                            <span className={`effect-type ${layerType}`}>
                              {Array.isArray(items) ? `${items.length} items` : '1 item'}
                            </span>
                          </div>
                        ))}
                        
                        {Object.keys(analysisData.parseResult.layers).length === 0 && (
                          <div className="layer-item">
                            <span className="layer-type background">No layers</span>
                            <span className="layer-name">Base card only</span>
                            <span className="effect-type print">print</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="detail-group">
                      <h4>✨ Processing Results</h4>
                      <div className="effect-summary">
                        <span className="effect-badge parsing">
                          Confidence: {Math.round(analysisData.parseResult.parsing.confidence * 100)}%
                        </span>
                      </div>
                      <div className="effect-summary">
                        <span className="effect-badge method">
                          Method: {analysisData.parseResult.parsing.method}
                        </span>
                      </div>
                      <div className="effect-summary">
                        <span className="effect-badge processing">
                          Status: Successfully processed
                        </span>
                      </div>
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
            cardData={uploadedData}
            onClose={() => setShowShareModal(false)}
          />
        )}
      </main>
    </div>
  )
}

export default App