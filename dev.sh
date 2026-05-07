#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

if [ ! -d "node_modules" ]; then
  echo "[INFO] node_modules 없음 — npm install 실행 중..."
  npm install
fi

echo "[INFO] 개발 서버 시작 중..."
npm run dev
