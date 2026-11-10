$ErrorActionPreference = 'Stop'

# When OneDrive has already synced System\System\THEO on this PC, delegate directly to
# the canonical dynamic per-PC setup (handles runtimes, THEO_PAIR_TOKEN, theo-hub, hooks,
# autoMode, git identity, pre-commit secret scan, memory gitdir and any future steps).
$theoRootCandidates = @()
if ($env:THEO_MEMORY_ROOT) { $theoRootCandidates += $env:THEO_MEMORY_ROOT }
if ($env:OneDriveCommercial) { $theoRootCandidates += (Join-Path $env:OneDriveCommercial "System\System\THEO") }
$theoRootCandidates += (Join-Path $HOME "OneDrive - BHFIRMS\System\System\THEO")
foreach ($candRoot in $theoRootCandidates) {
    $odSetupPs1 = Join-Path $candRoot "Admin\Setup-THEO-PC.ps1"
    $odSetupPy  = Join-Path $candRoot "Admin\theo-pc-setup.py"
    if ((Test-Path -LiteralPath $odSetupPs1) -and (Test-Path -LiteralPath $odSetupPy)) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $odSetupPs1 @args
        if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) {
            throw "Setup-THEO-PC.ps1 failed with exit code $LASTEXITCODE."
        }
        return
    }
}

Write-Host "=== Installing THEO Extension & Multi-Device Fleet Agent ===" -ForegroundColor Cyan

$extId = "bhfirms.theo-hub"
$version = "0.1.0"
$folderName = "$extId-$version"
$vscodeExtDir = Join-Path $HOME ".vscode\extensions"
$targetDir = Join-Path $vscodeExtDir $folderName
$repoDir = Join-Path $HOME "bhfirms\theo-hub"

New-Item -ItemType Directory -Force -Path $vscodeExtDir | Out-Null
New-Item -ItemType Directory -Force -Path $repoDir | Out-Null

# Stop any running relay_keepalive daemon BEFORE overwriting extension/repo files (#39.1)
try {
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe' OR Name = 'Code.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -like '*relay_keepalive.cjs*' } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Sleep -Milliseconds 350
} catch {}

# Locate or download theo-hub-bundle.zip
$localZip = $null
if ($PSScriptRoot) {
    $candidate = Join-Path $PSScriptRoot "theo-hub-bundle.zip"
    if (Test-Path $candidate) { $localZip = $candidate }
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
if (-not (Test-Path (Join-Path $repoDir ".git"))) {
    Expand-Archive -Path $localZip -DestinationPath $repoDir -Force
}

$agyExtRoot = Join-Path $HOME ".antigravity\extensions"
$agyTargetDir = $null
if (Test-Path $agyExtRoot) {
    $agyTargetDir = Join-Path $agyExtRoot $folderName
    if (Test-Path $agyTargetDir) { Remove-Item -Recurse -Force $agyTargetDir }
    New-Item -ItemType Directory -Force -Path $agyTargetDir | Out-Null
    Expand-Archive -Path $localZip -DestinationPath $agyTargetDir -Force
}
Write-Host "[OK] Extracted THEO Multi-Device Studio files to $targetDir and $repoDir" -ForegroundColor Green

# Find or bootstrap Node v22+ runtime (ARM64 vs x64 aware, #39.2 & #39.3)
$nodeExe = $null
$useElectronNode = $false
$portableNodeDir = Join-Path $HOME ".local\node"
$portableNode = Join-Path $portableNodeDir "node.exe"
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
        $archSlug = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') { 'win-arm64' } else { 'win-x64' }
        $expectedSha = if ($archSlug -eq 'win-arm64') {
            '737cd7046d96575c2d6cd36e0355afba54b79296b0f403ef4b3b1b5852b10ab6'
        } else {
            '06067d4f0d463f90ed803d5eca5b039a05dec5d70fc7b7cc254803a59bd0e27c'
        }
        $nodeFolder = "node-v22.15.0-$archSlug"
        Write-Host "Bootstrapping portable Node.js v22.15.0 ($archSlug) into $portableNodeDir ..." -ForegroundColor Yellow
        $nZip = Join-Path $env:TEMP "$nodeFolder.zip"
        $nExtract = Join-Path $HOME ".local"
        New-Item -ItemType Directory -Force -Path $nExtract | Out-Null
        & curl.exe -L -s "https://nodejs.org/dist/v22.15.0/$nodeFolder.zip" -o $nZip
        if (Test-Path $nZip) {
            $gotSha = (Get-FileHash -LiteralPath $nZip -Algorithm SHA256).Hash.ToLowerInvariant()
            if ($gotSha -eq $expectedSha) {
                if (Test-Path $portableNodeDir) { Remove-Item -Recurse -Force $portableNodeDir }
                Expand-Archive -Path $nZip -DestinationPath $nExtract -Force
                Rename-Item -Path (Join-Path $nExtract $nodeFolder) -NewName "node" -Force
                if (Test-Path $portableNode) {
                    $nodeExe = $portableNode
                    Write-Host "[OK] Installed portable Node.js v22.15.0 at $portableNode" -ForegroundColor Green
                }
            } else {
                Write-Host "[WARN] Node.js archive SHA-256 mismatch ($gotSha); skipped portable extract." -ForegroundColor Yellow
            }
            Remove-Item $nZip -Force -ErrorAction SilentlyContinue
        }
    } catch {}
}

if (Test-Path $portableNodeDir) {
    $env:PATH = "$portableNodeDir;$env:PATH"
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

# Optional 1-line pairing token provisioning -> ~/.theo/credentials.json (mode 0600 / user ACL, #16)
if ($env:THEO_PAIR_TOKEN) {
    $pairScript = @'
const path = require('path');
const { parsePairTokenBase64Url, saveTheoCredentials, loadTheoCredentials } = require(path.join(process.argv[2], 'device-identity.js'));
const parsed = parsePairTokenBase64Url(process.env.THEO_PAIR_TOKEN || '');
if (!parsed) {
  console.error('[ERROR] THEO_PAIR_TOKEN could not be decoded.');
  process.exit(2);
}
const existing = loadTheoCredentials();
saveTheoCredentials({
  ...existing,
  cloudUrl: parsed.cloudKey && parsed.cloudUrl ? parsed.cloudUrl : existing.cloudUrl,
  cloudKey: parsed.cloudKey || existing.cloudKey,
  edgeAccessKey: parsed.edgeAccessKey ? parsed.edgeAccessKey : (parsed.cloudKey ? '' : existing.edgeAccessKey),
  edgeRelayUrl: (parsed.edgeAccessKey || parsed.cloudKey) && parsed.edgeRelayUrl ? parsed.edgeRelayUrl : existing.edgeRelayUrl,
  port: parsed.port || existing.port || 4318
});
console.log('[OK] Provisioned ~/.theo/credentials.json from THEO_PAIR_TOKEN');
process.exit(0);
'@
    $tmpPairJs = Join-Path $env:TEMP "theo_apply_pair.cjs"
    Set-Content -Path $tmpPairJs -Value $pairScript -Encoding UTF8
    if ($useElectronNode) { $env:ELECTRON_RUN_AS_NODE = "1" }
    & $nodeExe $tmpPairJs $repoDir
    $pairExit = $LASTEXITCODE
    if ($useElectronNode) { Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue }
    Remove-Item $tmpPairJs -Force -ErrorAction SilentlyContinue
    if ($pairExit -ne 0) {
        throw "THEO_PAIR_TOKEN could not be decoded or saved to ~/.theo/credentials.json."
    }
    $credFile = Join-Path $HOME ".theo\credentials.json"
    if (Test-Path $credFile) {
        & icacls.exe $credFile /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
    }
}

# Single-quoted here-string so PowerShell does not expand $mid or anything inside JS
$jsScript = @'
const fs = require('fs');
const path = require('path');

const extId = 'bhfirms.theo-hub';
const legacyId = 'bhfirms.antigravity-hub';
const version = '0.1.0';
const folderName = extId + '-' + version;

function registerAndPatchRoot(extRootDir, installedDir) {
  if (!extRootDir || !installedDir || !fs.existsSync(extRootDir) || !fs.existsSync(installedDir)) return;
  const extJsonPath = path.join(extRootDir, 'extensions.json');
  let entries = [];
  if (fs.existsSync(extJsonPath)) {
    try { entries = JSON.parse(fs.readFileSync(extJsonPath, 'utf8')); } catch {}
  }
  entries = entries.filter(e => {
    const id = String((e && e.identifier && e.identifier.id) || '').toLowerCase();
    return id !== extId && id !== legacyId;
  });

  let posixPath = '/' + installedDir.replace(/\\/g, '/');
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
  console.log('[OK] Registered ' + extId + ' in ' + extJsonPath);

  const bridge = require(path.join(installedDir, 'bridge.js'));
  for (const entry of fs.readdirSync(extRootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const fullDir = path.join(extRootDir, entry.name);
    if (/^google\.google-antigravity-/i.test(entry.name)) {
      const res = bridge.ensureBridgeInstalledForExtensionDir(fullDir, installedDir);
      console.log('[OK] Patched Google Antigravity in ' + fullDir + ' (installed=' + Boolean(res && res.installed) + ')');
    } else if (/^anthropic\.claude-code-/i.test(entry.name)) {
      const res = bridge.ensureClaudeBridgeInstalledForExtensionDir(fullDir, installedDir);
      console.log('[OK] Patched Claude Code in ' + fullDir + ' (installed=' + Boolean(res && res.installed) + ')');
    }
  }
}

registerAndPatchRoot(process.argv[2], process.argv[3]);
if (process.argv[4] && process.argv[5]) {
  registerAndPatchRoot(process.argv[4], process.argv[5]);
}

(async () => {
  try {
    const os = require('os');
    const { AntigravityDataStore } = require(path.join(process.argv[3], 'store.js'));
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
})().finally(() => {
  process.exit(0);
});
'@

$tmpJs = Join-Path $env:TEMP "theo_register_bridge.cjs"
Set-Content -Path $tmpJs -Value $jsScript -Encoding UTF8

if ($useElectronNode) {
    $env:ELECTRON_RUN_AS_NODE = "1"
}
if ($agyTargetDir) {
    & $nodeExe $tmpJs $vscodeExtDir $targetDir $agyExtRoot $agyTargetDir
} else {
    & $nodeExe $tmpJs $vscodeExtDir $targetDir
}
if ($useElectronNode) {
    Remove-Item Env:\ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}
Remove-Item $tmpJs -Force -ErrorAction SilentlyContinue

# Launch standalone multi-device relay_keepalive daemon in background (works even when VS Code is closed)
$agentStarter = Join-Path $repoDir "scripts\relay_keepalive_start.ps1"
if (-not (Test-Path $agentStarter)) {
    $agentStarter = Join-Path $repoDir "scripts\theo_agent_start.ps1"
}
if (Test-Path $agentStarter) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $agentStarter -Restart
        Write-Host "[OK] Started standalone THEO Multi-Device Agent (background daemon + 127.0.0.1:4318 + Edge WS)" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Could not auto-start theo-agent daemon: $_" -ForegroundColor Yellow
    }
}

$desktopShortcutInstaller = Join-Path $repoDir "scripts\install_desktop_shortcut.ps1"
if (Test-Path $desktopShortcutInstaller) {
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $desktopShortcutInstaller
    } catch {
        Write-Host "[WARN] Could not register THEO Desktop shortcut: $_" -ForegroundColor Yellow
    }
}

# Pre-seed ~/.claude/CLAUDE.md pointer and ~/.gemini/config (AGENTS.md + THEO project) so that
# as soon as OneDrive finishes syncing System\System\THEO on a brand-new PC, the first Claude Code
# or Antigravity session opened anywhere on this PC knows THEO.md and Setup-THEO-PC.ps1.
try {
    $odBase = if ($env:OneDriveCommercial) { $env:OneDriveCommercial } else { Join-Path $HOME "OneDrive - BHFIRMS" }
    $theoRootGuess = if ($env:THEO_MEMORY_ROOT) { $env:THEO_MEMORY_ROOT } else { Join-Path $odBase "System\System\THEO" }
    $theoIndexPath = Join-Path $theoRootGuess "THEO.md"
    $setupPs1Guess = Join-Path $theoRootGuess "Admin\Setup-THEO-PC.ps1"
    $ptrText = @"
# THEO

You are THEO, Hussein Bdeir's assistant. The project memory index lives outside this folder. Unless its text (the title ends "BHFIRMS & ISABI Systems Project Memory (Index)") is already in this conversation, read it before any BHFIRMS, ISABI or THEO work:

``$theoIndexPath``

It routes to the topic files and holds the hard rules (per-PC bootstrap if unconfigured: ``powershell -NoProfile -ExecutionPolicy Bypass -File "$setupPs1Guess"``). Skip it only for questions unrelated to those projects.
"@
    $claudePointer = Join-Path $HOME ".claude\CLAUDE.md"
    if (-not (Test-Path -LiteralPath $claudePointer)) {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $claudePointer) | Out-Null
        [System.IO.File]::WriteAllText($claudePointer, ($ptrText -replace "`r`n", "`n"))
    }
    $gemConfigDir = Join-Path $HOME ".gemini\config"
    $gemAgentsPath = Join-Path $gemConfigDir "AGENTS.md"
    if (-not (Test-Path -LiteralPath $gemAgentsPath)) {
        New-Item -ItemType Directory -Force -Path $gemConfigDir | Out-Null
        [System.IO.File]::WriteAllText($gemAgentsPath, ($ptrText -replace "`r`n", "`n"))
        [System.IO.File]::SetLastWriteTimeUtc($gemAgentsPath, [datetime]::new(2000, 1, 1, 0, 0, 0, [System.DateTimeKind]::Utc))
    }
    $gemProjDir = Join-Path $gemConfigDir "projects"
    New-Item -ItemType Directory -Force -Path $gemProjDir | Out-Null
    $theoFolderPosix = $theoRootGuess.Replace('\', '/')
    $driveLower = $theoFolderPosix.Substring(0, 1).ToLowerInvariant()
    $escapedRest = [System.Uri]::EscapeDataString($theoFolderPosix.Substring(2)).Replace('%2F', '/')
    $projPayload = @"
{
  "id": "c509f84b-f012-4596-9da5-8fec208449e8",
  "name": "THEO",
  "projectResources": {
    "resources": [
      {
        "folderUri": "file:///${driveLower}%3A${escapedRest}"
      }
    ]
  }
}
"@
    [System.IO.File]::WriteAllText((Join-Path $gemProjDir "c509f84b-f012-4596-9da5-8fec208449e8.json"), $projPayload)
} catch {}

Write-Host ""
Write-Host "=== SUCCESS! THEO Studio Host & Multi-Device Agent are installed! ===" -ForegroundColor Green
Write-Host "This PC is now live in your THEO Fleet (even when VS Code is closed)." -ForegroundColor Cyan
Write-Host "Once OneDrive syncs System\System\THEO on this PC, run full dynamic PC setup:" -ForegroundColor Yellow
Write-Host '  powershell -NoProfile -ExecutionPolicy Bypass -File "$HOME\OneDrive - BHFIRMS\System\System\THEO\Admin\Setup-THEO-PC.ps1"' -ForegroundColor White
