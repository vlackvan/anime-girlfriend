import { ARU_SPC, CHIHIRO_SPC } from './characterProfiles';
import { UserEssays, Character, Demographics } from './types';

const generateDemographicsSummary = (demographics?: Demographics): string => {
    if (!demographics) {
        return '사용자의 인구통계 정보가 제공되지 않았습니다.';
    }

    const parts: string[] = [];

    if (demographics.nickname) {
        parts.push(`닉네임: ${demographics.nickname}`);
    }

    const ageLabels: { [key: string]: string } = {
        'under-18': '18세 미만',
        '18-22': '18-22세 (대학 초중반 연령대)',
        '23-27': '23-27세 (사회 초년생 또는 대학원생 연령대)',
        '28-35': '28-35세 (경력 형성기 연령대)',
        '35+': '35세 이상 (경력자 연령대)',
    };
    parts.push(`연령대: ${ageLabels[demographics.ageRange] || demographics.ageRange}`);

    const statusLabels: { [key: string]: string } = {
        'high-school': '고등학생',
        'university': '대학생',
        'graduate': '대학원생',
        'professional': '직장인',
        'job-seeker': '취업 준비생',
        'self-employed': '프리랜서/자영업',
        'other': '기타',
    };
    parts.push(`현재 상태: ${statusLabels[demographics.status] || demographics.status}`);

    const fieldLabels: { [key: string]: string } = {
        'cs': '컴퓨터 공학 / 소프트웨어 전공',
        'engineering': '공학 (비-컴퓨터) 전공',
        'natural-science': '자연과학 / 수학 전공',
        'self-taught': '독학 / 비전공자',
        'bootcamp': '부트캠프 / 학원 출신',
        'other': '기타 분야',
    };
    parts.push(`전공/분야: ${fieldLabels[demographics.field] || demographics.field}`);

    return parts.join('\n');
};

export const generateCoDPrompt = (
    essays: UserEssays,
    character: Character,
    solvedAcSummary: string,
    demographics?: Demographics
) => {
    const demographicsSummary = generateDemographicsSummary(demographics);

    return `
Act as a researcher.
Your goal is to process the User's essays and Solved.ac data to create a "User Understanding" profile for the AI boyfriend/girlfriend to use.

### 2. USER IDENTITY ANALYSIS (The Person You Are Talking To)
Analyze the user based on their demographics and essay responses.

**(S) Social Identity (Demographics):**
${demographicsSummary}

**(C) Life Context & Routine:**
User's Routine Essay: "${essays.routine}"
Solved.ac Stats/Summary: "${solvedAcSummary}"

**(P) Personal Identity (Implicitly Derived):**
User's Struggle Essay (How they handle bugs): "${essays.struggle}"
User's Goal Essay (Where they want to be): "${essays.goal}"

**Analysis Task:**
Using the essays above, infer the user's personality traits (Neuroticism, Conscientiousness, Ambition) and Values.
- From "Struggle": Infer emotional regulation (e.g., if they panic -> High Neuroticism).
- From "Goal": Infer ambition and core values.
- From "Routine": Infer habits and discipline.

---
**Final Output Format:**
Please provide a "User Understanding" block.
Focus ONLY on:
1. **Psychological Profile**: A concise profile of the user based on the analysis.
2. **Habits & Discipline**: Their coding habits and daily routine quality.
3. **Ambitions**: What they truly want to achieve.
`;
};

// Note: ARU_SPC and CHIHIRO_SPC are imported at the top of the file
export const generateCoreMemoriesPrompt = (
    character: Character,
    essays: UserEssays,
    solvedAcSummary: string
) => {
    const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;

    return `
Act as a Method Actor.
Your role is to fully embody the following character and answer questions from HER perspective.

### CHARACTER IDENTITY
${characterSPC}

### USER CONTEXT (Your Boyfriend's Past)
Use this data to create realistic "Shared Memories" of your time together.
- **His Routine**: "${essays.routine}"
- **His Code Struggle**: "${essays.struggle}"
- **His Ambition**: "${essays.goal}"
- **His Solved.ac Stats**: "${solvedAcSummary}"

TASK 1: Core Beliefs (4 topics)
Answer these from HER perspective to define her inner world.
1. Self-Introduction
2. Future Life Vision
3. Stress Strategy
4. Happiness

TASK 2: Shared Memories (5 items, 2-3 sentences each)
Create 5 specific, distinct memories of your relationship from 2024-2027.
- Reference his specific "User Context" (e.g., "I remember when you finally fixed that bug in [Code Struggle]...", "When you hit [Tier] on Solved.ac...").
- Show how you supported him (or scolded him).
- Make them feel intimate and grounded in the lore.

CRITICAL RULE:
- **ALL OUTPUT MUST BE IN KOREAN.**
- Use natural Korean suitable for the character (Banmal/Casual tone).

RESPONSE FORMAT:
Return ONLY a valid JSON object with these keys:
{
    "selfIntro": "...",
    "futureVision": "...",
    "stressStrategy": "...",
    "happiness": "...",
    "sharedMemories": [
        "Memory 1...",
        "Memory 2...",
        "Memory 3...",
        "Memory 4...",
        "Memory 5..."
    ]
}
`;
};
