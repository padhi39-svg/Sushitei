@echo off
title Pembersih & Instal SQL Server 2008 R2
:: Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Meminta hak Administrator...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

echo ==========================================
echo TAHAP 1: MEMBERSIHKAN SISA SQL SERVER
echo ==========================================

echo Menghentikan service SQL...
net stop MSSQLFDLauncher /y >nul 2>&1
net stop MSSQLSERVER /y >nul 2>&1
net stop ReportServer /y >nul 2>&1
net stop SQLBrowser /y >nul 2>&1
net stop SQLWriter /y >nul 2>&1
net stop MSSQLServerADHelper100 /y >nul 2>&1
net stop MSSQL$SQLEXPRESS /y >nul 2>&1
net stop SQLAgent$SQLEXPRESS /y >nul 2>&1
net stop MSSQLFDLauncher$SQLEXPRESS /y >nul 2>&1

echo Menghapus service SQL...
sc delete MSSQLFDLauncher >nul 2>&1
sc delete MSSQLSERVER >nul 2>&1
sc delete ReportServer >nul 2>&1
sc delete SQLBrowser >nul 2>&1
sc delete SQLWriter >nul 2>&1
sc delete MSSQLServerADHelper100 >nul 2>&1
sc delete MSSQL$SQLEXPRESS >nul 2>&1
sc delete SQLAgent$SQLEXPRESS >nul 2>&1
sc delete MSSQLFDLauncher$SQLEXPRESS >nul 2>&1

echo Menghapus registry SQL...
reg delete "HKLM\SOFTWARE\Microsoft\Microsoft SQL Server" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Microsoft SQL Server 10 Release" /f >nul 2>&1

echo Menghapus folder SQL...
rmdir /s /q "C:\Program Files\Microsoft SQL Server" >nul 2>&1
rmdir /s /q "C:\Program Files (x86)\Microsoft SQL Server" >nul 2>&1
rmdir /s /q "C:\ProgramData\Microsoft\Microsoft SQL Server" >nul 2>&1

echo.
echo Pembersihan selesai. Memulai installer...

echo ==========================================
echo TAHAP 2: INSTAL SQL SERVER 2008 R2 EXPRESS
echo ==========================================
start "" "D:\SQL\SQLEXPRADV_x64_ENU.exe"

echo.
echo Installer terbuka. Ikuti langkah ini:
echo 1. Klik Installation (kiri)
echo 2. Klik New SQL Server stand-alone installation
echo 3. Klik Next sampai Instance Configuration
echo 4. PILIH Default instance (BUKAN Named instance)
echo 5. Klik Next sampai Install
echo.
echo Tunggu sampai install selesai, lalu beri tahu saya.
pause
