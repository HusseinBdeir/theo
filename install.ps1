$ErrorActionPreference = 'Stop'
Write-Host "=== Installing THEO Extension & Bridges for VS Code ===" -ForegroundColor Cyan

$extId = "bhfirms.theo-hub"
$version = "0.1.0"
$folderName = "$extId-$version"
$vscodeExtDir = Join-Path $HOME ".vscode\extensions"
$targetDir = Join-Path $vscodeExtDir $folderName
$repoDir = Join-Path $HOME "bhfirms\theo-hub"

New-Item -ItemType Directory -Force -Path $vscodeExtDir | Out-Null
New-Item -ItemType Directory -Force -Path $repoDir | Out-Null

# Locate or download theo-hub-bundle.zip
$localZip = $null
if ($PSScriptRoot) {
    $candidate = Join-Path $PSScriptRoot "theo-hub-bundle.zip"
    if (Test-Path $candidate) { $localZip = $candidate }
}
if (-not $localZip) {
    $odCandidate = Join-Path $HOME "OneDrive - BHFIRMS\System\System\THEO\Admin\theo-hub-bundle.zip"
    if (Test-Path $odCandidate) { $localZip = $odCandidate }
}
if (-not $localZip) {
    $tmpZip = Join-Path $env:TEMP "theo-hub-bundle.zip"
    try {
        Write-Host "Downloading THEO bundle from local LAN (192.168.3.129) ..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "http://192.168.3.129:8844/theo-hub-bundle.zip" -OutFile $tmpZip -UseBasicParsing -TimeoutSec 4
        $localZip = $tmpZip
    } catch {
        Write-Host "Downloading THEO bundle from https://husseinbdeir.github.io/theo/theo-hub-bundle.zip ..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri "https://husseinbdeir.github.io/theo/theo-hub-bundle.zip" -OutFile $tmpZip -UseBasicParsing
        $localZip = $tmpZip
    }
}

# Extract to both ~/.vscode/extensions/bhfirms.theo-hub-0.1.0 and ~/bhfirms/theo-hub
if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir }
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Expand-Archive -Path $localZip -DestinationPath $targetDir -Force
Expand-Archive -Path $localZip -DestinationPath $repoDir -Force
Write-Host "[OK] Extracted THEO files to $targetDir" -ForegroundColor Green

# Find Node runtime (system node or VS Code's built-in Electron runtime)
$nodeExe = $null
$useElectronNode = $false
$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCmd) {
    $nodeExe = $nodeCmd.Source
} else {
    $vsCodeCandidates = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
        "$env:ProgramFiles\Microsoft VS Code\Code.exe"
    )
    foreach ($c in $vsCodeCandidates) {
        if (Test-Path $c) {
            $nodeExe = $c
            $useElectronNode = $true
            break
        }
    }
}

if (-not $nodeExe) {
    throw "Could not find Node.js or VS Code executable to register THEO bridge."
}

# Register in ~/.vscode/extensions/extensions.json and patch Google Antigravity + Claude Code
$jsScript = @"
const fs = require('fs');
const path = require('path');

const vscodeExtDir = process.argv[1];
const targetDir = process.argv[2];
const extId = 'bhfirms.theo-hub';
const legacyId = 'bhfirms.antigravity-hub';
const version = '0.1.0';
const folderName = extId + '-' + version;

const extJsonPath = path.join(vscodeExtDir, 'extensions.json');
let entries = [];
if (fs.existsSync(extJsonPath)) {
  try { entries = JSON.parse(fs.readFileSync(extJsonPath, 'utf8')); } catch {}
}
entries = entries.filter(e => {
  const id = String((e && e.identifier && e.identifier.id) || '').toLowerCase();
  return id !== extId && id !== legacyId;
});

let posixPath = '/' + targetDir.replace(/\\/g, '/');
if (/^\/[A-Za-z]:/.test(posixPath)) {
  posixPath = '/' + posixPath[1].toLowerCase() + posixPath.slice(2);
}

entries.push({
  identifier: { id: extId },
  version,
  location: { '$mid': 1, path: posixPath, scheme: 'file' },
  relativeLocation: folderName,
  metadata: {
    isApplicationScoped: false,
    isMachineScoped: false,
    isBuiltin: false,
    installedTimestamp: Date.now(),
    pinned: true,
    source: 'vsix'
  }
});
fs.writeFileSync(extJsonPath, JSON.stringify(entries), 'utf8');
console.log('[OK] Registered ' + extId + ' in extensions.json');

const bridge = require(path.join(targetDir, 'bridge.js'));
for (const entry of fs.readdirSync(vscodeExtDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const fullDir = path.join(vscodeExtDir, entry.name);
  if (/^google\.google-antigravity-/i.test(entry.name)) {
    const res = bridge.ensureBridgeInstalledForExtensionDir(fullDir, targetDir);
    console.log('[OK] Patched Google Antigravity in ' + fullDir + ' (installed=' + Boolean(res && res.installed) + ')');
  } else if (/^anthropic\.claude-code-/i.test(entry.name)) {
    const res = bridge.ensureClaudeBridgeInstalledForExtensionDir(fullDir, targetDir);
    console.log('[OK] Patched Claude Code in ' + fullDir + ' (installed=' + Boolean(res && res.installed) + ')');
  }
}
"@

$tmpJs = Join-Path $env:TEMP "theo_register_bridge.cjs"
Set-Content -Path $tmpJs -Value $jsScript -Encoding UTF8

if ($useElectronNode) {
    $env:ELECTRON_RUN_AS_NODE = "1"
}
& $nodeExe $tmpJs $vscodeExtDir $targetDir
if ($useElectronNode) {
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== SUCCESS! THEO is installed! ===" -ForegroundColor Green
Write-Host "Now in VS Code press Ctrl+Shift+P -> type 'Reload Window' -> press Enter." -ForegroundColor Cyan
Write-Host "Then click the 'T' (THEO) icon on the left sidebar and click '+ Add' to sign in to Antigravity!" -ForegroundColor Cyan
