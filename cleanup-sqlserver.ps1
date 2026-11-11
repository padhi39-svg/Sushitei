# ================================================================
#  Pembersihan total sisa instalasi SQL Server 2008 / 2008 R2
#  Jalankan sebagai Administrator (lihat JALANKAN-CLEANUP.bat)
#  PostgreSQL TIDAK disentuh.
# ================================================================
$ErrorActionPreference = 'SilentlyContinue'
$log = 'D:\Sushite\cleanup-log.txt'
function Log($m) {
    $line = "$(Get-Date -Format 'HH:mm:ss')  $m"
    Write-Host $line
    Add-Content -Path $log -Value $line
}

# --- Cek hak admin ---
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$p  = New-Object Security.Principal.WindowsPrincipal($id)
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Script HARUS dijalankan sebagai Administrator!" -ForegroundColor Red
    Read-Host "Tekan Enter untuk keluar"
    exit 1
}

Log "=== MULAI pembersihan SQL Server ==="

# --- 1. Hentikan proses yang mungkin mengunci file ---
foreach ($pn in @('sqlservr','ReportingServicesService','SQLBrowser','SQLWriter','MSOLAP$OMEGA')) {
    Get-Process -Name $pn -ErrorAction SilentlyContinue | ForEach-Object {
        Log "Stop proses: $($_.ProcessName) (PID $($_.Id))"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
}

# --- 2. Hentikan & hapus service SQL Server ---
$svcNames = @(
    'ReportServer$OMEGA','ReportServer$SQLEXPRESS',
    'SQLBrowser','SQLWriter',
    'MSSQL$OMEGA','MSSQL$SQLEXPRESS',
    'SQLAgent$OMEGA','SQLAgent$SQLEXPRESS',
    'MSSQLFDLauncher$OMEGA','MSSQLFDLauncher$SQLEXPRESS',
    'MSOLAP$OMEGA','MSOLAP$SQLEXPRESS'
)
foreach ($s in $svcNames) {
    $svc = Get-Service -Name $s -ErrorAction SilentlyContinue
    if ($svc) {
        Log "Stop service: $s"
        Stop-Service -Name $s -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
        Log "Delete service: $s"
        & sc.exe delete $s | Out-Null
    }
}
# sapu sisa service yang namanya cocok
Get-Service | Where-Object { $_.Name -match '^(MSSQL|SQLAgent|ReportServer|SQLBrowser|SQLWriter|SQLFulltext|MSSQLFDLauncher|MSOLAP)' } | ForEach-Object {
    Log "Stop/delete sisa service: $($_.Name)"
    Stop-Service -Name $_.Name -Force -ErrorAction SilentlyContinue
    & sc.exe delete $_.Name | Out-Null
}

# --- 3. Uninstall komponen MSI ---
$guids = @(
    '893F27E6-D6BE-4B9F-80E6-0ADA694A31A8',  # SQL Server 2008 Common Files
    '5340A3B5-3853-4745-BED2-DD9FF5371331',  # SQL Server 2008 Common Files (x86)
    '01078B88-2981-4F75-96B0-8B22E2D2DE03',  # SQL Server 2008 R2 Setup
    '8A665A38-9FFC-4220-B5C2-895F438EE5DF',  # Reporting Services
    'AE11E248-B67A-4E3E-BDAF-AA53E00BD289',  # Reporting Services
    '0C270C59-8706-42B8-A2AD-6E5EE18BC90B',  # Reporting Services
    '2453DBC8-ACC4-4711-BD03-0C15353AA3D8',  # Reporting Services
    '2F14965D-567B-4E59-ADEB-0A2CC1E3ADDF'   # Customer Experience Improvement
)
foreach ($g in $guids) {
    Log "Uninstall MSI: {$g}"
    $proc = Start-Process -FilePath 'msiexec.exe' -ArgumentList "/X{$g} /qn /norestart" -Wait -PassThru
    Log "  exit code: $($proc.ExitCode)"
}

# --- 4. Hapus registry sisa ---
$regKeys = @(
    'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server',
    'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server 2008 R2',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server 2008 R2',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft SQL Server 10'
)
foreach ($k in $regKeys) {
    if (Test-Path $k) {
        Log "Hapus registry: $k"
        Remove-Item -Path $k -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- 5. Hapus folder sisa (termasuk data .mdf/.ldf lama) ---
$folders = @(
    'C:\Program Files\Microsoft SQL Server',
    'C:\Program Files (x86)\Microsoft SQL Server',
    'C:\ProgramData\Microsoft\Microsoft SQL Server',
    'C:\Program Files\Microsoft SQL Server Compact Edition',
    'C:\Program Files (x86)\Microsoft SQL Server Compact Edition'
)
foreach ($f in $folders) {
    if (Test-Path $f) {
        Log "Hapus folder: $f"
        Remove-Item -Path $f -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $f) { Log "  (sebagian gagal dihapus, mungkin terkunci)" }
    }
}

Log "=== SELESAI. Lihat log: $log ==="
Write-Host ""
Write-Host "Pembersihan selesai. Silakan cek log di $log" -ForegroundColor Green
Read-Host "Tekan Enter untuk menutup"
