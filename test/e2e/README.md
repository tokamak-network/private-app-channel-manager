# Create Channel E2E Test (MetaMask)

snap/e2e와 동일한 방식으로 MetaMask가 설치된 Chrome에 CDP로 연결합니다.

## 실행 방법

### 1. Chrome 시작 (remote debugging)
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

### 2. 앱 실행 (다른 터미널)
```bash
npm run dev
```

### 3. 테스트 실행
```bash
cd test/e2e
npm test
```

## 설정

`tests/createChannel.test.ts`에서 수정:
- `METAMASK_PASSWORD` - MetaMask 비밀번호 (기본: `temp12!!`)
- `TEST_PARTICIPANTS` - 테스트용 참가자 주소
