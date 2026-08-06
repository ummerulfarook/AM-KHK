@echo off
echo =====================================================
echo  AM ^& KHK - PDF Engine Setup (Playwright Chromium)
echo =====================================================
echo.

cd /d "%~dp0"

REM -- Detect where venv lives (project root or backend subfolder) --
SET PIP=
SET PYTHON=

IF EXIST "venv\Scripts\pip.exe" (
    SET PIP=venv\Scripts\pip.exe
    SET PYTHON=venv\Scripts\python.exe
    echo Detected venv at: project root\venv
) ELSE IF EXIST "backend\venv\Scripts\pip.exe" (
    SET PIP=backend\venv\Scripts\pip.exe
    SET PYTHON=backend\venv\Scripts\python.exe
    echo Detected venv at: backend\venv
) ELSE (
    echo ERROR: Could not find venv. Please create a virtual environment first.
    pause
    exit /b 1
)

echo.
echo [1/5] Clearing pip download cache (fixes hash mismatch errors)...
%PIP% cache purge
echo Cache cleared.

echo.
echo [2/5] Removing old/broken greenlet and playwright installs...
%PIP% uninstall -y greenlet pyee playwright 2>nul
echo Done.

echo.
echo [3/5] Installing greenlet (fresh, no cache)...
%PIP% install --no-cache-dir greenlet
if %errorlevel% neq 0 (
    echo ERROR: greenlet install failed.
    pause
    exit /b 1
)

echo.
echo [4/5] Installing Playwright (fresh, no cache)...
%PIP% install --no-cache-dir playwright
if %errorlevel% neq 0 (
    echo ERROR: playwright install failed.
    pause
    exit /b 1
)

echo.
echo [5/5] Downloading Chromium browser for PDF generation...
echo       (This will download ~200 MB - please wait)
%PYTHON% -m playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Playwright chromium install failed.
    pause
    exit /b 1
)

echo.
echo Verifying Chromium works...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('SUCCESS - Chromium version:', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Chromium verification failed.
    echo.
    echo Try installing Microsoft Visual C++ Redistributable:
    echo   Download: https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo   Install it, then run this script again.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  SETUP COMPLETE!
echo  IMPORTANT: Restart the Flask backend now for the
echo  new PDF engine to take effect.
echo =====================================================
echo.
pause
