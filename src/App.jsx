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

  // Safely extract data for analysis view
  const getAnalysisData = () => {
    if (!uploadedData) return null;

    const parseResult = uploadedData.parseResult || {};
    const file = uploadedData.file || {};
    
    return {
      file: {
        name: file.name || 'Unknown file',
        size: file.size || 0
      },
      parseResult: {
        dimensions: parseResult.dimensions || { width: 0, height: 0, thickness: 0.35 },
        metadata: parseResult.metadata || {},
        maps: parseResult.maps || {},
        materials: parseResult.materials || {},
        parsing: parseResult.parsing || { confidence: 0, method: 'Unknown' },
        fileType: file.name?.endsWith('.ai') ? 'ai' : 'pdf'
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
              // Analysis View - Fixed to handle actual parser structure
              <div className="analysis-content">
                <div className="analysis-card">
                  <h3>File Analysis Results</h3>
                  <div className="analysis-details">
                    <div className="detail-group">
                      <h4>📁 File Information</h4>
                      <p><strong>Name:</strong> {analysisData.file.name}</p>
                      <p><strong>Size:</strong> {(analysisData.file.size / (1024 * 1024)).toFixed(2)} MB</p>
                      <p><strong>Type:</strong> {analysisData.parseResult.fileType.toUpperCase()}</p>
                      <p><strong>Job ID:</strong> {uploadedData.jobId || 'N/A'}</p>
                    </div>

                    <div className="detail-group">
                      <h4>📐 Card Specifications</h4>
                      <p><strong>Dimensions:</strong> {Math.round(analysisData.parseResult.dimensions.width)} × {Math.round(analysisData.parseResult.dimensions.height)} units</p>
                      <p><strong>Thickness:</strong> {analysisData.parseResult.dimensions.thickness} mm</p>
                      <p><strong>Material:</strong> {analysisData.parseResult.materials.paper?.preset || 'Standard'}</p>
                      <p><strong>Resolution:</strong> {uploadedData.parseResult?.coords?.dpi || 600} DPI</p>
                    </div>

                    <div className="detail-group">
                      <h4>🎨 Texture Maps Found</h4>
                      <p><strong>Total Maps:</strong> {Object.keys(analysisData.parseResult.maps).length}</p>
                      <div className="layers-list">
                        {Object.entries(analysisData.parseResult.maps).map(([mapType, mapData], index) => (
                          <div key={index} className="layer-item">
                            <span className={`layer-type ${mapType.includes('albedo') ? 'background' : 'effect'}`}>
                              {mapType.includes('albedo') ? 'texture' : 'effect'}
                            </span>
                            <span className="layer-name">{mapType}</span>
                            <span className={`effect-type ${mapType}`}>
                              {Array.isArray(mapData) ? `${mapData.length} items` : '1 item'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="detail-group">
                      <h4>✨ Processing Results</h4>
                      <div className="effect-summary">
                        <span className="effect-badge parsing">
                          Confidence: {Math.round((analysisData.parseResult.parsing.confidence || 0) * 100)}%
                        </span>
                      </div>
                      <div className="effect-summary">
                        <span className="effect-badge method">
                          Method: {analysisData.parseResult.parsing.method || 'OCG Extraction'}
                        </span>
                      </div>
                      <div className="effect-summary">
                        <span className="effect-badge processing">
                          Processing: {uploadedData.processingTime ? `${(uploadedData.processingTime / 1000).toFixed(1)}s` : 'N/A'}
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