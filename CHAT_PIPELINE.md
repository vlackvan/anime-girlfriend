# 채팅 응답 생성 파이프라인

## 📋 개요

이 문서는 VSCode Extension에서 사용자가 메시지를 입력하고 AI 응답이 생성되어 표시되는 전체 파이프라인을 설명합니다.

---

## 🔄 전체 플로우 다이어그램

```
[사용자 입력] 
    ↓
[Chat.tsx] - UI 컴포넌트
    ↓ (postMessage)
[ChatPanel.ts] - 메시지 브리지
    ↓
[ChatGPTService.ts] - 핵심 로직
    ├─→ [ApiKeyManager.ts] - API 키 확인
    ├─→ [CodeContextProvider.ts] - 코드 컨텍스트 수집
    ├─→ [RAGService.ts] - 메모리 검색
    │   ├─→ [VectorStore.ts] - 벡터 검색
    │   │   ├─→ [EmbeddingService.ts] - 임베딩 생성
    │   │   └─→ [DatabaseService.ts] - PostgreSQL 검색
    ├─→ [UserDataStore.ts] - 사용자 프로필 로드
    └─→ [buildSystemPrompt()] - 시스템 프롬프트 생성
    ↓
[OpenAI API] - GPT 모델 호출
    ↓ (스트리밍)
[ChatPanel.ts] - 토큰 수신
    ↓ (postMessage)
[Chat.tsx] - UI 업데이트
    ↓
[사용자에게 표시]
```

---

## 📦 단계별 상세 설명

### **Phase 1: 사용자 입력 수신**

#### 1.1 `Chat.tsx` - 프론트엔드 UI
**위치**: `packages/vscode-extension/src/webview/components/Chat.tsx`

**역할**:
- 사용자 입력 필드 렌더링
- 메시지 전송 버튼/키보드 이벤트 처리
- 이미지 첨부 기능

**주요 함수**:
```typescript
handleSend() {
  // 1. 사용자 메시지 로컬 상태에 추가
  setMessages(prev => [...prev, userMessage]);
  
  // 2. VSCode Extension으로 메시지 전송
  window.vscode.postMessage({
    type: 'sendMessage',
    content: userMessage.content,
    images: selectedImage ? [selectedImage] : undefined
  });
}
```

**데이터 흐름**:
- 사용자 입력 → `inputValue` state
- 전송 시 → `window.vscode.postMessage()` 호출
- 메시지 타입: `'sendMessage'`

---

### **Phase 2: 메시지 브리지 처리**

#### 2.1 `ChatPanel.ts` - 웹뷰 뷰 프로바이더
**위치**: `packages/vscode-extension/src/ChatPanel.ts`

**역할**:
- VSCode Extension과 Webview 간 통신 브리지
- 메시지 라우팅 및 처리

**주요 함수**:
```typescript
resolveWebviewView(webviewView: vscode.WebviewView) {
  // 메시지 리스너 등록
  webviewView.webview.onDidReceiveMessage(async (message) => {
    switch (message.type) {
      case 'sendMessage':
        await this.handleChatMessage(
          message.content, 
          false, 
          message.images
        );
        break;
    }
  });
}

private async handleChatMessage(
  content: string, 
  isHidden: boolean = false, 
  images?: string[]
) {
  // 1. API 키 확인
  const hasApiKey = await this.apiKeyManager.hasApiKey();
  if (!hasApiKey) {
    // 에러 메시지 전송
    return;
  }
  
  // 2. 스트리밍 시작 신호 전송
  this.postMessage({
    type: 'botMessageStart',
    id: Date.now().toString()
  });
  
  // 3. ChatGPTService로 메시지 전달
  await this.chatGPTService.sendMessage(content, {
    onToken: (token) => { /* 토큰 전송 */ },
    onComplete: (fullResponse) => { /* 완료 신호 */ },
    onError: (error) => { /* 에러 처리 */ }
  }, images);
}
```

**데이터 흐름**:
- Webview 메시지 → `handleChatMessage()`
- `ChatGPTService.sendMessage()` 호출
- 콜백 함수로 스트리밍 응답 처리

---

### **Phase 3: 컨텍스트 수집 및 프롬프트 생성**

#### 3.1 `ChatGPTService.ts` - 핵심 서비스
**위치**: `packages/vscode-extension/src/ChatGPTService.ts`

**역할**:
- 모든 컨텍스트 수집
- 시스템 프롬프트 생성
- OpenAI API 호출

#### 3.1.1 컨텍스트 수집 단계

**A. API 키 확인**
```typescript
const apiKey = await this.apiKeyManager.getApiKey();
// ApiKeyManager.ts: VSCode Secret Storage에서 키 조회
```

**B. RAG 컨텍스트 검색**
```typescript
// BOJ 문제 ID 감지
const problemId = this.detectBOJProblem(userMessage);
// 예: "1149번 어떻게 풀어?" → "1149"

if (problemId) {
  // BOJ 특정 컨텍스트 검색
  const { documents, formattedContext } = 
    await this.ragService.retrieveBOJContext(problemId);
} else {
  // 일반 유사도 검색
  const { documents, formattedContext } = 
    await this.ragService.retrieveContext(userMessage);
}
```

**RAG 검색 상세 과정**:
1. `RAGService.retrieveContext()` 호출
2. `VectorStore.similaritySearch()` 호출
3. `EmbeddingService.generateEmbedding()` - 쿼리 임베딩 생성
4. `DatabaseService.similaritySearch()` - PostgreSQL 벡터 검색
5. 결과 포맷팅 및 반환

**C. 코드 컨텍스트 수집**
```typescript
const codeContext = this.codeContextProvider.buildContextString();
// CodeContextProvider.ts:
// - 활성 에디터 파일 정보
// - 선택된 텍스트
// - 진단 정보 (에러/경고)
// - 코드 내용 (최대 100줄)
```

**D. 사용자 프로필 로드**
```typescript
// 이미 constructor에서 로드됨
// this.userProfile = savedProfile;
// UserDataStore.loadProfile()로부터 가져옴
```

#### 3.1.2 시스템 프롬프트 생성

**`buildSystemPrompt(ragContext: string)` 함수**:

```typescript
private buildSystemPrompt(ragContext: string = ''): string {
  // 1. 캐릭터 프로필
  const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;
  // characterProfiles.ts에서 가져옴
  
  // 2. 사용자 성격 분석
  const analysis = this.userProfile?.analysis;
  // 온보딩 시 CoD 파이프라인으로 생성됨
  
  // 3. 코어 메모리
  const coreMemories = this.userProfile?.coreMemories;
  // - selfIntro, futureVision, stressStrategy, happiness
  // - sharedMemories (5개)
  
  // 4. RAG 컨텍스트
  const ragSection = ragContext ? 
    `\n\n### MEMORY RECALL (RAG Context)\n${ragContext}\n` : '';
  
  // 5. 코드 컨텍스트
  const codeContext = this.codeContextProvider.buildContextString();
  
  // 최종 프롬프트 조합
  return `
### CHARACTER PROFILE
${characterSPC}

### INSTRUCTIONS
[캐릭터 행동 지침...]

### USER ANALYSIS & INTERACTION DYNAMICS
${this.userProfile.analysis}

${ragSection}

### CURRENT CONTEXT (Code)
${codeContext}
  `;
}
```

**프롬프트 구조**:
1. **CHARACTER PROFILE**: 캐릭터 기본 정보 (Aru/Chihiro)
2. **INSTRUCTIONS**: 대화 규칙 및 톤 가이드
3. **USER ANALYSIS**: 사용자 성격 분석 (CoD 결과)
4. **HER CORE BELIEFS**: 캐릭터의 내면 세계
5. **SHARED MEMORIES**: 공유 기억 (5개)
6. **MEMORY RECALL**: RAG 검색 결과
7. **CURRENT CONTEXT**: 현재 코드 컨텍스트

#### 3.1.3 메시지 배열 구성

```typescript
const messagesToSend: any[] = [
  { role: 'system', content: systemPrompt },
  ...this.conversationHistory.slice(-20, -1), // 최근 20개 대화
];

// 현재 메시지 추가 (이미지 포함 가능)
if (images && images.length > 0) {
  messagesToSend.push({
    role: 'user',
    content: [
      { type: 'text', text: userMessage },
      ...images.map(img => ({
        type: 'image_url',
        image_url: { url: img }
      }))
    ]
  });
} else {
  messagesToSend.push({
    role: 'user',
    content: userMessage
  });
}
```

---

### **Phase 4: OpenAI API 호출**

#### 4.1 API 요청

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  },
  body: JSON.stringify({
    model: effectiveModel, // 'gpt-4o' (이미지) 또는 'gpt-4o-mini'
    messages: messagesToSend,
    stream: true, // 스트리밍 활성화
    temperature: 0.7,
    max_tokens: 2000
  })
});
```

**모델 선택 로직**:
- 이미지가 있으면 → `gpt-4o` (비전 지원)
- 이미지가 없으면 → 설정값 또는 `gpt-4o-mini`

---

### **Phase 5: 스트리밍 응답 처리**

#### 5.1 스트리밍 파싱

```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let fullResponse = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value, { stream: true });
  const lines = chunk.split('\n').filter(line => line.trim() !== '');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') continue;
      
      const parsed = JSON.parse(data);
      const content = parsed.choices?.[0]?.delta?.content;
      
      if (content) {
        fullResponse += content;
        callbacks.onToken(content); // 실시간 토큰 전송
      }
    }
  }
}

// 완료 후 히스토리에 추가
this.conversationHistory.push({
  role: 'assistant',
  content: fullResponse
});

callbacks.onComplete(fullResponse);
```

**스트리밍 데이터 형식**:
```
data: {"choices":[{"delta":{"content":"안녕"}}]}
data: {"choices":[{"delta":{"content":"하세요"}}]}
data: [DONE]
```

---

### **Phase 6: UI 업데이트**

#### 6.1 `ChatPanel.ts` - 토큰 전송

```typescript
await this.chatGPTService.sendMessage(content, {
  onToken: (token) => {
    // 각 토큰을 Webview로 전송
    this.postMessage({
      type: 'botMessageToken',
      token: token
    });
  },
  onComplete: (fullResponse) => {
    // 완료 신호 전송
    this.postMessage({
      type: 'botMessageComplete',
      content: fullResponse
    });
  },
  onError: (error) => {
    // 에러 전송
    this.postMessage({
      type: 'botMessageError',
      error: error.message
    });
  }
}, images);
```

#### 6.2 `Chat.tsx` - 메시지 수신 및 렌더링

```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    const message = event.data;
    
    switch (message.type) {
      case 'botMessageStart':
        // 새 스트리밍 메시지 시작
        setStreamingMessageId(message.id);
        setMessages(prev => [...prev, {
          id: message.id,
          author: 'bot',
          content: '',
          isStreaming: true
        }]);
        break;
        
      case 'botMessageToken':
        // 토큰 추가
        setMessages(prev => prev.map(msg =>
          msg.id === streamingMessageId
            ? { ...msg, content: msg.content + message.token }
            : msg
        ));
        break;
        
      case 'botMessageComplete':
        // 스트리밍 완료
        setMessages(prev => prev.map(msg =>
          msg.id === streamingMessageId
            ? { ...msg, content: message.content, isStreaming: false }
            : msg
        ));
        setStreamingMessageId(null);
        setIsLoading(false);
        break;
    }
  };
  
  window.addEventListener('message', handleMessage);
  return () => window.removeEventListener('message', handleMessage);
}, [streamingMessageId]);
```

**UI 렌더링**:
```tsx
{messages.map((msg) => (
  <div className={`message ${msg.author}`}>
    {msg.author === 'bot' && (
      <div className={`bubble ${msg.isStreaming ? 'streaming' : ''}`}>
        {msg.content || (msg.isStreaming && '...')}
      </div>
    )}
  </div>
))}
```

---

## 🔍 주요 서비스 상세

### **RAGService.ts** - 메모리 검색

**검색 프로세스**:

1. **일반 검색** (`retrieveContext`):
   ```typescript
   // 1. VectorStore.similaritySearch() 호출
   const documents = await this.vectorStore.similaritySearch(query, maxResults);
   
   // 2. 결과 포맷팅
   const formattedContext = this.formatContext(documents);
   // - BOJ 태그 문서
   // - 솔루션 문서
   // - 과거 대화 문서
   ```

2. **BOJ 특정 검색** (`retrieveBOJContext`):
   ```typescript
   // 1. 메타데이터 필터 검색
   const documents = await this.vectorStore.searchWithFilters(
     `Baekjoon problem ${problemId}`,
     { problemId },
     3
   );
   
   // 2. BOJ 전용 포맷팅
   const formattedContext = this.formatBOJContext(documents, problemId);
   ```

**검색 결과 타입**:
- `boj_tag`: solved.ac 문제 메타데이터
- `solution`: 사용자의 과거 솔루션 코드
- `conversation`: 과거 대화 기록

### **VectorStore.ts** - 벡터 검색 엔진

**검색 과정**:

1. **임베딩 생성**:
   ```typescript
   // EmbeddingService 사용
   const queryEmbedding = await this.embeddingService.generateEmbedding(query);
   // 모델: Xenova/all-MiniLM-L6-v2
   // 차원: 384
   ```

2. **PostgreSQL 벡터 검색**:
   ```sql
   SELECT 
     d.id,
     d.content,
     d.metadata,
     1 - (e.embedding <=> $1::vector) as similarity
   FROM documents d
   JOIN embeddings e ON d.id = e.document_id
   WHERE 1 - (e.embedding <=> $1::vector) > $2
   ORDER BY e.embedding <=> $1::vector
   LIMIT $3;
   ```

3. **결과 반환**:
   - 유사도 점수 포함
   - 메타데이터 포함
   - 최대 결과 수 제한

### **CodeContextProvider.ts** - 코드 컨텍스트

**수집 정보**:
- 파일명, 경로, 언어
- 선택된 텍스트
- 진단 정보 (에러/경고)
- 코드 내용 (최대 100줄)

**포맷 예시**:
```
## Currently Editing
**File:** solution.cpp
**Language:** cpp

### Diagnostics
- Line 10: [ERROR] Undefined variable 'x'

### Selected Code
```cpp
int main() {
  // ...
}
```

### Code (first 100 lines)
```cpp
#include <iostream>
// ...
```

---

## 📊 데이터 흐름 요약

### **입력 → 출력**

1. **사용자 입력**: "1149번 어떻게 풀어?"
2. **컨텍스트 수집**:
   - RAG: BOJ 1149 문제 정보 + 과거 솔루션
   - 코드: 현재 편집 중인 파일
   - 프로필: 사용자 성격 분석
3. **프롬프트 생성**: 모든 컨텍스트 조합
4. **API 호출**: OpenAI GPT-4o-mini
5. **스트리밍 응답**: 토큰 단위로 수신
6. **UI 업데이트**: 실시간 렌더링

### **성능 최적화**

- **RAG 검색**: 최대 5개 문서만 검색
- **코드 컨텍스트**: 최대 100줄만 포함
- **대화 히스토리**: 최근 20개만 전송
- **임베딩**: 텍스트 최대 512자로 제한

---

## 🛠️ 주요 설정

**VSCode 설정** (`package.json`):
- `anime-girlfriend.openaiModel`: 기본 모델 선택
- `anime-girlfriend.rag.enabled`: RAG 활성화 여부
- `anime-girlfriend.rag.maxResults`: 최대 검색 결과 수

**환경 변수**:
- PostgreSQL 연결 정보
- OpenAI API 키 (Secret Storage)

---

## 🔄 특수 케이스

### **하트 버튼 액션**

```typescript
// Chat.tsx
handleHeartClick() {
  window.vscode.postMessage({ type: 'heartAction' });
}

// ChatPanel.ts
case 'heartAction':
  const loveMessage = await this.chatGPTService.generateLoveMessage();
  // 특별한 프롬프트로 로맨틱 메시지 생성
```

### **초기 인사 메시지**

```typescript
// Chat.tsx
useEffect(() => {
  if (profile.isFirstMeeting && messages.length === 0) {
    window.vscode.postMessage({ type: 'triggerGreeting' });
  }
}, [profile.isFirstMeeting]);

// ChatPanel.ts
case 'triggerGreeting':
  await this.handleChatMessage(
    "(Start the conversation with the 'Chat rule_first reply'...)",
    true // isHidden
  );
```

### **이미지 첨부**

```typescript
// Chat.tsx
const handleImageSelect = (e) => {
  const file = e.target.files?.[0];
  const reader = new FileReader();
  reader.onloadend = () => {
    setSelectedImage(reader.result as string); // base64
  };
  reader.readAsDataURL(file);
};

// 전송 시
window.vscode.postMessage({
  type: 'sendMessage',
  content: inputValue,
  images: [selectedImage] // base64 이미지 배열
});
```

---

## 📝 결론

채팅 응답 생성 파이프라인은 다음과 같은 단계로 구성됩니다:

1. **입력**: 사용자 메시지 수신
2. **컨텍스트 수집**: RAG, 코드, 프로필
3. **프롬프트 생성**: 모든 컨텍스트 조합
4. **API 호출**: OpenAI GPT 모델
5. **스트리밍**: 실시간 토큰 수신
6. **렌더링**: UI 업데이트

각 단계는 독립적인 서비스로 분리되어 있어 유지보수와 확장이 용이합니다.
