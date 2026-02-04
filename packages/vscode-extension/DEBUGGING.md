# VSCode Extension 디버깅 가이드

## 에러 로그 확인 방법

### 1. Debug Console (디버그 모드)

**F5로 Extension을 실행한 경우:**
- 하단 패널에서 **"DEBUG CONSOLE"** 탭을 확인
- 모든 `console.log()`, `console.error()` 출력이 여기에 표시됩니다
- 가장 실시간으로 로그를 확인할 수 있는 방법입니다

**확인 방법:**
1. `F5` 키를 눌러 Extension Host 실행
2. 새로 열린 VSCode 창에서 Extension 사용
3. 원래 VSCode 창의 **"DEBUG CONSOLE"** 탭 확인

### 2. Output 패널

**실행 중인 Extension의 로그:**
- `View` → `Output` (또는 `Ctrl+Shift+U`)
- 드롭다운에서 **"Log (Extension Host)"** 선택
- Extension Host의 모든 로그가 표시됩니다

**확인 방법:**
1. VSCode에서 `Ctrl+Shift+U` (또는 `View` → `Output`)
2. 우측 상단 드롭다운에서 **"Log (Extension Host)"** 선택
3. Extension 관련 로그 확인

### 3. Developer Tools (웹뷰 디버깅)

**Webview 관련 에러 확인:**
- `Help` → `Toggle Developer Tools`
- 또는 `Ctrl+Shift+I`
- Console 탭에서 Webview의 JavaScript 에러 확인

### 4. 명령 팔레트를 통한 로그 확인

**Extension 로그 확인:**
1. `Ctrl+Shift+P` (또는 `F1`)
2. `Developer: Open Extension Logs Folder` 입력
3. 로그 파일이 저장된 폴더 열기

### 5. 터미널에서 로그 확인 (Windows)

**Extension Host 프로세스 로그:**
```powershell
# VSCode Extension Host 로그 위치
%APPDATA%\Code\logs\*\exthost\*\exthost.log
```

## 현재 프로젝트의 로그 포인트

### 주요 로그 위치:

1. **ChatPanel.ts**
   - `[ChatPanel] User message: ...`
   - `[ChatPanel] Starting chat pipeline...`
   - `[ChatPanel] About to call chatGPTService.sendMessage()...`

2. **ChatGPTService.ts**
   - `[ChatGPTService] sendMessage() called...`
   - `[ChatGPTService] API key found, starting pipeline...`
   - `[ChatGPTService] Calling contextAggregator.aggregate()...`
   - `[ChatGPTService] Calling strategyAgent.generateHint()...`
   - `[ChatGPTService] Calling personaWrapper.wrap()...`

3. **Worker A (ContextAggregator.ts)**
   - `[Worker A] Detecting BOJ problem...`
   - `[Worker A] Problem ID detected: ...`
   - `[Worker A] RAG: Retrieved ... document(s)`

4. **Worker B (StrategyAgent.ts)**
   - `[Worker B] Building strategy prompt...`
   - `[Worker B] Tier Gap: ...`
   - `[Worker B] Hint generated successfully ...`

5. **Worker C (PersonaWrapper.ts)**
   - `[Worker C] Building persona prompt...`
   - `[Worker C] Calling OpenAI API ...`
   - `[Worker C] Streaming completed ...`

## 에러 발생 시 확인 사항

### 1. 에러가 발생했는지 확인
- Debug Console에서 `❌ [Pipeline Error]` 검색
- `[ChatPanel] ChatGPT Error:` 검색
- `[ChatGPTService] Pipeline error:` 검색

### 2. 어느 단계에서 멈췄는지 확인
- 마지막으로 출력된 로그 확인
- 예: `[ChatGPTService] Calling strategyAgent.generateHint()...` 이후 로그가 없다면
  → `strategyAgent.generateHint()` 내부에서 에러 발생 가능

### 3. 스택 트레이스 확인
- `Error Stack:` 로 시작하는 로그 확인
- 파일명과 라인 번호를 통해 에러 위치 파악

## 로그 필터링 팁

### Debug Console에서:
- 특정 키워드로 필터링: `[Worker B]` 입력
- 에러만 보기: `Error` 또는 `❌` 검색

### Output 패널에서:
- `Ctrl+F`로 검색
- 정규식 사용 가능

## 문제 해결 체크리스트

1. ✅ Extension이 제대로 빌드되었는지 확인
   ```bash
   npm run compile
   ```

2. ✅ Extension Host가 실행 중인지 확인
   - F5로 디버그 모드 실행
   - 또는 Extension이 활성화되어 있는지 확인

3. ✅ Debug Console이 열려있는지 확인
   - 하단 패널에서 "DEBUG CONSOLE" 탭 선택

4. ✅ 로그가 너무 많아서 스크롤이 필요한지 확인
   - `Ctrl+End`로 최신 로그로 이동

5. ✅ 에러가 발생했는지 확인
   - `console.error`로 시작하는 로그 검색

## 추가 디버깅 도구

### 1. Breakpoint 설정
- 코드 라인 번호 왼쪽 클릭하여 빨간 점 생성
- F5로 디버그 모드 실행 시 해당 지점에서 멈춤

### 2. Watch 변수
- Debug 패널에서 변수 값 실시간 확인

### 3. Call Stack 확인
- 에러 발생 시 Call Stack에서 호출 경로 확인
