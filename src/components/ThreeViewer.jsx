// src/components/ThreeViewer.jsx - UPDATED WITH CARD SELECTOR
import { Suspense, useState, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  PerspectiveCamera,
} from "@react-three/drei";
import CardModel from "./CardModel";
import CardSelector from "./CardSelector";
import "./ThreeViewer.css";

export default function ThreeViewer({ cardData }) {
  const [autoRotate, setAutoRotate] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [selectedCard, setSelectedCard] = useState("front");

  // Process the card data to extract information from actual parser structure
  const processedCardInfo = useMemo(() => {
    if (!cardData) {
      return null;
    }

    const parseResult = cardData.parseResult || cardData;
    const cards = cardData.cards || {};
    const metadata = parseResult.metadata || {};

    // Determine which card to show
    const cardKeys = Object.keys(cards);
    let activeCardKey = selectedCard;

    // Auto-select first available card if selected doesn't exist
    if (cardKeys.length > 0 && !cards[selectedCard]) {
      activeCardKey = cardKeys.includes("front") ? "front" : cardKeys[0];
      setSelectedCard(activeCardKey);
    }

    const activeCardData = cards[activeCardKey] || cardData.layers || {};

    // Count total effects from active card
    const effectsCount = Object.values(activeCardData).reduce(
      (total, items) => total + (Array.isArray(items) ? items.length : 0),
      0
    );

    // Create effects summary for UI display
    const effects = {};
    Object.entries(activeCardData).forEach(([type, items]) => {
      if (Array.isArray(items) && items.length > 0) {
        effects[type] = items;
      }
    });

    // Extract file information
    const originalFile = metadata.originalFile || "Business Card";
    const g = parseResult.geometry || {};
    const geomFront = g.front?.size_mm;
    const geomBack = g.back?.size_mm;
    const primary = geomFront || geomBack;

    const dimensions = primary
      ? { width: primary.w, height: primary.h, thickness: 0.35 }
      : parseResult.dimensions || { width: 89, height: 51, thickness: 0.35 };
    const processingTime = metadata.processingTime
      ? `${(metadata.processingTime / 1000).toFixed(1)}s`
      : "N/A";

    return {
      originalFile,
      dimensions,
      effects,
      effectsCount,
      processingTime,
      totalItems: metadata.totalItems || effectsCount,
      confidence: parseResult.parsing?.confidence || 0,
      cardsDetected: cardKeys.length,
      cards: cards,
      activeCard: activeCardKey,
      fullCardData: {
        ...cardData,
        layers: activeCardData,
        activeCard: activeCardKey,
        dimensions, // <— force selected size into CardModel
      },
    };
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
    effects,
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

      {/* Controls Panel */}
      {showControls && (
        <div className="viewer-controls">
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
      )}

      {/* 3D Canvas */}
      <Canvas className="three-canvas">
        <Suspense fallback={<LoadingMesh />}>
          {/* Camera */}
          <PerspectiveCamera
            makeDefault
            position={[0, 0, 0.2]} // Closer for business card scale
            fov={40}
            near={0.001}
            far={10}
          />

          {/* Lighting Setup */}
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[0.1, 0.1, 0.1]}
            intensity={1}
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <directionalLight position={[-0.1, 0.1, 0.1]} intensity={0.5} />

          {/* Environment for reflections */}
          <Environment preset="studio" />

          {/* Card Model - Pass the card data with selected card */}
          <CardModel
            cardData={fullCardData}
            autoRotate={autoRotate}
            showEffects={true}
          />

          {/* Camera Controls */}
          <OrbitControls
            enablePan={false}
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
        <h4>
          {originalFile}
          {cardsDetected > 1 && (
            <span className="card-indicator"> - {activeCard} card</span>
          )}
        </h4>
        <div className="info-stats">
          <span>Items: {effectsCount}</span>
          <span>
            Size: {Math.round(dimensions.width)}×{Math.round(dimensions.height)}
            mm
          </span>
          {cardsDetected > 1 && <span>Cards: {cardsDetected}</span>}
          <span>Confidence: {Math.round(confidence * 100)}%</span>
        </div>

        <div className="effects-list">
          {Object.entries(effects).map(([effectType, items]) => (
            <div key={effectType} className="effect-item">
              <span className={`effect-badge ${effectType}`}>
                {effectType.replace("_", " ")}:{" "}
                {Array.isArray(items) ? items.length : 1}
              </span>
            </div>
          ))}

          {effectsCount === 0 && (
            <div className="effect-item">
              <span className="effect-badge print">
                No special effects detected in {activeCard} card
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
