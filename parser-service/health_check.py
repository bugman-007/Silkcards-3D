#!/usr/bin/env python
"""
Health check script for parser-service.
Alternative to running: python -m src.app health
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

try:
    from app import run_health_check
    
    print("Running Parser Service Health Check...")
    print("=" * 50)
    
    success = run_health_check()
    
    if success:
        print("\n✓ Health check PASSED!")
        print("Ready to start the service.")
        sys.exit(0)
    else:
        print("\n✗ Health check FAILED!")
        print("Please check the error messages above.")
        sys.exit(1)
        
except Exception as e:
    print(f"Error running health check: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
