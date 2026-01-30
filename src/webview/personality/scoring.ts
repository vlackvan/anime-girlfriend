import { BFIScores, PVQScores } from './types';
import { BFI_QUESTIONS, PVQ_QUESTIONS } from './questions';

export function scoreBFI(responses: Record<number, number>): BFIScores {
    const traitScores: Record<string, number[]> = {
        extraversion: [],
        agreeableness: [],
        conscientiousness: [],
        neuroticism: [],
        openness: [],
    };

    BFI_QUESTIONS.forEach(q => {
        let score = responses[q.id];
        if (q.reversed) {
            score = 6 - score; // Reverse 1-5 scale
        }
        traitScores[q.trait].push(score);
    });

    const average = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
        extraversion: average(traitScores.extraversion),
        agreeableness: average(traitScores.agreeableness),
        conscientiousness: average(traitScores.conscientiousness),
        neuroticism: average(traitScores.neuroticism),
        openness: average(traitScores.openness),
    };
}

export function scorePVQ(responses: Record<number, number>): PVQScores {
    const traitScores: Record<string, number[]> = {
        universalism: [],
        benevolence: [],
        tradition: [],
        conformity: [],
        security: [],
        power: [],
        achievement: [],
        hedonism: [],
        stimulation: [],
        selfDirection: [],
    };

    // Calculate Raw Means
    PVQ_QUESTIONS.forEach(q => {
        traitScores[q.trait].push(responses[q.id]);
    });

    const rawMeans: Record<string, number> = {};
    for (const trait in traitScores) {
        const scores = traitScores[trait];
        rawMeans[trait] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    // Calculate MRAT (Mean Respondent Affinity Total)
    const allScores = Object.values(responses);
    const mrat = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : 0;

    // Center scores (Raw Mean - MRAT)
    // This centers the scores relative to the individual's response style
    return {
        universalism: rawMeans.universalism - mrat,
        benevolence: rawMeans.benevolence - mrat,
        tradition: rawMeans.tradition - mrat,
        conformity: rawMeans.conformity - mrat,
        security: rawMeans.security - mrat,
        power: rawMeans.power - mrat,
        achievement: rawMeans.achievement - mrat,
        hedonism: rawMeans.hedonism - mrat,
        stimulation: rawMeans.stimulation - mrat,
        selfDirection: rawMeans.selfDirection - mrat,
    };
}
