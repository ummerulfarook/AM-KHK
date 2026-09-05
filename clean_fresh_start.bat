@echo off
echo =====================================================
echo  AM ^& KHK - Clean Production Fresh Start Script
echo =====================================================
echo.
echo  WARNING: This will reset the database to a clean production state.
echo  It will keep:
echo    - Default Users (admin / admin123)
echo    - Default Categories ^& Shop Settings
echo.
echo  It will ERASE:
echo    - All sample customers
echo    - All sample products
echo    - All sample sales / invoices
echo.
echo =====================================================
pause

cd /d "%~dp0"

REM -- Detect venv location --
SET PYTHON=
IF EXIST "venv\Scripts\python.exe" (
    SET PYTHON=venv\Scripts\python.exe
) ELSE IF EXIST "backend\venv\Scripts\python.exe" (
    SET PYTHON=backend\venv\Scripts\python.exe
) ELSE (
    echo ERROR: Cannot find venv. Aborting.
    pause
    exit /b 1
)

echo.
echo [STEP 1] Initializing 100%% Clean Production Database...
%PYTHON% backend\clean_fresh_db.py
if %errorlevel% neq 0 (
    echo ERROR: Database initialization failed.
    pause
    exit /b 1
)

echo.
echo [STEP 2] Rebuilding React frontend...
cd frontend
node "node_modules/vite/bin/vite.js" build
if %errorlevel% neq 0 (
    call npm run build
)
cd ..

echo.
echo =====================================================
echo  CLEAN FRESH START COMPLETE!
echo.
echo  Login Credentials:
echo    Username : admin
echo    Password : admin123
echo =====================================================
echo.
pause
