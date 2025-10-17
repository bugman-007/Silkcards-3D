@echo off
REM Parser Service - API Server Startup Script
REM Windows batch file to start the Flask API server

echo Starting Parser Service API...
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    echo Activating virtual environment...
    call venv\Scripts\activate.bat
)

REM Set environment variables (customize as needed)
REM set AI_EXE=C:\Program Files\Adobe\Adobe Illustrator 2025\Support Files\Contents\Windows\Illustrator.exe
REM set PLATE_DPI=600
REM set PARSER_SHARED_KEY=your-secret-key-here

REM Run API server
python -m src.app api --host 0.0.0.0 --port 5001

pause

