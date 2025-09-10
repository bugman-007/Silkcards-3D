// src/components/CardModel.jsx - COMPLETELY REWRITTEN FOR ACTUAL PARSER OUTPUT
import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import EffectOverlay from './EffectOverlay';
import BaseCard from './BaseCard';

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();

  // Extract data from the adapted structure
  const jobId = useMemo(() => {
    return cardData?.jobId || cardData?.id || null;
  }, [cardData]);

  // Get card dimensions and convert mm to meters for Three.js
  const cardDimensions = useMemo(() => {
    const dims = cardData?.dimensions || cardData?.parseResult?.dimensions || 
                 { width: 89, height: 51, thickness: 0.35 };

    return {
      // Convert mm to meters for Three.js (standard practice)
      width: dims.width / 1000,
      height: dims.height / 1000,
      thickness: (dims.thickness || 0.35) / 1000,
    };
  }, [cardData]);

  // Extract layer data from the adapted structure
  const layers = useMemo(() => {
    return cardData?.layers || {};
  }, [cardData]);

  // Get original file name for debugging
  const originalFileName = useMemo(() => {
    return cardData?.parseResult?.metadata?.originalFile || 
           cardData?.file?.name || 
           "Business Card";
  }, [cardData]);

  // Count total effect items for logging
  const totalEffects = useMemo(() => {
    return Object.values(layers).reduce((total, items) => 
      total + (Array.isArray(items) ? items.length : 0), 0
    );
  }, [layers]);

  console.log("CardModel rendering:", {
    hasJobId: !!jobId,
    fileName: originalFileName,
    dimensions: cardDimensions,
    layerTypes: Object.keys(layers),
    totalEffects: totalEffects,
  });

  // Auto rotation animation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.3;
    }
  });

  // Show placeholder if no card data
  if (!cardData) {
    return <CardModelPlaceholder message="Upload a file to see 3D preview" />;
  }

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card */}
      <BaseCard dimensions={cardDimensions} />
      
      {/* Effect Layers - render as colored overlays based on bounds */}
      {showEffects && (
        <>
          {/* Print Layers (base content) */}
          {layers.print?.map((printItem, index) => (
            <EffectOverlay
              key={`print-${index}`}
              item={printItem}
              cardDimensions={cardDimensions}
              effectType="print"
              zOffset={0.0001 + index * 0.0001}
            />
          ))}

          {/* Foil Effects */}
          {layers.foil?.map((foilItem, index) => (
            <EffectOverlay
              key={`foil-${index}`}
              item={foilItem}
              cardDimensions={cardDimensions}
              effectType="foil"
              zOffset={0.001 + index * 0.0002}
            />
          ))}

          {/* Spot UV Effects */}
          {layers.spot_uv?.map((uvItem, index) => (
            <EffectOverlay
              key={`uv-${index}`}
              item={uvItem}
              cardDimensions={cardDimensions}
              effectType="spotUV"
              zOffset={0.002 + index * 0.0002}
            />
          ))}

          {/* Emboss Effects */}
          {layers.emboss?.map((embossItem, index) => (
            <EffectOverlay
              key={`emboss-${index}`}
              item={embossItem}
              cardDimensions={cardDimensions}
              effectType="emboss"
              zOffset={0.003 + index * 0.0002}
            />
          ))}

          {/* Die Cut Effects */}
          {layers.die_cut?.map((dieItem, index) => (
            <EffectOverlay
              key={`die-${index}`}
              item={dieItem}
              cardDimensions={cardDimensions}
              effectType="die_cut"
              zOffset={0.004 + index * 0.0002}
            />
          ))}
        </>
      )}

      {/* Debug info (only in development) */}
      {import.meta.env.DEV && (
        <Text
          position={[0, -cardDimensions.height / 2 - 0.02, 0]}
          fontSize={0.01}
          color="#666666"
          anchorX="center"
        >
          Effects: {totalEffects} | Job: {jobId ? jobId.slice(0, 8) + '...' : 'N/A'}
        </Text>
      )}

      {/* Show message when no effects are found */}
      {totalEffects === 0 && (
        <Text
          position={[0, 0, cardDimensions.thickness / 2 + 0.001]}
          fontSize={0.005}
          color="#999999"
          anchorX="center"
          anchorY="middle"
        >
          No special effects detected
        </Text>
      )}
    </group>
  );
}

// Simple placeholder component for loading states
function CardModelPlaceholder({
  message = "Loading...",
  cardDimensions = { width: 0.089, height: 0.051, thickness: 0.00035 },
}) {
  const meshRef = useRef();

  useFrame((state) => {
    if (meshRef.current && meshRef.current.material) {
      meshRef.current.material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <group>
      <BaseCard dimensions={cardDimensions} />
      <Text
        position={[0, -cardDimensions.height / 2 - 0.02, 0]}
        fontSize={0.008}
        color="#666666"
        anchorX="center"
        anchorY="middle"
      >
        {message}
      </Text>
    </group>
  );
}

export { CardModel as default, CardModelPlaceholder };