@echo off
echo =====================================================
echo  AM ^& KHK - Full Client Deployment Script
echo =====================================================
echo.

cd /d "%~dp0"

REM -- Detect venv location --
SET PIP=
SET PYTHON=
IF EXIST "venv\Scripts\pip.exe" (
    SET PIP=venv\Scripts\pip.exe
    SET PYTHON=venv\Scripts\python.exe
) ELSE IF EXIST "backend\venv\Scripts\pip.exe" (
    SET PIP=backend\venv\Scripts\pip.exe
    SET PYTHON=backend\venv\Scripts\python.exe
) ELSE (
    echo ERROR: Cannot find venv. Aborting.
    pause
    exit /b 1
)
echo Venv: %PYTHON%

SET PLAYWRIGHT_BROWSERS_PATH=C:\ms-playwright

echo.
echo [STEP 1] Pulling latest code from GitHub...
git fetch origin feature/sales-report-boxes-printer
git reset --hard origin/feature/sales-report-boxes-printer
if %errorlevel% neq 0 (
    echo ERROR: git reset failed.
    pause
    exit /b 1
)
echo Latest code applied.

echo.
echo [STEP 2] Checking if Playwright is installed...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('Playwright OK:', b.version); b.close(); pw.stop()" 2>nul
if %errorlevel% neq 0 (
    echo Playwright not working. Installing now...

    REM Try offline install first
    IF EXIST "playwright_offline\playwright-1.62.0-py3-none-win_amd64.whl" (
        echo Installing from offline package...
        %PIP% install playwright_offline\playwright-1.62.0-py3-none-win_amd64.whl --no-deps --no-cache-dir
    ) ELSE (
        echo Trying online install - may be slow...
        %PIP% cache purge
        %PIP% install --no-cache-dir --timeout 300 --retries 10 playwright
    )

    echo Downloading Chromium browser - 200MB one-time...
    %PYTHON% -m playwright install chromium
)

echo.
echo [STEP 3] Verifying Playwright works...
%PYTHON% -c "from playwright.sync_api import sync_playwright; pw=sync_playwright().start(); b=pw.chromium.launch(headless=True); print('✅ Playwright OK - Chromium', b.version); b.close(); pw.stop()"
if %errorlevel% neq 0 (
    echo ❌ Playwright verification failed!
    echo Open in browser after restarting backend:
    echo   http://localhost:5000/api/billing/pdf-diagnostics
    pause
    exit /b 1
)

echo.
echo [STEP 4] Rebuilding React frontend for production...
cd frontend
node "node_modules/vite/bin/vite.js" build
if %errorlevel% neq 0 (
    echo ⚠️ Vite build failed, trying npm run build...
    call npm run build
)
cd ..


echo.
echo [STEP 5] Restarting backend service...
REM Try NSSM service restart
sc query "AMKHK_ERP" >nul 2>&1
if %errorlevel% equ 0 (
    echo Restarting Windows Service 'AMKHK_ERP'...
    net stop "AMKHK_ERP"
    net start "AMKHK_ERP"
) ELSE (
    sc query amkhk >nul 2>&1
    if %errorlevel% equ 0 (
        echo Restarting Windows Service 'amkhk'...
        net stop amkhk
        net start amkhk
    ) ELSE (
        sc query "am-khk" >nul 2>&1
        if %errorlevel% equ 0 (
            echo Restarting Windows Service 'am-khk'...
            net stop "am-khk"
            net start "am-khk"
        ) ELSE (
            echo.
            echo ⚠️  Could not find Windows Service automatically.
            echo     Please restart the backend manually:
            echo       - Open Services [Win+R - services.msc]
            echo       - Find the AM & KHK service - Right-click - Restart
            echo     OR press Ctrl+C in the backend terminal and restart with:
            echo       %PYTHON% backend\run.py
        )
    )
)

echo.
echo =====================================================
echo  DEPLOYMENT COMPLETE!
echo.
echo  To verify everything is working correctly,
echo  open this URL in the browser after restart:
echo    http://localhost:5000/api/billing/pdf-diagnostics
echo.
echo  You should see:
echo    active_pdf_engine: Playwright (NEW DESIGN - correct)
echo    playwright_status: WORKING
echo    invoice_pdf_html_exists: false
echo =====================================================
echo.
pause
