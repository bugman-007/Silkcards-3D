// src/components/CardModel.jsx - UPDATED FOR REAL TEXTURE MAPS
import { useRef, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { Box, Plane } from '@react-three/drei';
import * as THREE from 'three';
import { getAssetUrl } from '../api/client';

export default function CardModel({ cardData, autoRotate = false }) {
  const cardRef = useRef();
  const [textures, setTextures] = useState({});
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [textureErrors, setTextureErrors] = useState([]);

  // Load texture maps from microservice
  useEffect(() => {
    if (!cardData?.maps || !cardData?.jobId) {
      console.log('📊 No texture maps to load');
      return;
    }
    
    const loadTextures = async () => {
      console.log('🖼️ Loading texture maps for job:', cardData.jobId);
      const textureLoader = new THREE.TextureLoader();
      const loadedTextures = {};
      const errors = [];
      let totalTextures = 0;
      let loadedCount = 0;

      // Count total textures to load
      for (const [mapType, mapData] of Object.entries(cardData.maps)) {
        if (typeof mapData === 'string') {
          totalTextures++;
        } else if (Array.isArray(mapData)) {
          totalTextures += mapData.length;
        }
      }

      const updateProgress = () => {
        loadedCount++;
        setLoadingProgress((loadedCount / totalTextures) * 100);
      };

      // Load each texture map
      for (const [mapType, mapData] of Object.entries(cardData.maps)) {
        try {
          if (typeof mapData === 'string') {
            // Single texture (like albedo)
            console.log(`🔍 Loading ${mapType}: ${mapData}`);
            const textureUrl = getAssetUrl(cardData.jobId, mapData);
            
            try {
              const texture = await new Promise((resolve, reject) => {
                textureLoader.load(
                  textureUrl,
                  (loadedTexture) => {
                    // Configure texture
                    loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
                    loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
                    loadedTexture.flipY = false; // Important for proper orientation
                    resolve(loadedTexture);
                  },
                  undefined,
                  reject
                );
              });
              
              loadedTextures[mapType] = texture;
              console.log(`✅ Loaded ${mapType} texture`);
              
            } catch (error) {
              console.warn(`⚠️ Failed to load texture: ${mapData}`, error);
              errors.push(`${mapType}: ${mapData}`);
            }
            
            updateProgress();
            
          } else if (Array.isArray(mapData)) {
            // Array of textures (like foil, spotUV, emboss)
            console.log(`🔍 Loading ${mapType} array: ${mapData.length} items`);
            loadedTextures[mapType] = [];
            
            for (let i = 0; i < mapData.length; i++) {
              const item = mapData[i];
              const maskFile = item.mask || item.file || item;
              
              if (typeof maskFile === 'string') {
                try {
                  const textureUrl = getAssetUrl(cardData.jobId, maskFile);
                  
                  const texture = await new Promise((resolve, reject) => {
                    textureLoader.load(
                      textureUrl,
                      (loadedTexture) => {
                        // Configure texture for effects
                        loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
                        loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
                        loadedTexture.flipY = false;
                        
                        // For alpha masks, ensure proper channel usage
                        if (maskFile.includes('mask') || maskFile.includes('alpha')) {
                          loadedTexture.format = THREE.AlphaFormat;
                        }
                        
                        resolve(loadedTexture);
                      },
                      undefined,
                      reject
                    );
                  });
                  
                  loadedTextures[mapType].push({ 
                    ...item, 
                    texture,
                    maskFile 
                  });
                  
                  console.log(`✅ Loaded ${mapType}[${i}]: ${maskFile}`);
                  
                } catch (error) {
                  console.warn(`⚠️ Failed to load effect texture: ${maskFile}`, error);
                  errors.push(`${mapType}[${i}]: ${maskFile}`);
                }
              }
              
              updateProgress();
            }
          }
        } catch (error) {
          console.error(`❌ Error loading ${mapType}:`, error);
          errors.push(`${mapType}: ${error.message}`);
        }
      }
      
      setTextures(loadedTextures);
      setTextureErrors(errors);
      
      console.log('🎯 Texture loading completed:', {
        loaded: Object.keys(loadedTextures).length,
        errors: errors.length,
        totalTextures,
        loadedCount
      });
    };
    
    loadTextures();
  }, [cardData]);

  // Auto rotation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.2;
    }
  });

  if (!cardData) {
    return null;
  }

  // Convert mm to Three.js units (scale for better viewing)
  const { width, height, thickness } = cardData.dimensions;
  const cardWidth = width / 20; // Scale down for better viewing
  const cardHeight = height / 20;
  const cardThickness = thickness / 10;

  console.log('📐 Card dimensions:', { cardWidth, cardHeight, cardThickness });

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card with Albedo Texture */}
      <Box args={[cardWidth, cardHeight, cardThickness]} position={[0, 0, 0]}>
        <meshStandardMaterial
          map={textures.albedo_front || textures.albedo || null}
          color={textures.albedo_front || textures.albedo ? '#ffffff' : '#f8f9fa'}
          roughness={0.8}
          metalness={0.0}
        />
      </Box>

      {/* Back Face (if albedo_back exists) */}
      {textures.albedo_back && (
        <Box args={[cardWidth, cardHeight, cardThickness]} position={[0, 0, -0.001]}>
          <meshStandardMaterial
            map={textures.albedo_back}
            color="#ffffff"
            roughness={0.8}
            metalness={0.0}
            side={THREE.BackSide}
          />
        </Box>
      )}

      {/* Foil Effect Layers */}
      {textures.foil && textures.foil.map((foilLayer, index) => (
        <EffectLayer
          key={`foil-${index}`}
          effectData={foilLayer}
          cardDimensions={{ width, height, thickness }}
          displayDimensions={{ cardWidth, cardHeight, cardThickness }}
          zIndex={0.001 + index * 0.0005}
          materialType="foil"
        />
      ))}

      {/* Spot UV Layers */}
      {textures.spotUV && textures.spotUV.map((uvLayer, index) => (
        <EffectLayer
          key={`uv-${index}`}
          effectData={uvLayer}
          cardDimensions={{ width, height, thickness }}
          displayDimensions={{ cardWidth, cardHeight, cardThickness }}
          zIndex={0.002 + index * 0.0005}
          materialType="spotUV"
        />
      ))}

      {/* Emboss Layers */}
      {textures.emboss && textures.emboss.map((embossLayer, index) => (
        <EffectLayer
          key={`emboss-${index}`}
          effectData={embossLayer}
          cardDimensions={{ width, height, thickness }}
          displayDimensions={{ cardWidth, cardHeight, cardThickness }}
          zIndex={0.003 + index * 0.0005}
          materialType="emboss"
        />
      ))}

      {/* Die-cut outline (if exists) */}
      {textures.diecut && (
        <DiecutLayer
          diecutData={textures.diecut}
          cardDimensions={{ width, height, thickness }}
          displayDimensions={{ cardWidth, cardHeight, cardThickness }}
        />
      )}
    </group>
  );
}

// Enhanced Effect Layer with Real Textures and Proper Coordinates
function EffectLayer({ effectData, cardDimensions, displayDimensions, zIndex, materialType }) {
  const { texture, bounds, color, mode, side } = effectData;
  
  if (!texture || !bounds) {
    console.warn(`⚠️ Missing texture or bounds for ${materialType} effect`);
    return null;
  }
  
  // Convert bounds from mm to Three.js coordinates
  // Parser provides bounds in mm relative to bottom-left origin
  const scaleX = displayDimensions.cardWidth / cardDimensions.width;
  const scaleY = displayDimensions.cardHeight / cardDimensions.height;
  
  const effectWidth = bounds.width * scaleX;
  const effectHeight = bounds.height * scaleY;
  
  // Position relative to card center, accounting for coordinate system conversion
  // Parser uses bottom-left origin, Three.js uses center origin
  const effectX = ((bounds.x + bounds.width / 2) - (cardDimensions.width / 2)) * scaleX;
  const effectY = ((bounds.y + bounds.height / 2) - (cardDimensions.height / 2)) * scaleY;
  const effectZ = displayDimensions.cardThickness / 2 + zIndex;

  console.log(`🎨 Effect ${materialType}:`, {
    bounds,
    effectWidth,
    effectHeight,
    position: [effectX, effectY, effectZ]
  });

  // Create material based on effect type
  const createMaterial = () => {
    const baseProps = {
      alphaMap: texture,
      transparent: true,
      alphaTest: 0.1,
      side: side === 'back' ? THREE.BackSide : THREE.FrontSide
    };

    switch (materialType) {
      case 'foil':
        const foilColors = {
          gold: '#FFD700',
          silver: '#C0C0C0',
          copper: '#B87333',
          rose_gold: '#E8B4B8',
          holographic: '#FF69B4'
        };
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: foilColors[color] || foilColors.gold,
          metalness: 1.0,
          roughness: 0.05, // Very shiny
          envMapIntensity: 2.0,
          emissive: foilColors[color] || foilColors.gold,
          emissiveIntensity: 0.1
        });
        
      case 'spotUV':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: '#ffffff',
          metalness: 0.0,
          roughness: 0.01, // Extremely glossy
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          envMapIntensity: 1.5
        });
        
      case 'emboss':
        const embossHeight = mode === 'deboss' ? -0.5 : 0.5;
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: '#ffffff',
          metalness: 0.0,
          roughness: 0.6,
          normalMap: texture, // Use texture as normal map for height
          normalScale: new THREE.Vector2(embossHeight, embossHeight),
          displacementMap: texture,
          displacementScale: 0.01 * Math.abs(embossHeight)
        });
        
      default:
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: '#ff0000' // Debug color for unknown effects
        });
    }
  };

  return (
    <Plane
      args={[effectWidth, effectHeight]}
      position={[effectX, effectY, effectZ]}
    >
      <primitive object={createMaterial()} />
    </Plane>
  );
}

// Die-cut layer for showing card edges
function DiecutLayer({ diecutData, cardDimensions, displayDimensions }) {
  if (!diecutData || !diecutData.mask) {
    return null;
  }

  // For now, just show a subtle outline
  // TODO: Implement proper die-cut geometry from SVG vector data
  const outlineGeometry = new THREE.EdgesGeometry(
    new THREE.BoxGeometry(
      displayDimensions.cardWidth,
      displayDimensions.cardHeight,
      displayDimensions.cardThickness
    )
  );

  return (
    <lineSegments geometry={outlineGeometry}>
      <lineBasicMaterial color="#666666" linewidth={2} />
    </lineSegments>
  );
}

// Loading placeholder while textures load
export function CardModelPlaceholder({ cardData }) {
  if (!cardData?.dimensions) {
    return (
      <Box args={[4, 2.5, 0.1]}>
        <meshStandardMaterial color="#f0f0f0" wireframe />
      </Box>
    );
  }

  const { width, height, thickness } = cardData.dimensions;
  const cardWidth = width / 20;
  const cardHeight = height / 20;
  const cardThickness = thickness / 10;

  return (
    <Box args={[cardWidth, cardHeight, cardThickness]}>
      <meshStandardMaterial 
        color="#e9ecef" 
        wireframe 
        opacity={0.7} 
        transparent 
      />
    </Box>
  );
}