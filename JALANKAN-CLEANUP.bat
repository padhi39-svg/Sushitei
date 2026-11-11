@echo off
title Pembersihan SQL Server 2008
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Meminta hak Administrator (klik YES pada UAC)...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)
echo Menjalankan pembersihan SQL Server...
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Sushite\cleanup-sqlserver.ps1"
