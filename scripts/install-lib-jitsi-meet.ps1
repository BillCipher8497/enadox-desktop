# Installs the patched lib-jitsi-meet built from source into the jitsi-meet
# fork's node_modules, replacing the hand-patched .min.js dependency.
#
# Run from this folder (`enadox-desktop/`):
#   powershell -ExecutionPolicy Bypass -File scripts/install-lib-jitsi-meet.ps1
#
# Prereq: the sibling clone at ../enadox-video-embed/ext/vcav/lib-jitsi-meet
# has `npm install` + `npm run build` already run. (See VENDORING_STRATEGY.md
# for the one-time setup and patches/lib-jitsi-meet-enadox.patch for what we
# patched.)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$libSrc   = Resolve-Path (Join-Path $repoRoot '..\enadox-video-embed\ext\vcav\lib-jitsi-meet')
$forkDir  = Resolve-Path (Join-Path $repoRoot '..\enadox-video-embed\ext\vcav\jitsi-meet')

Write-Host "lib-jitsi-meet source: $libSrc"
Write-Host "jitsi-meet fork:        $forkDir"

if (-not (Test-Path (Join-Path $libSrc 'dist/umd/lib-jitsi-meet.min.js'))) {
    throw "Built dist/ not found under $libSrc. Run `npm install` then `npm run build` there first."
}

Push-Location $libSrc
try {
    Write-Host "`nPacking lib-jitsi-meet..."
    # npm pack writes a .tgz into the cwd and prints its name
    $pkg = & npm pack --silent | Select-Object -Last 1
    if ([string]::IsNullOrEmpty($pkg)) { throw "npm pack produced no output" }
    $pkgPath = Join-Path $libSrc $pkg
    Write-Host "Packed to $pkgPath"

    Push-Location $forkDir
    try {
        Write-Host "`nInstalling patched build into fork..."
        & npm install "file:$pkgPath" --force --no-audit --no-fund
    } finally {
        Pop-Location
    }
} finally {
    Pop-Location
}

Write-Host "`nDone. The fork now uses the source-patched lib-jitsi-meet."
Write-Host "Verify with:"
Write-Host "  cd $forkDir"
Write-Host "  node -e `"const j=require('lib-jitsi-meet/package.json'); console.log(j.version, j._location || '')`""
