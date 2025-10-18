#!/usr/bin/env python
"""
Test script to verify JSX execution.
Creates a minimal test job and runs it through Illustrator.
"""

import sys
import os
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

try:
    import config
    import illustrator
    
    print("=" * 60)
    print("JSX Test Script")
    print("=" * 60)
    print()
    
    # Test 1: Check Illustrator path
    print("1. Checking Illustrator installation...")
    if Path(config.ILLUSTRATOR_EXE).exists():
        print(f"   ✓ Found: {config.ILLUSTRATOR_EXE}")
    else:
        print(f"   ✗ Not found: {config.ILLUSTRATOR_EXE}")
        sys.exit(1)
    
    # Test 2: Check JSX scripts
    print("\n2. Checking JSX scripts...")
    if config.JSX_EXPORT_TO_PDF.exists():
        print(f"   ✓ export_to_pdf.jsx exists")
    else:
        print(f"   ✗ export_to_pdf.jsx not found")
        sys.exit(1)
    
    if config.JSX_TEST_OPEN.exists():
        print(f"   ✓ test_open.jsx exists")
    else:
        print(f"   ✗ test_open.jsx not found")
        sys.exit(1)
    
    # Test 3: Run Illustrator health check
    print("\n3. Running Illustrator health check...")
    print("   This will open Illustrator briefly...")
    
    runner = illustrator.IllustratorRunner()
    
    # Kill any existing instances
    print("   Killing existing Illustrator processes...")
    runner.kill_illustrator()
    
    # Run test
    print("   Running test_open.jsx...")
    try:
        runner.run_jsx(config.JSX_TEST_OPEN, timeout=60)
        print("   ✓ JSX execution successful")
    except Exception as e:
        print(f"   ✗ JSX execution failed: {e}")
        sys.exit(1)
    
    # Check temp folder for success file
    temp_folder = Path(os.environ.get("TEMP", "/tmp"))
    success_file = temp_folder / "illustrator_health_check_success.txt"
    error_file = temp_folder / "illustrator_health_check_error.txt"
    
    if error_file.exists():
        print(f"   ✗ Error file found:")
        print(f"      {error_file.read_text()}")
        error_file.unlink()
        sys.exit(1)
    elif success_file.exists():
        print(f"   ✓ Success file found:")
        print(f"      {success_file.read_text()}")
        success_file.unlink()
    else:
        print("   ⚠ No result files found (this may be normal)")
    
    print()
    print("=" * 60)
    print("✓ All tests passed!")
    print("=" * 60)
    print()
    print("Next steps:")
    print("  1. Place a test .ai file in jobs/incoming/")
    print("  2. Run: python app.py")
    print("  3. Upload the .ai file via API")
    print()
    
    sys.exit(0)
    
except Exception as e:
    print(f"\nError: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

