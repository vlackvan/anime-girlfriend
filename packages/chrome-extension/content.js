// ============================================
// 백준 채점 결과 모니터링 및 VSCode 전송
// ============================================

// 채점 결과 상태 코드 변환
function getResultStatus(resultText) {
    if (!resultText) return 'unknown';
    
    if (resultText.includes('맞았습니다') || resultText.includes('100%')) {
        return 'accepted';
    } else if (resultText.includes('틀렸습니다')) {
        return 'wrong_answer';
    } else if (resultText.includes('시간 초과')) {
        return 'time_limit';
    } else if (resultText.includes('메모리 초과')) {
        return 'memory_limit';
    } else if (resultText.includes('런타임 에러')) {
        return 'runtime_error';
    } else if (resultText.includes('컴파일 에러')) {
        return 'compile_error';
    } else if (resultText.includes('출력 초과')) {
        return 'output_limit';
    } else if (resultText.includes('출력 형식이 잘못되었습니다')) {
        return 'presentation_error';
    } else {
        return 'unknown';
    }
}

// 채점 중 상태인지 확인
function isJudgingStatus(resultText) {
    if (!resultText) return false;
    
    return resultText.includes('채점 준비 중') ||
           resultText.includes('채점 중') ||
           resultText.includes('기다리는 중') ||
           resultText.includes('준비 중') ||
           resultText.includes('대기 중');
}

// 테이블 행에서 제출 정보 추출
function extractSubmissionInfo(row) {
    try {
        // 문제 번호 추출
        const problemLink = row.querySelector('a[href^="/problem/"]');
        const problemId = problemLink ? problemLink.innerText.trim() : '';
        
        // 결과 셀 찾기
        const resultCell = row.querySelector('td.result') || 
                          row.querySelector('td:nth-child(4)') ||
                          row.querySelector('td');
        const resultText = resultCell ? resultCell.innerText.trim() : '';
        const status = getResultStatus(resultText);
        
        // 메모리와 시간 정보 추출
        const memoryCell = row.querySelector('td.memory') || 
                          row.querySelector('td:nth-child(5)');
        const timeCell = row.querySelector('td.time') || 
                        row.querySelector('td:nth-child(6)');
        const memory = memoryCell ? memoryCell.innerText.trim() : '';
        const time = timeCell ? timeCell.innerText.trim() : '';
        
        // 제출 번호 추출
        const submissionIdCell = row.querySelector('td:nth-child(1)') || 
                                row.querySelector('a[href^="/status"]');
        const submissionId = submissionIdCell ? submissionIdCell.innerText.trim() : '';
        
        return {
            problemId,
            resultText,
            status,
            memory,
            time,
            submissionId
        };
    } catch (error) {
        console.error('정보 추출 실패:', error);
        return null;
    }
}

// VSCode 서버로 데이터 전송
async function sendToVSCode(data) {
    try {
        const response = await fetch('http://localhost:3000/judge-result', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log("🚀 VSCode로 채점 결과를 전송했습니다!", result);
        } else {
            console.error("❌ VSCode 서버 응답 오류:", response.status, response.statusText);
        }
    } catch (error) {
        console.error("❌ VSCode 서버 통신 실패:", error.message);
        console.error("   - 서버가 실행 중인지 확인하세요 (localhost:3000)");
        console.error("   - VSCode Extension이 활성화되어 있는지 확인하세요");
    }
}

// ============================================
// 채점 상태 추적 시스템
// ============================================

// 채점 중인 제출 추적 (제출 ID -> 추적 정보)
// "채점 준비 중" 또는 "채점 중" 상태를 추적하고, 완료 결과로 바뀔 때만 전송
const judgingSubmissions = new Map();

// 이미 전송한 결과 저장 (중복 방지)
// 키: "submissionId:status"
const sentResults = new Set();

// 최상단 행의 제출 상태 처리
function processTopRowSubmission() {
    const statusTable = document.querySelector('#status-table tbody');
    if (!statusTable) return;
    
    const firstRow = statusTable.querySelector('tr');
    if (!firstRow) return;
    
    const info = extractSubmissionInfo(firstRow);
    if (!info || !info.submissionId) return;
    
    const submissionId = info.submissionId;
    const isJudging = isJudgingStatus(info.resultText);
    
    // ============================================
    // 케이스 1: 채점 중 상태 감지
    // ============================================
    if (isJudging) {
        // 채점 중 상태를 처음 감지한 경우 추적 시작
        if (!judgingSubmissions.has(submissionId)) {
            judgingSubmissions.set(submissionId, {
                problemId: info.problemId,
                judgingStatus: info.resultText,
                startTime: Date.now()
            });
            console.log(`⏳ 채점 시작 감지: 문제 ${info.problemId} - ${info.resultText}`);
        }
        // 채점 중일 때는 전송하지 않음
        return;
    }
    
    // ============================================
    // 케이스 2: 완료 결과 감지
    // ============================================
    
    // 유효하지 않은 결과는 무시
    if (info.status === 'unknown' || !info.resultText) {
        return;
    }
    
    // 채점 중이었던 제출인지 확인
    const wasJudging = judgingSubmissions.has(submissionId);
    
    if (!wasJudging) {
        // 채점 중 상태를 거치지 않은 완료 결과는 무시
        // (이미 완료된 결과이거나 페이지 로드 시 이미 완료된 경우)
        return;
    }
    
    // ============================================
    // 케이스 3: 채점 중 -> 완료 결과로 변화
    // ============================================
    
    // 채점 중이었던 제출이 완료 결과로 바뀐 경우
    const trackingInfo = judgingSubmissions.get(submissionId);
    judgingSubmissions.delete(submissionId); // 추적 종료
    
    // 중복 전송 방지
    const resultKey = `${submissionId}:${info.status}`;
    if (sentResults.has(resultKey)) {
        return;
    }
    
    // 전송 표시
    sentResults.add(resultKey);
    
    console.log(`📊 채점 완료 감지: 문제 ${info.problemId} - ${info.resultText} (${info.status})`);
    console.log(`   ${trackingInfo.judgingStatus} → ${info.resultText}`);
    
    // VSCode로 데이터 전송
    sendToVSCode({
        problemId: info.problemId,
        resultText: info.resultText,
        status: info.status,
        memory: info.memory,
        time: info.time,
        submissionId: submissionId,
        timestamp: new Date().toISOString()
    });
}

// ============================================
// DOM 모니터링 초기화
// ============================================

const statusTable = document.querySelector('#status-table tbody');

if (statusTable) {
    // MutationObserver로 DOM 변화 감지
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
        // 디바운싱: 여러 변경사항을 모아서 한 번만 처리
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }
        
        debounceTimer = setTimeout(() => {
            processTopRowSubmission();
        }, 300);
    });
    
    observer.observe(statusTable, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'title']
    });
    
    console.log("👀 백준 채점 결과 감시 시작... (채점 중 → 완료 결과만 전송)");
    
    // 주기적 스캔 (폴백 메커니즘)
    const intervalId = setInterval(() => {
        processTopRowSubmission();
    }, 2000);
    
    // 페이지 언로드 시 정리
    window.addEventListener('beforeunload', () => {
        clearInterval(intervalId);
        observer.disconnect();
    });
    
    // 페이지 로드 시 초기 체크
    setTimeout(() => {
        processTopRowSubmission();
    }, 1000);
    
} else {
    console.warn("⚠️ 백준 status 테이블을 찾을 수 없습니다. 페이지가 로드될 때까지 대기합니다...");
    
    // 테이블이 동적으로 로드되는 경우 대비
    const checkTableInterval = setInterval(() => {
        const table = document.querySelector('#status-table tbody');
        if (table) {
            clearInterval(checkTableInterval);
            location.reload(); // 테이블 발견 시 페이지 새로고침
        }
    }, 1000);
}
