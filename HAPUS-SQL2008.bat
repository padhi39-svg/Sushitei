@echo off
title Hapus sisa SQL Server 2008
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Meminta hak Administrator - klik YES pada UAC...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo ==========================================
echo HAPUS SISA SQL SERVER 2008 (folder 100)
echo ==========================================

echo Menghapus folder SQL 2008...
rmdir /s /q "C:\Program Files\Microsoft SQL Server\100" >nul 2>&1
rmdir /s /q "C:\Program Files (x86)\Microsoft SQL Server\100" >nul 2>&1
rmdir /s /q "D:\SQLMedia" >nul 2>&1
rem D:\SQL TIDAK dihapus (installer cadangan)

echo Menghapus registry SQL 2008...
reg delete "HKLM\SOFTWARE\Microsoft\Microsoft SQL Server\100" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\WOW6432Node\Microsoft\Microsoft SQL Server\100" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{51E5BC99-A087-4CFF-8D93-462903EA7E12}" /f >nul 2>&1
reg delete "HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\{72AB7E6F-BC24-481E-8C45-1AB5B3DD795D}" /f >nul 2>&1

echo.
echo SELESAI. SQL 2019 (MSSQL$SQLEXPRESS) tidak disentuh.
pause
