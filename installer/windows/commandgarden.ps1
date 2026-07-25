$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$Node   = Join-Path $AppDir 'runtime\node.exe'
$CLI    = Join-Path $AppDir 'app\cli\dist\main.js'
$Log    = Join-Path $env:USERPROFILE '.commandgarden\daemon.log'

$output = & $Node $CLI up --no-open 2>&1 | Out-String
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0 -or $output -match 'failed to start|not responding|already in progress') {
    Add-Type -AssemblyName System.Windows.Forms
    $logNote = if (Test-Path $Log) { "`n`nView the log file for details?" } else { "" }
    $msg = "commandGarden failed to start.`n`n$($output.Trim())$logNote"
    $result = [System.Windows.Forms.MessageBox]::Show(
        $msg,
        'commandGarden',
        [System.Windows.Forms.MessageBoxButtons]::OKCancel,
        [System.Windows.Forms.MessageBoxIcon]::Error
    )
    if ($result -eq [System.Windows.Forms.DialogResult]::OK -and (Test-Path $Log)) {
        Start-Process notepad.exe $Log
    }
    exit 1
}

$maxAttempts = 40
for ($i = 0; $i -lt $maxAttempts; $i++) {
    try {
        $null = Invoke-WebRequest -Uri 'http://127.0.0.1:9092' -UseBasicParsing -TimeoutSec 1
        break
    } catch {
        Start-Sleep -Milliseconds 500
    }
}

Start-Process 'http://127.0.0.1:9092'
