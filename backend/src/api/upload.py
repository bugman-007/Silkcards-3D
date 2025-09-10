from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from app.services.windows_client import forward_to_windows

router = APIRouter()

@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    try:
        result = await forward_to_windows(file)
        return JSONResponse(result)
    except HTTPException as e:
        raise e
    except Exception:
        raise HTTPException(status_code=502, detail="Windows parser is unavailable")
