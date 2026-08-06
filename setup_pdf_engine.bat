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
echo [1/3] Installing Playwright Python package...
%PIP% install playwright
if %errorlevel% neq 0 (
    echo ERROR: pip install failed.
    pause
    exit /b 1
)

echo.
echo [2/3] Downloading Chromium browser for PDF generation...
echo       (This will download ~200 MB - please wait)
%PYTHON% -m playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Playwright chromium install failed.
    pause
    exit /b 1
)

echo.
echo [3/3] Verifying Chromium works...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('SUCCESS - Chromium version:', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo ERROR: Chromium verification failed.
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
