$ErrorActionPreference = 'Stop'

# Get the script's directory
$repoRoot = $PSScriptRoot
if (-not $repoRoot) { $repoRoot = Get-Location }
Set-Location $repoRoot

Write-Host "`n=== xend Philippines: Production Build ===" -ForegroundColor Cyan

# 1. Build Frontend
Write-Host "`n[1/3] Building Frontend (React/Vite)..." -ForegroundColor Yellow
Push-Location "$repoRoot/frontend"
try {
    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        Write-Host "Using corepack pnpm..." -ForegroundColor Gray
        & corepack pnpm install
        & corepack pnpm build
    } elseif (Get-Command pnpm -ErrorAction SilentlyContinue) {
        Write-Host "Using pnpm..." -ForegroundColor Gray
        & pnpm install
        & pnpm build
    } else {
        Write-Host "Using npm..." -ForegroundColor Gray
        & npm install
        & npm run build
    }
} finally {
    Pop-Location
}

# 2. Update Backend Static Files
Write-Host "`n[2/3] Updating Backend Static Files..." -ForegroundColor Yellow
$staticDir = "$repoRoot/backend/static"
if (Test-Path $staticDir) {
    Write-Host "Cleaning $staticDir ..." -ForegroundColor Gray
    Remove-Item -Path "$staticDir/*" -Recurse -Force -ErrorAction SilentlyContinue
} else {
    Write-Host "Creating $staticDir ..." -ForegroundColor Gray
    New-Item -ItemType Directory -Path $staticDir
}

Write-Host "Copying assets to backend..." -ForegroundColor Gray
Copy-Item -Path "$repoRoot/frontend/dist/*" -Destination $staticDir -Recurse -Force

# 3. Finalize
Write-Host "`n[3/3] Build Complete! ✅" -ForegroundColor Green
Write-Host "`nTo start the application in production mode:" -ForegroundColor Cyan
Write-Host "1. cd backend"
Write-Host "2. `$env:ENVIRONMENT='production'"
Write-Host "3. `$env:DATABASE_URL='sqlite+aiosqlite:///./paybot.db' # (or your PostgreSQL URL)"
Write-Host "4. python -m uvicorn main:app --host 0.0.0.0 --port 8000"
Write-Host "`nOr use Docker:" -ForegroundColor Cyan
Write-Host "docker build -t paybot ."
Write-Host "docker run -p 8000:8000 --env-file .env paybot"
