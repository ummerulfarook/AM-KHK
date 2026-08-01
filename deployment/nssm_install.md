# NSSM Windows Service Install Guide

## Prerequisites
1. Download NSSM from https://nssm.cc/download — use the 64-bit version
2. Copy `nssm.exe` to `C:\Windows\System32\` (or any directory in PATH)
3. Build the React frontend: `cd frontend && npm run build`
4. Create and activate the Python venv, install requirements:
   ```
   python -m venv venv
   venv\Scripts\activate
   pip install -r backend\requirements.txt
   ```
5. Run the seed script once: `python backend\seed.py`

## Install the Windows Service

Open **PowerShell as Administrator** and run:

```powershell
# Replace the paths below with your actual installation directory
$install_dir = "C:\Users\ummer\OneDrive\Desktop\AM & KHK Vegetable Merchants"
$python = "$install_dir\venv\Scripts\python.exe"
$script  = "$install_dir\deployment\waitress_serve.py"

nssm install AMKHK_ERP "$python" "$script"
nssm set AMKHK_ERP AppDirectory "$install_dir"
nssm set AMKHK_ERP DisplayName "AM & KHK Vegetable Merchants ERP"
nssm set AMKHK_ERP Description "Vegetable wholesale & retail management system"
nssm set AMKHK_ERP Start SERVICE_AUTO_START
nssm set AMKHK_ERP AppStdout "$install_dir\logs\service_stdout.log"
nssm set AMKHK_ERP AppStderr "$install_dir\logs\service_stderr.log"

# Create logs directory
New-Item -ItemType Directory -Force -Path "$install_dir\logs"

nssm start AMKHK_ERP
```

## Verify the service is running

```powershell
nssm status AMKHK_ERP
# Should print: SERVICE_RUNNING
```

Open a browser on any machine on the same Wi-Fi / LAN:
```
http://<server-pc-ip>:8000
```
Find the server PC's IP with: `ipconfig` (look for IPv4 Address under Wi-Fi or Ethernet).

## Manage the service

```powershell
nssm stop  AMKHK_ERP   # Stop the service
nssm start AMKHK_ERP   # Start the service
nssm restart AMKHK_ERP # Restart (e.g. after updates)
nssm remove AMKHK_ERP  # Uninstall the service
```

## Update the application

```powershell
nssm stop AMKHK_ERP
# Pull changes / edit files
cd frontend && npm run build  # Rebuild frontend if changed
nssm start AMKHK_ERP
```
