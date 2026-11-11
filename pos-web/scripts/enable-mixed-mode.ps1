# Aktifkan SQL Server Mixed Mode (Windows + SQL Login) untuk instance SQLEXPRESS
# Jalankan sebagai Administrator.
$ErrorActionPreference = "Stop"
$log = "D:\Sushite\pos-web\scripts\enable-mixed-mode.log"
function Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  $msg"
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

try {
  Log "Mulai: aktifkan Mixed Mode untuk MSSQL`$SQLEXPRESS"
  $reg = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.SQLEXPRESS\MSSQLServer"
  $before = (Get-ItemProperty $reg -Name LoginMode).LoginMode
  Log "LoginMode sebelum: $before"
  Set-ItemProperty -Path $reg -Name LoginMode -Value 2
  Log "LoginMode sesudah diset: $((Get-ItemProperty $reg -Name LoginMode).LoginMode)"

  Log "Restart service MSSQL`$SQLEXPRESS ..."
  Restart-Service -Name 'MSSQL$SQLEXPRESS' -Force
  Start-Sleep -Seconds 6
  Log "Status service: $((Get-Service 'MSSQL$SQLEXPRESS').Status)"

  $sqlcmd = "D:\SQL2019\SQLServer\Client SDK\ODBC\170\Tools\Binn\SQLCMD.EXE"
  $check = & $sqlcmd -S ".\SQLEXPRESS" -E -h-1 -W -Q "SET NOCOUNT ON; SELECT SERVERPROPERTY('IsIntegratedSecurityOnly')" 2>&1
  Log "IsIntegratedSecurityOnly (0 = mixed mode aktif): $check"

  $test = & $sqlcmd -S ".\SQLEXPRESS" -U posweb -P "PosWeb#2026" -d Omega -h-1 -W -Q "SET NOCOUNT ON; SELECT COUNT(*) FROM dbo.Barang" 2>&1
  Log "Test login posweb (jumlah barang): $test"

  Log "SELESAI - Mixed Mode aktif."
} catch {
  Log "GAGAL: $($_.Exception.Message)"
  throw
}
