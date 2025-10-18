@echo off
REM Parser Service - Health Check Script
REM Windows batch file to run health check

echo Running Parser Service Health Check...
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Run health check using the standalone script
python health_check.py

pause

