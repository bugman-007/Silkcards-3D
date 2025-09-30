# app/api/upload.py
import os
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from app.services.windows_client import forward_to_windows

router = APIRouter()

PUBLIC_BACKEND_ORIGIN = os.environ.get("PUBLIC_BACKEND_ORIGIN", "").rstrip("/")


def absolutize_manifest(m: dict) -> dict:
    job_id = m.get("job_id") or ""
    if not job_id or not PUBLIC_BACKEND_ORIGIN:
        return m

    base = f"{PUBLIC_BACKEND_ORIGIN}/proofs/{job_id}/"

    # FIX: v3 per-card maps - CORRECTED PATH (top-level front_cards/back_cards)
    for side in ("front_cards", "back_cards"):
        arr = m.get(side, [])
        for card in arr or []:
            if not card:
                continue
            maps = card.get("maps", {}) or {}
            for key, rel in list(maps.items()):
                if not rel:
                    continue
                # ROBUST FIX: Better filename extraction
                rel_str = str(rel)
                # Handle both forward and backward slashes
                rel_str = rel_str.replace("\\", "/")
                # Extract just the filename regardless of path structure
                if "/" in rel_str:
                    name = rel_str.split("/")[-1]
                else:
                    name = rel_str
                maps[key] = base + name
                print(f"DEBUG: Absolutized {key}: {rel} -> {maps[key]}")

    # v2: legacy single-side maps (keep existing logic)
    maps = m.get("maps", {})
    for side in ("front", "back"):
        side_maps = maps.get(side)
        if not side_maps:
            continue
        for k, rel in list(side_maps.items()):
            name = str(rel).split(f"assets/{job_id}/")[-1]
            side_maps[k] = base + name

    # diecut on geometry if present
    geom = m.get("geometry", {})
    for die_key in ("diecut_svg", "diecut_png"):
        rel = geom.get(die_key)
        if rel:
            name = str(rel).split(f"assets/{job_id}/")[-1]
            geom[die_key] = base + name

    m["assets_base_url"] = base
    return m


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    try:
        result = await forward_to_windows(file)
        result = absolutize_manifest(result)  # <-- add this line
        return JSONResponse(result)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=502, detail="Windows parser is unavailable")
