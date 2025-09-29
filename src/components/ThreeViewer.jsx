// src/components/ThreeViewer.jsx - FIXED VERSION
import { Suspense, useState, useMemo, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
} from "@react-three/drei";
import CardModel from "./CardModel";
import CardSelector from "./CardSelector";
import * as THREE from "three";
import "./ThreeViewer.css";

export default function ThreeViewer({ cardData }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [selectedCard, setSelectedCard] = useState("front");
  const [envMapIntensity, setEnvMapIntensity] = useState(1.0);
  const exposure = 1.0; // keep neutral for faithful colors

  // Process the card data for the new structure - FIXED
  const processedCardInfo = useMemo(() => {
    if (!cardData) {
      return null;
    }

    const parseResult = cardData.parseResult || cardData;
    const cards = cardData.cards || {};
    const metadata = parseResult.metadata || {};

    // Determine which card to show
    const cardKeys = Object.keys(cards).filter(key => key === "front" || key === "back");
    let activeCardKey = selectedCard;

    // Auto-select first available card if selected doesn't exist
    if (cardKeys.length > 0 && !cards[selectedCard]) {
      activeCardKey = cardKeys.includes("front") ? "front" : cardKeys[0];
    }

    const activeCardData = cards[activeCardKey] || {};

    // Count effects from new structure - FIXED
    const effectsCount = 
      (activeCardData.foilLayers?.length || 0) +
      (activeCardData.uvLayers?.length || 0) +
      (activeCardData.embossLayers?.length || 0);

    // Extract file information - FIXED
    const g = parseResult.geometry || {};
    const gf0 = Array.isArray(g.front_cards) && g.front_cards[0]?.meta?.size_mm;
    const gb0 = Array.isArray(g.back_cards) && g.back_cards[0]?.meta?.size_mm;
    const v2f = g.front?.size_mm;
    const v2b = g.back?.size_mm;

    const primary = gf0 || gb0 || v2f || v2b;
    const dimensions = primary
      ? { width: primary.w || 89, height: primary.h || 51, thickness: 0.35 }
      : parseResult.dimensions || { width: 89, height: 51, thickness: 0.35 };

    const processingTime = metadata.processingTime
      ? `${(metadata.processingTime / 1000).toFixed(1)}s`
      : "N/A";

    const originalFile =
      parseResult?.metadata?.originalFile ||
      cardData?.file?.name ||
      parseResult?.doc?.name ||
      "Untitled.ai";

    return {
      originalFile,
      dimensions,
      effectsCount,
      processingTime,
      totalItems: metadata.totalItems || effectsCount,
      confidence: parseResult.parsing?.confidence || 0,
      cardsDetected: cardKeys.length,
      cards: cards,
      activeCard: activeCardKey,
      fullCardData: {
        ...cardData,
        cards: cards, // Pass the new structure
        activeCard: activeCardKey,
        dimensions,
        jobId: parseResult.jobId || parseResult.job_id || cardData?.jobId,
      },
    };
  }, [cardData, selectedCard]);

  useEffect(() => {
    const cards = cardData?.cards || {};
    const keys = Object.keys(cards).filter(key => key === "front" || key === "back");
    if (keys.length > 0 && !cards[selectedCard]) {
      setSelectedCard(keys.includes("front") ? "front" : keys[0]);
    }
  }, [cardData, selectedCard]);

  const handleCardChange = (cardKey) => {
    setSelectedCard(cardKey);
  };

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
    effectsCount,
    processingTime,
    totalItems,
    confidence,
    cardsDetected,
    cards,
    activeCard,
    fullCardData,
  } = processedCardInfo;

  return (
    <div className="three-viewer-container">
      {/* Card Selector for multiple cards */}
      {cardsDetected > 1 && (
        <CardSelector
          cards={cards}
          activeCard={activeCard}
          onCardChange={handleCardChange}
        />
      )}

      {/* Enhanced Controls Panel */}
      {showControls && (
        <div className="viewer-controls">
          <div className="control-group">
            <button
              className={`control-btn ${autoRotate ? "active" : ""}`}
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

          <div className="control-group">
            <label>Reflections:</label>
            <input
              type="range"
              min="0"
              max="3"
              step="0.1"
              value={envMapIntensity}
              onChange={(e) => setEnvMapIntensity(parseFloat(e.target.value))}
            />
            <span>{envMapIntensity.toFixed(1)}</span>
          </div>
        </div>
      )}

      {/* 3D Canvas */}
      <Canvas
        className="three-canvas"
        gl={{ 
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: exposure
        }}
        dpr={[1, 2]}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <color attach="background" args={["#0E1420"]} />
        
        <Suspense fallback={<LoadingMesh />}>
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 0.22]}
            fov={40}
            near={0.001}
            far={10}
          />

          {/* Enhanced Lighting */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[2, 4, 3]}
            intensity={1.5 * envMapIntensity}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-0.6, 0.8, 0.4]} intensity={0.6} />

          {/* Environment Map with adjustable intensity */}
          <Environment 
            preset="city" 
            background={false}
          />

          {/* Ground plane */}
          <mesh
            position={[0, -0.05, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[0.6, 0.6]} />
            <meshStandardMaterial color="#0c0f1a" roughness={1} metalness={0} />
          </mesh>

          {/* Main Card Model */}
          <CardModel
            cardData={fullCardData}
            autoRotate={autoRotate}
            showEffects={true}
          />

          <OrbitControls
            enablePan
            enableZoom
            enableRotate
            minDistance={0.05}
            maxDistance={0.5}
            // maxPolarAngle={Math.PI / 2}
            autoRotate={autoRotate}
          />
        </Suspense>
      </Canvas>

      {/* Enhanced Info Panel */}
      <div className="card-info">
        <h4>
          {originalFile}
          {cardsDetected > 1 && (
            <span className="card-indicator"> - {activeCard} card</span>
          )}
        </h4>
        <div className="info-stats">
          <span>Layers: {effectsCount}</span>
          <span>
            Size: {Math.round(dimensions.width)}×{Math.round(dimensions.height)}
            mm
          </span>
          {cardsDetected > 1 && <span>Cards: {cardsDetected}</span>}
          <span>Confidence: {Math.round(confidence * 100)}%</span>
        </div>

        <div className="effects-list">
          {/* Show new structure layer counts - FIXED */}
          {cards[activeCard] && (
            <>
              {(cards[activeCard].foilLayers?.length || 0) > 0 && (
                <div className="effect-item">
                  <span className="effect-badge foil">
                    Foil: {cards[activeCard].foilLayers.length} layers
                  </span>
                </div>
              )}
              {(cards[activeCard].uvLayers?.length || 0) > 0 && (
                <div className="effect-item">
                  <span className="effect-badge spot_uv">
                    UV: {cards[activeCard].uvLayers.length} layers
                  </span>
                </div>
              )}
              {(cards[activeCard].embossLayers?.length || 0) > 0 && (
                <div className="effect-item">
                  <span className="effect-badge emboss">
                    Emboss: {cards[activeCard].embossLayers.length} layers
                  </span>
                </div>
              )}
            </>
          )}

          {effectsCount === 0 && (
            <div className="effect-item">
              <span className="effect-badge print">
                No special effects detected in {activeCard} card
              </span>
            </div>
          )}
        </div>

        {/* Rendering Mode Indicator */}
        <div className="rendering-mode">
          <span className="mode-indicator">
            🎨 Per-Image Overlay Mode
          </span>
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

// Loading component
function LoadingMesh() {
  return (
    <mesh position={[0, 0, 0]}>
      <boxGeometry args={[0.089, 0.051, 0.00035]} />
      <meshStandardMaterial color="#f0f0f0" wireframe />
    </mesh>
  );
}
