$ErrorActionPreference = 'Stop'
Write-Host "=== Installing THEO Extension, Bridges & Session Databases ===" -ForegroundColor Cyan

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
    Write-Host "Downloading THEO bundle ..." -ForegroundColor Yellow
    Invoke-WebRequest -Uri "https://raw.githubusercontent.com/HusseinBdeir/theo/main/theo-hub-bundle.zip" -OutFile $tmpZip -UseBasicParsing
    $localZip = $tmpZip
}

# Extract to ~/.vscode/extensions/bhfirms.theo-hub-0.1.0, ~/bhfirms/theo-hub, and ~/.antigravity/extensions if present
if (Test-Path $targetDir) { Remove-Item -Recurse -Force $targetDir }
New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
Expand-Archive -Path $localZip -DestinationPath $targetDir -Force
Expand-Archive -Path $localZip -DestinationPath $repoDir -Force
$agyExtRoot = Join-Path $HOME ".antigravity\extensions"
if (Test-Path $agyExtRoot) {
    $agyTargetDir = Join-Path $agyExtRoot $folderName
    if (Test-Path $agyTargetDir) { Remove-Item -Recurse -Force $agyTargetDir }
    New-Item -ItemType Directory -Force -Path $agyTargetDir | Out-Null
    Expand-Archive -Path $localZip -DestinationPath $agyTargetDir -Force
}
Write-Host "[OK] Extracted THEO v3 Multi-Device Studio files to $targetDir and $repoDir" -ForegroundColor Green

# Find or bootstrap Node v22+ runtime (needed for native WebSocket Edge Relay & standalone theo-agent)
$nodeExe = $null
$useElectronNode = $false
$portableNode = Join-Path $HOME ".local\node\node.exe"
if (Test-Path $portableNode) {
    $nodeExe = $portableNode
} else {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) {
        $nodeExe = $nodeCmd.Source
    } elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
        $nodeExe = "C:\Program Files\nodejs\node.exe"
    }
}

if (-not $nodeExe) {
    try {
        Write-Host "Bootstrapping portable Node.js v22.15.0 into $HOME\.local\node (for native WebSocket & headless theo-agent) ..." -ForegroundColor Yellow
        $nZip = Join-Path $env:TEMP "node-v22.15.0-win-x64.zip"
        $nExtract = Join-Path $HOME ".local"
        New-Item -ItemType Directory -Force -Path $nExtract | Out-Null
        & curl.exe -L -s "https://nodejs.org/dist/v22.15.0/node-v22.15.0-win-x64.zip" -o $nZip
        if ((Test-Path $nZip) -and ((Get-Item $nZip).Length -gt 10000000)) {
            $nTarget = Join-Path $HOME ".local\node"
            if (Test-Path $nTarget) { Remove-Item -Recurse -Force $nTarget }
            Expand-Archive -Path $nZip -DestinationPath $nExtract -Force
            Rename-Item -Path (Join-Path $nExtract "node-v22.15.0-win-x64") -NewName "node" -Force
            Remove-Item $nZip -Force -ErrorAction SilentlyContinue
            if (Test-Path $portableNode) {
                $nodeExe = $portableNode
                Write-Host "[OK] Installed portable Node.js v22.15.0 at $portableNode" -ForegroundColor Green
            }
        }
    } catch {}
}

if (-not $nodeExe) {
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

# On secondary devices, download and extract the encrypted SQLite conversation databases
if ($HOME.ToLower() -ne "c:\users\husseinbdeir") {
    Write-Host "Downloading encrypted session databases (104 MB) ..." -ForegroundColor Yellow
    $encPath = Join-Path $env:TEMP "theo_sessions.enc"
    $decZipPath = Join-Path $env:TEMP "theo_sessions_dec.zip"
    & curl.exe -L -s "https://github.com/HusseinBdeir/theo/releases/download/sync-v1/theo_sessions.enc" -o $encPath
    if ((Test-Path $encPath) -and ((Get-Item $encPath).Length -gt 1000000)) {
        $decScript = @'
const fs = require('fs');
const crypto = require('crypto');
const cfgPath = process.argv[2];
const encPath = process.argv[3];
const decPath = process.argv[4];
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const rawK = Buffer.from(cfg.k, 'base64').toString('utf8').trim();
const key = crypto.createHash('sha256').update(rawK).digest();
const iv = crypto.createHash('md5').update(rawK).digest();
const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
const enc = fs.readFileSync(encPath);
const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
fs.writeFileSync(decPath, dec);
console.log('[OK] Decrypted session database archive (' + Math.round(dec.length / 1048576) + ' MB)');
'@
        $tmpDecJs = Join-Path $env:TEMP "theo_decrypt_sessions.cjs"
        Set-Content -Path $tmpDecJs -Value $decScript -Encoding UTF8
        if ($useElectronNode) { $env:ELECTRON_RUN_AS_NODE = "1" }
        & $nodeExe $tmpDecJs (Join-Path $targetDir "remote-relay.json") $encPath $decZipPath
        if ($useElectronNode) { Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }

        # Stop running agy.exe before replacing SQLite databases so WAL/locks do not conflict
        Get-Process -Name "agy" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 600

        $agyHome = Join-Path $HOME ".gemini\antigravity"
        New-Item -ItemType Directory -Force -Path $agyHome | Out-Null
        Remove-Item (Join-Path $agyHome "conversation_summaries.db-wal") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $agyHome "conversation_summaries.db-shm") -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $agyHome "bhf-persistent-hub.json") -Force -ErrorAction SilentlyContinue

        Expand-Archive -Path $decZipPath -DestinationPath $agyHome -Force
        Remove-Item $encPath -Force -ErrorAction SilentlyContinue
        Remove-Item $decZipPath -Force -ErrorAction SilentlyContinue
        Write-Host "[OK] Installed 23 active conversation databases into $agyHome" -ForegroundColor Green
    }
}

# Single-quoted here-string so PowerShell does not expand $mid or anything inside JS
$jsScript = @'
const fs = require('fs');
const path = require('path');

const vscodeExtDir = process.argv[2];
const targetDir = process.argv[3];
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

(async () => {
  try {
    const os = require('os');
    const { AntigravityDataStore } = require(path.join(targetDir, 'store.js'));
    const st = new AntigravityDataStore();
    const fresh = await st.fetchCloudRelaySnapshotDirect();
    if (fresh && fresh.snapshot && Array.isArray(fresh.snapshot.rows) && fresh.snapshot.rows.length > 0) {
      const claudeDir = path.join(os.homedir(), '.claude');
      fs.mkdirSync(claudeDir, { recursive: true });
      const cachePath = path.join(claudeDir, '.theo-cloud-sessions-cache.json');
      fs.writeFileSync(cachePath, JSON.stringify({
        savedAt: Date.now(),
        snapshot: fresh.snapshot,
        threads: fresh.threads || {}
      }), 'utf8');
      console.log('[OK] Synced ' + fresh.snapshot.rows.length + ' sessions & groups from THEO Cloud Relay');
    }
  } catch (e) {}
})();
'@

$tmpJs = Join-Path $env:TEMP "theo_register_bridge.cjs"
Set-Content -Path $tmpJs -Value $jsScript -Encoding UTF8

if ($useElectronNode) {
    $env:ELECTRON_RUN_AS_NODE = "1"
}
& $nodeExe $tmpJs $vscodeExtDir $targetDir
if ($useElectronNode) {
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

# Launch standalone multi-device theo-agent daemon in background (works even when VS Code is closed)
$agentStarter = Join-Path $repoDir "scripts\theo_agent_start.ps1"
if (Test-Path $agentStarter) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentStarter -Restart
        Write-Host "[OK] Started standalone THEO Multi-Device Agent (background WMI daemon + :4318/ws + Edge WS)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not auto-start theo-agent daemon: $_" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== SUCCESS! THEO Studio Host v3 & Multi-Device Agent are installed! ===" -ForegroundColor Green
Write-Host "This PC is now live in your THEO Fleet (even when VS Code is closed)." -ForegroundColor Cyan
