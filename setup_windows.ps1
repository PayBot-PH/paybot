param(
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'

function Test-CommandExists {
    param([Parameter(Mandatory = $true)][string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-PathIfMissing {
    param([Parameter(Mandatory = $true)][string]$PathToAdd)

    if (-not $PathToAdd) { return }
    if (-not (Test-Path $PathToAdd)) { return }

    $parts = ($env:Path -split ';') | Where-Object { $_ -and $_.Trim() -ne '' }
    if ($parts -notcontains $PathToAdd) {
        $env:Path = "$env:Path;$PathToAdd"
    }
}

function Get-PythonExe {
    if (Test-CommandExists -Name 'python') {
        return 'python'
    }

    $userPy = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\python.exe'
    if (Test-Path $userPy) {
        return $userPy
    }

    return $null
}

function Get-NodeExe {
    if (Test-CommandExists -Name 'node') {
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

    if (Test-CommandExists -Name 'corepack') {
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

function Install-WithWinget {
    param(
        [Parameter(Mandatory = $true)][string]$Id,
        [Parameter(Mandatory = $true)][string]$Name
    )

    Write-Host "Installing $Name..." -ForegroundColor Cyan
    winget install -e --id $Id --source winget --scope user --silent --disable-interactivity --accept-package-agreements --accept-source-agreements
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $repoRoot

if (-not (Test-CommandExists -Name 'winget')) {
    throw 'winget is required but not found. Install App Installer from Microsoft Store and re-run.'
}

if (-not $SkipInstall) {
    if (-not (Get-PythonExe)) {
        Install-WithWinget -Id 'Python.Python.3.11' -Name 'Python 3.11'
    }

    if (-not (Test-CommandExists -Name 'node')) {
        Install-WithWinget -Id 'OpenJS.NodeJS.LTS' -Name 'Node.js LTS'
    }
}

Add-PathIfMissing (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311')
Add-PathIfMissing (Join-Path $env:LOCALAPPDATA 'Programs\Python\Python311\Scripts')
Add-PathIfMissing (Join-Path $env:LOCALAPPDATA 'Programs\nodejs')
Add-PathIfMissing (Join-Path $env:ProgramFiles 'nodejs')

$pythonExe = Get-PythonExe
if (-not $pythonExe) {
    throw 'Python is still not available. Open a new terminal and re-run this script.'
}

$nodeExe = Get-NodeExe
if (-not $nodeExe) {
    throw 'Node.js is still not available. Open a new terminal and re-run this script.'
}

$corepackCmd = Get-CorepackCmd -NodeExe $nodeExe
if (-not $corepackCmd) {
    throw 'Corepack was not found. Please reinstall Node.js LTS and re-run this script.'
}

Write-Host 'Enabling pnpm via Corepack...' -ForegroundColor Cyan
& $corepackCmd enable
& $corepackCmd prepare pnpm@8.10.0 --activate

if (-not (Test-Path '.\backend\.env')) {
    Copy-Item '.\backend\.env.example' '.\backend\.env'
    Write-Host 'Created backend/.env from example.' -ForegroundColor Yellow
}

if (-not (Test-Path '.\frontend\.env')) {
    if (Test-Path '.\frontend\.env.example') {
        Copy-Item '.\frontend\.env.example' '.\frontend\.env'
        Write-Host 'Created frontend/.env from example.' -ForegroundColor Yellow
    }
}

Write-Host 'Installing backend dependencies...' -ForegroundColor Cyan
Push-Location '.\backend'
& $pythonExe -m pip install --upgrade pip
& $pythonExe -m pip install -r requirements.txt
Pop-Location

Write-Host 'Installing frontend dependencies...' -ForegroundColor Cyan
Push-Location '.\frontend'
& $corepackCmd pnpm install
Pop-Location

Write-Host ''
Write-Host 'Setup completed.' -ForegroundColor Green
Write-Host 'Next: run .\start_local_windows.ps1 to start backend + frontend.' -ForegroundColor Green
