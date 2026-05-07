@echo off
chcp 65001 >nul
title VaultLine Lite — 개발 모드

cd /d "%~dp0"

if not exist "node_modules" (
  echo [INFO] node_modules 없음 — npm install 실행 중...
  npm install
  if errorlevel 1 (
    echo [ERROR] npm install 실패
    pause
    exit /b 1
  )
)

echo [INFO] 개발 서버 시작 중...
npm run dev
