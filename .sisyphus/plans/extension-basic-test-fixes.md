# Extension Basic Functionality Fixes

## TL;DR

> **Quick Summary**: Chrome Extension 기본 기능 (설정 저장, 채널 조회) 동작 검증 및 버그 수정
> 
> **Deliverables**:
> - Settings 저장 기능 수정
> - 채널 정보 조회 검증
> - 기본 플로우 동작 확인
> 
> **Estimated Effort**: Quick
> **Test Channel ID**: `0xa0b93ea3324a4feda230fb4d5a2def0d95a4444eeb8800cb7d0e4c647975f621`

---

## Context

### Original Request
사용자가 Chrome Extension에서 Settings 저장이 안 되는 문제 발견. 채널 ID 기반으로 기본 기능들 검증 및 수정 요청.

### Problem Analysis
1. `useSettings.ts`에서 `rpcUrl` 필드가 제거됨
2. `Settings.tsx`에서는 여전히 `settings.rpcUrl` 참조 → undefined
3. `handleSave`에서 `rpcUrl` 저장 시도 → 타입 불일치로 저장 실패

---

## TODOs

- [ ] 1. useSettings.ts에 rpcUrl 필드 복원

  **What to do**:
  - `ExtensionSettings` 인터페이스에 `rpcUrl: string` 추가
  - `DEFAULT_SETTINGS`에 기본 RPC URL 추가: `'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S'`
  - `leaderServerUrl` 기본값도 `'http://localhost:3000'`으로 설정

  **File**: `extension/src/hooks/useSettings.ts`
  
  **Changes**:
  ```typescript
  // Before (line 3-11)
  export interface ExtensionSettings {
    leaderServerUrl: string;
    channelId: string;
  }

  const DEFAULT_SETTINGS: ExtensionSettings = {
    leaderServerUrl: '',
    channelId: '',
  };

  // After
  export interface ExtensionSettings {
    rpcUrl: string;
    leaderServerUrl: string;
    channelId: string;
  }

  const DEFAULT_SETTINGS: ExtensionSettings = {
    rpcUrl: 'https://eth-sepolia.g.alchemy.com/v2/PbqCcGx1oHN7yNaFdUJUYqPEN0QSp23S',
    leaderServerUrl: 'http://localhost:3000',
    channelId: '',
  };
  ```

  **Acceptance Criteria**:
  - [ ] TypeScript 타입 에러 없음
  - [ ] Settings 페이지에서 RPC URL 기본값 표시됨

---

- [ ] 2. Extension 재빌드 및 Chrome 리로드

  **What to do**:
  ```bash
  cd extension
  bun run build
  ```
  - Chrome에서 `chrome://extensions/` → Tokamak Channels → Reload 버튼 클릭

  **Acceptance Criteria**:
  - [ ] 빌드 성공 (에러 없음)
  - [ ] Chrome에서 익스텐션 리로드 완료

---

- [ ] 3. Settings 저장 기능 검증

  **Test Steps**:
  1. 익스텐션 팝업 열기
  2. Settings 탭으로 이동
  3. RPC URL 확인: `https://eth-sepolia.g.alchemy.com/v2/...` (기본값)
  4. Leader Server URL: `http://localhost:3000`
  5. Test 버튼 클릭 → 체크마크 표시 확인
  6. Save Settings 버튼 클릭
  7. 팝업 닫고 다시 열기
  8. 저장된 값이 유지되는지 확인

  **Acceptance Criteria**:
  - [ ] RPC Test 통과 (체크마크)
  - [ ] Server Test 통과 (체크마크) - 웹앱 실행 중일 때
  - [ ] Save 후 팝업 재오픈 시 값 유지

---

- [ ] 4. Channel ID 입력 및 조회 검증

  **Test Channel ID**: `0xa0b93ea3324a4feda230fb4d5a2def0d95a4444eeb8800cb7d0e4c647975f621`

  **Test Steps**:
  1. Home 탭으로 이동
  2. Channel ID 입력란에 테스트 채널 ID 붙여넣기
  3. 검색 버튼 (돋보기) 클릭
  4. Channel Info 섹션 확인:
     - Status: 표시 (None/Initialized/Open/Closing/Closed 중 하나)
     - Participants: 숫자 표시
     - Leader: 주소 표시 (0x...형식)
  5. 지갑 연결 시 Your Status 표시 확인

  **Acceptance Criteria**:
  - [ ] Channel ID 입력 후 검색 버튼 활성화
  - [ ] 검색 후 Channel Info 섹션 표시
  - [ ] 온체인 데이터 정상 조회 (Status, Participants, Leader)

---

- [ ] 5. 채널 상태별 버튼 활성화 검증

  **Test Steps**:
  - State = Initialized → Deposit 버튼 활성화, Send 버튼 비활성화
  - State = Open → Send 버튼 활성화, Deposit 버튼 비활성화
  - State = Closed → Withdraw 버튼만 표시

  **Acceptance Criteria**:
  - [ ] 채널 상태에 따라 적절한 버튼만 활성화

---

## Success Criteria

### Verification Commands
```bash
# 빌드 검증
cd extension && bun run build

# 타입 체크
cd extension && bun run typecheck
```

### Final Checklist
- [ ] Settings 저장/로드 정상 동작
- [ ] Channel ID 입력 및 조회 정상 동작
- [ ] 온체인 데이터 (state, leader, participants) 정상 표시
- [ ] 빌드 에러 없음
