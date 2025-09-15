// src/components/CardSelector.jsx - NEW COMPONENT FOR MULTI-CARD SUPPORT
import { useState } from 'react';
import './CardSelector.css';

export default function CardSelector({ cards, activeCard, onCardChange }) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const cardKeys = Object.keys(cards || {});
  
  // Don't show selector if only one card
  if (cardKeys.length <= 1) return null;

  const getCardDisplayName = (key) => {
    switch (key) {
      case 'front': return 'Front Card';
      case 'back': return 'Back Card';
      default: return `Card ${key.replace('card', '')}`;
    }
  };

  const getCardStats = (cardData) => {
    const totalItems = Object.values(cardData).reduce((total, items) => 
      total + (Array.isArray(items) ? items.length : 0), 0);
    const effectTypes = Object.keys(cardData).filter(key => 
      Array.isArray(cardData[key]) && cardData[key].length > 0);
    return { totalItems, effectTypes: effectTypes.length };
  };

  return (
    <div className="card-selector">
      <div className="selector-header">
        <span className="selector-label">Multiple cards detected:</span>
        <button 
          className="toggle-btn"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? '▼' : '▶'} {cardKeys.length} cards
        </button>
      </div>
      
      {isExpanded && (
        <div className="selector-content">
          <div className="cards-grid">
            {cardKeys.map((key) => {
              const cardData = cards[key];
              const stats = getCardStats(cardData);
              const isActive = key === activeCard;
              
              return (
                <div 
                  key={key}
                  className={`card-option ${isActive ? 'active' : ''}`}
                  onClick={() => onCardChange(key)}
                >
                  <div className="card-preview">
                    <div className="card-icon">🃏</div>
                    <div className="card-details">
                      <h4>{getCardDisplayName(key)}</h4>
                      <p>{stats.totalItems} items</p>
                      <p>{stats.effectTypes} effect types</p>
                    </div>
                  </div>
                  {isActive && <div className="active-indicator">Currently viewing</div>}
                </div>
              );
            })}
          </div>
          
          <div className="selector-actions">
            <button 
              className="view-all-btn"
              onClick={() => {
                // Cycle through all cards
                const currentIndex = cardKeys.indexOf(activeCard);
                const nextIndex = (currentIndex + 1) % cardKeys.length;
                onCardChange(cardKeys[nextIndex]);
              }}
            >
              🔄 Switch Card
            </button>
          </div>
        </div>
      )}
    </div>
  );
}