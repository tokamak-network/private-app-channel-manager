# MetaMask Snap 개발 맥락 문서

## 개요

Chrome Extension MVP 테스트 완료 후, MetaMask Snap을 추가로 개발하여 하이브리드 접근 방식 채택 예정.

---

## 현재 상태

### Chrome Extension (완료)
- **위치**: `extension/`
- **기능**: 채널 대시보드, Settings, Deposit, L2 Transaction, Proof 조회, Withdraw
- **상태**: MVP 완료, 기본 기능 테스트 진행 중

### 테스트 채널 정보
- **Channel ID**: `0xa0b93ea3324a4feda230fb4d5a2def0d95a4444eeb8800cb7d0e4c647975f621`
- **Network**: Sepolia (Chain ID: 11155111)
- **RPC**: `https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S`

---

## MetaMask Snap 계획

### 목적
Chrome Extension과 별도로, MetaMask 내부에서 채널 관련 트랜잭션 서명 시 **Transaction Insights** 제공

### 핵심 기능

#### 1. Transaction Insights (최우선)
채널 컨트랙트 트랜잭션 서명 전 분석 표시:

| 함수 | 표시 정보 |
|------|----------|
| `depositToken` | 채널 ID, 입금 금액, MPT Key |
| `initializeChannelState` | 채널 상태 변경 경고, 참여자 수 |
| `submitProofAndSignature` | Proof 개수, 상태 루트 변경 |
| `withdraw` | 출금 금액, 채널 종료 확인 |

```typescript
// 예시: depositToken 분석
export const onTransaction: OnTransactionHandler = async ({ transaction, chainId }) => {
  // BridgeDepositManager 주소 확인
  if (transaction.to === BRIDGE_DEPOSIT_MANAGER_ADDRESS) {
    const decoded = decodeDepositToken(transaction.data);
    return {
      content: (
        <Box>
          <Heading>Channel Deposit</Heading>
          <Row label="Channel ID">
            <Text>{truncateId(decoded.channelId)}</Text>
          </Row>
          <Row label="Amount">
            <Text>{formatUnits(decoded.amount, 18)} TON</Text>
          </Row>
          <Row label="MPT Key">
            <Address address={decoded.mptKey} />
          </Row>
        </Box>
      ),
    };
  }
};
```

#### 2. 채널 상태 빠른 조회 (선택)
- Custom RPC method로 채널 상태 조회
- MetaMask 내에서 간단한 정보 표시

---

## 기술 스택

### 필수 도구
- **MetaMask Flask**: 개발용 MetaMask (Snap 테스트용)
- **@metamask/snaps-cli**: Snap 개발 CLI
- **@metamask/snaps-sdk**: Snap SDK (JSX 컴포넌트 포함)

### 프로젝트 구조 (예상)
```
snap/
├── snap.manifest.json      # Snap 메타데이터, 권한
├── package.json
├── src/
│   ├── index.tsx           # Entry point
│   ├── insights/
│   │   ├── deposit.tsx     # depositToken 분석
│   │   ├── withdraw.tsx    # withdraw 분석
│   │   └── proof.tsx       # submitProof 분석
│   ├── utils/
│   │   ├── decode.ts       # Calldata 디코딩
│   │   └── format.ts       # 포맷팅 유틸
│   └── constants.ts        # 컨트랙트 주소, ABI
├── dist/                   # 빌드 결과물
└── images/
    └── icon.svg
```

### 필요 권한 (snap.manifest.json)
```json
{
  "initialPermissions": {
    "endowment:transaction-insight": {
      "allowTransactionOrigin": true
    },
    "endowment:network-access": {}
  }
}
```

---

## 컨트랙트 정보 (Sepolia)

### 주소
```typescript
const CONTRACT_ADDRESSES = {
  BridgeCore: "0x70052fDC4eb2BC482f591d296D9C6e70A4E2D119",
  BridgeDepositManager: "0xYOUR_DEPOSIT_MANAGER_ADDRESS",
  BridgeProofManager: "0xYOUR_PROOF_MANAGER_ADDRESS",
  BridgeWithdrawManager: "0xYOUR_WITHDRAW_MANAGER_ADDRESS",
};
```

### Function Selectors
```typescript
const SELECTORS = {
  depositToken: "0x...",           // depositToken(bytes32,uint256,bytes32)
  initializeChannelState: "0x...", // initializeChannelState(bytes32,bytes)
  submitProofAndSignature: "0x...",
  withdraw: "0x...",
};
```

---

## 개발 단계

### Phase 1: 환경 설정
- [ ] MetaMask Flask 설치
- [ ] Snap 프로젝트 초기화 (`yarn create @metamask/snap snap`)
- [ ] 기본 빌드/테스트 환경 확인

### Phase 2: Transaction Insights 구현
- [ ] depositToken 분석 UI
- [ ] withdraw 분석 UI
- [ ] submitProofAndSignature 분석 UI
- [ ] initializeChannelState 분석 UI

### Phase 3: 테스트 및 통합
- [ ] 각 트랜잭션 타입별 테스트
- [ ] Chrome Extension과 연동 테스트
- [ ] 에러 핸들링

### Phase 4: 배포 준비 (선택)
- [ ] MetaMask Snap Directory 등록 검토
- [ ] 문서화

---

## 참고 자료

### 공식 문서
- [MetaMask Snaps 개발 문서](https://docs.metamask.io/snaps/)
- [Snaps Quickstart](https://docs.metamask.io/snaps/get-started/quickstart/)
- [Transaction Insights](https://docs.metamask.io/snaps/features/transaction-insights/)

### 예제 코드
```typescript
// Transaction Insights 기본 구조
import type { OnTransactionHandler } from "@metamask/snaps-sdk";
import { Box, Heading, Text, Row, Address, Divider } from "@metamask/snaps-sdk/jsx";

export const onTransaction: OnTransactionHandler = async ({
  transaction,
  chainId,
  transactionOrigin,
}) => {
  // Sepolia 체인만 처리
  if (chainId !== "eip155:11155111") {
    return null;
  }

  // 채널 컨트랙트 트랜잭션인지 확인
  const isChannelTx = isChannelContract(transaction.to);
  if (!isChannelTx) {
    return null;
  }

  // 함수 디코딩 및 UI 반환
  const insights = await analyzeTransaction(transaction);
  
  return {
    content: (
      <Box>
        <Heading>Tokamak Channel Transaction</Heading>
        <Divider />
        {insights}
      </Box>
    ),
    severity: "critical", // 중요 트랜잭션 표시
  };
};
```

---

## 선행 조건

**Chrome Extension 테스트 통과 필수:**
- [ ] Settings 저장/로드 정상 동작
- [ ] Channel ID 입력 및 조회 정상 동작
- [ ] 온체인 데이터 정상 표시

테스트 완료 후 이 문서를 기반으로 Snap 개발 시작.

---

## 세션 복원용 프롬프트

```
## MetaMask Snap 개발 시작

### 프로젝트 위치
/Users/son-yeongseong/Desktop/dev/private-app-channel-manager/

### 맥락 문서
.sisyphus/docs/metamask-snap-context.md

### 목표
Chrome Extension과 별도로, MetaMask Snap을 개발하여 채널 관련 트랜잭션 
서명 시 Transaction Insights 제공

### 핵심 기능
1. depositToken 트랜잭션 분석 UI
2. withdraw 트랜잭션 분석 UI  
3. submitProofAndSignature 트랜잭션 분석 UI

### 시작하기
1. 맥락 문서 읽기
2. MetaMask Flask 설치 확인
3. Snap 프로젝트 초기화
4. Transaction Insights 구현
```
