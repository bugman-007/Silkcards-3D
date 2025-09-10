import os
from fastapi import HTTPException, UploadFile
import httpx

WINDOWS_PARSER_URL = os.environ.get("WINDOWS_PARSER_URL", "").rstrip("/")
if not WINDOWS_PARSER_URL:
    raise RuntimeError("WINDOWS_PARSER_URL not set")

PARSER_SHARED_KEY = os.environ.get("PARSER_SHARED_KEY", "").strip()

_TIMEOUT = httpx.Timeout(connect=5.0, read=300.0, write=300.0, pool=5.0)

async def forward_to_windows(file: UploadFile) -> dict:
    parse_url = f"{WINDOWS_PARSER_URL}/parse"
    await file.seek(0)
    files = {"file": (file.filename, file.file, "application/octet-stream")}
    headers = {}
    if PARSER_SHARED_KEY:
        headers["X-KEY"] = PARSER_SHARED_KEY

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(parse_url, files=files, headers=headers)

    # Bubble Windows-side structured errors if present
    try:
        data = resp.json()
    except Exception:
        data = None

    if resp.status_code != 200:
        if isinstance(data, dict) and "error_code" in data:
            raise HTTPException(status_code=resp.status_code, detail=data)
        raise HTTPException(status_code=502, detail=f"Windows parser error: {resp.text}")

    if not isinstance(data, dict):
        raise HTTPException(status_code=502, detail="Invalid JSON from Windows parser")

    return data
