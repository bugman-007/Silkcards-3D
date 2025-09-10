// src/components/BaseCard.jsx - NEW FILE
import { useMemo } from 'react';
import { Box } from '@react-three/drei';
import * as THREE from 'three';

export default function BaseCard({ dimensions }) {
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#f8f9fa',
      roughness: 0.8,
      metalness: 0.0,
      side: THREE.DoubleSide
    });
  }, []);

  return (
    <Box args={[dimensions.width, dimensions.height, dimensions.thickness]} position={[0, 0, 0]}>
      <primitive object={material} attach="material" />
    </Box>
  );
}