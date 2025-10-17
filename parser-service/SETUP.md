# Parser Service Setup Guide

## Prerequisites

### 1. Adobe Illustrator
- **Version**: 2024 or later (2025 recommended)
- **Platform**: Windows 10/11
- **License**: Active Illustrator license required

**Installation**:
```
Download from Adobe Creative Cloud
```

**Verify Installation**:
```batch
"C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe" --version
```

### 2. Ghostscript
- **Version**: 10.0 or later
- **Required for**: PDF plate extraction

**Installation**:
1. Download from https://ghostscript.com/releases/gsdnld.html
2. Run installer (choose default location)
3. Add to PATH or place in `bin/gs/`

**Verify Installation**:
```batch
gswin64c -version
```

### 3. Python
- **Version**: 3.9 or later
- **Platform**: Windows x64

**Installation**:
```batch
# Download from https://www.python.org/downloads/
# OR use winget
winget install Python.Python.3.11
```

**Verify Installation**:
```batch
python --version
```

### 4. pdfToolbox (Optional)
- **Required for**: Vector die extraction (optional feature)
- **License**: Commercial license required

If not installed, the service will skip vector die extraction and use raster masks only.

## Installation

### Step 1: Clone/Extract Project

```batch
cd D:\projects
git clone <your-repo-url> parser-service
cd parser-service
```

### Step 2: Create Virtual Environment

```batch
python -m venv venv
venv\Scripts\activate
```

### Step 3: Install Dependencies

```batch
pip install -r requirements.txt
```

### Step 4: Configure Environment

```batch
# Copy example env file
copy .env.example .env

# Edit .env with your settings
notepad .env
```

**Required Settings**:
- `AI_EXE`: Path to Illustrator.exe
- `PARSER_SHARED_KEY`: Change to a secure random string

**Optional Settings**:
- `PLATE_DPI`: Default is 600, increase for higher quality
- `ILLUSTRATOR_TIMEOUT_SEC`: Increase if processing large files
- `GS_EXE`: Only needed if Ghostscript not in PATH

### Step 5: Verify Setup

```batch
# Run health check
python -m src.app health
```

**Expected Output**:
```
✓ Illustrator OK
✓ Ghostscript OK: C:\Program Files\gs\...\gswin64c.exe
○ pdfToolbox not found (optional)
Health check passed!
```

## Running the Service

### Option 1: API Server (Production)

```batch
# Using batch script
run_api.bat

# OR manually
python app.py
```

API will be available at: http://localhost:5001

### Option 2: CLI Mode (Testing)

```batch
# Parse a single file
python -m src.app parse path\to\design.ai

# With custom job ID
python -m src.app parse path\to\design.ai --job-id test-job-001
```

### Option 3: Python Module (Integration)

```python
from src.app import run_job

result = run_job("path/to/design.ai")
print(result)
```

## Testing

### Test 1: Health Check

```batch
run_health_check.bat
```

### Test 2: Sample File

```batch
# Create a test AI file in Illustrator with:
# - Front artboard with some artwork
# - Layer named "UV" with some shapes
# - Layer named "FOIL" with some text

python -m src.app parse test_sample.ai
```

### Test 3: API Upload

```bash
curl -X POST http://localhost:5001/parse \
  -H "X-KEY: your-shared-key" \
  -F "file=@test_sample.ai"
```

## Directory Structure After Setup

```
parser-service/
├── venv/                  # Python virtual environment
├── jobs/
│   ├── incoming/          # Temporary upload storage
│   ├── working/           # Processing workspace
│   ├── results/           # Final outputs
│   │   └── <job-id>/
│   │       ├── front_layer_0_albedo.png
│   │       ├── front_layer_0_uv.png
│   │       ├── report.json
│   │       └── ...
│   └── failed/            # Failed jobs with logs
├── logs/
│   └── parser.log         # Service logs
└── .env                   # Your configuration
```

## Common Issues

### Issue 1: Illustrator Won't Start

**Symptoms**: `AI_OPEN_FAILED` or timeout errors

**Solutions**:
1. Verify Illustrator path in `.env`
2. Check Illustrator license is active
3. Try opening Illustrator manually first
4. Kill existing Illustrator processes: `taskkill /F /IM Illustrator.exe`

### Issue 2: Ghostscript Not Found

**Symptoms**: `GHOSTSCRIPT_FAILED` or "gswin64c not found"

**Solutions**:
1. Install Ghostscript from official website
2. Add Ghostscript to PATH:
   ```batch
   setx PATH "%PATH%;C:\Program Files\gs\gs10.02.1\bin"
   ```
3. OR copy `gswin64c.exe` to `bin/gs/`
4. Restart terminal after PATH changes

### Issue 3: Plates Not Detected

**Symptoms**: Empty masks or missing finishes in report

**Solutions**:
1. Check layer/artboard names contain tokens: `uv`, `foil`, `emboss`, `die`
2. Verify layers are visible and unlocked
3. Check `working/<job-id>_scratch.json` for detection results
4. Review logs: `logs/parser.log`

### Issue 4: Python Import Errors

**Symptoms**: `ModuleNotFoundError` or import errors

**Solutions**:
1. Activate virtual environment: `venv\Scripts\activate`
2. Reinstall dependencies: `pip install -r requirements.txt`
3. Verify Python version: `python --version` (3.9+)

### Issue 5: Timeout Errors

**Symptoms**: `TIMEOUT_ILLUSTRATOR` or `TIMEOUT_GS`

**Solutions**:
1. Increase timeouts in `.env`:
   ```
   ILLUSTRATOR_TIMEOUT_SEC=600
   GHOSTSCRIPT_TIMEOUT_SEC=400
   ```
2. Simplify complex designs (fewer layers, smaller file size)
3. Check system resources (RAM, CPU usage)

## Updating

```batch
# Pull latest changes
git pull origin main

# Update dependencies
pip install -r requirements.txt --upgrade

# Restart service
```

## Uninstalling

```batch
# Stop service (Ctrl+C)
# Delete directory
rd /s /q parser-service
```

## Getting Help

- Check logs: `logs/parser.log`
- Review error codes in `README.md`
- Check `working/<job-id>/` for intermediate files
- Contact support with job ID and error logs

