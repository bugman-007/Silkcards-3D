@echo off
echo =====================================================
echo Testing Per-Side Export
echo =====================================================
echo.
echo This will:
echo 1. Run parser-service with your .ai file
echo 2. Generate card-sized textures per effect
echo 3. One PDF per side (front_layer_0.pdf, back_layer_0.pdf)
echo.
echo Expected output:
echo   - front_layer_0_albedo.png (card-sized)
echo   - front_layer_0_uv.png (card-sized mask)
echo   - front_layer_0_foil.png (card-sized mask)
echo   - back_layer_0_albedo.png (card-sized)
echo   - back_layer_0_foil.png (card-sized mask)
echo.
pause

cd /d "%~dp0"
python app.py

