// 1. VSCode 서버로 데이터를 쏘는 함수
async function sendToVSCode(data) {
    try {
        const response = await fetch('http://localhost:3000/success', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        if (response.ok) {
            const result = await response.json();
            console.log("🚀 VSCode로 신호를 보냈습니다!", result);
        } else {
            console.error("❌ VSCode 서버 응답 오류:", response.status, response.statusText);
        }
    } catch (error) {
        console.error("❌ VSCode 서버 통신 실패:", error.message);
        console.error("   - 서버가 실행 중인지 확인하세요 (localhost:3000)");
        console.error("   - VSCode Extension이 활성화되어 있는지 확인하세요");
    }
}

// 2. DOM 변화 감지 로직
const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
        const target = mutation.target;
        
        // "맞았습니다!!" 또는 "100%" 텍스트가 나타났는지 확인
        if (target.innerText && (target.innerText.includes("맞았습니다!!") || target.innerText.includes("100%"))) {
            const row = target.closest('tr'); // 현재 행 추출
            const problemId = row.querySelector('a[href^="/problem/"]').innerText;
            const resultText = target.innerText;

            console.log(`🎉 문제 성공 감지: ${problemId}`);
            
            // VSCode로 데이터 송신
            sendToVSCode({
                problemId: problemId,
                status: resultText,
                timestamp: new Date().toISOString()
            });

            // 한 번 감지하면 중복 송신 방지를 위해 잠시 중단하거나 로직 처리
            // (실제 개발 시에는 제출 번호를 저장하여 중복 체크를 하는 것이 좋습니다)
        }
    }
});

// 3. 백준 제출 표(tbody) 감시 시작
const statusTable = document.querySelector('#status-table tbody');
if (statusTable) {
    observer.observe(statusTable, {
        childList: true,
        subtree: true,
        characterData: true
    });
    console.log("👀 백준 결과 감시 시작...");
}