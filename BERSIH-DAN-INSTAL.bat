@echo off
title Bersihkan & Instal SQL Server 2008 R2 Express
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Meminta hak Administrator (klik YES pada UAC)...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo ============================================
echo TAHAP 1: MEMBERSIHKAN SISA INSTALASI GAGAL
echo ============================================

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"Stop-Service -Name MSSQLFDLauncher,MSSQLSERVER,ReportServer,SQLBrowser,SQLWriter,MSSQLServerADHelper100 -Force -ErrorAction SilentlyContinue; ^
Get-Service | Where-Object { \$_.Name -match '^(MSSQL|SQLAgent|ReportServer|SQLBrowser|SQLWriter|SQLFulltext|MSSQLFDLauncher|MSOLAP)' } | ForEach-Object { sc.exe delete \$_.Name }; ^
Write-Host 'Service dibersihkan.'"

echo.
echo Menghapus registry dan folder SQL Server...
reg delete "HKLM\SOFTWARE\Microsoft\Microsoft SQL Server" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server" /f >nul 2>&1
rmdir /s /q "C:\Program Files\Microsoft SQL Server" >nul 2>&1
rmdir /s /q "C:\Program Files (x86)\Microsoft SQL Server" >nul 2>&1
rmdir /s /q "C:\ProgramData\Microsoft\Microsoft SQL Server" >nul 2>&1
echo Folder dan registry dibersihkan.

echo.
echo ============================================
echo TAHAP 2: INSTALASI SQL SERVER 2008 R2 EXPRESS
echo ============================================
echo Jalankan installer...
start /wait "" "D:\SQL\SQLEXPRADV_x64_ENU.exe"

echo.
echo Instalasi selesai. Tekan Enter untuk menutup.
pause
