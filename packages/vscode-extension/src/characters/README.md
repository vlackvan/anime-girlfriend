# Character System

캐릭터 시스템은 각 캐릭터의 설정, 프로필, 메시지를 중앙에서 관리합니다.

## 구조

```
src/characters/
├── types.ts              # 공통 타입 정의
├── index.ts              # 캐릭터 레지스트리 및 통합 export
├── aru/
│   ├── config.ts        # Aru 기본 설정 (이름, 설명, 이미지 경로)
│   ├── profile.ts       # Aru SPC 프로필
│   ├── messages.ts      # Aru 상태별 메시지
│   └── assets/          # Aru 이미지 파일
│       ├── aru.png
│       └── portrait.webp
└── chihiro/
    ├── config.ts        # Chihiro 기본 설정
    ├── profile.ts       # Chihiro SPC 프로필
    ├── messages.ts      # Chihiro 상태별 메시지
    └── assets/          # Chihiro 이미지 파일
        ├── chihiro.png
        └── portrait.webp
```

## 새 캐릭터 추가하기

1. **캐릭터 폴더 생성**
   ```
   src/characters/newcharacter/
   ├── config.ts
   ├── profile.ts
   ├── messages.ts
   └── assets/
       ├── newcharacter.png
       └── portrait.webp
   ```

2. **config.ts 생성**
   ```typescript
   import { CharacterConfig } from '../types';
   
   export const newcharacterConfig: CharacterConfig = {
       id: 'newcharacter',
       name: 'New Character',
       fullName: 'Full Name',
       description: '캐릭터 설명',
       imagePath: 'src/characters/newcharacter/assets/newcharacter.png',
       portraitPath: 'src/characters/newcharacter/assets/portrait.webp'
   };
   ```

3. **profile.ts 생성** - SPC 프로필 텍스트 작성

4. **messages.ts 생성** - 상태별 메시지 배열 작성

5. **레지스트리에 등록** - `src/characters/index.ts`의 `CHARACTER_REGISTRY`에 추가

6. **타입 업데이트** - `src/characters/types.ts`의 `CharacterId` 타입에 추가

## 사용법

```typescript
import { getCharacter, getAvailableCharacters } from './characters';

// 캐릭터 정보 가져오기
const character = getCharacter('aru');
console.log(character.config.name); // "Aru"
console.log(character.profile);     // SPC 프로필 텍스트
console.log(character.messages.accepted); // 상태별 메시지

// 사용 가능한 모든 캐릭터 목록
const allCharacters = getAvailableCharacters(); // ['aru', 'chihiro']
```
