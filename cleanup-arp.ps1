$ErrorActionPreference = 'SilentlyContinue'
$keys = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft SQL Server 10 Release',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{5340A3B5-3853-4745-BED2-DD9FF5371331}',
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{893F27E6-D6BE-4B9F-80E6-0ADA694A31A8}'
)
foreach ($k in $keys) {
    if (Test-Path $k) {
        Remove-Item -Path $k -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $k) { Write-Host "GAGAL hapus: $k" -ForegroundColor Red }
        else { Write-Host "Terhapus : $k" -ForegroundColor Green }
    } else {
        Write-Host "Tidak ada: $k"
    }
}
Write-Host ""
Write-Host "Selesai. Tekan Enter untuk menutup."
Read-Host
