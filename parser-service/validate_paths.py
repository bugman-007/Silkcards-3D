#!/usr/bin/env python
"""
Quick validation script to verify all paths are correct.
"""

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

try:
    import config
    
    print("=" * 60)
    print("Path Validation Script")
    print("=" * 60)
    print()
    
    # Check JSX paths
    print("1. JSX Script Paths:")
    print(f"   Export script: {config.JSX_EXPORT_TO_PDF}")
    print(f"   Exists: {config.JSX_EXPORT_TO_PDF.exists()}")
    print()
    
    print(f"   Utils script: {config.JSX_UTILS}")
    print(f"   Exists: {config.JSX_UTILS.exists()}")
    print()
    
    print(f"   Test script: {config.JSX_TEST_OPEN}")
    print(f"   Exists: {config.JSX_TEST_OPEN.exists()}")
    print()
    
    # Check runtime path
    print("2. Runtime Path:")
    print(f"   Job config: {config.JSX_RUNTIME_JOB}")
    print(f"   Parent exists: {config.JSX_RUNTIME_JOB.parent.exists()}")
    print()
    
    # Check job directories
    print("3. Job Directories:")
    for name, path in [
        ("Incoming", config.JOBS_INCOMING),
        ("Working", config.JOBS_WORKING),
        ("Results", config.JOBS_RESULTS),
        ("Failed", config.JOBS_FAILED)
    ]:
        print(f"   {name}: {path}")
        print(f"   Exists: {path.exists()}")
    print()
    
    # Verify paths match expected structure
    print("4. Path Structure Validation:")
    
    errors = []
    
    # Normalize paths for comparison (handle both / and \ separators)
    export_path = str(config.JSX_EXPORT_TO_PDF).replace("\\", "/")
    runtime_path = str(config.JSX_RUNTIME_JOB).replace("\\", "/")
    
    # JSX scripts should be in scripts/jsx/
    if not export_path.endswith("scripts/jsx/export_to_pdf.jsx"):
        errors.append("❌ Export script path incorrect")
        print(f"   ❌ Export script path: {export_path}")
    else:
        print("   ✓ Export script path correct")
    
    # Runtime should be in scripts/runtime/
    if not runtime_path.endswith("scripts/runtime/job.jsx"):
        errors.append("❌ Runtime job path incorrect")
        print(f"   ❌ Runtime path: {runtime_path}")
    else:
        print("   ✓ Runtime job path correct")
    
    # All JSX files should exist
    if not all([
        config.JSX_EXPORT_TO_PDF.exists(),
        config.JSX_UTILS.exists(),
        config.JSX_TEST_OPEN.exists()
    ]):
        errors.append("❌ Some JSX files missing")
    else:
        print("   ✓ All JSX files exist")
    
    # Runtime directory should exist
    if not config.JSX_RUNTIME_JOB.parent.exists():
        errors.append("❌ Runtime directory missing")
    else:
        print("   ✓ Runtime directory exists")
    
    print()
    
    if errors:
        print("=" * 60)
        print("ERRORS FOUND:")
        for error in errors:
            print(f"  {error}")
        print("=" * 60)
        sys.exit(1)
    else:
        print("=" * 60)
        print("✅ ALL PATHS VALID!")
        print("=" * 60)
        print()
        print("Path structure:")
        print(f"  Base: {config.BASE_DIR}")
        print(f"  Scripts: {config.SCRIPTS_DIR}")
        print(f"  JSX: {config.SCRIPTS_JSX}")
        print(f"  Runtime: {config.SCRIPTS_RUNTIME}")
        print()
        print("Ready to run jobs!")
        sys.exit(0)

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

