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
    echo ERROR: Could not find venv in either location:
    echo   - %cd%\venv\Scripts\pip.exe
    echo   - %cd%\backend\venv\Scripts\pip.exe
    echo Please create a virtual environment first.
    pause
    exit /b 1
)

echo.
echo [1/4] Fixing greenlet DLL (required by Playwright)...
%PIP% uninstall -y greenlet
%PIP% install --force-reinstall --no-cache-dir greenlet
if %errorlevel% neq 0 (
    echo ERROR: greenlet reinstall failed.
    pause
    exit /b 1
)

echo.
echo [2/4] Installing Playwright Python package...
%PIP% install --force-reinstall --no-cache-dir playwright
if %errorlevel% neq 0 (
    echo ERROR: pip install playwright failed.
    pause
    exit /b 1
)

echo.
echo [3/4] Downloading Chromium browser for PDF generation...
echo       (This will download ~200 MB - please wait)
%PYTHON% -m playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Playwright chromium install failed.
    pause
    exit /b 1
)

echo.
echo [4/4] Verifying Chromium works...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('SUCCESS - Chromium version:', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Chromium verification failed.
    echo.
    echo Try installing Microsoft Visual C++ Redistributable:
    echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
    echo Download and install it, then run this script again.
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  SETUP COMPLETE!
echo  Please restart the Flask backend now.
echo =====================================================
echo.
pause
