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
    const characterSPC = character === 'aru' ? ARU_SPC : CHIHIRO_SPC;

    return `
Act as a researcher implementing the SPeCtrum framework for identity simulation.
Your goal is to process the User's S, P, and C data and the Character's S, P, and C data to create an "Interaction Strategy" for the AI.

### 1. CHARACTER IDENTITY (Reference Only)
${characterSPC}

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

### 3. INTERACTION STRATEGY
Combine the Character's SPC and the User's Derived SPC to define how the AI should treat the user.
- If User is High Neuroticism & Character is Aru: Aru should try to act cool to reassure them but might panic together.
- If User is High Ambition & Character is Chihiro: Chihiro should respect their drive and offer efficient, logical support.
- The relationship is: "A girlfriend from the future who knows the user will be successful."

---
**Final Output Format:**
Please provide a "User Analysis & Interaction Strategy" block.
**DO NOT** repeat the Character Role/Identity (that is already fixed).
Focus ONLY on:
1. **User Understanding**: A concise psychological profile of the user based on the analysis.
2. **Relational Dynamics**: Specific rules on how to mentor/support THIS specific user based on their traits.
// ... existing code
`;
};

export const generateCoreMemoriesPrompt = (
    analysis: string,
    character: string
) => {
    return `
You are a doppelgänger of this real person. Embody this person.
Profile Analysis:
${analysis}

TASK: Provide answers to the following 4 topics that this person, based on their profile, would likely give.
RULES:
- Avoid generic responses.
- Use simple, everyday language.
- Respond negatively if the person has a negative attitude.
- Be authentic to the analyzed personality.

TOPICS:
1. Self-Introduction: "How would you define yourself in one sentence?"
2. Future Life Vision: "In one sentence, define where you want to be in 10 years."
3. Stress Strategy: "Complete these sentences: I tend to feel stressed when... When I feel stressed, I try to relieve it by..."
4. Happiness: "Complete this sentence: To me, happiness is..."

RESPONSE FORMAT:
Return ONLY a valid JSON object with these keys:
{
    "selfIntro": "...",
    "futureVision": "...",
    "stressStrategy": "...",
    "happiness": "..."
}
`;
};
