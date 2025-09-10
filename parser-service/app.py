from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
from pathlib import Path
import uuid

APP_ROOT = Path(r"C:\parser_service")
INCOMING = APP_ROOT / "jobs" / "incoming"
RESULTS  = APP_ROOT / "jobs" / "results"
INCOMING.mkdir(parents=True, exist_ok=True)
RESULTS.mkdir(parents=True, exist_ok=True)

app = FastAPI()

@app.get("/ping")
def ping():
    return JSONResponse({"pong": True})

@app.post("/parse")
async def parse(file: UploadFile = File(...)):
    # Make a unique job id and safe destination path
    job_id = str(uuid.uuid4())
    safe_name = "".join(ch for ch in file.filename if ch.isalnum() or ch in (".","_","-")).strip(".")
    if not safe_name:
        safe_name = f"file_{job_id}.ai"
    dest = INCOMING / f"{job_id}__{safe_name}"

    # Stream-save the upload to disk
    with dest.open("wb") as out:
        chunk = await file.read(1024 * 1024)
        while chunk:
            out.write(chunk)
            chunk = await file.read(1024 * 1024)

    size = dest.stat().st_size

    # For Step 4 MVP we just acknowledge; Step 5 will invoke Illustrator
    return {
        "status": "queued",
        "job_id": job_id,
        "filename": safe_name,
        "size_bytes": size,
        "incoming_path": str(dest)
    }
