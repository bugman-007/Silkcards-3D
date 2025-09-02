// src/components/ThreeViewer.jsx - FIXED VERSION FOR ACTUAL PARSER OUTPUT
import { Suspense, useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, PerspectiveCamera } from '@react-three/drei';
import CardModel from './CardModel';
import './ThreeViewer.css';

export default function ThreeViewer({ cardData }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Process the card data to extract information safely
  const processedCardInfo = useMemo(() => {
    if (!cardData) {
      return null;
    }

    // Handle the ACTUAL structure from your parser
    const parseResult = cardData.parseResult || cardData;
    
    // Extract dimensions
    const dimensions = parseResult.dimensions || {};
    const width = dimensions.width || 89;
    const height = dimensions.height || 51;
    
    // Extract file name
    const originalFile = parseResult.metadata?.originalFile ||
                        cardData.file?.name ||
                        'Business Card';
    
    // Extract available maps/effects
    const maps = parseResult.maps || {};
    const effectsCount = Object.keys(maps).length;
    
    // Create mock layers array since your parser doesn't provide it
    const layers = Object.keys(maps).map((mapType, index) => ({
      id: `layer-${index}`,
      name: mapType,
      type: mapType === 'albedo_front' || mapType === 'albedo_back' ? 'background' : 'effect'
    }));

    // Create mock effects object for UI display
    const effects = {};
    Object.keys(maps).forEach(mapType => {
      if (mapType !== 'albedo_front' && mapType !== 'albedo_back') {
        effects[mapType] = Array.isArray(maps[mapType]) ? maps[mapType] : [maps[mapType]];
      }
    });

    return {
      originalFile,
      dimensions: { width, height },
      layers,
      effects,
      effectsCount,
      // Pass the full card data to the 3D model
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

  const { originalFile, dimensions, layers, effects, effectsCount, fullCardData } = processedCardInfo;

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

          {/* Card Model - Pass the full card data */}
          <CardModel 
            cardData={fullCardData} 
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
            autoRotate={false}
          />
        </Suspense>
      </Canvas>

      {/* Info Panel */}
      <div className="card-info">
        <h4>{originalFile}</h4>
        <div className="info-stats">
          <span>Texture Maps: {effectsCount}</span>
          <span>Size: {Math.round(dimensions.width)}×{Math.round(dimensions.height)} units</span>
          <span>3D Model: Ready</span>
        </div>
        
        <div className="effects-list">
          {Object.entries(effects).map(([effect, items]) => (
            <div key={effect} className="effect-item">
              <span className={`effect-badge ${effect}`}>
                {effect}: {Array.isArray(items) ? items.length : 1}
              </span>
            </div>
          ))}
          
          {effectsCount === 0 && (
            <div className="effect-item">
              <span className="effect-badge albedo">
                Base card only
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
      <boxGeometry args={[4, 2.5, 0.1]} />
      <meshStandardMaterial color="#f0f0f0" wireframe />
    </mesh>
  );
}