# Parser Service v2.0 - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Step 1: Install Dependencies

```batch
# Install Python packages
pip install -r requirements.txt
```

### Step 2: Configure Environment

```batch
# Copy example environment file
copy .env.example .env

# Edit with your paths
notepad .env
```

**Required settings:**
```env
AI_EXE=C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe
PARSER_SHARED_KEY=your-secret-key-here
```

### Step 3: Verify Setup

```batch
# Run setup check
python scripts/setup_check.py

# Run health check
python -m src.app health
```

### Step 4: Start Using

#### Option A: API Server
```batch
# Start server
python app.py

# Upload file via API
curl -X POST http://localhost:5001/parse \
  -H "X-KEY: your-secret-key-here" \
  -F "file=@design.ai"
```

#### Option B: CLI
```batch
# Parse single file
python -m src.app parse design.ai
```

---

## 📁 Output Location

Results are saved to: `jobs/results/<job-id>/`

Example output:
```
jobs/results/abc123-def456/
├── front_layer_0_albedo.png       # Front composite
├── front_layer_0_uv.png           # UV mask
├── front_layer_0_foil.png         # FOIL mask
├── front_layer_0_diecut_mask.png  # Die mask
├── front_layer_0_diecut.svg       # Die vector
└── report.json                     # Job metadata
```

---

## 🎨 Design Requirements

### Layer Names (Case A)
Create layers with these names to trigger detection:
- `UV` or `spot_uv` → UV finish
- `FOIL` or `metal` → Foil finish
- `EMBOSS` or `deboss` → Emboss finish
- `DIE` or `diecut` → Die cut

### Artboard Names (Case B)
Name artboards to assign all content to a finish:
- `Front UV` → All content is UV
- `FOIL` → All content is foil
- `Emboss` → All content is emboss

---

## 🔧 Common Commands

```batch
# Health check
python -m src.app health

# Parse file
python -m src.app parse design.ai

# Start API server
python app.py

# Setup verification
python scripts/setup_check.py
```

---

## 🆘 Quick Troubleshooting

| Problem | Solution |
|---------|----------|
| Illustrator not found | Set `AI_EXE` in `.env` |
| Ghostscript error | Install from ghostscript.com or add to PATH |
| Timeout | Increase timeouts in `.env` |
| No plates detected | Check layer names contain tokens (uv, foil, etc.) |

---

## 📚 Full Documentation

- **Setup Guide**: See `SETUP.md`
- **API Reference**: See `README.md`
- **Implementation Details**: See `IMPLEMENTATION_SUMMARY.md`

---

## 🎯 What This Service Does

1. **Opens** your .ai file in Illustrator
2. **Detects** finishes from layer/artboard names
3. **Creates** spot color plates in PDF/X
4. **Extracts** masks via Ghostscript
5. **Exports** albedo composites and die vectors
6. **Generates** report.json with metadata

**Input**: design.ai  
**Output**: albedo.png + uv.png + foil.png + emboss.png + die.png + die.svg + report.json

---

Ready to parse your first file! 🎉

