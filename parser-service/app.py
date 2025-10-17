# parser-service/app.py
# Backward compatibility wrapper - now uses the new architecture in src/
# For new usage, prefer: python -m src.app

import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

# Import new API server (linter may show warning, but works at runtime)
try:
    from api_server import create_app  # type: ignore
except ImportError:
    # Fallback for development
    from src.api_server import create_app  # type: ignore

# Create Flask app using new architecture
app = create_app()

# Legacy compatibility: expose some old paths for existing integrations
import os
from datetime import datetime
from flask import jsonify

# Legacy config compatibility
AI_EXE = os.environ.get(
    "AI_EXE",
    r"C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe",
)
PARSER_SHARED_KEY = os.environ.get("PARSER_SHARED_KEY", "change-me-long-random")
PARSE_TIMEOUT_SEC = int(os.environ.get("PARSE_TIMEOUT_SEC", "480"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "150"))

# Legacy paths (kept for reference, not used by new code)
BASE = Path(__file__).parent
DIR_JOBS = BASE / "jobs"
DIR_INCOMING = DIR_JOBS / "incoming"
DIR_RESULTS = DIR_JOBS / "results"
DIR_FAILED = DIR_JOBS / "failed"

ALLOWED_ORIGINS = set(
    os.environ.get("ALLOWED_ORIGINS",
                   "http://localhost:5173,http://127.0.0.1:5173,https://revolve360.vercel.app"
                  ).split(",")
)
PUBLIC_ORIGIN = "*"

# Legacy helper - not used by new architecture
def _now():
    return datetime.utcnow().isoformat() + "Z"


if __name__ == "__main__":
    # Run new API server on port 5001
    print("=" * 60)
    print("Parser Service v2.0 - New Architecture")
    print("=" * 60)
    print("Starting API server...")
    print(f"Listening on http://0.0.0.0:5001")
    print("")
    print("For CLI usage, use: python -m src.app")
    print("For health check: python -m src.app health")
    print("=" * 60)
    app.run(host="0.0.0.0", port=5001, threaded=True)
