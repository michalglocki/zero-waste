# 10x-bootstrapper — Expo scaffold for Zero waste
# Run from project root (directory that contains context/):
#   cd C:\Users\mglocki
#   powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-expo.ps1

$ErrorActionPreference = "Stop"
$LogFile = Join-Path $PSScriptRoot "..\bootstrap-run.log"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $Root

function Log($msg) {
    $line = "[$(Get-Date -Format o)] $msg"
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

Log "Root: $Root"

if (-not (Test-Path "context\foundation\tech-stack.md")) {
    Log "ERROR: context\foundation\tech-stack.md missing. Run from project root."
    exit 1
}

if (Test-Path "package.json") {
    Log "WARN: package.json already exists at root."
}

# Pre-scaffold recency
try {
    $ver = npm view create-expo-app version 2>&1
    $mod = npm view create-expo-app time.modified 2>&1
    Log "Pre-scaffold: create-expo-app version=$ver modified=$mod"
} catch {
    Log "Pre-scaffold: npm view failed: $_"
}

# Scaffold
if (Test-Path ".bootstrap-scaffold") {
    Log "Removing stale .bootstrap-scaffold"
    Remove-Item -Recurse -Force ".bootstrap-scaffold"
}

Log "Running: npx create-expo-app .bootstrap-scaffold --yes --template default"
& npx create-expo-app .bootstrap-scaffold --yes --template default
$exitCode = $LASTEXITCODE
Log "create-expo-app exit code: $exitCode"

if ($exitCode -ne 0) {
    Log "HARD-STOP: scaffold failed. Inspect .bootstrap-scaffold and re-run."
    exit $exitCode
}

# Merge (conflict policy)
$moved = 0
$conflicts = @()
$scaffoldRoot = Join-Path $Root ".bootstrap-scaffold"

Get-ChildItem -Path $scaffoldRoot -Force | ForEach-Object {
    $name = $_.Name
    $src = $_.FullName
    $dest = Join-Path $Root $name

    if ($name -eq "context") {
        Log "Skip context/ (preserve cwd context/)"
        return
    }

    if ($name -eq ".git") {
        Log "Skip .git from scaffold"
        return
    }

    if (-not (Test-Path $dest)) {
        Move-Item -Path $src -Destination $dest -Force
        $moved++
        Log "Moved: $name"
        return
    }

    if ($name -eq ".gitignore") {
        $cwdLines = @(Get-Content $dest -ErrorAction SilentlyContinue)
        $scaffoldLines = @(Get-Content $src)
        $merged = $cwdLines + @("", "# from expo") + ($scaffoldLines | Where-Object { $_ -notin $cwdLines })
        Set-Content -Path $dest -Value $merged
        $moved++
        Log "Append-merged: .gitignore"
        return
    }

    $sibling = "$dest.scaffold"
    Move-Item -Path $src -Destination $sibling -Force
    $conflicts += $name
    Log "Conflict: $name -> $name.scaffold"
}

if (Test-Path $scaffoldRoot) {
    Remove-Item -Recurse -Force $scaffoldRoot -ErrorAction SilentlyContinue
    Log "Removed .bootstrap-scaffold"
}

Log "Files moved/merged: $moved; conflicts: $($conflicts -join ', ')"

# Post-scaffold audit
if (Test-Path "package.json") {
    Log "Running npm audit --json"
    npm audit --json *> (Join-Path $Root "npm-audit.json")
    Log "npm audit written to npm-audit.json (exit $LASTEXITCODE)"
}

Log "Done. Re-invoke /10x-bootstrapper in Cursor to write verification.md, or review npm-audit.json"
