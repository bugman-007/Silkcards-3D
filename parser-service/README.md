# Parser Service

A Windows-friendly parser service that converts Adobe Illustrator `.ai` files into PDF/X with spot plates, then extracts per-finish masks (UV/FOIL/EMBOSS/DIE) and albedo composites.

## Features

- **Dual Detection Mode**: Supports both Case A (layer-based) and Case B (artboard-based) design workflows
- **Automatic Finish Detection**: Intelligently detects UV, FOIL, EMBOSS, and DIE finishes from layer/artboard names
- **Spot Color Plates**: Creates clean spot color separations via PDF/X-4
- **High-Quality Output**: 600 DPI masks with proper transparency
- **Deterministic**: Consistent output across multiple runs
- **Error Handling**: Comprehensive error taxonomy and diagnostic reporting

## Project Structure

```
parser-service/
├── jobs/
│   ├── incoming/      # Uploaded .ai files
│   ├── working/       # Temp files and intermediate plates
│   ├── results/       # Final PNG/SVG + report.json
│   └── failed/        # Failed jobs with logs
├── scripts/
│   ├── jsx/
│   │   ├── export_to_pdf.jsx   # Main export script (ES3)
│   │   ├── utils.jsx           # ES3 helper functions
│   │   └── test_open.jsx       # Health check script
│   └── runtime/
│       └── job.jsx             # Auto-generated job config
├── bin/
│   ├── gs/            # Ghostscript (optional local install)
│   └── pdftoolbox/    # callas pdfToolbox CLI (optional)
├── src/
│   ├── app.py         # Main orchestrator
│   ├── config.py      # Configuration
│   ├── report.py      # Report generation
│   ├── illustrator.py # Illustrator runner
│   ├── gs_runner.py   # Ghostscript plate extraction
│   ├── die_vector.py  # Optional die vector extraction
│   └── api_server.py  # Flask API server
├── logs/
│   └── parser.log
└── requirements.txt
```

## Requirements

### Software
- **Adobe Illustrator 2024+** (Windows)
- **Ghostscript 10.0+** (for plate extraction)
- **Python 3.9+**
- **pdfToolbox CLI** (optional, for vector die extraction)

### Python Dependencies
```bash
pip install -r requirements.txt
```

## Configuration

Configure via environment variables or edit `src/config.py`:

- `AI_EXE`: Path to Illustrator executable
- `GS_EXE`: Path to Ghostscript executable (auto-detected)
- `PLATE_DPI`: DPI for plate extraction (default: 600)
- `ILLUSTRATOR_TIMEOUT_SEC`: Timeout for Illustrator operations (default: 480s)
- `GHOSTSCRIPT_TIMEOUT_SEC`: Timeout for Ghostscript (default: 300s)

## Usage

### CLI Mode

```bash
# Health check
python -m src.app health

# Parse a single file
python -m src.app parse path/to/design.ai

# Parse with custom job ID
python -m src.app parse path/to/design.ai --job-id my-custom-id
```

### API Mode

```bash
# Start API server
python -m src.app api --host 0.0.0.0 --port 5001
```

API Endpoints:
- `POST /parse` - Upload and parse .ai file
- `GET /assets/<job_id>/<filename>` - Retrieve output assets
- `GET /ping` - Health ping
- `GET /health` - Comprehensive health check

### As Module

```python
from src.app import run_job, run_health_check

# Health check
run_health_check()

# Run job
result = run_job("path/to/design.ai")
print(result)
```

## Output Format

Results are saved to `jobs/results/<jobId>/`:

### Filenames
- `front_layer_0_albedo.png` - Front albedo composite
- `back_layer_0_albedo.png` - Back albedo composite
- `front_layer_0_uv.png` - UV mask (white=apply)
- `front_layer_0_foil.png` - FOIL mask
- `front_layer_0_emboss.png` - EMBOSS mask
- `front_layer_0_diecut_mask.png` - Die cut mask
- `front_layer_0_diecut.svg` - Die cut vector
- `report.json` - Job report with metadata

### Report Schema

```json
{
  "jobId": "uuid",
  "illustrator": {
    "version": "29.0",
    "pdf_preset": "PDF/X-4",
    "doc_color": "CMYK"
  },
  "artboards": [
    {"name": "FRONT", "index": 0, "bounds": [0, 0, 612, 792]}
  ],
  "sides": [
    {
      "side": "front",
      "index": 0,
      "finishes": ["albedo", "foil", "uv"],
      "die": true
    }
  ],
  "plates_detected": ["Cyan", "Magenta", "Yellow", "Black", "UV", "FOIL"],
  "outputs": {
    "front_layer_0_albedo": "front_layer_0_albedo.png",
    "front_layer_0_foil": "front_layer_0_foil.png",
    "front_layer_0_uv": "front_layer_0_uv.png"
  },
  "diagnostics": [
    {"level": "info", "code": "PLATE_DPI", "detail": "600"}
  ]
}
```

## Detection Logic

### Finish Tokens (case-insensitive, contains match)

- **FOIL**: `foil`, `metal`, `metallic`
- **UV**: `uv`, `spot_uv`, `varnish`, `gloss`
- **EMBOSS**: `emboss`, `deboss`, `height`
- **DIE**: `die`, `diecut`, `die_cut`

### Detection Strategy

The service uses a **union** of two signals:

1. **Case A (Layer Names)**: Detects finishes from layer/sublayer names
2. **Case B (Artboard Names)**: If an artboard name contains a finish token, all content on it is for that finish

Items are assigned to sides (front/back) based on geometric overlap with artboard bounds.

## Error Codes

- `AI_OPEN_FAILED` - Failed to open .ai file
- `PDF_SAVE_FAILED` - Failed to save PDF/X
- `GHOSTSCRIPT_FAILED` - Ghostscript plate extraction failed
- `MISSING_PLATE_UV/FOIL/EMBOSS/DIE` - Expected plate not found
- `TIMEOUT_ILLUSTRATOR` - Illustrator operation timed out
- `TIMEOUT_GS` - Ghostscript operation timed out
- `DIE_SVG_MISMATCH` - Die SVG bounds don't align with mask

## Development

### Running Tests

```bash
# TODO: Add test suite
pytest tests/
```

### Debugging

Set logging level in `src/config.py` or via environment:

```bash
export LOG_LEVEL=DEBUG
python -m src.app parse design.ai
```

Logs are written to `logs/parser.log`.

## Troubleshooting

### Illustrator Won't Start
- Verify `AI_EXE` path in config
- Check Illustrator license is active
- Try killing existing Illustrator processes

### Plates Not Detected
- Verify layer/artboard names contain finish tokens
- Check `working/<jobId>_scratch.json` for detection results
- Ensure spot colors were created in PDF/X

### Timeout Errors
- Increase timeout values in config
- Check system resources (RAM, CPU)
- Simplify complex designs

## License

Proprietary - Silkcards 3D Project

