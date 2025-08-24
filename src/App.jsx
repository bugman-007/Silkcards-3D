// src/App.jsx - UPDATED VERSION
import { useState } from 'react'
import './App.css'
import FileUploader from './components/FileUploader'

function App() {
  const [uploadedData, setUploadedData] = useState(null);

  const handleFileUpload = (data) => {
    console.log('File processing completed:', data);
    setUploadedData(data);
  };

  return (
    <div className="App">
      <header className="app-header">
        <h1>SilkCards 3D Preview Tool</h1>
        <p>Upload your AI/PDF file to see a realistic 3D preview</p>
      </header>
      
      <main className="main-content">
        <div className="upload-area">
          <FileUploader onFileUpload={handleFileUpload} />
          
          {uploadedData && (
            <div className="upload-result">
              <h3>Analysis Complete!</h3>
              <div className="result-details">
                <p><strong>File:</strong> {uploadedData.file.name}</p>
                <p><strong>Layers found:</strong> {uploadedData.parseResult.layers.length}</p>
                <p><strong>Effects detected:</strong></p>
                <ul>
                  {Object.entries(uploadedData.parseResult.effects).map(([effect, items]) => (
                    items.length > 0 && (
                      <li key={effect}>
                        {effect}: {items.length} instances
                      </li>
                    )
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App