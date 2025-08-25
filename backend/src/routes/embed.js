// backend/src/routes/embed.js - NEW FILE - COMPLETE EMBED SYSTEM
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper function to get shares directory
function getSharesPath() {
  return path.join(__dirname, '../../shares');
}

// Get embed HTML page
router.get('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const { 
      autoRotate = 'false', 
      showControls = 'true', 
      bg = '#667eea',
      width = '600',
      height = '400'
    } = req.query;

    console.log('🖼️ Serving embed page for:', shareId);

    // Get share data
    const sharesPath = getSharesPath();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).send(generateNotFoundPage(shareId));
    }

    const shareData = await fs.readJson(shareFilePath);

    // Check if expired
    if (new Date(shareData.expiresAt) < new Date()) {
      return res.status(410).send(generateExpiredPage(shareId, shareData.expiresAt));
    }

    // Update access tracking
    shareData.accessCount = (shareData.accessCount || 0) + 1;
    shareData.lastAccessedAt = new Date().toISOString();
    await fs.writeJson(shareFilePath, shareData, { spaces: 2 });

    // Generate embed HTML
    const embedHtml = generateEmbedHTML({
      shareId,
      cardData: shareData.cardData,
      autoRotate: autoRotate === 'true',
      showControls: showControls === 'true',
      backgroundColor: bg,
      width: parseInt(width),
      height: parseInt(height),
      options: shareData.options
    });

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    res.send(embedHtml);

  } catch (error) {
    console.error('❌ Embed serving failed:', error);
    res.status(500).send(generateErrorPage(error.message));
  }
});

// Get embed script for JavaScript integration
router.get('/script/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const { 
      callback,
      width = '600',
      height = '400',
      autoRotate = 'false',
      showControls = 'true',
      bg = '#667eea'
    } = req.query;

    console.log('📜 Serving embed script for:', shareId);

    // Verify share exists
    const sharesPath = getSharesPath();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).json({
        error: 'Share not found',
        shareId
      });
    }

    const shareData = await fs.readJson(shareFilePath);

    // Check if expired
    if (new Date(shareData.expiresAt) < new Date()) {
      return res.status(410).json({
        error: 'Share expired',
        shareId,
        expiresAt: shareData.expiresAt
      });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const embedScript = generateEmbedScript({
      baseUrl,
      shareId,
      width: parseInt(width),
      height: parseInt(height),
      autoRotate: autoRotate === 'true',
      showControls: showControls === 'true',
      backgroundColor: bg,
      callback
    });

    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(embedScript);

  } catch (error) {
    console.error('❌ Embed script failed:', error);
    res.status(500).json({
      error: 'Failed to generate embed script',
      message: error.message
    });
  }
});

// Get universal embed script (works with any share ID)
router.get('/js/silkcards-embed.js', (req, res) => {
  const embedLibrary = `
/**
 * SilkCards 3D Embed Library
 * Universal JavaScript library for embedding SilkCards 3D previews
 */
(function(window, document) {
  'use strict';
  
  var SilkCardsEmbed = {
    version: '2.0.0',
    baseUrl: '${req.protocol}://${req.get('host')}',
    
    // Initialize embed with share ID
    init: function(options) {
      if (!options.shareId) {
        console.error('SilkCards: shareId is required');
        return null;
      }
      
      var config = {
        shareId: options.shareId,
        containerId: options.containerId || ('silkcards-' + options.shareId),
        width: options.width || 600,
        height: options.height || 400,
        autoRotate: options.autoRotate || false,
        showControls: options.showControls !== false,
        backgroundColor: options.backgroundColor || '#667eea',
        onLoad: options.onLoad || null,
        onError: options.onError || null
      };
      
      return this.createEmbed(config);
    },
    
    // Create embed iframe
    createEmbed: function(config) {
      var container = document.getElementById(config.containerId);
      if (!container) {
        console.error('SilkCards: Container not found:', config.containerId);
        return null;
      }
      
      // Create loading indicator
      container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:' + config.height + 'px;background:#f8f9fa;border:1px solid #ddd;border-radius:8px;"><div style="text-align:center;color:#666;"><div style="margin-bottom:10px;">🔄</div><div>Loading 3D Preview...</div></div></div>';
      
      // Create iframe
      var iframe = document.createElement('iframe');
      iframe.src = this.baseUrl + '/embed/' + config.shareId + 
        '?autoRotate=' + config.autoRotate + 
        '&showControls=' + config.showControls +
        '&bg=' + encodeURIComponent(config.backgroundColor) +
        '&width=' + config.width +
        '&height=' + config.height;
      
      iframe.width = config.width;
      iframe.height = config.height;
      iframe.frameBorder = '0';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'border: 1px solid #ddd; border-radius: 8px; max-width: 100%; display: block;';
      
      // Handle load events
      iframe.onload = function() {
        container.innerHTML = '';
        container.appendChild(iframe);
        if (config.onLoad) config.onLoad(iframe);
      };
      
      iframe.onerror = function() {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:' + config.height + 'px;background:#f8d7da;border:1px solid #f5c6cb;border-radius:8px;color:#721c24;"><div style="text-align:center;"><div style="margin-bottom:10px;">❌</div><div>Failed to load 3D preview</div></div></div>';
        if (config.onError) config.onError(new Error('Failed to load embed'));
      };
      
      // Load iframe (triggers onload/onerror)
      setTimeout(function() {
        if (iframe.contentWindow) {
          // Iframe loaded successfully
        } else {
          iframe.onerror();
        }
      }, 5000);
      
      return {
        iframe: iframe,
        config: config,
        refresh: function() {
          iframe.src = iframe.src; // Reload iframe
        },
        destroy: function() {
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
        }
      };
    },
    
    // Auto-initialize embeds with data attributes
    autoInit: function() {
      var embeds = document.querySelectorAll('[data-silkcards-share]');
      var instances = [];
      
      for (var i = 0; i < embeds.length; i++) {
        var element = embeds[i];
        var shareId = element.getAttribute('data-silkcards-share');
        var width = element.getAttribute('data-width') || 600;
        var height = element.getAttribute('data-height') || 400;
        var autoRotate = element.getAttribute('data-auto-rotate') === 'true';
        var showControls = element.getAttribute('data-show-controls') !== 'false';
        var backgroundColor = element.getAttribute('data-bg-color') || '#667eea';
        
        // Set container ID if not set
        if (!element.id) {
          element.id = 'silkcards-auto-' + i;
        }
        
        var instance = this.init({
          shareId: shareId,
          containerId: element.id,
          width: parseInt(width),
          height: parseInt(height),
          autoRotate: autoRotate,
          showControls: showControls,
          backgroundColor: backgroundColor
        });
        
        if (instance) {
          instances.push(instance);
        }
      }
      
      return instances;
    }
  };
  
  // Expose to global scope
  window.SilkCardsEmbed = SilkCardsEmbed;
  window.SilkCards = SilkCardsEmbed; // Alias
  
  // Auto-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      SilkCardsEmbed.autoInit();
    });
  } else {
    SilkCardsEmbed.autoInit();
  }
  
})(window, document);
`;

  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
  res.send(embedLibrary);
});

// Helper function to generate embed HTML
function generateEmbedHTML(options) {
  const {
    shareId,
    cardData,
    autoRotate,
    showControls,
    backgroundColor,
    width,
    height
  } = options;

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SilkCards 3D Preview - ${shareId}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: ${backgroundColor};
            overflow: hidden;
            width: 100vw;
            height: 100vh;
        }
        
        #app {
            width: 100%;
            height: 100%;
            display: flex;
            flex-direction: column;
        }
        
        #viewer-container {
            flex: 1;
            position: relative;
            background: linear-gradient(135deg, ${backgroundColor} 0%, ${adjustColor(backgroundColor, -20)} 100%);
        }
        
        #three-canvas {
            width: 100% !important;
            height: 100% !important;
        }
        
        .controls {
            position: absolute;
            top: 15px;
            right: 15px;
            display: flex;
            gap: 10px;
            z-index: 100;
        }
        
        .control-btn {
            width: 40px;
            height: 40px;
            border: none;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.2rem;
            transition: all 0.3s ease;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        
        .control-btn:hover {
            background: rgba(255, 255, 255, 1);
            transform: scale(1.1);
        }
        
        .control-btn.active {
            background: rgba(102, 126, 234, 0.9);
            color: white;
        }
        
        .info-panel {
            position: absolute;
            bottom: 15px;
            left: 15px;
            right: 15px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 15px;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            font-size: 0.9rem;
        }
        
        .info-panel h4 {
            margin: 0 0 8px 0;
            color: #333;
        }
        
        .info-stats {
            display: flex;
            gap: 15px;
            margin-bottom: 10px;
            color: #666;
            flex-wrap: wrap;
        }
        
        .effects-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        
        .effect-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 0.8rem;
            font-weight: 600;
            color: white;
        }
        
        .effect-badge.foil { background: linear-gradient(45deg, #ffd700, #ffed4e); color: #333; }
        .effect-badge.spotUV { background: linear-gradient(45deg, #667eea, #764ba2); }
        .effect-badge.emboss { background: linear-gradient(45deg, #8e9eab, #eef2f3); color: #333; }
        .effect-badge.diecut { background: linear-gradient(45deg, #ff6b6b, #ee5a52); }
        .effect-badge.edge { background: linear-gradient(45deg, #4ecdc4, #44a08d); }
        
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: white;
            font-size: 1.2rem;
        }
        
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 4px solid rgba(255, 255, 255, 0.3);
            border-top: 4px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin-bottom: 20px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        @media (max-width: 768px) {
            .info-panel {
                position: static;
                margin: 10px;
                border-radius: 8px;
            }
            
            .controls {
                top: 10px;
                right: 10px;
            }
            
            .info-stats {
                flex-direction: column;
                gap: 5px;
            }
        }
    </style>
    <script src="https://unpkg.com/three@0.179.1/build/three.min.js"></script>
    <script src="https://unpkg.com/three@0.179.1/examples/js/controls/OrbitControls.js"></script>
</head>
<body>
    <div id="app">
        <div id="viewer-container">
            <div class="loading">
                <div>
                    <div class="loading-spinner"></div>
                    <div>Loading 3D Preview...</div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // Embed configuration
        const config = {
            shareId: '${shareId}',
            autoRotate: ${autoRotate},
            showControls: ${showControls},
            backgroundColor: '${backgroundColor}',
            cardData: ${JSON.stringify(cardData)}
        };
        
        // Initialize 3D viewer
        let scene, camera, renderer, card, controls;
        let autoRotateEnabled = config.autoRotate;
        
        function init() {
            const container = document.getElementById('viewer-container');
            
            // Create scene
            scene = new THREE.Scene();
            
            // Create camera
            camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 1000);
            camera.position.set(0, 0, 8);
            
            // Create renderer
            renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            renderer.setSize(container.clientWidth, container.clientHeight);
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFSoftShadowMap;
            renderer.setClearColor(0x000000, 0);
            
            container.innerHTML = '';
            container.appendChild(renderer.domElement);
            renderer.domElement.id = 'three-canvas';
            
            // Add lighting
            const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
            scene.add(ambientLight);
            
            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(5, 5, 5);
            directionalLight.castShadow = true;
            scene.add(directionalLight);
            
            const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.5);
            directionalLight2.position.set(-5, 5, 5);
            scene.add(directionalLight2);
            
            // Create card
            createCard(config.cardData);
            
            // Add controls
            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enablePan = true;
            controls.enableZoom = true;
            controls.enableRotate = true;
            controls.minDistance = 3;
            controls.maxDistance = 15;
            controls.maxPolarAngle = Math.PI / 2;
            
            // Add UI controls
            if (config.showControls) {
                addUIControls(container);
            }
            
            // Add info panel
            addInfoPanel(container, config.cardData);
            
            // Handle resize
            window.addEventListener('resize', onWindowResize);
            
            // Start animation
            animate();
            
            // Notify parent window that embed is ready
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'silkcards-ready',
                    shareId: config.shareId
                }, '*');
            }
        }
        
        function createCard(cardData) {
            const cardGroup = new THREE.Group();
            
            // Card dimensions (convert mm to Three.js units)
            const { width, height, thickness } = cardData.cardDimensions;
            const cardWidth = width / 20;
            const cardHeight = height / 20;
            const cardThickness = thickness / 10;
            
            // Base card
            const cardGeometry = new THREE.BoxGeometry(cardWidth, cardHeight, cardThickness);
            const cardMaterial = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.8,
                metalness: 0.0
            });
            const cardMesh = new THREE.Mesh(cardGeometry, cardMaterial);
            cardMesh.receiveShadow = true;
            cardGroup.add(cardMesh);
            
            // Add effect layers
            cardData.layers.forEach((layer, index) => {
                if (layer.type === 'effect') {
                    const effectMesh = createEffectLayer(layer, { width: cardWidth, height: cardHeight, thickness: cardThickness }, index);
                    if (effectMesh) {
                        cardGroup.add(effectMesh);
                    }
                }
            });
            
            card = cardGroup;
            scene.add(cardGroup);
        }
        
        function createEffectLayer(layer, cardDimensions, zIndex) {
            const { bounds, effectType, effectSubtype } = layer;
            
            // Convert bounds to Three.js coordinates
            const effectWidth = (bounds.width / 89) * cardDimensions.width;
            const effectHeight = (bounds.height / 51) * cardDimensions.height;
            
            // Position relative to card center
            const effectX = ((bounds.x + bounds.width / 2 - 44.5) / 89) * cardDimensions.width;
            const effectY = -((bounds.y + bounds.height / 2 - 25.5) / 51) * cardDimensions.height;
            const effectZ = cardDimensions.thickness / 2 + zIndex * 0.001;
            
            // Create effect geometry
            const geometry = new THREE.PlaneGeometry(effectWidth, effectHeight);
            const material = getEffectMaterial(effectType, effectSubtype);
            
            const mesh = new THREE.Mesh(geometry, material);
            mesh.position.set(effectX, effectY, effectZ);
            
            return mesh;
        }
        
        function getEffectMaterial(effectType, effectSubtype = 'gold') {
            switch (effectType) {
                case 'foil':
                    const foilColors = {
                        gold: 0xFFD700,
                        silver: 0xC0C0C0,
                        copper: 0xB87333,
                        rose_gold: 0xE8B4B8
                    };
                    return new THREE.MeshStandardMaterial({
                        color: foilColors[effectSubtype] || foilColors.gold,
                        metalness: 1.0,
                        roughness: 0.1,
                        envMapIntensity: 1.5
                    });
                    
                case 'spotUV':
                    return new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0.0,
                        roughness: 0.05,
                        transparent: true,
                        opacity: 0.3
                    });
                    
                case 'emboss':
                    return new THREE.MeshStandardMaterial({
                        color: 0xffffff,
                        metalness: 0.0,
                        roughness: 0.6
                    });
                    
                default:
                    return new THREE.MeshStandardMaterial({ color: 0xff0000 });
            }
        }
        
        function addUIControls(container) {
            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'controls';
            
            const rotateBtn = document.createElement('button');
            rotateBtn.className = 'control-btn' + (autoRotateEnabled ? ' active' : '');
            rotateBtn.innerHTML = '🔄';
            rotateBtn.title = 'Auto Rotate';
            rotateBtn.onclick = toggleAutoRotate;
            
            controlsDiv.appendChild(rotateBtn);
            container.appendChild(controlsDiv);
        }
        
        function addInfoPanel(container, cardData) {
            const panel = document.createElement('div');
            panel.className = 'info-panel';
            
            const effectCounts = Object.entries(cardData.effects)
                .filter(([key, items]) => items.length > 0)
                .map(([effect, items]) => 
                    \`<span class="effect-badge \${effect}">\${effect}: \${items.length}</span>\`
                ).join('');
            
            panel.innerHTML = \`
                <h4>\${cardData.originalFile || 'Business Card'}</h4>
                <div class="info-stats">
                    <span>Layers: \${cardData.layers.length}</span>
                    <span>Size: \${cardData.cardDimensions.width}×\${cardData.cardDimensions.height}mm</span>
                    <span>Method: \${cardData.parsingMethod || 'Unknown'}</span>
                </div>
                <div class="effects-list">
                    \${effectCounts || '<span style="color: #999;">No effects detected</span>'}
                </div>
            \`;
            
            container.appendChild(panel);
        }
        
        function toggleAutoRotate() {
            autoRotateEnabled = !autoRotateEnabled;
            const btn = document.querySelector('.control-btn');
            if (autoRotateEnabled) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
        
        function animate() {
            requestAnimationFrame(animate);
            
            if (autoRotateEnabled && card) {
                card.rotation.y += 0.005;
            }
            
            controls.update();
            renderer.render(scene, camera);
        }
        
        function onWindowResize() {
            const container = document.getElementById('viewer-container');
            camera.aspect = container.clientWidth / container.clientHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(container.clientWidth, container.clientHeight);
            
            // Notify parent of size change
            if (window.parent !== window) {
                window.parent.postMessage({
                    type: 'silkcards-resize',
                    width: container.clientWidth,
                    height: container.clientHeight
                }, '*');
            }
        }
        
        // Initialize when page loads
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    </script>
</body>
</html>`;
}

// Helper function to generate embed script for JavaScript integration
function generateEmbedScript(options) {
  const {
    baseUrl,
    shareId,
    width,
    height,
    autoRotate,
    showControls,
    backgroundColor,
    callback
  } = options;

  return `
// SilkCards Embed Script for ${shareId}
(function() {
  var shareId = '${shareId}';
  var config = {
    width: ${width},
    height: ${height},
    autoRotate: ${autoRotate},
    showControls: ${showControls},
    backgroundColor: '${backgroundColor}'
  };
  
  function createEmbed(containerId) {
    var container = document.getElementById(containerId);
    if (!container) {
      console.error('SilkCards: Container not found:', containerId);
      return null;
    }
    
    var iframe = document.createElement('iframe');
    iframe.src = '${baseUrl}/embed/' + shareId + 
      '?autoRotate=' + config.autoRotate + 
      '&showControls=' + config.showControls +
      '&bg=' + encodeURIComponent(config.backgroundColor) +
      '&width=' + config.width +
      '&height=' + config.height;
    iframe.width = config.width;
    iframe.height = config.height;
    iframe.frameBorder = '0';
    iframe.allowFullscreen = true;
    iframe.style.cssText = 'border: 1px solid #ddd; border-radius: 8px; max-width: 100%;';
    
    container.appendChild(iframe);
    
    ${callback ? `
    iframe.onload = function() {
      if (typeof ${callback} === 'function') {
        ${callback}(iframe, shareId);
      }
    };` : ''}
    
    return iframe;
  }
  
  // Auto-create embed if container exists
  var autoContainer = document.getElementById('silkcards-${shareId}');
  if (autoContainer) {
    createEmbed('silkcards-${shareId}');
  }
  
  // Expose createEmbed function globally
  window.SilkCardsEmbed_${shareId.replace(/-/g, '_')} = {
    create: createEmbed,
    config: config
  };
})();
`;
}

// Helper functions for HTML generation
function generateNotFoundPage(shareId) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Share Not Found - SilkCards</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8f9fa;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            color: #333;
        }
        .error-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            max-width: 400px;
        }
        .error-icon { font-size: 4rem; margin-bottom: 20px; }
        h1 { color: #dc3545; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .share-id { font-family: monospace; background: #f8f9fa; padding: 5px 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">🔍</div>
        <h1>Share Not Found</h1>
        <p>The requested 3D preview could not be found.</p>
        <div class="share-id">ID: ${shareId}</div>
        <p><small>This share link may have been removed or never existed.</small></p>
    </div>
</body>
</html>`;
}

function generateExpiredPage(shareId, expiresAt) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Share Expired - SilkCards</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8f9fa;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            color: #333;
        }
        .error-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            max-width: 400px;
        }
        .error-icon { font-size: 4rem; margin-bottom: 20px; }
        h1 { color: #ffc107; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 15px; }
        .expire-date { font-family: monospace; background: #fff3cd; padding: 5px 10px; border-radius: 4px; color: #856404; }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">⏰</div>
        <h1>Share Link Expired</h1>
        <p>This 3D preview share link has expired and is no longer available.</p>
        <div class="expire-date">Expired: ${new Date(expiresAt).toLocaleDateString()}</div>
        <p><small>Please request a new share link from the original creator.</small></p>
    </div>
</body>
</html>`;
}

function generateErrorPage(errorMessage) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Error - SilkCards</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f8f9fa;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            color: #333;
        }
        .error-container {
            text-align: center;
            padding: 40px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
            max-width: 500px;
        }
        .error-icon { font-size: 4rem; margin-bottom: 20px; }
        h1 { color: #dc3545; margin-bottom: 10px; }
        p { color: #666; margin-bottom: 20px; }
        .error-details { 
            font-family: monospace; 
            background: #f8d7da; 
            padding: 10px; 
            border-radius: 4px; 
            color: #721c24;
            font-size: 0.9rem;
            text-align: left;
        }
    </style>
</head>
<body>
    <div class="error-container">
        <div class="error-icon">❌</div>
        <h1>Something Went Wrong</h1>
        <p>We encountered an error while loading this 3D preview.</p>
        <div class="error-details">${errorMessage}</div>
        <p><small>Please try refreshing the page or contact support if the problem persists.</small></p>
    </div>
</body>
</html>`;
}

// Helper function to adjust color brightness
function adjustColor(color, amount) {
  // Simple color adjustment - in production you might want a more robust solution
  const hex = color.replace('#', '');
  const num = parseInt(hex, 16);
  const r = Math.max(0, Math.min(255, (num >> 16) + amount));
  const g = Math.max(0, Math.min(255, (num >> 8 & 0x00FF) + amount));
  const b = Math.max(0, Math.min(255, (num & 0x0000FF) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export default router;