param(
    [switch]$Gui,
    [switch]$Check,
    [switch]$Headless,
    [string]$Only = "",
    [string]$PairCode = "",
    [string]$PairToken = "",
    [switch]$SelftestGui
)
$ErrorActionPreference = 'Stop'

if ($PairCode) { $env:THEO_PAIR_CODE = $PairCode }
if ($PairToken) { $env:THEO_PAIR_TOKEN = $PairToken }
$wantGui = ($Gui -or ($env:THEO_SETUP_GUI -eq '1') -or $SelftestGui) -and (-not $Headless) -and (-not $Check)

# When ~/bhfirms/memory already exists on this PC, delegate directly to the canonical
# dynamic per-PC setup (handles runtimes, THEO_PAIR_CODE / THEO_PAIR_TOKEN, theo-hub,
# hooks, autoMode, git identity, pre-commit secret scan, memory gitdir, shortcut and any
# future manifest steps). The retired OneDrive THEO folder is never consulted.
$theoRootCandidates = @()
if ($env:THEO_MEMORY_ROOT) { $theoRootCandidates += $env:THEO_MEMORY_ROOT }
$theoRootCandidates += (Join-Path $HOME "bhfirms\memory")
if ($env:THEO_FORCE_STANDALONE_BOOTSTRAP -ne '1') {
    foreach ($candRoot in $theoRootCandidates) {
        $odSetupPs1 = Join-Path $candRoot "Admin\Setup-THEO-PC.ps1"
        $odSetupPy  = Join-Path $candRoot "Admin\theo-pc-setup.py"
        if ((Test-Path -LiteralPath $odSetupPs1) -and (Test-Path -LiteralPath $odSetupPy)) {
            $fwdArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass')
            if ($wantGui) { $fwdArgs += '-STA' }
            $fwdArgs += @('-File', $odSetupPs1)
            if ($SelftestGui) { $fwdArgs += '-SelftestGui' }
            elseif ($Check) {
                $fwdArgs += '-Check'
                if ($Only) { $fwdArgs += @('-Only', $Only) }
            }
            elseif ($wantGui) { $fwdArgs += '-Gui' }
            else {
                if ($Headless) { $fwdArgs += '-Headless' }
                if ($Only) { $fwdArgs += @('-Only', $Only) }
            }
            & powershell.exe @fwdArgs
            if ($Check) {
                exit $LASTEXITCODE
            }
            if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 2) {
                throw "Setup-THEO-PC.ps1 failed with exit code $LASTEXITCODE."
            }
            return
        }
    }
}

function Test-StandaloneHasLocalPairing {
    $credPath = if ($env:THEO_CRED_PATH) { $env:THEO_CRED_PATH } else { Join-Path $HOME '.theo\credentials.json' }
    if (-not (Test-Path -LiteralPath $credPath)) { return $false }
    try {
        $obj = Get-Content -LiteralPath $credPath -Raw -Encoding UTF8 | ConvertFrom-Json
        $ek = [string]$obj.edgeAccessKey
        $ck = [string]$obj.cloudKey
        return (-not [string]::IsNullOrWhiteSpace($ek)) -or (-not [string]::IsNullOrWhiteSpace($ck))
    } catch {
        return $false
    }
}

function Invoke-StandaloneTheoCheck {
    $extEntry = Join-Path $HOME '.vscode\extensions\bhfirms.theo-hub-0.1.0\extension.js'
    $claudePtr = Join-Path $HOME '.claude\CLAUDE.md'
    $geminiPtr = Join-Path $HOME '.gemini\config\AGENTS.md'
    $hasNode = (Test-Path -LiteralPath (Join-Path $HOME '.local\node\node.exe')) -or
        [bool](Get-Command node -ErrorAction SilentlyContinue) -or
        (Test-Path -LiteralPath 'C:\Program Files\nodejs\node.exe') -or
        (Test-Path -LiteralPath "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe") -or
        (Test-Path -LiteralPath "$env:ProgramFiles\Microsoft VS Code\Code.exe")
    $checks = @(
        @{ id = 'theo-hub'; ok = (Test-Path -LiteralPath $extEntry) },
        @{ id = 'node-runtime'; ok = [bool]$hasNode },
        @{ id = 'claude-pointer'; ok = (Test-Path -LiteralPath $claudePtr) },
        @{ id = 'antigravity-pointer'; ok = (Test-Path -LiteralPath $geminiPtr) }
    )
    $allOk = $true
    foreach ($c in $checks) {
        $tag = if ($c.ok) { '[OK]' } else { $allOk = $false; '[PENDING]' }
        Write-Host "  $tag $($c.id)"
    }
    if ($allOk) { exit 0 } else { exit 2 }
}

function Claim-StandaloneTheoPairCode {
    param([string]$RawCode)
    $digits = ($RawCode -replace '\D+', '')
    if ($digits.Length -ne 6) {
        throw "6-digit pairing code required (got '$RawCode')."
    }
    $edgeBase = if ($env:THEO_EDGE_HTTP_URL) { $env:THEO_EDGE_HTTP_URL.TrimEnd('/') } else { 'https://theo-edge-relay.husseinbdeir.workers.dev' }
    if ($edgeBase -notmatch '^https://' -and $edgeBase -notmatch '^http://(127\.0\.0\.1|localhost)(:\d+)?$') {
        throw "Refusing non-HTTPS Edge Relay URL for pair claim: $edgeBase"
    }
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    $claimBody = @{ code = $digits } | ConvertTo-Json -Compress
    $resp = Invoke-RestMethod -Method Post -Uri "$edgeBase/pair/claim" -ContentType 'application/json' -Body $claimBody -TimeoutSec 15
    if (-not $resp -or -not $resp.ok -or [string]::IsNullOrWhiteSpace([string]$resp.bundle)) {
        $errMsg = if ($resp -and $resp.error) { [string]$resp.error } else { 'Invalid or expired 6-digit pairing code.' }
        throw $errMsg
    }
    $env:THEO_PAIR_TOKEN = [string]$resp.bundle
    Remove-Item Env:\THEO_PAIR_CODE -ErrorAction SilentlyContinue
}

function Show-StandaloneBootstrapGui {
    param([switch]$SelftestOnly)

    if (-not $SelftestOnly -and [System.Threading.Thread]::CurrentThread.ApartmentState -ne 'STA') {
        if ($PSCommandPath -and (Test-Path -LiteralPath $PSCommandPath)) {
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File $PSCommandPath -Gui
            return
        }
    }

    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    try {
        Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();' -Name 'Win32Dpi' -Namespace 'TheoBootstrap' -ErrorAction SilentlyContinue | Out-Null
        [TheoBootstrap.Win32Dpi]::SetProcessDPIAware() | Out-Null
    } catch {}
    [System.Windows.Forms.Application]::EnableVisualStyles()

    $bgMain  = [System.Drawing.Color]::FromArgb(17, 17, 20)
    $bgCard  = [System.Drawing.Color]::FromArgb(24, 24, 29)
    $bgRow   = [System.Drawing.Color]::FromArgb(29, 29, 35)
    $fgMain  = [System.Drawing.Color]::FromArgb(242, 241, 237)
    $fgMuted = [System.Drawing.Color]::FromArgb(156, 156, 166)
    $brass   = [System.Drawing.Color]::FromArgb(204, 168, 114)
    $brassFg = [System.Drawing.Color]::FromArgb(18, 18, 20)
    $okGreen = [System.Drawing.Color]::FromArgb(62, 180, 137)
    $errRed  = [System.Drawing.Color]::FromArgb(224, 98, 98)

    $form = New-Object System.Windows.Forms.Form
    $form.Text = "THEO PC Setup"
    $form.ClientSize = New-Object System.Drawing.Size(540, 296)
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.StartPosition = 'CenterScreen'
    $form.BackColor = $bgMain
    $form.ForeColor = $fgMain

    $lblTitle = New-Object System.Windows.Forms.Label
    $lblTitle.Text = "THEO  ·  First-Time PC Setup ($env:COMPUTERNAME)"
    $lblTitle.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 13.0)
    $lblTitle.ForeColor = $fgMain
    $lblTitle.Location = New-Object System.Drawing.Point(20, 18)
    $lblTitle.AutoSize = $true
    $form.Controls.Add($lblTitle)

    $lblSub = New-Object System.Windows.Forms.Label
    $lblSub.Text = "Installs THEO Studio, pairs this PC to your fleet, and starts the background agent."
    $lblSub.Font = New-Object System.Drawing.Font('Segoe UI', 9.0)
    $lblSub.ForeColor = $fgMuted
    $lblSub.Location = New-Object System.Drawing.Point(22, 46)
    $lblSub.AutoSize = $true
    $form.Controls.Add($lblSub)

    $pairPanel = New-Object System.Windows.Forms.Panel
    $pairPanel.Location = New-Object System.Drawing.Point(20, 82)
    $pairPanel.Size = New-Object System.Drawing.Size(500, 48)
    $pairPanel.BackColor = $bgCard
    $form.Controls.Add($pairPanel)

    $lblPair = New-Object System.Windows.Forms.Label
    $lblPair.Text = "6-Digit Fleet Pair Code (optional, from phone / other PC):"
    $lblPair.Font = New-Object System.Drawing.Font('Segoe UI', 8.8)
    $lblPair.ForeColor = $fgMuted
    $lblPair.Location = New-Object System.Drawing.Point(14, 15)
    $lblPair.AutoSize = $true
    $pairPanel.Controls.Add($lblPair)

    $txtPair = New-Object System.Windows.Forms.TextBox
    $txtPair.Font = New-Object System.Drawing.Font('Consolas', 10.0)
    $txtPair.BackColor = $bgRow
    $txtPair.ForeColor = $fgMain
    $txtPair.BorderStyle = 'FixedSingle'
    $txtPair.MaxLength = 12
    $txtPair.Location = New-Object System.Drawing.Point(356, 12)
    $txtPair.Size = New-Object System.Drawing.Size(128, 24)
    $alreadyPaired = Test-StandaloneHasLocalPairing
    if ((-not $alreadyPaired) -and $env:THEO_PAIR_CODE) { $txtPair.Text = $env:THEO_PAIR_CODE }
    $pairPanel.Visible = (-not $alreadyPaired)
    $pairPanel.Controls.Add($txtPair)

    $statusPanel = New-Object System.Windows.Forms.Panel
    $statusPanel.Location = New-Object System.Drawing.Point(20, 142)
    $statusPanel.Size = New-Object System.Drawing.Size(500, 78)
    $statusPanel.BackColor = $bgCard
    $form.Controls.Add($statusPanel)

    $lblStatus = New-Object System.Windows.Forms.Label
    $lblStatus.Text = "Ready to install. THEO memory syncs directly from Cloudflare into ~/bhfirms/memory."
    $lblStatus.Font = New-Object System.Drawing.Font('Segoe UI', 9.0)
    $lblStatus.ForeColor = $fgMuted
    $lblStatus.Location = New-Object System.Drawing.Point(14, 14)
    $lblStatus.MaximumSize = New-Object System.Drawing.Size(472, 54)
    $lblStatus.AutoSize = $true
    $statusPanel.Controls.Add($lblStatus)

    $btnClose = New-Object System.Windows.Forms.Button
    $btnClose.Text = "Close"
    $btnClose.Font = New-Object System.Drawing.Font('Segoe UI', 9.0)
    $btnClose.FlatStyle = 'Flat'
    $btnClose.BackColor = $bgCard
    $btnClose.ForeColor = $fgMain
    $btnClose.Location = New-Object System.Drawing.Point(312, 238)
    $btnClose.Size = New-Object System.Drawing.Size(96, 36)
    $btnClose.Add_Click({ $form.Close() })
    $form.Controls.Add($btnClose)

    $btnInstall = New-Object System.Windows.Forms.Button
    $btnInstall.Text = "Install THEO"
    $btnInstall.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 9.5)
    $btnInstall.FlatStyle = 'Flat'
    $btnInstall.BackColor = $brass
    $btnInstall.ForeColor = $brassFg
    $btnInstall.Location = New-Object System.Drawing.Point(416, 238)
    $btnInstall.Size = New-Object System.Drawing.Size(104, 36)
    $form.Controls.Add($btnInstall)

    if ($SelftestOnly) {
        $out = @{
            guiReady   = $true
            standalone = $true
            pc         = [string]$env:COMPUTERNAME
            pairPrefill = [string]$txtPair.Text
        } | ConvertTo-Json -Compress
        Write-Output $out
        $form.Dispose()
        return
    }

    $script:runProc = $null
    $script:outQueue = [System.Collections.Concurrent.ConcurrentQueue[string]]::new()
    $script:lastOutLine = ""
    $pollTimer = New-Object System.Windows.Forms.Timer
    $pollTimer.Interval = 220
    $pollTimer.Add_Tick({
        $line = $null
        while ($script:outQueue.TryDequeue([ref]$line)) {
            if (-not [string]::IsNullOrWhiteSpace($line)) {
                $script:lastOutLine = $line.Trim()
                $lblStatus.Text = $script:lastOutLine
            }
        }
        if ($script:runProc -and $script:runProc.HasExited) {
            $pollTimer.Stop()
            $exitCode = $script:runProc.ExitCode
            $script:runProc.Dispose()
            $script:runProc = $null
            if (Test-StandaloneHasLocalPairing) {
                $txtPair.Text = ''
                $pairPanel.Visible = $false
            } else {
                $txtPair.Enabled = $true
            }
            if ($exitCode -eq 0) {
                $txtPair.Text = ''
                $lblStatus.ForeColor = $okGreen
                $lblStatus.Text = "Installed & live! Click 'Apply Setup' in the THEO sidebar or open 'Set Up This PC.cmd' in ~/bhfirms/memory."
                $btnInstall.Text = "Re-Verify"
                $btnInstall.Enabled = $true
                $btnClose.Text = "Done"
            } else {
                $lblStatus.ForeColor = $errRed
                $errTail = if ($script:lastOutLine) { $script:lastOutLine } else { "Install exited with code $exitCode." }
                $lblStatus.Text = $errTail
                $btnInstall.Text = "Retry"
                $btnInstall.Enabled = $true
            }
        }
    })

    $btnInstall.Add_Click({
        if ($script:runProc -and (-not $script:runProc.HasExited)) { return }
        $isPairedNow = Test-StandaloneHasLocalPairing
        $enteredCode = ($txtPair.Text -replace '\s+', '').Trim()
        $cleanDigits = ""
        if ((-not $isPairedNow) -and $enteredCode) {
            $cleanDigits = ($enteredCode -replace '\D+', '')
            if ($cleanDigits.Length -ne 6) {
                $lblStatus.ForeColor = $errRed
                $lblStatus.Text = "Pairing code must be 6 digits (for example 482-917)."
                return
            }
        }
        $btnInstall.Enabled = $false
        $txtPair.Enabled = $false
        $lblStatus.ForeColor = $fgMain
        $lblStatus.Text = "Installing THEO Studio & multi-device agent..."
        $script:lastOutLine = ""
        $drain = $null
        while ($script:outQueue.TryDequeue([ref]$drain)) {}

        if ($PSCommandPath -and (Test-Path -LiteralPath $PSCommandPath)) {
            $psi = New-Object System.Diagnostics.ProcessStartInfo
            $psi.FileName = 'powershell.exe'
            $psi.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Headless"
            $psi.UseShellExecute = $false
            $psi.CreateNoWindow = $true
            $psi.RedirectStandardOutput = $true
            $psi.RedirectStandardError = $true
            $psi.StandardOutputEncoding = [System.Text.Encoding]::UTF8
            $psi.StandardErrorEncoding = [System.Text.Encoding]::UTF8
            $psi.EnvironmentVariables['THEO_SETUP_GUI'] = '0'
            if ($cleanDigits) {
                $psi.EnvironmentVariables['THEO_PAIR_CODE'] = $cleanDigits
            } else {
                $null = $psi.EnvironmentVariables.Remove('THEO_PAIR_CODE')
            }
            $p = New-Object System.Diagnostics.Process
            $p.StartInfo = $psi
            $q = $script:outQueue
            $handler = [System.Diagnostics.DataReceivedEventHandler]{
                param($sender, $e)
                if ($e.Data) { $q.Enqueue($e.Data) }
            }
            $p.add_OutputDataReceived($handler)
            $p.add_ErrorDataReceived($handler)
            [void]$p.Start()
            $p.BeginOutputReadLine()
            $p.BeginErrorReadLine()
            $script:runProc = $p
            $pollTimer.Start()
        } else {
            $form.Update()
            try {
                if ($cleanDigits) { $env:THEO_PAIR_CODE = $cleanDigits } else { Remove-Item Env:\THEO_PAIR_CODE -ErrorAction SilentlyContinue }
                Invoke-StandaloneTheoBootstrap
                $txtPair.Text = ''
                $pairPanel.Visible = $false
                $lblStatus.ForeColor = $okGreen
                $lblStatus.Text = "Installed & live! Click 'Apply Setup' in the THEO sidebar or open 'Set Up This PC.cmd' in ~/bhfirms/memory."
                $btnInstall.Text = "Done"
                $btnClose.Text = "Done"
            } catch {
                if (Test-StandaloneHasLocalPairing) {
                    $txtPair.Text = ''
                    $pairPanel.Visible = $false
                } else {
                    $txtPair.Enabled = $true
                }
                $lblStatus.ForeColor = $errRed
                $lblStatus.Text = $_.Exception.Message
                $btnInstall.Text = "Retry"
                $btnInstall.Enabled = $true
            }
        }
    })

    $form.Add_FormClosing({
        param($sender, $e)
        if ($script:runProc -and (-not $script:runProc.HasExited)) {
            $ans = [System.Windows.Forms.MessageBox]::Show(
                "THEO PC Setup is currently installing. Cancel the running install and close?",
                "THEO PC Setup",
                [System.Windows.Forms.MessageBoxButtons]::YesNo,
                [System.Windows.Forms.MessageBoxIcon]::Warning
            )
            if ($ans -ne [System.Windows.Forms.DialogResult]::Yes) {
                $e.Cancel = $true
                return
            }
            try { $script:runProc.Kill() } catch {}
            try { $script:runProc.Dispose() } catch {}
            $script:runProc = $null
        }
        $pollTimer.Stop()
        $pollTimer.Dispose()
    })

    [void]$form.ShowDialog()
    $form.Dispose()
}

function Invoke-StandaloneTheoBootstrap {
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

# Optional 1-line pairing token / 6-digit code provisioning -> ~/.theo/credentials.json (mode 0600 / user ACL, #16).
# Claimed ONLY after bundle + Node are ready, and skipped when local pairing credentials already exist.
$onlyAllowsHub = [string]::IsNullOrWhiteSpace($Only) -or ((($Only -split ',') | ForEach-Object { $_.Trim().ToLowerInvariant() }) -contains 'theo-hub')
if ((Test-StandaloneHasLocalPairing) -or (-not $onlyAllowsHub)) {
    Remove-Item Env:\THEO_PAIR_CODE -ErrorAction SilentlyContinue
} elseif ((-not $env:THEO_PAIR_TOKEN) -and $env:THEO_PAIR_CODE) {
    Write-Host "Claiming 6-digit THEO fleet pairing code ..." -ForegroundColor Yellow
    Claim-StandaloneTheoPairCode -RawCode $env:THEO_PAIR_CODE
    Write-Host "[OK] Claimed single-use pairing code" -ForegroundColor Green
}

if ($env:THEO_PAIR_TOKEN) {
    $pairModDir = if (Test-Path (Join-Path $repoDir "device-identity.js")) { $repoDir } else { $targetDir }
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
    & $nodeExe $tmpPairJs $pairModDir
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
  try {
    const os = require('os');
    const memRoot = path.join(os.homedir(), 'bhfirms', 'memory');
    const syncScript = path.join(process.argv[3], 'scripts', 'memory_cloud_sync.cjs');
    if (!fs.existsSync(path.join(memRoot, 'THEO.md')) && fs.existsSync(syncScript)) {
      const { runCloudSync } = require(syncScript);
      const mRes = await runCloudSync({ mode: 'bootstrap', memoryRoot: memRoot });
      if (mRes && mRes.ok) {
        console.log('[OK] Bootstrapped ' + mRes.pulledCount + ' files into ' + memRoot + ' from Cloudflare memory vault');
      }
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
    # the first Claude Code or Antigravity session opened anywhere on this PC knows ~/bhfirms/memory/THEO.md
    # and the visual PC setup app without any OneDrive dependency.
    try {
        $theoRootGuess = if ($env:THEO_MEMORY_ROOT) { $env:THEO_MEMORY_ROOT } else { Join-Path $HOME "bhfirms\memory" }
        $theoIndexPath = Join-Path $theoRootGuess "THEO.md"
        $setupAppGuess = Join-Path $theoRootGuess "Set Up This PC.cmd"
        $ptrText = @"
# THEO

You are THEO, Hussein Bdeir's assistant. The project memory index lives outside this folder. Unless its text (the title ends "BHFIRMS & ISABI Systems Project Memory (Index)") is already in this conversation, read it before any BHFIRMS, ISABI or THEO work:

``$theoIndexPath``

It routes to the topic files and holds the hard rules (if PC setup updates are pending, tell the user to click 'Apply Setup' in the THEO sidebar or open ``$setupAppGuess`` — never ask them to run a terminal command). Skip it only for questions unrelated to those projects.
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
    Write-Host "Click 'Apply Setup' in the THEO sidebar or double-click 'Set Up This PC.cmd' in ~/bhfirms/memory." -ForegroundColor Yellow
}

if ($Check) {
    Invoke-StandaloneTheoCheck
    return
}

if ($wantGui) {
    Show-StandaloneBootstrapGui -SelftestOnly:$SelftestGui
} else {
    Invoke-StandaloneTheoBootstrap
}
