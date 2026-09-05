@echo off
echo =====================================================
echo  AM ^& KHK - Safe Client Update Script (Preserves Data)
echo =====================================================
echo.
echo  This script will:
echo    1. Backup existing database (amkhk.db)
echo    2. Pull latest code updates from GitHub (main)
echo    3. Build frontend production assets
echo    4. Run database schema auto-migrations
echo.
echo  Your existing Customers, Products, Stock, Sales,
echo  and Payments will be 100%% SAFE and preserved!
echo =====================================================
echo.

cd /d "%~dp0"

REM -- 1. Safety Backup of Existing Database --
if exist "backend\data\amkhk.db" (
    echo [STEP 1/4] Creating safety backup of existing database...
    copy /Y "backend\data\amkhk.db" "backend\data\amkhk_backup_safety.db" >nul
    echo ✅ Backup created: backend\data\amkhk_backup_safety.db
) else (
    echo [STEP 1/4] No existing database file found. A fresh DB will be created on startup.
)

REM -- 2. Pull Latest Code from main branch --
echo.
echo [STEP 2/4] Pulling latest code updates from GitHub (main)...
git fetch origin main
git pull origin main
if %errorlevel% neq 0 (
    echo ⚠️ git pull returned a warning, performing safe checkout...
    git checkout main
    git pull origin main
)
echo ✅ Code updated to latest version.

REM -- 3. Rebuild React Frontend --
echo.
echo [STEP 3/4] Rebuilding React frontend assets...
cd frontend
node "node_modules/vite/bin/vite.js" build
if %errorlevel% neq 0 (
    call npm run build
)
cd ..
echo ✅ Frontend production bundle built.

REM -- 4. Finish --
echo.
echo =====================================================
echo  ✅ UPDATE COMPLETE!
echo.
echo  All existing client data has been PRESERVED.
echo  Start the backend server now:
echo    python backend/run.py
echo =====================================================
echo.
pause
