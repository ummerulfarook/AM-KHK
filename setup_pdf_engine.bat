@echo off
echo =====================================================
echo  AM ^& KHK - PDF Engine Setup (Playwright Chromium)
echo =====================================================
echo.

cd /d "%~dp0"

echo [1/3] Installing Playwright Python package...
.\venv\Scripts\pip.exe install playwright
if %errorlevel% neq 0 (
    echo ERROR: pip install failed. Make sure venv exists.
    pause
    exit /b 1
)

echo.
echo [2/3] Downloading Chromium browser for PDF generation...
echo       (This will download ~200 MB - please wait)
.\venv\Scripts\python.exe -m playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Playwright chromium install failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Verifying Chromium works...
.\venv\Scripts\python.exe -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('SUCCESS - Chromium version:', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo ERROR: Chromium verification failed.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  SETUP COMPLETE!
echo  Please restart the Flask backend now:
echo    Stop the current backend (Ctrl+C in its window)
echo    Then run: .\venv\Scripts\python.exe backend\run.py
echo =====================================================
echo.
pause
