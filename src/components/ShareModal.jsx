// src/components/ShareModal.jsx - NEW FILE
import { useState } from 'react';
import { createShareLink } from '../api/client';
import './ShareModal.css';

export default function ShareModal({ cardData, onClose }) {
  const [shareLink, setShareLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const generateShareLink = async () => {
    setIsGenerating(true);
    try {
      const response = await createShareLink(cardData);
      setShareLink(response.shareUrl);
    } catch (error) {
      console.error('Failed to generate share link:', error);
      alert('Failed to generate share link. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const embedCode = shareLink ? 
    `<iframe src="${shareLink.replace('/share/', '/embed/')}" width="600" height="400" frameborder="0"></iframe>` : '';

  return (
    <div className="share-modal-overlay" onClick={onClose}>
      <div className="share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Share 3D Preview</h3>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          {!shareLink ? (
            <div className="generate-section">
              <p>Generate a shareable link for this 3D card preview.</p>
              <button 
                className="generate-btn" 
                onClick={generateShareLink}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <div className="spinner-small"></div>
                    Generating...
                  </>
                ) : (
                  '🔗 Generate Share Link'
                )}
              </button>
            </div>
          ) : (
            <div className="share-section">
              <div className="share-option">
                <h4>📎 Shareable Link</h4>
                <div className="input-group">
                  <input 
                    type="text" 
                    value={shareLink} 
                    readOnly 
                    className="share-input"
                  />
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(shareLink)}
                  >
                    {copySuccess ? '✅' : '📋'}
                  </button>
                </div>
                <p className="share-description">
                  Share this link with anyone to view the 3D preview
                </p>
              </div>

              <div className="share-option">
                <h4>🔧 Embed Code</h4>
                <div className="input-group">
                  <textarea 
                    value={embedCode} 
                    readOnly 
                    className="embed-textarea"
                    rows={3}
                  />
                  <button 
                    className="copy-btn"
                    onClick={() => copyToClipboard(embedCode)}
                  >
                    {copySuccess ? '✅' : '📋'}
                  </button>
                </div>
                <p className="share-description">
                  Embed this code in your website or HTML email
                </p>
              </div>

              <div className="share-actions">
                <button 
                  className="preview-btn"
                  onClick={() => window.open(shareLink, '_blank')}
                >
                  👁️ Preview Link
                </button>
                <button className="new-link-btn" onClick={() => setShareLink('')}>
                  🔄 Generate New Link
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}