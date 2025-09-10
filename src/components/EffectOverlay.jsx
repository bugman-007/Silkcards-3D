// src/components/EffectOverlay.jsx - NEW FILE
import { useMemo } from 'react';
import { Plane } from '@react-three/drei';
import * as THREE from 'three';

export default function EffectOverlay({ item, cardDimensions, effectType, zOffset }) {
  const bounds = item.bounds;
  
  if (!bounds) return null;

  // Convert bounds from document coordinates to 3D coordinates
  const overlayDimensions = useMemo(() => {
    // Use artboard dimensions from the JSON (215.9 x 279.4)
    const artboardWidth = 215.9;
    const artboardHeight = 279.4;
    
    // Calculate scale factors to map document coordinates to card coordinates
    const scaleX = cardDimensions.width / (artboardWidth / 1000); // Convert to meters
    const scaleY = cardDimensions.height / (artboardHeight / 1000);
    
    // Convert bounds to card coordinates
    const width = (bounds.w / 1000) * scaleX;
    const height = (bounds.h / 1000) * scaleY;
    
    // Calculate center position relative to card center
    const centerX = (bounds.x + bounds.w / 2) / 1000;
    const centerY = (bounds.y + bounds.h / 2) / 1000;
    const artboardCenterX = artboardWidth / 2000;
    const artboardCenterY = artboardHeight / 2000;
    
    const x = (centerX - artboardCenterX) * scaleX;
    const y = -((centerY - artboardCenterY) * scaleY); // Flip Y for Three.js
    const z = cardDimensions.thickness / 2 + zOffset;
    
    return { width, height, x, y, z };
  }, [bounds, cardDimensions, zOffset]);

  // Create material based on effect type
  const material = useMemo(() => {
    const baseProps = {
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false
    };

    switch (effectType) {
      case 'foil':
        const foilColors = {
          gold: new THREE.Color('#FFD700'),
          silver: new THREE.Color('#C0C0C0'), 
          copper: new THREE.Color('#B87333'),
          hot_pink: new THREE.Color('#FF1493'),
          teal: new THREE.Color('#008080'),
          rose_gold: new THREE.Color('#E8B4B8'),
          default: new THREE.Color('#FFD700')
        };
        
        const foilColor = foilColors[item.color] || foilColors.default;
        
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: foilColor,
          metalness: 1.0,
          roughness: 0.1,
          emissive: foilColor.clone().multiplyScalar(0.1),
          opacity: 0.9
        });

      case 'spotUV':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#ffffff'),
          metalness: 0.0,
          roughness: 0.02,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          opacity: 0.8
        });

      case 'emboss':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#f5f5f5'),
          metalness: 0.0,
          roughness: 0.6,
          opacity: 0.7,
          // Simulate height by making it slightly brighter
          emissive: new THREE.Color('#ffffff').multiplyScalar(0.05)
        });

      case 'print':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#333333'),
          metalness: 0.0,
          roughness: 0.9,
          opacity: 0.8
        });

      default:
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#667eea'),
          opacity: 0.6
        });
    }
  }, [effectType, item]);

  return (
    <Plane
      args={[overlayDimensions.width, overlayDimensions.height]}
      position={[overlayDimensions.x, overlayDimensions.y, overlayDimensions.z]}
    >
      <primitive object={material} attach="material" />
    </Plane>
  );
}