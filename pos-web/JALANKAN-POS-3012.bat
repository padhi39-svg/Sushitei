@echo off
title POS Omega - Port 3012
cd /d D:\Sushite\pos-web
echo ==========================================
echo  POS Omega - Next.js (port 3012)
echo  Buka: http://localhost:3012/login
echo  Tekan CTRL+C untuk berhenti
echo ==========================================
echo.
REM install sekali kalau node_modules belum ada
if not exist node_modules (
  echo node_modules tidak ada, install dulu...
  call npm install
)
call npm run dev
echo.
echo Server berhenti. Tekan tombol apa saja untuk menutup.
pause >nul
