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
Act as a researcher implementing the SPeCtrum framework for identity simulation. I will provide you with three datasets: Social Identity (S), Personal Identity (P), and Personal Life Context (C).

Your goal is to process these inputs and stack them into a single string called "Current Profile". Follow these specific processing rules for each section:

### 1. PROCESS SOCIAL IDENTITY (S)
*   **Instruction:** Simply list the provided demographic data as key-value pairs. Do not summarize.
*   **Input Data:**
${demographicsSummary}
*   **Format:** [Demographics] List.

### 2. PROCESS PERSONAL LIFE CONTEXT (C)
*   **Instruction:** Incorporate the provided "Daily Routine" essays and "Likes/Dislikes" lists directly, without summarization or alteration.
*   **Input Data:**
"${contextSummary}"
*   **Format:** [Personal Life Context] Raw text.

### 3. PROCESS PERSONAL IDENTITY (P) - **COMPLEX STEP**
You must generate 4 distinct paragraphs using "Chain of Density" (CoD) logic.

**Input Data (Scores):**
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

**Processing Steps:**

**Step A (Natural Language Conversion):**
First, internally convert the raw BFI-2-S and PVQ scores above into detailed descriptive sentences (e.g., "High Extraversion" -> "This person is socially energetic..."). This text will serve as the "Input Text" for the CoD process.

**Step B (Chain of Density Summarization):**
For *both* the Personality description and the Values description derived in Step A, perform the following recursive summarization process to create specific "Expert View" summaries:

    "You will generate increasingly concise, entity-dense psychological summaries of the Input Text.
    Repeat the following 2 steps 5 times:
    Step 1. Identify 1-3 informative Entities (';' delimited) from the Input Text which are missing from the previously generated summary.
    Step 2. Write a new, denser summary of identical length which covers every entity and detail from the previous summary plus the Missing Entities.
    
    A Missing Entity is Relevant, Specific, Novel, Faithful, and located anywhere in the Input Text.
    The goal is to reach a highly dense and concise summary using 'Psychotherapist's Terminology' to describe the user's inner drives and emotional regulation."

**Step C (The 4 Blocks Output):**
Based on the final dense summaries from Step B, generate the following four outputs:
    1.  **Personality (Expert View):** The final dense summary of personality (focus on inner drives and emotional regulation). This is the result of the CoD analysis.
    2.  **Personality (Everyday View):** Translate the expert view into casual language describing how they act in daily life.
    3.  **Values (Expert View):** The final dense summary of values (Life-Guiding Principles). This is the result of the CoD analysis.
    4.  **Values (Everyday View):** Translate the values into casual language (e.g., "They care deeply about...").

---
**Final Output Format:**
Please provide the "Current Profile" containing the processed S, C, and P sections as described above.
`;
};
