// src/components/EffectOverlay.jsx - FIXED FOR PROPER COORDINATE MAPPING
import { useMemo } from 'react';
import { Plane } from '@react-three/drei';
import * as THREE from 'three';

export default function EffectOverlay({ item, cardDimensions, effectType, zOffset }) {
  const bounds = item.bounds;
  
  if (!bounds) return null;

  // Convert bounds from document coordinates to 3D coordinates
  const overlayDimensions = useMemo(() => {
    // Standard business card is 89mm x 51mm
    const CARD_WIDTH_MM = 89;
    const CARD_HEIGHT_MM = 51;
    
    // Convert card dimensions back to mm for calculation
    const cardWidthMm = cardDimensions.width * 1000;
    const cardHeightMm = cardDimensions.height * 1000;
    
    // Scale factor from bounds to 3D space
    const scaleX = cardDimensions.width / cardWidthMm;
    const scaleY = cardDimensions.height / cardHeightMm;
    
    // Convert bounds to 3D dimensions (bounds are already relative to card)
    const width = bounds.w * scaleX;
    const height = bounds.h * scaleY;
    
    // Calculate position relative to card center
    // Bounds x,y are from top-left, we need center position
    const centerX = (bounds.x + bounds.w / 2) * scaleX;
    const centerY = (bounds.y + bounds.h / 2) * scaleY;
    
    // Convert to Three.js coordinates (center card at origin)
    const x = centerX - cardDimensions.width / 2;
    const y = cardDimensions.height / 2 - centerY; // Flip Y for Three.js
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
          emissive: foilColor.clone().multiplyScalar(0.15),
          opacity: 0.9
        });

      case 'spot_uv':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#ffffff'),
          metalness: 0.0,
          roughness: 0.02,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          opacity: 0.3, // More subtle for UV coating
          emissive: new THREE.Color('#ffffff').multiplyScalar(0.1)
        });

      case 'emboss':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#f5f5f5'),
          metalness: 0.0,
          roughness: 0.6,
          opacity: 0.4,
          // Simulate raised surface
          emissive: new THREE.Color('#ffffff').multiplyScalar(0.08)
        });

      case 'print':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#2c3e50'),
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