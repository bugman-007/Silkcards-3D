// src/App.jsx - Replace the entire content with this
import { useState } from 'react'
import './App.css'
import FileUploader from './components/FileUploader'

function App() {
  const [uploadedFile, setUploadedFile] = useState(null);

  const handleFileUpload = (file) => {
    console.log('File uploaded:', file.name);
    setUploadedFile(file);
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
          
          {uploadedFile && (
            <div className="upload-result">
              <h3>File ready for processing:</h3>
              <p>{uploadedFile.name}</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default App