#!/usr/bin/env python
"""
Setup check script for parser-service.
Validates all prerequisites and configuration.
"""

import sys
import os
import shutil
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

try:
    import config
except ImportError:
    print("ERROR: Could not import src/config.py")
    print("Make sure you're running from the parser-service directory")
    sys.exit(1)

def check_python_version():
    """Check Python version."""
    major, minor = sys.version_info[:2]
    required = (3, 9)
    
    if (major, minor) >= required:
        print(f"✓ Python {major}.{minor} (OK)")
        return True
    else:
        print(f"✗ Python {major}.{minor} (Need 3.9+)")
        return False

def check_illustrator():
    """Check Illustrator installation."""
    ai_exe = config.ILLUSTRATOR_EXE
    
    if Path(ai_exe).exists():
        print(f"✓ Illustrator found: {ai_exe}")
        return True
    else:
        print(f"✗ Illustrator not found: {ai_exe}")
        print(f"  Set AI_EXE environment variable or edit src/config.py")
        return False

def check_ghostscript():
    """Check Ghostscript installation."""
    try:
        gs_path = config.get_ghostscript_path()
        print(f"✓ Ghostscript found: {gs_path}")
        return True
    except FileNotFoundError as e:
        print(f"✗ Ghostscript not found")
        print(f"  Install from: https://ghostscript.com/releases/gsdnld.html")
        print(f"  Or place gswin64c.exe in: {config.BIN_GS}")
        return False

def check_pdftoolbox():
    """Check pdfToolbox installation (optional)."""
    pdftoolbox_path = config.get_pdftoolbox_path()
    
    if pdftoolbox_path:
        print(f"✓ pdfToolbox found: {pdftoolbox_path}")
        return True
    else:
        print(f"○ pdfToolbox not found (optional)")
        print(f"  Vector die extraction will be skipped")
        return None  # Not required

def check_dependencies():
    """Check Python dependencies."""
    required = ["flask", "PIL", "numpy"]
    missing = []
    
    for module in required:
        try:
            __import__(module)
        except ImportError:
            missing.append(module)
    
    if not missing:
        print(f"✓ Python dependencies installed")
        return True
    else:
        print(f"✗ Missing Python packages: {', '.join(missing)}")
        print(f"  Run: pip install -r requirements.txt")
        return False

def check_directories():
    """Check and create required directories."""
    try:
        config.ensure_directories()
        print(f"✓ Directories created/verified")
        return True
    except Exception as e:
        print(f"✗ Could not create directories: {e}")
        return False

def check_jsx_scripts():
    """Check JSX scripts exist."""
    scripts = [
        config.JSX_EXPORT_TO_PDF,
        config.JSX_UTILS,
        config.JSX_TEST_OPEN
    ]
    
    missing = []
    for script in scripts:
        if not script.exists():
            missing.append(script.name)
    
    if not missing:
        print(f"✓ JSX scripts found")
        return True
    else:
        print(f"✗ Missing JSX scripts: {', '.join(missing)}")
        return False

def main():
    """Run all checks."""
    print("=" * 60)
    print("Parser Service - Setup Check")
    print("=" * 60)
    print()
    
    results = []
    
    print("Checking Prerequisites...")
    print("-" * 60)
    results.append(check_python_version())
    results.append(check_illustrator())
    results.append(check_ghostscript())
    pdftoolbox_result = check_pdftoolbox()
    if pdftoolbox_result is not None:
        results.append(pdftoolbox_result)
    
    print()
    print("Checking Installation...")
    print("-" * 60)
    results.append(check_dependencies())
    results.append(check_directories())
    results.append(check_jsx_scripts())
    
    print()
    print("=" * 60)
    
    if all(results):
        print("✓ All checks passed! Ready to run.")
        print()
        print("Next steps:")
        print("  1. Run health check: python -m src.app health")
        print("  2. Start API server: python app.py")
        print("  3. Test with a sample .ai file")
        return 0
    else:
        print("✗ Some checks failed. Please fix the issues above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())

