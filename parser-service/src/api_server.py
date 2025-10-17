"""
Flask API server for parser-service.
Provides HTTP endpoints for job submission and asset retrieval.
"""

import os
import uuid
import shutil
import threading
import mimetypes
from datetime import datetime
from pathlib import Path
from flask import Flask, request, jsonify, send_file, make_response
from werkzeug.utils import safe_join

import config
from app import run_job, run_health_check

# Single-flight lock for MVP
JOB_LOCK = threading.Lock()


def create_app():
    """Create and configure Flask app."""
    app = Flask(__name__)
    
    # CORS configuration
    ALLOWED_ORIGINS = set(
        os.environ.get(
            "ALLOWED_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173"
        ).split(",")
    )
    
    @app.after_request
    def add_cors_headers(response):
        """Add CORS headers to responses."""
        origin = request.headers.get("Origin", "")
        if origin in ALLOWED_ORIGINS:
            response.headers["Access-Control-Allow-Origin"] = origin
        else:
            response.headers["Access-Control-Allow-Origin"] = "*"
        
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*,x-requested-with,x-key,authorization"
        response.headers["Vary"] = "Origin"
        
        return response
    
    @app.route("/ping", methods=["GET"])
    def ping():
        """Health ping endpoint."""
        return jsonify({
            "ok": True,
            "ts": datetime.utcnow().isoformat() + "Z"
        })
    
    @app.route("/health", methods=["GET"])
    def health():
        """Comprehensive health check."""
        try:
            success = run_health_check()
            return jsonify({"ok": success}), 200 if success else 503
        except Exception as e:
            return jsonify({"ok": False, "error": str(e)}), 503
    
    @app.route("/parse", methods=["POST", "OPTIONS"])
    def parse():
        """Parse .ai file endpoint."""
        if request.method == "OPTIONS":
            return "", 204
        
        # Auth
        key = request.headers.get("X-KEY") or request.headers.get("Authorization") or ""
        if key.strip() != config.PARSER_SHARED_KEY:
            return jsonify({"error": "unauthorized"}), 401
        
        # File validation
        if "file" not in request.files:
            return jsonify({"error": "missing file"}), 400
        
        file = request.files["file"]
        if not file.filename.lower().endswith(".ai"):
            return jsonify({"error": "only .ai files allowed"}), 400
        
        # Check file size
        if request.content_length and request.content_length > config.MAX_UPLOAD_MB * 1024 * 1024:
            return jsonify({"error": f"file too large (>{config.MAX_UPLOAD_MB}MB)"}), 413
        
        # Single-flight lock (MVP safety)
        if not JOB_LOCK.acquire(blocking=False):
            return jsonify({"error": "busy"}), 409
        
        job_id = str(uuid.uuid4())
        incoming_path = None
        
        try:
            # Save upload
            safe_filename = _sanitize_filename(file.filename)
            incoming_name = f"{job_id}__{safe_filename}"
            incoming_path = config.JOBS_INCOMING / incoming_name
            
            file.save(str(incoming_path))
            
            # Run job
            result = run_job(str(incoming_path), job_id)
            
            # Load and return report.json
            report_path = config.JOBS_RESULTS / job_id / "report.json"
            if report_path.exists():
                with open(report_path, 'r', encoding='utf-8') as f:
                    report_data = f.read()
                
                return app.response_class(report_data, mimetype="application/json")
            else:
                return jsonify(result)
        
        except Exception as e:
            # Move to failed
            if incoming_path and incoming_path.exists():
                failed_path = config.JOBS_FAILED / incoming_name
                try:
                    shutil.move(str(incoming_path), str(failed_path))
                except Exception:
                    pass
            
            return jsonify({
                "error": True,
                "message": str(e),
                "job_id": job_id
            }), 500
        
        finally:
            JOB_LOCK.release()
            
            # Cleanup incoming file
            if incoming_path and incoming_path.exists():
                try:
                    incoming_path.unlink()
                except Exception:
                    pass
    
    @app.route("/assets/<job_id>/<path:filename>", methods=["GET", "OPTIONS"])
    def get_asset(job_id, filename):
        """Public asset retrieval endpoint."""
        if request.method == "OPTIONS":
            return "", 204
        
        asset_path = config.JOBS_RESULTS / job_id / filename
        
        if not asset_path.exists():
            return jsonify({"error": "not_found"}), 404
        
        # Restrict to images and vectors
        if not (filename.lower().endswith((".png", ".svg", ".json"))):
            return jsonify({"error": "forbidden"}), 403
        
        return _send_asset(asset_path)
    
    @app.route("/internal/assets/<job_id>/<path:filename>", methods=["GET"])
    def get_internal_asset(job_id, filename):
        """Internal asset retrieval (requires auth)."""
        # Auth
        key = request.headers.get("X-KEY") or ""
        if key.strip() != config.PARSER_SHARED_KEY:
            return jsonify({"error": "unauthorized"}), 401
        
        asset_path = config.JOBS_RESULTS / job_id / filename
        
        if not asset_path.exists():
            return jsonify({"error": "not_found"}), 404
        
        return _send_asset(asset_path)
    
    def _send_asset(asset_path: Path):
        """Send asset file with proper headers."""
        ctype = mimetypes.guess_type(str(asset_path))[0] or "application/octet-stream"
        
        resp = make_response(send_file(str(asset_path), mimetype=ctype, conditional=True))
        
        # Cache headers
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        resp.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        resp.headers["Timing-Allow-Origin"] = "*"
        
        # ETag
        stat = asset_path.stat()
        resp.headers["ETag"] = f'W/"{stat.st_size:x}-{int(stat.st_mtime)}"'
        resp.headers["Last-Modified"] = datetime.utcfromtimestamp(stat.st_mtime).strftime(
            "%a, %d %b %Y %H:%M:%S GMT"
        )
        
        return resp
    
    def _sanitize_filename(filename: str) -> str:
        """Sanitize uploaded filename."""
        keep = "-_.() "
        out = []
        for ch in filename:
            if ch.isalnum() or ch in keep:
                out.append(ch)
            else:
                out.append("_")
        return "".join(out).strip() or "upload.ai"
    
    return app


if __name__ == "__main__":
    app = create_app()
    app.run(host=config.API_HOST, port=config.API_PORT, threaded=True)

