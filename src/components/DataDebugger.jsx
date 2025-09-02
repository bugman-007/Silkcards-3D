// src/components/DataDebugger.jsx - TEMPORARY DEBUGGING COMPONENT
// Add this component to help debug the data structure
import { useState } from 'react';

export default function DataDebugger({ data, title = "Debug Data" }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);

  const copyToClipboard = () => {
    const jsonString = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    });
  };

  if (!data) {
    return (
      <div style={{ 
        background: '#f8d7da', 
        border: '1px solid #f5c6cb', 
        padding: '10px', 
        borderRadius: '4px',
        margin: '10px 0'
      }}>
        <strong>{title}:</strong> No data provided
      </div>
    );
  }

  return (
    <div style={{ 
      background: '#d1ecf1', 
      border: '1px solid #bee5eb', 
      padding: '10px', 
      borderRadius: '4px',
      margin: '10px 0'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <strong>{title}</strong>
        <div>
          <button 
            onClick={copyToClipboard}
            style={{ 
              marginRight: '10px',
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #17a2b8',
              background: copySuccess ? '#28a745' : '#17a2b8',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            {copySuccess ? '✓ Copied' : '📋 Copy JSON'}
          </button>
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            style={{ 
              padding: '4px 8px',
              borderRadius: '4px',
              border: '1px solid #6c757d',
              background: '#6c757d',
              color: 'white',
              cursor: 'pointer'
            }}
          >
            {isExpanded ? '▼ Hide' : '▶ Show'}
          </button>
        </div>
      </div>

      <div>
        <p><strong>Type:</strong> {typeof data}</p>
        <p><strong>Keys:</strong> {typeof data === 'object' ? Object.keys(data).join(', ') : 'N/A'}</p>
        
        {isExpanded && (
          <pre style={{ 
            background: '#f8f9fa', 
            padding: '10px', 
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '400px',
            fontSize: '0.8em'
          }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// Usage in your components:
// import DataDebugger from './DataDebugger';
// <DataDebugger data={cardData} title="Card Data Structure" />