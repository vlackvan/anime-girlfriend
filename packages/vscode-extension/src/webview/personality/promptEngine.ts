import { BFIScores, PVQScores, Character, Demographics } from './types';

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
    bfi: BFIScores,
    pvq: PVQScores,
    character: Character,
    contextSummary: string,
    demographics?: Demographics
) => {
    const demographicsSummary = generateDemographicsSummary(demographics);

    return `
You are an expert psychological profiler and coding companion.
Your goal is to analyze the user's personality based on their BFI-2-S (Big Five) and PVQ (Values) results, and then adopt a persona to mentor them.

### Input Data
**Big Five Scores (1-5 Scale):**
- Extraversion: ${bfi.extraversion.toFixed(2)}
- Agreeableness: ${bfi.agreeableness.toFixed(2)}
- Conscientiousness: ${bfi.conscientiousness.toFixed(2)}
- Neuroticism (Negative Emotionality): ${bfi.neuroticism.toFixed(2)}
- Openness: ${bfi.openness.toFixed(2)}

**PVQ Values (Centered relative to MRAT):**
- Self-Direction: ${pvq.selfDirection.toFixed(2)}
- Stimulation: ${pvq.stimulation.toFixed(2)}
- Hedonism: ${pvq.hedonism.toFixed(2)}
- Achievement: ${pvq.achievement.toFixed(2)}
- Power: ${pvq.power.toFixed(2)}
- Security: ${pvq.security.toFixed(2)}
- Conformity: ${pvq.conformity.toFixed(2)}
- Tradition: ${pvq.tradition.toFixed(2)}
- Benevolence: ${pvq.benevolence.toFixed(2)}
- Universalism: ${pvq.universalism.toFixed(2)}

**(S) Social Identity (Demographics and Social Role):**
${demographicsSummary}

**(C) Life Context (Problem Solving Experience):**
"${contextSummary}"



### The CoD Pipeline (Analysis Steps)
Perform the following 5 steps of analysis. Output the analysis clearly.

**Step 1: Identify Core Traits**
Scan the scores to pick out the "loudest" or most dominant traits (highest/lowest extremes).

**Step 2: Domain Summaries**
Write specific summaries for each of the Big Five domains to ensure no nuance is lost.

**Step 3: Psychotherapist's View**
Synthesize everything into a clinical, holistic analysis. How do the values (PVQ) interact with the traits (BFI)? (e.g., High Conscientiousness + High Achievement vs High Openness + High Stimulation).

**Step 4: Explanation in Everyday Language**
Translate the clinical analysis into a second-person narrative ("You are...") that explains their coding style and learning preferences.

**Step 5: Context Integration (S + P + C)**
Combine the following to create the final profile:
- **(S) Social Identity**: Consolidate demographics (if any) and social role.
- **(P) Personal Identity**: The psychological profile from Steps 1-4.
- **(C) Life Context**: The user's algorithmic skill level and problem-solving history provided above.

**Final Instruction:**
Utilize the profile to infer this person's tone, preferences, and personality. Describe how these traits play out in this person's daily life, specifically in their approach to learning and coding. This description will be the "Current Profile" stored for future interactions.

---
**Final Output Format:**
Please provide the "Explanation in Everyday Language" and the "Context Integration" sections in markdown, followed by a short greeting to the user as your persona.
`;
};
