// src/components/CardModel.jsx - FIXED FOR MULTI-CARD DETECTION
import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { Text, Plane } from "@react-three/drei";
import * as THREE from "three";
import { getAssetUrl } from "../api/client";
import EffectOverlay from "./EffectOverlay";
import BaseCard from "./BaseCard";

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();

  // Extract data from the adapted structure
  const jobId = useMemo(() => {
    return cardData?.jobId || cardData?.id || null;
  }, [cardData]);

  // Get card dimensions and convert mm to meters for Three.js
  const cardDimensions = useMemo(() => {
    const dims = cardData?.dimensions ||
      cardData?.parseResult?.dimensions || {
        width: 89,
        height: 51,
        thickness: 0.35,
      };

    return {
      // Convert mm to meters for Three.js (standard practice)
      width: dims.width / 1000,
      height: dims.height / 1000,
      thickness: (dims.thickness || 0.35) / 1000,
    };
  }, [cardData]);

  // Prefer flattened maps from adapter; flatten nested shape if needed
  const maps = useMemo(() => {
    const m = cardData?.maps || cardData?.parseResult?.maps || {};
    if (m.albedo_front || m.albedo_back) return m; // already flat
    const out = {};
    const push = (side, obj) => {
      if (!obj) return;
      Object.entries(obj).forEach(([k, v]) => {
        if (v) out[`${k}_${side}`] = v;
      });
    };
    push("front", cardData?.parseResult?.maps?.front || cardData?.maps?.front);
    push("back", cardData?.parseResult?.maps?.back || cardData?.maps?.back);
    return out;
  }, [cardData]);

  const [textures, setTextures] = useState({});
  const [texLoading, setTexLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();

    const loadOne = (jobId, rel) =>
      new Promise((resolve, reject) => {
        const url = /^https?:\/\//i.test(String(rel))
          ? String(rel)
          : getAssetUrl(jobId, rel);
        loader.load(
          url,
          (tex) => {
            tex.anisotropy = 8;
            tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
            resolve(tex);
          },
          undefined,
          reject
        );
      });

    const run = async () => {
      try {
        setTexLoading(true);
        const entries = Object.entries(maps).filter(
          ([, v]) => typeof v === "string"
        );
        if (!entries.length) {
          if (!cancelled) setTextures({});
          return;
        }
        const pairs = await Promise.all(
          entries.map(async ([k, rel]) => [k, await loadOne(jobId, rel)])
        );
        if (!cancelled) setTextures(Object.fromEntries(pairs));
      } catch {
        if (!cancelled) setTextures({});
      } finally {
        if (!cancelled) setTexLoading(false);
      }
    };

    if (!jobId || !maps || !Object.keys(maps).length) {
      setTextures({});
      return;
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [jobId, maps]);

  // Extract layer data - handle multiple cards
  const { layers, cardsDetected, activeCard } = useMemo(() => {
    const cards = cardData?.cards || {};
    const layers = cardData?.layers || {};

    // If we have multiple cards detected, show the first one
    const cardKeys = Object.keys(cards);
    let activeCardData = layers;
    let activeCardKey = "primary";

    if (cardKeys.length > 0) {
      // Prefer 'front' card, otherwise take first card
      activeCardKey = cardKeys.includes("front") ? "front" : cardKeys[0];
      activeCardData = cards[activeCardKey] || {};
    }

    return {
      layers: activeCardData,
      cardsDetected: cardKeys.length,
      activeCard: activeCardKey,
    };
  }, [cardData]);

  // Get original file name for debugging
  const originalFileName = useMemo(() => {
    return (
      cardData?.parseResult?.metadata?.originalFile ||
      cardData?.file?.name ||
      "Business Card"
    );
  }, [cardData]);

  // Count total effect items for logging
  const totalEffects = useMemo(() => {
    return Object.values(layers).reduce(
      (total, items) => total + (Array.isArray(items) ? items.length : 0),
      0
    );
  }, [layers]);

  console.log("CardModel rendering:", {
    hasJobId: !!jobId,
    fileName: originalFileName,
    dimensions: cardDimensions,
    layerTypes: Object.keys(layers),
    totalEffects: totalEffects,
    cardsDetected: cardsDetected,
    activeCard: activeCard,
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
      {/* Base Card */}
      <BaseCard dimensions={cardDimensions} />

      {/* Albedo planes (front/back) */}
      {textures.albedo_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0004]}
        >
          <meshStandardMaterial
            map={textures.albedo_front}
            roughness={0.6}
            metalness={0.0}
          />
        </Plane>
      )}
      {textures.albedo_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0004]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            map={textures.albedo_back}
            roughness={0.6}
            metalness={0.0}
          />
        </Plane>
      )}

      {/* Effect mask overlays (front) */}
      {textures.foil_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0006]}
        >
          <meshStandardMaterial
            map={textures.foil_front}
            transparent
            metalness={1.0}
            roughness={0.2}
            opacity={0.85}
          />
        </Plane>
      )}
      {textures.uv_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0007]}
        >
          <meshStandardMaterial
            map={textures.uv_front}
            transparent
            metalness={0.0}
            roughness={0.1}
            opacity={0.5}
          />
        </Plane>
      )}
      {textures.emboss_front && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, cardDimensions.thickness / 2 + 0.0008]}
        >
          <meshStandardMaterial
            map={textures.emboss_front}
            transparent
            metalness={0.0}
            roughness={0.6}
            opacity={0.6}
          />
        </Plane>
      )}

      {/* Effect mask overlays (back) */}
      {textures.foil_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0006]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            map={textures.foil_back}
            transparent
            metalness={1.0}
            roughness={0.2}
            opacity={0.85}
          />
        </Plane>
      )}
      {textures.uv_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0007]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            map={textures.uv_back}
            transparent
            metalness={0.0}
            roughness={0.1}
            opacity={0.5}
          />
        </Plane>
      )}
      {textures.emboss_back && (
        <Plane
          args={[cardDimensions.width, cardDimensions.height]}
          position={[0, 0, -cardDimensions.thickness / 2 - 0.0008]}
          rotation={[0, Math.PI, 0]}
        >
          <meshStandardMaterial
            map={textures.emboss_back}
            transparent
            metalness={0.0}
            roughness={0.6}
            opacity={0.6}
          />
        </Plane>
      )}

      {/* Fallback rectangles (only if no texture maps) */}
      {showEffects && !Object.keys(textures).length && (
        <>
          {layers.print?.map((printItem, index) => (
            <EffectOverlay
              key={`print-${index}`}
              item={printItem}
              cardDimensions={cardDimensions}
              effectType="print"
              zOffset={0.0001 + index * 0.0001}
            />
          ))}
          {layers.foil?.map((foilItem, index) => (
            <EffectOverlay
              key={`foil-${index}`}
              item={foilItem}
              cardDimensions={cardDimensions}
              effectType="foil"
              zOffset={0.001 + index * 0.0002}
            />
          ))}
          {layers.spot_uv?.map((uvItem, index) => (
            <EffectOverlay
              key={`uv-${index}`}
              item={uvItem}
              cardDimensions={cardDimensions}
              effectType="spot_uv"
              zOffset={0.002 + index * 0.0002}
            />
          ))}
          {layers.emboss?.map((embossItem, index) => (
            <EffectOverlay
              key={`emboss-${index}`}
              item={embossItem}
              cardDimensions={cardDimensions}
              effectType="emboss"
              zOffset={0.003 + index * 0.0002}
            />
          ))}
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
          fontSize={0.008}
          color="#666666"
          anchorX="center"
        >
          {cardsDetected > 1
            ? `Card: ${activeCard} (${cardsDetected} detected)`
            : `Effects: ${totalEffects}`}
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
          No effects detected in {activeCard} card
        </Text>
      )}

      {/* Show multi-card indicator */}
      {cardsDetected > 1 && (
        <Text
          position={[0, cardDimensions.height / 2 + 0.01, 0]}
          fontSize={0.006}
          color="#667eea"
          anchorX="center"
        >
          Showing: {activeCard} card ({cardsDetected} cards detected)
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
      meshRef.current.material.opacity =
        0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
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
