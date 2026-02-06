#!/bin/bash
cd "$(dirname "$0")/../.."

TEST_PROFILE="$HOME/.chrome-metamask-test"

cleanup() {
  [ -n "$APP_PID" ] && kill $APP_PID 2>/dev/null
  [ -n "$CHROME_PID" ] && kill $CHROME_PID 2>/dev/null
}
trap cleanup EXIT

# Chrome이 이미 CDP로 실행 중인지 확인
if ! curl -s http://localhost:9222/json/version > /dev/null 2>&1; then
  echo "테스트용 Chrome 시작 중..."

  # 테스트 프로필이 없으면 안내
  if [ ! -d "$TEST_PROFILE" ]; then
    echo ""
    echo "⚠️  테스트용 Chrome 프로필이 없습니다."
    echo ""
    echo "최초 1회 설정이 필요합니다:"
    echo "1. 아래 명령으로 Chrome 시작:"
    echo "   /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --user-data-dir=\"$TEST_PROFILE\" --remote-debugging-port=9222"
    echo ""
    echo "2. MetaMask 설치 및 지갑 설정 (Sepolia 네트워크)"
    echo "3. Chrome 닫기"
    echo "4. 다시 npm run test:e2e:metamask 실행"
    echo ""
    exit 1
  fi

  # 테스트용 Chrome 시작 (기존 Chrome과 별도로 실행됨)
  /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
    --user-data-dir="$TEST_PROFILE" \
    --remote-debugging-port=9222 \
    --no-first-run \
    > /dev/null 2>&1 &
  CHROME_PID=$!
  sleep 4
fi

# 앱 시작
if ! curl -s http://localhost:3001 > /dev/null 2>&1; then
  echo "앱 시작 중..."
  npm run dev > /dev/null 2>&1 &
  APP_PID=$!
  sleep 8
fi

echo "테스트 실행..."
npx playwright test --config=test/e2e/playwright.config.ts "$@"
