$ErrorActionPreference = 'Stop'
$AppDir = Split-Path -Parent $PSScriptRoot
$Node   = Join-Path $AppDir 'runtime\node.exe'
$CLI    = Join-Path $AppDir 'app\cli\dist\main.js'
$Log    = Join-Path $env:USERPROFILE '.commandgarden\daemon.log'

# Windows PowerShell 5.1 routes a native command's stderr through PowerShell's
# error stream whenever it is redirected (2>&1, 2>file, even 2>$null). With
# $ErrorActionPreference = 'Stop' that turns the CLI's ordinary progress output
# ("Starting daemon...", "Starting GUI...") into a script-terminating
# NativeCommandError. Fixed only in PowerShell 7.2+, and this script runs under
# powershell.exe (5.1), so scope the preference around the call.
# See https://github.com/PowerShell/PowerShell/issues/4002
#
# `cg up` (without --no-open) polls for readiness and opens the browser itself,
# using the port from config.yaml. Do not reimplement either here.
#
# Both default to failure: under 'Continue' a missing node.exe raises a
# non-terminating CommandNotFoundException, which leaves $LASTEXITCODE untouched
# and would otherwise skip the dialog on the worst failure mode.
$output = ''
$exitCode = 1
$prevErrorActionPreference = $ErrorActionPreference
try {
    $ErrorActionPreference = 'Continue'
    if (Test-Path $Node) {
        $output = & $Node $CLI up 2>&1 | Out-String
        if ($null -ne $LASTEXITCODE) { $exitCode = $LASTEXITCODE }
    } else {
        $output = "Runtime not found at $Node. Reinstall commandGarden."
    }
} finally {
    $ErrorActionPreference = $prevErrorActionPreference
}

if ($exitCode -ne 0) {
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
