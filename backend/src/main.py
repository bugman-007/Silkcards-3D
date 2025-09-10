from fastapi import FastAPI
from fastapi.responses import JSONResponse
from app.api.upload import router as upload_router

app = FastAPI()
from fastapi.middleware.cors import CORSMiddleware

origins = [
    "http://localhost:5173",  # Vite dev
    "https://revolve360.vercel.app/",  # Vercel (replace with your actual domain)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return JSONResponse({"status": "ok"})


# mount upload routes
app.include_router(upload_router, prefix="", tags=["upload"])
