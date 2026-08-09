$ErrorActionPreference = "Stop"

$RootDir = Split-Path -Parent $PSScriptRoot
Set-Location $RootDir

if (-not (Test-Path .env)) {
    Write-Host "No .env found. Create one yourself — see README.md's Environment Variables section for the required keys."
}

Write-Host "Installing backend dependencies..."
python -m venv backend\.venv
& backend\.venv\Scripts\pip.exe install --upgrade pip
& backend\.venv\Scripts\pip.exe install -r backend\requirements.txt

Write-Host "Installing frontend dependencies..."
Push-Location frontend
npm install
Pop-Location

Write-Host "Done. Run 'docker-compose up' or start services individually — see each folder's README."
