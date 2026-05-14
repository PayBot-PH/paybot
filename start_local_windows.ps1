$ErrorActionPreference = 'Stop'

function Get-NodeExe {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        return 'node'
    }

    $userNode = Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'
    if (Test-Path $userNode) {
        return $userNode
    }

    $machineNode = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    if (Test-Path $machineNode) {
        return $machineNode
    }

    return $null
}

function Get-CorepackCmd {
    param([Parameter(Mandatory = $true)][string]$NodeExe)

    if (Get-Command corepack -ErrorAction SilentlyContinue) {
        return 'corepack'
    }

    if ($NodeExe -eq 'node') {
        return $null
    }

    $nodeDir = Split-Path -Parent $NodeExe
    $corepackCmd = Join-Path $nodeDir 'corepack.cmd'
    if (Test-Path $corepackCmd) {
        return $corepackCmd
    }

    return $null
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Test-Path '.\backend\.env')) {
    throw 'Missing backend/.env. Run .\setup_windows.ps1 first.'
}

if (-not (Test-Path '.\frontend\.env')) {
    throw 'Missing frontend/.env. Run .\setup_windows.ps1 first.'
}

$pythonExe = 'python'
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'
    if (-not (Test-Path $candidate)) {
        throw 'Python executable not found. Run .\setup_windows.ps1 first.'
    }
    $pythonExe = $candidate
}

$nodeExe = Get-NodeExe
if (-not $nodeExe) {
    throw 'Node.js executable not found. Run .\setup_windows.ps1 first.'
}

$corepackCmd = Get-CorepackCmd -NodeExe $nodeExe
if (-not $corepackCmd) {
    throw 'Corepack was not found. Run .\setup_windows.ps1 first.'
}

Write-Host 'Starting backend on http://127.0.0.1:8000 ...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\backend'; & '$pythonExe' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

Write-Host 'Starting frontend on http://127.0.0.1:3000 ...' -ForegroundColor Cyan
Start-Process powershell -ArgumentList '-NoExit', '-Command', "Set-Location '$repoRoot\frontend'; & '$corepackCmd' pnpm dev"

Write-Host 'Both services launched in new terminals.' -ForegroundColor Green
