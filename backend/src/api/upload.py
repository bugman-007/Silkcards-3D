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
    
    def _basename(rel):
        s = str(rel).replace("\\", "/")
        return s.split("/")[-1] if "/" in s else s

    # Track die-cut files for debugging
    diecut_files = []

    # v3 per-card maps actually live under m["maps"]["front_cards"/"back_cards"]
    v3 = (m.get("maps") or {})
    for side in ("front_cards", "back_cards"):
        arr = v3.get(side, []) or []
        for card in arr:
            if not card:
                continue
            maps = card.get("maps", {}) or {}
            for key, rel in list(maps.items()):
                if not rel:
                    continue
                maps[key] = base + _basename(rel)
                if 'die' in key.lower() or 'cut' in key.lower():
                    diecut_files.append(f"{side} {key}: {maps[key]}")
                print(f"DEBUG: Absolutized {key}: {rel} -> {maps[key]}")

    # v2: legacy single-side maps
    maps = m.get("maps", {})
    for side in ("front", "back"):
        side_maps = maps.get(side)
        if not side_maps:
            continue
        for k, rel in list(side_maps.items()):
            if rel:
                side_maps[k] = base + _basename(rel)
                if 'die' in k.lower() or 'cut' in k.lower():
                    diecut_files.append(f"{side} {k}: {side_maps[k]}")

    # diecut on geometry if present
    geom = m.get("geometry", {})
    for die_key in ("diecut_svg", "diecut_png", "die_svg", "die_png"):
        rel = geom.get(die_key)
        if rel:
            geom[die_key] = base + _basename(rel)
            diecut_files.append(f"geometry {die_key}: {geom[die_key]}")

    # Log all die-cut files for debugging
    print(f"=== DIE-CUT FILES FOUND ({len(diecut_files)}) ===")
    for file_info in diecut_files:
        print(f"  {file_info}")

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
