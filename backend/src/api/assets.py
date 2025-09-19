# src/api/assets.py
import os, httpx
from fastapi import APIRouter, HTTPException, Response, Request

router = APIRouter()

WINDOWS_PARSER_URL = os.environ.get("WINDOWS_PARSER_URL", "").rstrip("/")
PARSER_SHARED_KEY = os.environ.get("PARSER_SHARED_KEY", "").strip()
FRONTEND_ORIGIN = os.environ.get("FRONTEND_ORIGIN", "").rstrip("/")

TIMEOUT = httpx.Timeout(connect=5.0, read=60.0, write=60.0, pool=5.0)


@router.get("/proofs/{job_id}/{path:path}")
async def proofs(job_id: str, path: str, request: Request):
    if not WINDOWS_PARSER_URL:
        raise HTTPException(status_code=500, detail="WINDOWS_PARSER_URL not set")

    url = f"{WINDOWS_PARSER_URL}/internal/assets/{job_id}/{path}"
    fwd_headers = {"X-KEY": PARSER_SHARED_KEY}
    # pass Range for partial content
    rng = request.headers.get("range")
    if rng:
        fwd_headers["Range"] = rng

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        r = await client.get(url, headers=fwd_headers)

    if r.status_code not in (200, 206):
        raise HTTPException(status_code=r.status_code, detail=r.text)

    resp = Response(content=r.content, status_code=r.status_code)
    # Pass-through important headers
    origin = request.headers.get("origin", "")
    if FRONTEND_ORIGIN:
        resp.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
    else:
        # permissive fallback for images in dev
        resp.headers["Access-Control-Allow-Origin"] = origin or "*"

    resp.headers["Access-Control-Allow-Methods"] = "GET, OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "*,x-requested-with,range"
    resp.headers["Vary"] = "Origin"
    for h in (
        "content-type",
        "cache-control",
        "content-length",
        "last-modified",
        "etag",
        "accept-ranges",
        "content-range",
    ):
        v = r.headers.get(h)
        if not v:
            continue
        if h == "etag":
            resp.headers["ETag"] = v
        else:
            resp.headers[h] = v

    if FRONTEND_ORIGIN:
        resp.headers["Access-Control-Allow-Origin"] = FRONTEND_ORIGIN
    return resp
