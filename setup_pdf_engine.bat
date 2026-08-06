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
echo [1/5] Clearing pip download cache...
%PIP% cache purge
echo Cache cleared.

echo.
echo [2/5] Removing old/broken installs...
%PIP% uninstall -y greenlet pyee playwright 2>nul
echo Done.

echo.
echo [3/5] Installing greenlet (slow connection mode - may take a few minutes)...
%PIP% install --no-cache-dir --timeout 300 --retries 10 greenlet
if %errorlevel% neq 0 (
    echo ERROR: greenlet install failed. Check internet connection and try again.
    pause
    exit /b 1
)

echo.
echo [4/5] Installing Playwright (38 MB download - please wait, do not close)...
%PIP% install --no-cache-dir --timeout 300 --retries 10 playwright
if %errorlevel% neq 0 (
    echo.
    echo ERROR: playwright install failed due to network timeout.
    echo.
    echo The internet connection on this machine is too slow for direct download.
    echo.
    echo ALTERNATIVE - Transfer files manually:
    echo   1. On a machine with good internet, download:
    echo      playwright-1.62.0-py3-none-win_amd64.whl
    echo      from: https://pypi.org/project/playwright/#files
    echo   2. Copy the .whl file to this machine
    echo   3. Run: %PIP% install playwright-1.62.0-py3-none-win_amd64.whl
    echo   4. Then run this script again
    pause
    exit /b 1
)

SET PLAYWRIGHT_BROWSERS_PATH=C:\ms-playwright

echo.
echo [5/5] Downloading Chromium browser (~200 MB - please wait, do not close)...
echo       This is a one-time download.
%PYTHON% -m playwright install chromium
if %errorlevel% neq 0 (
    echo ERROR: Chromium install failed.
    pause
    exit /b 1
)

echo.
echo Verifying Chromium works...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('SUCCESS - Chromium version:', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Chromium verification failed.
    echo Try installing Microsoft Visual C++ Redistributable:
    echo   https://aka.ms/vs/17/release/vc_redist.x64.exe
    pause
    exit /b 1
)

echo.
echo =====================================================
echo  SETUP COMPLETE!
echo  IMPORTANT: Restart the Flask backend now.
echo =====================================================
echo.
pause
