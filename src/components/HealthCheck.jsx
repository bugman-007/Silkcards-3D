// src/components/HealthCheck.jsx - NEW FILE
import { useState, useEffect } from 'react';
import { healthCheck } from '../api/client';

export default function HealthCheck() {
  const [status, setStatus] = useState('checking'); // 'checking', 'healthy', 'error'
  const [healthData, setHealthData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        setStatus('checking');
        const data = await healthCheck();
        setHealthData(data);
        setStatus('healthy');
        setError(null);
      } catch (err) {
        setError(err.message);
        setStatus('error');
      }
    };

    checkHealth();
  }, []);

  const retryHealthCheck = async () => {
    setStatus('checking');
    try {
      const data = await healthCheck();
      setHealthData(data);
      setStatus('healthy');
      setError(null);
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  };

  return (
    <div style={{ 
      padding: '10px', 
      marginBottom: '20px', 
      borderRadius: '8px',
      backgroundColor: status === 'healthy' ? '#d4edda' : status === 'error' ? '#f8d7da' : '#fff3cd',
      border: `1px solid ${status === 'healthy' ? '#c3e6cb' : status === 'error' ? '#f5c6cb' : '#faeeba'}`
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <strong>Backend Status: </strong>
          {status === 'checking' && '🔍 Checking...'}
          {status === 'healthy' && '✅ Connected'}
          {status === 'error' && '❌ Connection Failed'}
        </div>
        {status === 'error' && (
          <button 
            onClick={retryHealthCheck}
            style={{ 
              padding: '5px 10px', 
              borderRadius: '4px',
              border: '1px solid #dc3545',
              backgroundColor: 'transparent',
              color: '#dc3545',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        )}
      </div>
      
      {healthData && (
        <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#666' }}>
          Environment: {healthData.environment} | Port: {healthData.port}
        </div>
      )}
      
      {error && (
        <div style={{ marginTop: '8px', fontSize: '0.9em', color: '#dc3545' }}>
          Error: {error}
        </div>
      )}
    </div>
  );
}