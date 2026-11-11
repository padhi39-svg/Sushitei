@echo off
title Aktifkan SQL Login (Mixed Mode) - Omega
echo ==========================================================
echo  Aktifkan Mixed Mode SQL Server SQLEXPRESS + test login
echo  (Butuh izin Administrator / UAC)
echo ==========================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','D:\Sushite\pos-web\scripts\enable-mixed-mode.ps1' -Wait"
echo.
echo Selesai. Cek log: D:\Sushite\pos-web\scripts\enable-mixed-mode.log
pause
