import React, { useState } from 'react';

export interface Demographics {
    nickname?: string;
    ageRange: string;
    status: string;
    field: string;
}

interface DemographicsFormProps {
    onComplete: (demographics: Demographics) => void;
    onSkip: () => void;
}

const AGE_RANGES = [
    { value: '', label: '선택하세요' },
    { value: 'under-18', label: '18세 미만' },
    { value: '18-22', label: '18-22세' },
    { value: '23-27', label: '23-27세' },
    { value: '28-35', label: '28-35세' },
    { value: '35+', label: '35세 이상' },
];

const STATUS_OPTIONS = [
    { value: '', label: '선택하세요' },
    { value: 'high-school', label: '고등학생' },
    { value: 'university', label: '대학생' },
    { value: 'graduate', label: '대학원생' },
    { value: 'professional', label: '직장인' },
    { value: 'job-seeker', label: '취업 준비생' },
    { value: 'self-employed', label: '프리랜서/자영업' },
    { value: 'other', label: '기타' },
];

const FIELD_OPTIONS = [
    { value: '', label: '선택하세요' },
    { value: 'cs', label: '컴퓨터 공학 / 소프트웨어' },
    { value: 'engineering', label: '공학 (비-컴퓨터)' },
    { value: 'natural-science', label: '자연과학 / 수학' },
    { value: 'self-taught', label: '독학 / 비전공' },
    { value: 'bootcamp', label: '부트캠프 / 학원' },
    { value: 'other', label: '기타' },
];

export const DemographicsForm: React.FC<DemographicsFormProps> = ({ onComplete, onSkip }) => {
    const [nickname, setNickname] = useState('');
    const [ageRange, setAgeRange] = useState('');
    const [status, setStatus] = useState('');
    const [field, setField] = useState('');

    const handleSubmit = () => {
        if (!ageRange || !status || !field) {
            return;
        }

        onComplete({
            nickname: nickname.trim() || undefined,
            ageRange,
            status,
            field,
        });
    };

    const isValid = ageRange && status && field;

    return (
        <div className="survey-form demographics-form">
            <h2>당신에 대해 알려주세요</h2>
            <p className="subtitle">
                더 나은 맞춤형 학습 경험을 위해 몇 가지 정보를 수집합니다.
                <br />
                <span className="privacy-note">※ 모든 정보는 로컬에만 저장되며 외부로 전송되지 않습니다.</span>
            </p>

            <div className="demographics-fields">
                <div className="form-group">
                    <label htmlFor="nickname">
                        닉네임 (선택사항)
                        <span className="optional-label">Optional</span>
                    </label>
                    <input
                        id="nickname"
                        type="text"
                        className="demographics-input"
                        placeholder="어떻게 불러드릴까요?"
                        value={nickname}
                        onChange={(e) => setNickname(e.target.value)}
                        maxLength={20}
                    />
                    <span className="field-hint">AI가 당신을 부를 이름입니다. 비워두면 "당신"으로 불립니다.</span>
                </div>

                <div className="form-group">
                    <label htmlFor="ageRange">
                        연령대 <span className="required">*</span>
                    </label>
                    <select
                        id="ageRange"
                        className="demographics-select"
                        value={ageRange}
                        onChange={(e) => setAgeRange(e.target.value)}
                    >
                        {AGE_RANGES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="status">
                        현재 상태 <span className="required">*</span>
                    </label>
                    <select
                        id="status"
                        className="demographics-select"
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                    >
                        {STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label htmlFor="field">
                        전공/분야 <span className="required">*</span>
                    </label>
                    <select
                        id="field"
                        className="demographics-select"
                        value={field}
                        onChange={(e) => setField(e.target.value)}
                    >
                        {FIELD_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <span className="field-hint">학업 또는 업무와 관련된 분야를 선택해주세요.</span>
                </div>
            </div>

            <div className="button-group demographics-buttons">
                <button
                    className="submit-btn"
                    onClick={handleSubmit}
                    disabled={!isValid}
                >
                    다음: 성격 검사 →
                </button>
            </div>

            <button className="skip-btn" onClick={onSkip}>
                건너뛰기 (추천하지 않음)
            </button>
        </div>
    );
};
