/**
 * patch-win.js — 설치된 VaultLine Lite에 app.asar만 빠르게 교체
 *
 * 실행: npm run patch:win
 * 조건: 앱이 실행 중이면 안 됨 (asar 파일 잠금)
 */

const { copyFileSync, existsSync } = require('fs')
const { join } = require('path')

const src = join(__dirname, '..', 'dist', 'win-unpacked', 'resources', 'app.asar')
const installDir = join(process.env.LOCALAPPDATA, 'Programs', 'VaultLine Lite', 'resources')
const dest = join(installDir, 'app.asar')

if (!existsSync(src)) {
  console.error('❌ 빌드 파일 없음. 먼저 npm run dist:win --dir 실행 필요:', src)
  process.exit(1)
}

if (!existsSync(installDir)) {
  console.error('❌ 설치 경로 없음 (기본 경로):', installDir)
  console.error('   사용자 지정 경로에 설치된 경우 아래 명령을 직접 실행하세요:')
  console.error('   copy dist\\win-unpacked\\resources\\app.asar "설치경로\\resources\\app.asar"')
  process.exit(1)
}

try {
  copyFileSync(src, dest)
  console.log('✅ 패치 완료:', dest)
} catch (err) {
  if (err.code === 'EBUSY' || err.code === 'EPERM') {
    console.error('❌ 파일이 사용 중입니다. VaultLine Lite를 먼저 종료하세요.')
  } else {
    console.error('❌ 패치 실패:', err.message)
  }
  process.exit(1)
}
