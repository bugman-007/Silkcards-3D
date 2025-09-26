// src/components/EffectOverlay.jsx - ENHANCED FOR PER-IMAGE OVERLAYS
import { useMemo } from 'react';
import { Plane } from '@react-three/drei';
import * as THREE from 'three';

export default function EffectOverlay({ 
  item, 
  cardDimensions, 
  effectType, 
  zOffset, 
  side = 'front',
  map = null,
  alphaMap = null,
  mode = 'auto' // 'ink' | 'metal' | 'uv' | 'emboss' | 'auto'
}) {
  const bounds = item?.bounds;
  
  // Determine mode automatically if not specified
  const renderMode = useMemo(() => {
    if (mode !== 'auto') return mode;
    
    switch (effectType) {
      case 'foil':
        return 'ink'; // Default to ink for foil
      case 'spot_uv':
        return 'uv';
      case 'emboss':
      case 'deboss':
        return 'emboss';
      default:
        return 'ink';
    }
  }, [effectType, mode]);

  // Calculate overlay dimensions and position
  const overlayData = useMemo(() => {
    if (bounds) {
      // Item-based positioning (fallback)
      const cardWidthMm = cardDimensions.width * 1000;
      const cardHeightMm = cardDimensions.height * 1000;
      const scaleX = cardDimensions.width / cardWidthMm;
      const scaleY = cardDimensions.height / cardHeightMm;
      
      const width = bounds.w * scaleX;
      const height = bounds.h * scaleY;
      const centerX = (bounds.x + bounds.w / 2) * scaleX;
      const centerY = (bounds.y + bounds.h / 2) * scaleY;
      
      const x = centerX - cardDimensions.width / 2;
      const y = cardDimensions.height / 2 - centerY;
      
      return { width, height, x, y, fullCard: false };
    } else {
      // Full-card overlay (texture mode)
      return {
        width: cardDimensions.width,
        height: cardDimensions.height,
        x: 0,
        y: 0,
        fullCard: true
      };
    }
  }, [bounds, cardDimensions]);

  // Determine z-position based on side
  const zPosition = useMemo(() => {
    const isBack = side === 'back';
    const baseZ = cardDimensions.thickness / 2 + zOffset;
    return isBack ? -baseZ : baseZ;
  }, [side, cardDimensions, zOffset]);

  // Create material based on render mode
  const material = useMemo(() => {
    const baseProps = {
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    };

    // Apply back-side mirroring to textures
    const applyMirroring = (tex) => {
      if (tex && side === 'back') {
        tex.wrapS = THREE.RepeatWrapping;
        tex.repeat.x = -1;
        tex.offset.x = 1;
        tex.needsUpdate = true;
      }
      return tex;
    };

    const mirroredMap = applyMirroring(map);
    const mirroredAlphaMap = applyMirroring(alphaMap);

    switch (renderMode) {
      case 'ink':
        // Unlit exact colors (for foil ink)
        return new THREE.MeshBasicMaterial({
          ...baseProps,
          map: mirroredMap,
          alphaMap: mirroredAlphaMap,
          alphaTest: 0.1,
          toneMapped: false, // Important: disable tone mapping for exact colors
        });

      case 'metal':
        // Reflective metal highlight (for foil metal)
        return new THREE.MeshPhysicalMaterial({
          ...baseProps,
          alphaMap: mirroredAlphaMap,
          alphaTest: 0.1,
          metalness: 1.0,
          roughness: 0.1,
          color: new THREE.Color(0xffffff),
          envMapIntensity: 2.0,
          opacity: 0.35,
          blending: THREE.AdditiveBlending
        });

      case 'uv':
        // Clear gloss coating
        return new THREE.MeshPhysicalMaterial({
          ...baseProps,
          alphaMap: mirroredAlphaMap,
          alphaTest: 0.1,
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          roughness: 0.02,
          metalness: 0.0,
          envMapIntensity: 1.5,
        });

      case 'emboss':
        // Raised surface effect
        const isDeboss = effectType === 'deboss';
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          alphaMap: mirroredAlphaMap,
          alphaTest: 0.5,
          color: isDeboss ? new THREE.Color(0x444444) : new THREE.Color(0xf5f5f5),
          roughness: 0.6,
          metalness: 0.0,
          emissive: new THREE.Color(0xffffff).multiplyScalar(0.08),
        });

      default:
        // Fallback material
        const foilColors = {
          gold: new THREE.Color('#FFD700'),
          silver: new THREE.Color('#C0C0C0'), 
          copper: new THREE.Color('#B87333'),
          hot_pink: new THREE.Color('#FF1493'),
          teal: new THREE.Color('#008080'),
          rose_gold: new THREE.Color('#E8B4B8'),
          default: new THREE.Color('#FFD700')
        };
        
        const foilColor = foilColors[item?.color] || foilColors.default;
        
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: foilColor,
          metalness: effectType === 'foil' ? 1.0 : 0.0,
          roughness: effectType === 'foil' ? 0.1 : 0.6,
          emissive: effectType === 'foil' ? foilColor.clone().multiplyScalar(0.15) : new THREE.Color(0x000000),
          opacity: 0.9
        });
    }
  }, [renderMode, effectType, map, alphaMap, side, item]);

  // Rotation based on side
  const rotation = useMemo(() => {
    return side === 'back' ? [0, Math.PI, 0] : [0, 0, 0];
  }, [side]);

  if (!overlayData) return null;

  return (
    <Plane
      args={[overlayData.width, overlayData.height]}
      position={[overlayData.x, overlayData.y, zPosition]}
      rotation={rotation}
    >
      <primitive object={material} attach="material" />
    </Plane>
  );
}