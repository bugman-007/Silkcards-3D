// src/components/CardModel.jsx - COMPLETE PRODUCTION VERSION WITH FULL JOBID SUPPORT
import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Box, Plane, Text } from '@react-three/drei';
import * as THREE from 'three';
import { getAssetUrl } from '../api/client';

function CardModel({ cardData, autoRotate = false, showEffects = true }) {
  const cardRef = useRef();
  const [textures, setTextures] = useState({});
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [textureErrors, setTextureErrors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Memoize card dimensions with fallback support
  const cardDimensions = useMemo(() => {
    // Support multiple dimension field names for compatibility
    const dimensions = cardData?.dimensions || 
                      cardData?.cardDimensions || 
                      cardData?.cardData?.dimensions ||
                      cardData?.cardData?.cardDimensions;
    
    if (!dimensions) {
      console.warn('⚠️ No dimensions found, using defaults');
      return { width: 4, height: 2.5, thickness: 0.1 };
    }
    
    const { width, height, thickness } = dimensions;
    return {
      width: (width || 89) / 20,     // Convert mm to Three.js units
      height: (height || 51) / 20,   // Default to business card size
      thickness: (thickness || 0.35) / 10
    };
  }, [cardData]);

  // Extract jobId with multiple fallback paths
  const jobId = useMemo(() => {
    return cardData?.jobId || 
           cardData?.id || 
           cardData?.parseResult?.jobId ||
           cardData?.uploadResult?.jobId ||
           null;
  }, [cardData]);

  // Extract maps with multiple fallback paths
  const maps = useMemo(() => {
    return cardData?.maps || 
           cardData?.parseResult?.maps ||
           cardData?.cardData?.maps ||
           {};
  }, [cardData]);

  // Load textures from EC2 microservice with comprehensive error handling
  useEffect(() => {
    if (!maps || Object.keys(maps).length === 0) {
      console.log('📊 No texture maps available');
      setIsLoading(false);
      return;
    }

    if (!jobId) {
      console.error('❌ No jobId available for texture loading');
      setIsLoading(false);
      setTextureErrors(['No jobId available for loading textures']);
      return;
    }
    
    let isMounted = true;
    
    const loadTextures = async () => {
      console.log('🖼️ Loading textures from EC2 parser service...');
      console.log('🆔 Job ID:', jobId);
      console.log('🗂️ Available maps:', Object.keys(maps));
      
      const textureLoader = new THREE.TextureLoader();
      const loadedTextures = {};
      const errors = [];
      let totalTextures = 0;
      let loadedCount = 0;

      // Count total textures to load
      for (const [mapType, mapData] of Object.entries(maps)) {
        if (typeof mapData === 'string') {
          totalTextures++;
        } else if (Array.isArray(mapData)) {
          totalTextures += mapData.length;
        }
      }

      if (totalTextures === 0) {
        console.log('📊 No textures to load');
        setIsLoading(false);
        return;
      }

      console.log(`📈 Loading ${totalTextures} texture maps...`);

      const updateProgress = () => {
        if (!isMounted) return;
        loadedCount++;
        const progress = (loadedCount / totalTextures) * 100;
        setLoadingProgress(progress);
        console.log(`📊 Texture loading progress: ${progress.toFixed(1)}%`);
      };

      try {
        // Load each texture map type
        for (const [mapType, mapData] of Object.entries(maps)) {
          if (!isMounted) break;
          
          if (typeof mapData === 'string') {
            // Single texture (like albedo_front, albedo_back)
            console.log(`🔍 Loading ${mapType}: ${mapData}`);
            
            try {
              const textureUrl = getAssetUrl(jobId, mapData);
              console.log(`🌐 Texture URL: ${textureUrl}`);
              
              const texture = await loadSingleTexture(textureLoader, textureUrl);
              
              if (isMounted && texture) {
                loadedTextures[mapType] = texture;
                console.log(`✅ Loaded ${mapType} texture`);
              }
              
            } catch (error) {
              console.warn(`⚠️ Failed to load texture: ${mapData}`, error);
              errors.push(`${mapType}: ${mapData}`);
            }
            
            updateProgress();
            
          } else if (Array.isArray(mapData)) {
            // Array of effect textures (foil, spotUV, emboss, etc.)
            console.log(`🔍 Loading ${mapType} effects: ${mapData.length} items`);
            loadedTextures[mapType] = [];
            
            for (let i = 0; i < mapData.length; i++) {
              if (!isMounted) break;
              
              const item = mapData[i];
              const maskFile = extractMaskFileName(item);
              
              if (maskFile) {
                try {
                  const textureUrl = getAssetUrl(jobId, maskFile);
                  console.log(`🎨 Loading effect texture: ${maskFile}`);
                  
                  const texture = await loadSingleTexture(textureLoader, textureUrl);
                  
                  if (isMounted && texture) {
                    loadedTextures[mapType].push({ 
                      ...item, 
                      texture,
                      maskFile 
                    });
                    console.log(`✅ Loaded ${mapType}[${i}]: ${maskFile}`);
                  }
                  
                } catch (error) {
                  console.warn(`⚠️ Failed to load effect texture: ${maskFile}`, error);
                  errors.push(`${mapType}[${i}]: ${maskFile}`);
                }
              }
              
              updateProgress();
            }
          }
        }
        
        if (isMounted) {
          setTextures(loadedTextures);
          setTextureErrors(errors);
          setIsLoading(false);
          
          console.log('🎯 Texture loading completed:', {
            totalMaps: Object.keys(loadedTextures).length,
            totalTextures: loadedCount,
            errors: errors.length,
            jobId: jobId
          });
        }
        
      } catch (error) {
        console.error('❌ Critical texture loading error:', error);
        if (isMounted) {
          setTextureErrors([...errors, `Critical error: ${error.message}`]);
          setIsLoading(false);
        }
      }
    };
    
    loadTextures();
    
    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, [maps, jobId]);

  // Helper function to load a single texture with proper configuration
  const loadSingleTexture = async (textureLoader, textureUrl) => {
    return new Promise((resolve, reject) => {
      // Pre-check if URL is accessible
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const texture = textureLoader.load(
          textureUrl,
          (loadedTexture) => {
            // Configure texture for optimal quality
            loadedTexture.wrapS = THREE.ClampToEdgeWrapping;
            loadedTexture.wrapT = THREE.ClampToEdgeWrapping;
            loadedTexture.flipY = false;
            loadedTexture.minFilter = THREE.LinearFilter;
            loadedTexture.magFilter = THREE.LinearFilter;
            loadedTexture.generateMipmaps = false; // Disable for better performance
            resolve(loadedTexture);
          },
          undefined,
          (error) => {
            console.error('Three.js texture loading error:', error);
            reject(error);
          }
        );
      };
      
      img.onerror = (error) => {
        console.error('Image loading error:', error);
        reject(new Error(`Failed to load image: ${textureUrl}`));
      };
      
      img.src = textureUrl;
    });
  };

  // Helper function to extract mask file name from various formats
  const extractMaskFileName = (item) => {
    if (typeof item === 'string') {
      return item;
    }
    
    if (typeof item === 'object' && item !== null) {
      return item.mask || 
             item.maskFile || 
             item.file || 
             item.texture || 
             item.asset ||
             null;
    }
    
    return null;
  };

  // Auto rotation animation
  useFrame((state, delta) => {
    if (autoRotate && cardRef.current) {
      cardRef.current.rotation.y += delta * 0.3;
    }
  });

  // Show loading placeholder if no card data
  if (!cardData) {
    return <CardModelPlaceholder message="Upload a file to see 3D preview" />;
  }

  // Show loading state while textures are loading
  if (isLoading) {
    return (
      <CardModelPlaceholder 
        message={`Loading textures... ${Math.round(loadingProgress)}%`}
        cardDimensions={cardDimensions}
        showProgress={true}
        progress={loadingProgress}
      />
    );
  }

  console.log('🎨 Rendering 3D card with dimensions:', cardDimensions);

  return (
    <group ref={cardRef} position={[0, 0, 0]}>
      {/* Base Card with Albedo Texture */}
      <BaseCardMesh 
        dimensions={cardDimensions}
        albedoTexture={textures.albedo_front || textures.albedo}
        backTexture={textures.albedo_back}
      />

      {/* Effect Layers */}
      {showEffects && (
        <>
          {/* Foil Effects */}
          {textures.foil && textures.foil.map((foilLayer, index) => (
            <EffectLayer
              key={`foil-${index}`}
              effectData={foilLayer}
              cardDimensions={cardDimensions}
              zIndex={0.001 + index * 0.0002}
              materialType="foil"
            />
          ))}

          {/* Spot UV Effects */}
          {textures.spotUV && textures.spotUV.map((uvLayer, index) => (
            <EffectLayer
              key={`uv-${index}`}
              effectData={uvLayer}
              cardDimensions={cardDimensions}
              zIndex={0.002 + index * 0.0002}
              materialType="spotUV"
            />
          ))}

          {/* Emboss Effects */}
          {textures.emboss && textures.emboss.map((embossLayer, index) => (
            <EffectLayer
              key={`emboss-${index}`}
              effectData={embossLayer}
              cardDimensions={cardDimensions}
              zIndex={0.003 + index * 0.0002}
              materialType="emboss"
            />
          ))}

          {/* Die-cut Effects */}
          {textures.diecut && textures.diecut.map((diecutLayer, index) => (
            <DiecutIndicator
              key={`diecut-${index}`}
              diecutData={diecutLayer}
              cardDimensions={cardDimensions}
            />
          ))}
        </>
      )}

      {/* Debug info (only in development) */}
      {import.meta.env.DEV && textureErrors.length > 0 && (
        <Text
          position={[0, -cardDimensions.height/2 - 0.5, 0]}
          fontSize={0.1}
          color="red"
          anchorX="center"
        >
          {textureErrors.length} texture errors
        </Text>
      )}
    </group>
  );
}

// Base card mesh component with enhanced material handling
function BaseCardMesh({ dimensions, albedoTexture, backTexture }) {
  const { width, height, thickness } = dimensions;
  
  const frontMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: albedoTexture || null,
      color: albedoTexture ? '#ffffff' : '#f8f9fa',
      roughness: albedoTexture ? 0.8 : 0.9,
      metalness: 0.0,
      side: THREE.FrontSide
    });
  }, [albedoTexture]);

  const backMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      map: backTexture || albedoTexture || null,
      color: (backTexture || albedoTexture) ? '#ffffff' : '#f0f0f0',
      roughness: (backTexture || albedoTexture) ? 0.8 : 0.9,
      metalness: 0.0,
      side: THREE.BackSide
    });
  }, [backTexture, albedoTexture]);

  return (
    <Box args={[width, height, thickness]} position={[0, 0, 0]}>
      <primitive object={frontMaterial} attach="material" />
    </Box>
  );
}

// Enhanced effect layer with proper coordinate handling
function EffectLayer({ effectData, cardDimensions, zIndex, materialType }) {
  const { texture, bounds, color, mode, side } = effectData;
  
  if (!texture || !bounds) {
    console.warn(`⚠️ Missing texture or bounds for ${materialType} effect`);
    return null;
  }
  
  // Use the display dimensions (already converted to Three.js units)
  const effectWidth = (bounds.width / 89) * cardDimensions.width;
  const effectHeight = (bounds.height / 51) * cardDimensions.height;
  
  // Position calculation (bounds are in mm, convert to Three.js coordinates)
  const effectX = ((bounds.x + bounds.width / 2 - 44.5) / 89) * cardDimensions.width;
  const effectY = -((bounds.y + bounds.height / 2 - 25.5) / 51) * cardDimensions.height;
  const effectZ = cardDimensions.thickness / 2 + zIndex;

  // Create optimized material based on effect type
  const material = useMemo(() => {
    const baseProps = {
      alphaMap: texture,
      transparent: true,
      alphaTest: 0.1,
      side: side === 'back' ? THREE.BackSide : THREE.FrontSide,
      blending: THREE.NormalBlending
    };

    switch (materialType) {
      case 'foil':
        const foilColors = {
          gold: new THREE.Color('#FFD700'),
          silver: new THREE.Color('#C0C0C0'),
          copper: new THREE.Color('#B87333'),
          rose_gold: new THREE.Color('#E8B4B8'),
          holographic: new THREE.Color('#FF69B4'),
          default: new THREE.Color('#FFD700')
        };
        
        const foilColor = foilColors[color] || foilColors.default;
        
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: foilColor,
          metalness: 1.0,
          roughness: 0.05,
          envMapIntensity: 2.5,
          emissive: foilColor,
          emissiveIntensity: 0.1
        });
        
      case 'spotUV':
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#ffffff'),
          metalness: 0.0,
          roughness: 0.01, // Extremely glossy
          clearcoat: 1.0,
          clearcoatRoughness: 0.0,
          envMapIntensity: 2.0,
          transparent: true,
          opacity: 0.6
        });
        
      case 'emboss':
        const embossHeight = mode === 'deboss' ? -0.8 : 0.8;
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#ffffff'),
          metalness: 0.0,
          roughness: 0.6,
          normalMap: texture,
          normalScale: new THREE.Vector2(embossHeight, embossHeight),
          displacementMap: texture,
          displacementScale: 0.002 * Math.abs(embossHeight)
        });
        
      default:
        return new THREE.MeshStandardMaterial({
          ...baseProps,
          color: new THREE.Color('#667eea'),
          opacity: 0.7
        });
    }
  }, [texture, materialType, color, mode, side]);

  return (
    <Plane args={[effectWidth, effectHeight]} position={[effectX, effectY, effectZ]}>
      <primitive object={material} attach="material" />
    </Plane>
  );
}

// Die-cut edge indicator component
function DiecutIndicator({ diecutData, cardDimensions }) {
  if (!diecutData) return null;

  const edgeGeometry = useMemo(() => {
    return new THREE.EdgesGeometry(
      new THREE.BoxGeometry(
        cardDimensions.width,
        cardDimensions.height,
        cardDimensions.thickness
      )
    );
  }, [cardDimensions]);

  const edgeMaterial = useMemo(() => {
    return new THREE.LineBasicMaterial({
      color: '#ff6b6b',
      linewidth: 2,
      opacity: 0.8,
      transparent: true
    });
  }, []);

  return (
    <lineSegments geometry={edgeGeometry}>
      <primitive object={edgeMaterial} attach="material" />
    </lineSegments>
  );
}

// Loading placeholder component with enhanced feedback
function CardModelPlaceholder({ 
  message = "Loading...", 
  cardDimensions = { width: 4, height: 2.5, thickness: 0.1 },
  showProgress = false,
  progress = 0
}) {
  const meshRef = useRef();

  // Gentle pulsing animation for loading
  useFrame((state) => {
    if (meshRef.current && meshRef.current.material) {
      meshRef.current.material.opacity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.2;
    }
  });

  return (
    <group>
      <Box ref={meshRef} args={[cardDimensions.width, cardDimensions.height, cardDimensions.thickness]}>
        <meshStandardMaterial 
          color="#e9ecef" 
          wireframe={!showProgress}
          opacity={0.7} 
          transparent 
        />
      </Box>
      
      <Text
        position={[0, -cardDimensions.height/2 - 0.3, 0]}
        fontSize={0.15}
        color="#666666"
        anchorX="center"
        anchorY="middle"
      >
        {message}
      </Text>

      {showProgress && (
        <Text
          position={[0, -cardDimensions.height/2 - 0.6, 0]}
          fontSize={0.12}
          color="#667eea"
          anchorX="center"
          anchorY="middle"
        >
          {Math.round(progress)}% • Loading from EC2 server...
        </Text>
      )}
    </group>
  );
}

// Export components
export { CardModel as default, CardModelPlaceholder };