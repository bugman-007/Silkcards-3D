// src/components/ThreeViewer.jsx - NEW FILE
import { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import CardModel from './CardModel';
import './ThreeViewer.css';

export default function ThreeViewer({ cardData }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);

  if (!cardData) {
    return (
      <div className="three-viewer-placeholder">
        <p>Upload a file to see 3D preview</p>
      </div>
    );
  }

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
            position={[0, 0, 8]} 
            fov={50}
          />

          {/* Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight 
            position={[5, 5, 5]} 
            intensity={1} 
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight 
            position={[-5, 5, 5]} 
            intensity={0.5} 
          />

          {/* Environment for reflections */}
          <Environment preset="studio" />

          {/* Card Model */}
          <CardModel 
            cardData={cardData} 
            autoRotate={autoRotate}
          />

          {/* Camera Controls */}
          <OrbitControls
            enablePan={true}
            enableZoom={true}
            enableRotate={true}
            minDistance={3}
            maxDistance={15}
            maxPolarAngle={Math.PI / 2}
            autoRotate={false} // We handle auto-rotate manually
          />
        </Suspense>
      </Canvas>

      {/* Info Panel */}
      <div className="card-info">
        <h4>{cardData.originalFile || 'Business Card'}</h4>
        <div className="info-stats">
          <span>Layers: {cardData.layers.length}</span>
          <span>Size: {cardData.cardDimensions.width}×{cardData.cardDimensions.height}mm</span>
        </div>
        
        <div className="effects-list">
          {Object.entries(cardData.effects).map(([effect, items]) => (
            items.length > 0 && (
              <div key={effect} className="effect-item">
                <span className={`effect-badge ${effect}`}>
                  {effect}: {items.length}
                </span>
              </div>
            )
          ))}
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
      <boxGeometry args={[4, 2.5, 0.1]} />
      <meshStandardMaterial color="#f0f0f0" wireframe />
    </mesh>
  );
}