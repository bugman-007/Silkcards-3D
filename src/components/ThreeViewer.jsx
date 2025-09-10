// src/components/ThreeViewer.jsx - FIXED VERSION FOR ACTUAL PARSER OUTPUT
import { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import CardModel from './CardModel';
import './ThreeViewer.css';

export default function ThreeViewer({ cardData }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Process the card data to extract information from actual parser structure
  const processedCardInfo = useMemo(() => {
    if (!cardData) {
      return null;
    }

    const parseResult = cardData.parseResult || cardData;
    const layers = cardData.layers || {};
    const metadata = parseResult.metadata || {};
    
    // Count total effects from all layer types
    const effectsCount = Object.values(layers).reduce((total, items) => 
      total + (Array.isArray(items) ? items.length : 0), 0);
    
    // Create effects summary for UI display
    const effects = {};
    Object.entries(layers).forEach(([type, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        effects[type] = items;
      }
    });

    // Extract file information
    const originalFile = metadata.originalFile || 'Business Card';
    const dimensions = parseResult.dimensions || { width: 89, height: 51 };
    const processingTime = metadata.processingTime ? 
      `${(metadata.processingTime / 1000).toFixed(1)}s` : 'N/A';

    return {
      originalFile,
      dimensions,
      effects,
      effectsCount,
      processingTime,
      totalItems: metadata.totalItems || effectsCount,
      confidence: parseResult.parsing?.confidence || 0,
      fullCardData: cardData
    };
  }, [cardData]);

  if (!cardData || !processedCardInfo) {
    return (
      <div className="three-viewer-placeholder">
        <p>Upload a file to see 3D preview</p>
      </div>
    );
  }

  const { 
    originalFile, 
    dimensions, 
    effects, 
    effectsCount, 
    processingTime,
    totalItems,
    confidence,
    fullCardData 
  } = processedCardInfo;

  return (
    <div className="three-viewer-container">
      {/* Controls Panel */}
      {showControls && (
        <div className="viewer-controls">
          <button
            className={`control-btn ${autoRotate ? 'active' : ''}`}
            onClick={() => setAutoRotate(!autoRotate)}
            title="Auto Rotate"
          >
            🔄
          </button>
          
          <button
            className="control-btn"
            onClick={() => setShowControls(false)}
            title="Hide Controls"
          >
            👁️
          </button>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas className="three-canvas">
        <Suspense fallback={<LoadingMesh />}>
          {/* Camera */}
          <PerspectiveCamera 
            makeDefault 
            position={[0, 0, 0.2]} // Closer for business card scale
            fov={50}
          />

          {/* Lighting Setup */}
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[0.1, 0.1, 0.1]} 
            intensity={1} 
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight 
            position={[-0.1, 0.1, 0.1]} 
            intensity={0.5} 
          />

          {/* Environment for reflections */}
          <Environment preset="studio" />

          {/* Card Model - Pass the full adapted card data */}
          <CardModel 
            cardData={fullCardData} 
            autoRotate={autoRotate}
            showEffects={true}
          />

          {/* Camera Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={0.05}
            maxDistance={0.5}
            maxPolarAngle={Math.PI / 2}
            autoRotate={false}
          />
        </Suspense>
      </Canvas>

      {/* Info Panel */}
      <div className="card-info">
        <h4>{originalFile}</h4>
        <div className="info-stats">
          <span>Items Found: {totalItems}</span>
          <span>Size: {Math.round(dimensions.width)}×{Math.round(dimensions.height)}mm</span>
          <span>Processing: {processingTime}</span>
          <span>Confidence: {Math.round(confidence * 100)}%</span>
        </div>
        
        <div className="effects-list">
          {Object.entries(effects).map(([effectType, items]) => (
            <div key={effectType} className="effect-item">
              <span className={`effect-badge ${effectType}`}>
                {effectType.replace('_', ' ')}: {Array.isArray(items) ? items.length : 1}
              </span>
            </div>
          ))}
          
          {effectsCount === 0 && (
            <div className="effect-item">
              <span className="effect-badge print">
                Base card only - no special effects detected
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Show controls toggle when hidden */}
      {!showControls && (
        <button
          className="show-controls-btn"
          onClick={() => setShowControls(true)}
          title="Show Controls"
        >
          ⚙️
        </button>
      )}
    </div>
  );
}

// Loading component for Suspense
function LoadingMesh() {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.089, 0.051, 0.00035]} />
      <meshStandardMaterial color="#f0f0f0" wireframe />
    </mesh>
  );
}