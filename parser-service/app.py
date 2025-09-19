# C:\parser_service\app.py
import os, uuid, json, time, shutil, threading, traceback, logging
import subprocess
import mimetypes
from datetime import datetime
from flask import Flask, request, jsonify, send_file, make_response
from werkzeug.utils import safe_join

# ---------------- Config (from environment or sane defaults) ----------------
AI_EXE = os.environ.get(
    "AI_EXE",
    r"C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe",
)
PARSER_SHARED_KEY = os.environ.get("PARSER_SHARED_KEY", "change-me-long-random")
PARSE_TIMEOUT_SEC = int(os.environ.get("PARSE_TIMEOUT_SEC", "300"))
MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "150"))

BASE = r"C:\parser_service"
DIR_SCRIPTS = os.path.join(BASE, "scripts")
DIR_RUNTIME = os.path.join(DIR_SCRIPTS, "runtime")
DIR_JOBS = os.path.join(BASE, "jobs")
DIR_INCOMING = os.path.join(DIR_JOBS, "incoming")
DIR_PROCESSED = os.path.join(DIR_JOBS, "processed")
DIR_RESULTS = os.path.join(DIR_JOBS, "results")
DIR_FAILED = os.path.join(DIR_JOBS, "failed")
RUN_WRAPPER = os.path.join(DIR_SCRIPTS, "run_job.jsx")
RUNTIME_JOB_JSX = os.path.join(DIR_RUNTIME, "job.jsx")

ASSETS_BASE = os.path.join(DIR_RESULTS, "assets")
# add near the top
ALLOWED_ORIGINS = set(
    os.environ.get("ALLOWED_ORIGINS",
                   "http://localhost:5173,http://127.0.0.1:5173,https://revolve360.vercel.app"
                  ).split(",")
)
PUBLIC_ORIGIN = "*"

def _asset_response(full_path):
    ctype = mimetypes.guess_type(full_path)[0] or "application/octet-stream"
    resp = make_response(send_file(full_path, mimetype=ctype, conditional=True))
    # allow current origin if whitelisted, else be permissive for images
    origin = request.headers.get("Origin") or ""
    resp.headers["Access-Control-Allow-Origin"] = origin if origin in ALLOWED_ORIGINS else "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*,x-requested-with"
    resp.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
    resp.headers["Timing-Allow-Origin"] = "*"
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    st = os.stat(full_path)
    resp.headers["ETag"] = f'W/"{st.st_size:x}-{int(st.st_mtime)}"'
    resp.headers["Last-Modified"] = datetime.utcfromtimestamp(st.st_mtime).strftime("%a, %d %b %Y %H:%M:%S GMT")
    resp.headers["Vary"] = "Origin"
    return resp


# ---------------- Ensure directories exist ----------------
for d in [DIR_RUNTIME, DIR_INCOMING, DIR_PROCESSED, DIR_RESULTS, DIR_FAILED]:
    if not os.path.exists(d):
        os.makedirs(d)

# ---------------- Logging ----------------
LOG_DIR = os.path.join(BASE, "logs")
if not os.path.exists(LOG_DIR):
    os.makedirs(LOG_DIR)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(os.path.join(LOG_DIR, "parser.log"), encoding="utf-8"),
        logging.StreamHandler(),
    ],
)
log = logging.getLogger("parser")

# ---------------- App & single-flight lock ----------------
app = Flask(__name__)
JOB_LOCK = threading.Lock()


# ---------------- Helpers ----------------
def _kill_illustrator():
    # Best-effort kill; avoids sticky process state
    try:
        os.system(
            'powershell -NoProfile -Command "Get-Process -Name Illustrator -ErrorAction SilentlyContinue | Stop-Process -Force"'
        )
    except Exception:
        pass


def _sanitize_name(name: str) -> str:
    keep = "-_.() "
    out = []
    for ch in name:
        if ch.isalnum() or ch in keep:
            out.append(ch)
        else:
            out.append("_")
    s = "".join(out).strip()
    return s or "upload.ai"


def _write_runtime_job_jsx(input_path: str, output_path: str, job_id: str):
    """
    Writes scripts/runtime/job.jsx with a JS object __JOB that export.jsx will read.
    """

    # double-escape backslashes for ExtendScript strings
    def esc(p):
        return p.replace("\\", "\\\\")

    content = (
        "var __JOB = {\n"
        '  input:  "' + esc(input_path) + '",\n'
        '  output: "' + esc(output_path) + '",\n'
        '  job_id: "' + job_id + '"\n'
        "};\n"
    )
    with open(RUNTIME_JOB_JSX, "w", encoding="ascii", newline="\n") as f:
        f.write(content)


def _wait_for_file(path: str, timeout_sec: int) -> bool:
    t0 = time.time()
    while time.time() - t0 < timeout_sec:
        if os.path.exists(path) and os.path.getsize(path) > 0:
            return True
        time.sleep(0.5)
    return False


def _now():
    return datetime.utcnow().isoformat() + "Z"


# ---------------- Routes ----------------

@app.route("/assets/<job_id>/<path:filename>", methods=["GET", "OPTIONS"])
def public_get_asset(job_id, filename):
    if request.method == "OPTIONS":
        return _asset_response(os.path.join(ASSETS_BASE, job_id, filename))  # headers only
    folder = os.path.join(ASSETS_BASE, job_id)
    full = safe_join(folder, filename)
    if not full or not os.path.exists(full):
        return jsonify({"error": "not_found"}), 404
    # optional: restrict to image/vector types
    if not (filename.lower().endswith(".png") or filename.lower().endswith(".svg")):
        return jsonify({"error": "forbidden"}), 403
    return _asset_response(full)

@app.get("/internal/assets/<job_id>/<path:filename>")
def internal_get_asset(job_id, filename):
    # Only backend may call this; enforce shared key + SG allowlist (backend egress IP)
    key = request.headers.get("X-KEY") or ""
    if key.strip() != PARSER_SHARED_KEY:
        return jsonify({"error": "unauthorized"}), 401

    folder = os.path.join(ASSETS_BASE, job_id)
    full = safe_join(folder, filename)
    if not full or not os.path.exists(full):
        return jsonify({"error": "not_found"}), 404

    # Correct content-type
    ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
    resp = make_response(send_file(full, mimetype=ctype, conditional=True))
    # CORS optional here (not public), but harmless:
    resp.headers["Access-Control-Allow-Origin"] = PUBLIC_ORIGIN
    # Immutable cache (job assets never change)
    resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    st = os.stat(full)
    resp.headers["ETag"] = f'W/"{st.st_size:x}-{int(st.st_mtime)}"'
    resp.headers["Last-Modified"] = datetime.utcfromtimestamp(st.st_mtime).strftime(
        "%a, %d %b %Y %H:%M:%S GMT"
    )
    resp.headers["Accept-Ranges"] = "bytes"
    return resp


@app.get("/ping")
def ping():
    return jsonify({"ok": True, "ts": _now()})


@app.post("/parse")
def parse():
    # Auth
    key = request.headers.get("X-KEY") or request.headers.get("Authorization") or ""
    if key.strip() != PARSER_SHARED_KEY:
        return jsonify({"error": "unauthorized"}), 401

    # File
    if "file" not in request.files:
        return jsonify({"error": "missing file"}), 400
    f = request.files["file"]
    if not f.filename.lower().endswith(".ai"):
        return jsonify({"error": "only .ai allowed"}), 400
    if request.content_length and request.content_length > MAX_UPLOAD_MB * 1024 * 1024:
        return jsonify({"error": f"file too large (>{MAX_UPLOAD_MB}MB)"}), 413

    # Single-flight (MVP safety)
    if not JOB_LOCK.acquire(blocking=False):
        return jsonify({"error": "busy"}), 409

    job_id = str(uuid.uuid4())
    safe_name = _sanitize_name(f.filename)
    inc_name = f"{job_id}__{safe_name}"
    incoming_path = os.path.join(DIR_INCOMING, inc_name)
    result_path = os.path.join(DIR_RESULTS, f"{job_id}.json")

    try:
        # Save upload atomically
        tmp = incoming_path + ".tmp"
        f.save(tmp)
        os.replace(tmp, incoming_path)
        log.info(f"[{job_id}] saved -> {incoming_path}")

        # Prepare runtime job config (read by export.jsx via run_job.jsx include)
        _write_runtime_job_jsx(incoming_path, result_path, job_id)
        log.info(f"[{job_id}] wrote runtime job.jsx")

        # Clean any previous Illustrator instance (avoid sticky state)
        _kill_illustrator()

        # Verify files before launch (fail fast with a clear log)
        if not os.path.exists(RUN_WRAPPER):
            raise RuntimeError(f"run_job.jsx not found: {RUN_WRAPPER}")
        if not os.path.exists(incoming_path):
            raise RuntimeError(f"input.ai missing: {incoming_path}")

        # Launch Illustrator directly; no PowerShell, no shell quoting issues
        try:
            proc = subprocess.Popen(
                [AI_EXE, RUN_WRAPPER],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=False,
            )
            log.info(f"[{job_id}] Illustrator started (pid={proc.pid})")
        except FileNotFoundError as e:
            raise RuntimeError(f"Illustrator exe not found: {AI_EXE}") from e

        # Now wait for the exporter to write the result file
        if not _wait_for_file(result_path, PARSE_TIMEOUT_SEC):
            raise RuntimeError("timeout waiting for result.json")
        # Note: Illustrator is GUI app; return code here is not reliable. We rely on result file presence.

        # Read and return JSON
        with open(result_path, "r", encoding="utf-8") as jf:
            data = jf.read()
        try:
            m = json.loads(data)
            rel_base = m.get("assets_rel_base", "").replace("/", os.sep)
            needed = []

            def add_maps(side_key):
                cards = m.get("maps", {}).get(side_key + "_cards", [])
                for c in cards:
                    maps = (c or {}).get("maps", {}) or {}
                    for k in ("albedo", "uv", "foil", "emboss", "die_png"):
                        if maps.get(k):
                            needed.append(maps[k])
                # v2 fallback if no cards
                v2 = m.get("maps", {}).get(side_key, {})
                if v2:
                    for k in ("albedo", "uv", "foil", "emboss"):
                        if v2.get(k):
                            needed.append(v2[k])

            add_maps("front")
            add_maps("back")

            # normalize and check on disk
            missing = []
            for rel in needed:
                rel = str(rel).replace("/", os.sep)
                # strip leading "assets/<jobId>/" if present
                rel = rel.split("assets" + os.sep + job_id + os.sep)[-1]
                full = os.path.join(ASSETS_BASE, job_id, rel)
                if not os.path.exists(full) or os.path.getsize(full) == 0:
                    missing.append(full)

            if missing:
                log.error(f"[{job_id}] missing assets: {missing}")
                raise RuntimeError("export produced JSON but textures missing on disk")

        except Exception as _e:
            # Bubble as server error; caller will retry / you can inspect logs
            raise
        log.info(f"[{job_id}] success -> {result_path} ({len(data)} bytes)")
        return app.response_class(data, mimetype="application/json")

    except Exception as e:
        log.error(f"[{job_id}] ERROR: {e}\n{traceback.format_exc()}")
        # Move to failed for inspection
        try:
            fail_to = os.path.join(DIR_FAILED, inc_name)
            if os.path.exists(incoming_path):
                shutil.move(incoming_path, fail_to)
        except Exception:
            pass
        return jsonify({"error": True, "message": str(e), "job_id": job_id}), 500

    finally:
        JOB_LOCK.release()
        # Optional: move to processed for audit
        try:
            if os.path.exists(incoming_path):
                shutil.move(incoming_path, os.path.join(DIR_PROCESSED, inc_name))
        except Exception:
            pass
        # Best-effort: do not accumulate runtime/job.jsx
        try:
            if os.path.exists(RUNTIME_JOB_JSX):
                os.remove(RUNTIME_JOB_JSX)
        except Exception:
            pass


if __name__ == "__main__":
    # Run Flask on a high, non-conflicting port (MVP)
    app.run(host="0.0.0.0", port=5001, threaded=True)
