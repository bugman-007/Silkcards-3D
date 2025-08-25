// src/components/CardModel.jsx - NEW FILE
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Plane } from '@react-three/drei';
import * as THREE from 'three';

export default function CardModel({ cardData, autoRotate = false }) {
  const cardRef = useRef();

  // Auto rotation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.2;
    }
  });

  if (!cardData) {
    return null;
  }

  // Convert mm to Three.js units (scale down by 100)
  const { width, height, thickness } = cardData.cardDimensions;
  const cardWidth = width / 20; // Scale down for better viewing
  const cardHeight = height / 20;
  const cardThickness = thickness / 10;

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card */}
      <Box args={[cardWidth, cardHeight, cardThickness]} position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.8}
          metalness={0.0}
        />
      </Box>

      {/* Render effect layers */}
      {cardData.layers.map((layer, index) => {
        if (layer.type === 'effect') {
          return (
            <EffectLayer
              key={layer.id}
              layer={layer}
              cardDimensions={{ width: cardWidth, height: cardHeight, thickness: cardThickness }}
              zIndex={index * 0.001} // Stack effects on top of each other
            />
          );
        }
        return null;
      })}
    </group>
  );
}

// Individual effect layer component
function EffectLayer({ layer, cardDimensions, zIndex }) {
  const { bounds, effectType, effectSubtype } = layer;
  
  // Convert bounds to Three.js coordinates
  const effectWidth = (bounds.width / 89) * cardDimensions.width;
  const effectHeight = (bounds.height / 51) * cardDimensions.height;
  
  // Position relative to card center
  const effectX = ((bounds.x + bounds.width / 2 - 44.5) / 89) * cardDimensions.width;
  const effectY = -((bounds.y + bounds.height / 2 - 25.5) / 51) * cardDimensions.height;
  const effectZ = cardDimensions.thickness / 2 + zIndex;

  // Get material based on effect type
  const getMaterial = () => {
    switch (effectType) {
      case 'foil':
        return getFoilMaterial(effectSubtype);
      case 'spotUV':
        return getSpotUVMaterial();
      case 'emboss':
        return getEmbossMaterial();
      default:
        return new THREE.MeshStandardMaterial({ color: 0xff0000 });
    }
  };

  return (
    <Plane
      args={[effectWidth, effectHeight]}
      position={[effectX, effectY, effectZ]}
    >
      <primitive object={getMaterial()} />
    </Plane>
  );
}

// Material generators for different effects
function getFoilMaterial(subtype = 'gold') {
  const colors = {
    gold: '#FFD700',
    silver: '#C0C0C0',
    copper: '#B87333',
    rose_gold: '#E8B4B8'
  };

  return new THREE.MeshStandardMaterial({
    color: colors[subtype] || colors.gold,
    metalness: 1.0,
    roughness: 0.1,
    envMapIntensity: 1.5,
  });
}

function getSpotUVMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.05, // Very glossy
    transparent: true,
    opacity: 0.3,
  });
}

function getEmbossMaterial() {
  return new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0.0,
    roughness: 0.6,
    // TODO: Add normal map for emboss effect
  });
}