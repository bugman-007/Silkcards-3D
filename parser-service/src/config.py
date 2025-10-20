"""
Configuration module for parser-service.
Contains all static settings for DPI, tokens, timeouts, and folder paths.
"""

import os
from pathlib import Path

# ============================================================================
# Base Paths
# ============================================================================

# Project root (parser-service directory)
BASE_DIR = Path(__file__).parent.parent.resolve()

# Directory structure
JOBS_DIR = BASE_DIR / "jobs"
JOBS_INCOMING = JOBS_DIR / "incoming"
JOBS_WORKING = JOBS_DIR / "working"
JOBS_RESULTS = JOBS_DIR / "results"
JOBS_FAILED = JOBS_DIR / "failed"

SCRIPTS_DIR = BASE_DIR / "scripts"
SCRIPTS_JSX = SCRIPTS_DIR / "jsx"
SCRIPTS_RUNTIME = SCRIPTS_DIR / "runtime"

BIN_DIR = BASE_DIR / "bin"
BIN_GS = BIN_DIR / "gs"
BIN_PDFTOOLBOX = BIN_DIR / "pdftoolbox"

LOGS_DIR = BASE_DIR / "logs"
LOG_FILE = LOGS_DIR / "parser.log"

# ============================================================================
# Illustrator Settings
# ============================================================================

# Illustrator executable path (can be overridden by environment variable)
ILLUSTRATOR_EXE = os.environ.get(
    "AI_EXE",
    r"C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe"
)

# JSX Scripts
JSX_EXPORT_TO_PDF = SCRIPTS_JSX / "export_to_pdf.jsx"
JSX_UTILS = SCRIPTS_JSX / "utils.jsx"
JSX_TEST_OPEN = SCRIPTS_JSX / "test_open.jsx"
JSX_RUNTIME_JOB = SCRIPTS_RUNTIME / "job.jsx"

# Timeouts (seconds)
ILLUSTRATOR_TIMEOUT = int(os.environ.get("ILLUSTRATOR_TIMEOUT_SEC", "480"))  # 8 minutes
ILLUSTRATOR_STARTUP_TIMEOUT = 60

# ============================================================================
# Ghostscript Settings
# ============================================================================

# Ghostscript executable (will search in bin/gs or PATH)
GHOSTSCRIPT_EXE = os.environ.get("GS_EXE", "gswin64c.exe")

# DPI for plate extraction
PLATE_DPI = int(os.environ.get("PLATE_DPI", "600"))

# Ghostscript device (tiffsep or tiffsep1)
GS_DEVICE = "tiffsep"

# Ghostscript timeout (seconds)
GHOSTSCRIPT_TIMEOUT = int(os.environ.get("GHOSTSCRIPT_TIMEOUT_SEC", "300"))  # 5 minutes

# ============================================================================
# Finish Detection Tokens
# ============================================================================

# Token lists for finish detection (case-insensitive, suffix-tolerant "contains")
TOKENS = {
    "FOIL": ["foil", "metal", "metallic"],
    "UV": ["uv", "spot_uv", "varnish", "gloss"],
    "EMBOSS": ["emboss", "deboss", "height"],
    "DIE": ["die", "diecut", "die_cut"],
}

# Spot color names for PDF/X export
SPOT_COLORS = {
    "UV": "UV",
    "FOIL": "FOIL",
    "EMBOSS": "EMBOSS",
    "DIE": "DIE",
}

# ============================================================================
# Output Naming Convention
# ============================================================================

# Naming template: {side}_layer_{index}_{finish}.{ext}
# Examples: front_layer_0_albedo.png, back_layer_0_foil.png

OUTPUT_FORMATS = {
    "albedo": "png",
    "uv": "png",
    "foil": "png",
    "emboss": "png",
    "diecut_mask": "png",
    "diecut_svg": "svg",
}

# ============================================================================
# PDF/X Export Settings
# ============================================================================

PDF_PRESET = "PDF/X-4"  # or "PDF/X-1a:2001"
PDF_COLOR_MODE = "CMYK"  # or "RGB"

# ============================================================================
# Plate-to-Output Mapping
# ============================================================================

# Maps Ghostscript plate filenames to finish types
PLATE_MAPPING = {
    "(UV)": "uv",
    "(FOIL)": "foil",
    "(EMBOSS)": "emboss",
    "(DIE)": "diecut_mask",
}

# Process color plates (CMYK) - used for albedo composite
PROCESS_PLATES = ["(Cyan)", "(Magenta)", "(Yellow)", "(Black)"]

# ============================================================================
# Validation & Quality Checks
# ============================================================================

# Minimum non-transparent pixels for a valid mask
MIN_MASK_PIXELS = 10

# Maximum tolerance for die SVG vs mask alignment (pixels at PLATE_DPI)
DIE_ALIGNMENT_TOLERANCE_PX = 2

# Luminance thresholds for plate validation (0-255)
MIN_LUMINANCE = 5
MAX_LUMINANCE = 250

# ============================================================================
# Error Codes
# ============================================================================

ERROR_CODES = {
    "AI_OPEN_FAILED": "Failed to open .ai file in Illustrator",
    "PDF_SAVE_FAILED": "Failed to save PDF/X file",
    "GHOSTSCRIPT_FAILED": "Ghostscript plate extraction failed",
    "MISSING_PLATE_UV": "UV plate expected but not found",
    "MISSING_PLATE_FOIL": "FOIL plate expected but not found",
    "MISSING_PLATE_EMBOSS": "EMBOSS plate expected but not found",
    "MISSING_PLATE_DIE": "DIE plate expected but not found",
    "EMPTY_OUTPUT": "Output file generated but is empty",
    "TIMEOUT_ILLUSTRATOR": "Illustrator operation timed out",
    "TIMEOUT_GS": "Ghostscript operation timed out",
    "DIE_SVG_MISMATCH": "Die SVG bounds do not align with mask",
    "INVALID_ARTBOARD": "No valid artboards found in document",
    "INVALID_INPUT": "Invalid input file or format",
}

# ============================================================================
# API Settings (if Flask mode)
# ============================================================================

API_HOST = os.environ.get("API_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("API_PORT", "5001"))
PARSER_SHARED_KEY = os.environ.get("PARSER_SHARED_KEY", "change-me-long-random")
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "150"))

# ============================================================================
# Utility Functions
# ============================================================================

def ensure_directories():
    """Create all required directories if they don't exist."""
    dirs = [
        JOBS_INCOMING,
        JOBS_WORKING,
        JOBS_RESULTS,
        JOBS_FAILED,
        SCRIPTS_RUNTIME,
        LOGS_DIR,
    ]
    for d in dirs:
        d.mkdir(parents=True, exist_ok=True)


def get_ghostscript_path():
    """
    Locate Ghostscript executable.
    First checks bin/gs/, then PATH.
    """
    # Check local bin directory
    local_gs = BIN_GS / GHOSTSCRIPT_EXE
    if local_gs.exists():
        return str(local_gs)
    
    # Check if on PATH
    import shutil
    gs_path = shutil.which(GHOSTSCRIPT_EXE)
    if gs_path:
        return gs_path
    
    # Not found
    raise FileNotFoundError(
        f"Ghostscript not found. Please install Ghostscript and add to PATH, "
        f"or place {GHOSTSCRIPT_EXE} in {BIN_GS}"
    )


def get_pdftoolbox_path():
    """
    Locate callas pdfToolbox CLI (optional).
    Returns None if not found.
    """
    # Check local bin directory
    pdftoolbox_exe = "pdfToolbox.exe"  # or "pdfToolboxCLI.exe"
    local_pt = BIN_PDFTOOLBOX / pdftoolbox_exe
    if local_pt.exists():
        return str(local_pt)
    
    # Check if on PATH
    import shutil
    pt_path = shutil.which(pdftoolbox_exe)
    if pt_path:
        return pt_path
    
    return None


def detect_finish_from_name(name):
    """
    Detect finish type from layer/artboard name.
    Returns finish type or None.
    
    Args:
        name (str): Layer or artboard name
        
    Returns:
        str or None: Finish type (UV, FOIL, EMBOSS, DIE) or None
    """
    if not name:
        return None
    
    name_lower = name.lower()
    
    for finish_type, tokens in TOKENS.items():
        for token in tokens:
            if token in name_lower:
                return finish_type
    
    return None


def get_output_filename(side, layer_index, finish, extension=None):
    """
    Generate output filename based on convention.
    
    Args:
        side (str): "front" or "back"
        layer_index (int): Layer index (usually 0)
        finish (str): Finish type (albedo, uv, foil, emboss, diecut_mask, diecut_svg, die)
        extension (str, optional): File extension (auto-detected if None)
        
    Returns:
        str: Filename (e.g., "front_layer_0_albedo.png")
    """
    # Normalize finish name: "die" → "diecut_mask", "diecut_svg" stays as-is
    finish_normalized = finish
    if finish.lower() in ["die", "diecut"]:
        finish_normalized = "diecut_mask"
    
    if extension is None:
        extension = OUTPUT_FORMATS.get(finish_normalized, "png")
    
    return f"{side}_layer_{layer_index}_{finish_normalized}.{extension}"

