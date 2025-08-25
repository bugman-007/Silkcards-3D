// backend/src/routes/share.js - NEW FILE - COMPLETE SHARE SYSTEM
import express from 'express';
import path from 'path';
import fs from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

// ES6 module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Helper function to get shares directory
function getSharesPath() {
  return path.join(__dirname, '../../shares');
}

// Ensure shares directory exists
async function ensureSharesDirectory() {
  const sharesPath = getSharesPath();
  await fs.ensureDir(sharesPath);
  return sharesPath;
}

// Create shareable link
router.post('/', async (req, res) => {
  try {
    const { cardData, options = {} } = req.body;

    if (!cardData) {
      return res.status(400).json({
        success: false,
        error: 'Card data is required'
      });
    }

    // Generate unique share ID
    const shareId = uuidv4();
    console.log('🔗 Creating share link:', shareId);

    // Prepare share data
    const shareData = {
      id: shareId,
      cardData,
      createdAt: new Date().toISOString(),
      expiresAt: options.expiresAt || new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString(), // 30 days
      accessCount: 0,
      lastAccessedAt: null,
      options: {
        allowEmbed: options.allowEmbed !== false,
        showControls: options.showControls !== false,
        autoRotate: options.autoRotate || false,
        backgroundColor: options.backgroundColor || '#667eea',
        ...options
      },
      metadata: {
        userAgent: req.get('User-Agent'),
        ip: req.ip,
        referer: req.get('Referer')
      }
    };

    // Save share data
    const sharesPath = await ensureSharesDirectory();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);
    await fs.writeJson(shareFilePath, shareData, { spaces: 2 });

    // Generate URLs
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${baseUrl}/share/${shareId}`;
    const embedUrl = `${baseUrl}/embed/${shareId}`;

    console.log('✅ Share link created:', shareUrl);

    res.json({
      success: true,
      shareId,
      shareUrl,
      embedUrl,
      embedCode: generateEmbedCode(embedUrl, options),
      embedScript: generateEmbedScript(baseUrl, shareId, options),
      expiresAt: shareData.expiresAt,
      createdAt: shareData.createdAt
    });

  } catch (error) {
    console.error('❌ Share creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create share link',
      message: error.message
    });
  }
});

// Get shared card data
router.get('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    console.log('📖 Accessing shared card:', shareId);

    const sharesPath = await ensureSharesDirectory();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).json({
        success: false,
        error: 'Share not found',
        message: 'This share link may have expired or been removed'
      });
    }

    const shareData = await fs.readJson(shareFilePath);

    // Check if expired
    if (new Date(shareData.expiresAt) < new Date()) {
      console.log('⏰ Share link expired:', shareId);
      return res.status(410).json({
        success: false,
        error: 'Share link expired',
        expiresAt: shareData.expiresAt
      });
    }

    // Update access tracking
    shareData.accessCount = (shareData.accessCount || 0) + 1;
    shareData.lastAccessedAt = new Date().toISOString();
    await fs.writeJson(shareFilePath, shareData, { spaces: 2 });

    console.log(`👀 Share accessed (${shareData.accessCount} times)`);

    res.json({
      success: true,
      shareId,
      cardData: shareData.cardData,
      createdAt: shareData.createdAt,
      expiresAt: shareData.expiresAt,
      accessCount: shareData.accessCount,
      options: shareData.options
    });

  } catch (error) {
    console.error('❌ Share retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve shared card',
      message: error.message
    });
  }
});

// Update share options
router.patch('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    const { options = {} } = req.body;

    console.log('✏️ Updating share options:', shareId);

    const sharesPath = await ensureSharesDirectory();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).json({
        success: false,
        error: 'Share not found'
      });
    }

    const shareData = await fs.readJson(shareFilePath);

    // Check if expired
    if (new Date(shareData.expiresAt) < new Date()) {
      return res.status(410).json({
        success: false,
        error: 'Share link expired'
      });
    }

    // Update options
    shareData.options = { ...shareData.options, ...options };
    shareData.updatedAt = new Date().toISOString();

    await fs.writeJson(shareFilePath, shareData, { spaces: 2 });

    console.log('✅ Share options updated');

    res.json({
      success: true,
      shareId,
      options: shareData.options,
      updatedAt: shareData.updatedAt
    });

  } catch (error) {
    console.error('❌ Share update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update share options',
      message: error.message
    });
  }
});

// Delete share
router.delete('/:shareId', async (req, res) => {
  try {
    const { shareId } = req.params;
    console.log('🗑️ Deleting share:', shareId);

    const sharesPath = await ensureSharesDirectory();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).json({
        success: false,
        error: 'Share not found'
      });
    }

    await fs.remove(shareFilePath);

    console.log('✅ Share deleted successfully');

    res.json({
      success: true,
      message: 'Share deleted successfully',
      shareId
    });

  } catch (error) {
    console.error('❌ Share deletion failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete share',
      message: error.message
    });
  }
});

// Get share statistics
router.get('/:shareId/stats', async (req, res) => {
  try {
    const { shareId } = req.params;

    const sharesPath = await ensureSharesDirectory();
    const shareFilePath = path.join(sharesPath, `${shareId}.json`);

    if (!(await fs.pathExists(shareFilePath))) {
      return res.status(404).json({
        success: false,
        error: 'Share not found'
      });
    }

    const shareData = await fs.readJson(shareFilePath);

    const stats = {
      shareId,
      createdAt: shareData.createdAt,
      expiresAt: shareData.expiresAt,
      lastAccessedAt: shareData.lastAccessedAt,
      accessCount: shareData.accessCount || 0,
      isExpired: new Date(shareData.expiresAt) < new Date(),
      daysUntilExpiry: Math.max(0, Math.ceil((new Date(shareData.expiresAt) - new Date()) / (1000 * 60 * 60 * 24))),
      cardInfo: {
        layerCount: shareData.cardData.layers?.length || 0,
        effectsCount: shareData.cardData.effects ? Object.values(shareData.cardData.effects).flat().length : 0,
        fileType: shareData.cardData.fileType || 'unknown',
        parsingMethod: shareData.cardData.parsingMethod || 'unknown'
      }
    };

    res.json({
      success: true,
      statistics: stats
    });

  } catch (error) {
    console.error('❌ Share stats failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get share statistics',
      message: error.message
    });
  }
});

// List all shares (for admin/debugging)
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 10, includeExpired = false } = req.query;

    const sharesPath = await ensureSharesDirectory();
    const shareFiles = await fs.readdir(sharesPath);
    const shareJsonFiles = shareFiles.filter(f => f.endsWith('.json'));

    const shares = [];
    const now = new Date();

    for (const file of shareJsonFiles) {
      try {
        const shareData = await fs.readJson(path.join(sharesPath, file));
        const isExpired = new Date(shareData.expiresAt) < now;
        
        if (!includeExpired && isExpired) continue;

        shares.push({
          id: shareData.id,
          createdAt: shareData.createdAt,
          expiresAt: shareData.expiresAt,
          accessCount: shareData.accessCount || 0,
          lastAccessedAt: shareData.lastAccessedAt,
          isExpired,
          cardInfo: {
            layerCount: shareData.cardData.layers?.length || 0,
            fileType: shareData.cardData.fileType || 'unknown'
          }
        });
      } catch (error) {
        console.warn('⚠️ Skipped invalid share file:', file);
      }
    }

    // Sort by creation date (newest first)
    shares.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // Pagination
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + parseInt(limit);
    const paginatedShares = shares.slice(startIndex, endIndex);

    res.json({
      success: true,
      shares: paginatedShares,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: shares.length,
        totalPages: Math.ceil(shares.length / limit),
        hasNext: endIndex < shares.length,
        hasPrev: startIndex > 0
      }
    });

  } catch (error) {
    console.error('❌ Share listing failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list shares',
      message: error.message
    });
  }
});

// Cleanup expired shares
router.post('/cleanup', async (req, res) => {
  try {
    console.log('🧹 Starting cleanup of expired shares...');

    const sharesPath = await ensureSharesDirectory();
    const shareFiles = await fs.readdir(sharesPath);
    const shareJsonFiles = shareFiles.filter(f => f.endsWith('.json'));

    let deletedCount = 0;
    const now = new Date();

    for (const file of shareJsonFiles) {
      try {
        const shareData = await fs.readJson(path.join(sharesPath, file));
        const isExpired = new Date(shareData.expiresAt) < now;
        
        if (isExpired) {
          await fs.remove(path.join(sharesPath, file));
          deletedCount++;
          console.log('🗑️ Deleted expired share:', shareData.id);
        }
      } catch (error) {
        console.warn('⚠️ Error processing share file:', file, error.message);
      }
    }

    console.log(`✅ Cleanup completed: ${deletedCount} expired shares deleted`);

    res.json({
      success: true,
      deletedCount,
      remainingCount: shareJsonFiles.length - deletedCount,
      cleanupAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    res.status(500).json({
      success: false,
      error: 'Cleanup failed',
      message: error.message
    });
  }
});

// Helper functions for embed code generation
function generateEmbedCode(embedUrl, options = {}) {
  const width = options.width || 600;
  const height = options.height || 400;
  
  return `<iframe 
  src="${embedUrl}" 
  width="${width}" 
  height="${height}" 
  frameborder="0" 
  allowfullscreen
  style="border: 1px solid #ddd; border-radius: 8px;">
</iframe>`;
}

function generateEmbedScript(baseUrl, shareId, options = {}) {
  const config = {
    shareId,
    width: options.width || 600,
    height: options.height || 400,
    autoRotate: options.autoRotate || false,
    showControls: options.showControls !== false,
    backgroundColor: options.backgroundColor || '#667eea'
  };

  return `<div id="silkcards-preview-${shareId}"></div>
<script>
(function() {
  var config = ${JSON.stringify(config, null, 2)};
  var containerId = 'silkcards-preview-' + config.shareId;
  var container = document.getElementById(containerId);
  
  if (!container) {
    console.error('SilkCards: Container not found:', containerId);
    return;
  }
  
  // Create iframe
  var iframe = document.createElement('iframe');
  iframe.src = '${baseUrl}/embed/' + config.shareId + 
    '?autoRotate=' + config.autoRotate + 
    '&showControls=' + config.showControls +
    '&bg=' + encodeURIComponent(config.backgroundColor);
  iframe.width = config.width;
  iframe.height = config.height;
  iframe.frameBorder = '0';
  iframe.allowFullscreen = true;
  iframe.style.cssText = 'border: 1px solid #ddd; border-radius: 8px; max-width: 100%;';
  
  container.appendChild(iframe);
  
  // Optional: Add resize handler
  window.addEventListener('message', function(event) {
    if (event.origin !== '${baseUrl}') return;
    if (event.data.type === 'silkcards-resize') {
      iframe.height = event.data.height;
    }
  });
})();
</script>`;
}

export default router;