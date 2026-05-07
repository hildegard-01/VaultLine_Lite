@echo off
chcp 65001 >nul
title VaultLine Lite — Windows 패키지 빌드

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

echo [INFO] Windows NSIS 인스톨러 빌드 중...
npm run dist:win
if errorlevel 1 (
  echo [ERROR] 빌드 실패
  pause
  exit /b 1
)

echo.
echo [완료] dist\ 폴더에서 설치 파일을 확인하세요.
explorer dist
pause
