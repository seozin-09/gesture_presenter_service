// Presentation Show Controller Module
(function () {
    let sessionId = null;
    let presentationId = null;

    // CSRF 토큰 가져오기
    function getCsrfToken() {
        const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
        if (csrfInput) {
            return csrfInput.value;
        }
        return '';
    }

    // 초기 설정
    document.addEventListener('DOMContentLoaded', function () {
        const metadataEl = document.getElementById('presentation-metadata');
        if (!metadataEl) return;

        presentationId = metadataEl.getAttribute('data-id');
        const pdfUrl = metadataEl.getAttribute('data-pdf-url');

        // 1. PDF 뷰어 초기화
        window.pdfViewer.initPdfViewer(pdfUrl, 'pdf-canvas', presentationId);

        // 2. Teachable Machine 컨트롤러 초기화 (모델 로드 시작)
        window.tmPoseControl.init();

        // 3. 버튼 이벤트 바인딩
        initEventBindings();
    });

    // 이벤트 바인딩
    function initEventBindings() {
        // 이전/다음 슬라이드 버튼
        document.getElementById('btn-prev-slide').addEventListener('click', function () {
            prevSlide();
        });
        document.getElementById('btn-next-slide').addEventListener('click', function () {
            nextSlide();
        });

        // 전체화면 시작 버튼
        document.getElementById('btn-fullscreen').addEventListener('click', function () {
            toggleFullscreen();
        });

        // AI 제어 시작 / 중지 버튼
        document.getElementById('btn-start-ai').addEventListener('click', async function () {
            // AI 시작 및 세션 생성
            await startSession();
            await window.tmPoseControl.startAIControl();
        });

        document.getElementById('btn-stop-ai').addEventListener('click', async function () {
            // AI 제어 중지 (세션은 발표 종료 시 최종 종료 처리하거나 필요 시 임시 보관)
            await window.tmPoseControl.stopAIControl();
        });

        // 발표 종료 버튼
        document.getElementById('btn-end-presentation').addEventListener('click', async function () {
            await endSession();
        });

        // 키보드 조작
        document.addEventListener('keydown', function (event) {
            switch (event.key) {
                case 'ArrowRight':
                case ' ': // Space key
                    // 스페이스 키 입력 시 브라우저 스크롤 방지
                    if (event.key === ' ') event.preventDefault();
                    nextSlide();
                    break;
                case 'ArrowLeft':
                    prevSlide();
                    break;
                case 'Home':
                    goToPage(1);
                    break;
                case 'End':
                    const total = getTotalPages();
                    if (total > 0) goToPage(total);
                    break;
            }
        });

        // 전체화면 변경 이벤트 감지 (CSS 클래스 토글용)
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('mozfullscreenchange', handleFullscreenChange);
        document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    }

    // 전체화면 상태 감지 핸들러
    function handleFullscreenChange() {
        const fullscreenElement = document.fullscreenElement || 
                                  document.webkitFullscreenElement || 
                                  document.mozFullScreenElement || 
                                  document.msFullscreenElement;
        
        const container = document.getElementById('presentation-container');
        if (fullscreenElement) {
            container.classList.add('fullscreen-active');
            document.getElementById('btn-fullscreen').textContent = '전체화면 종료';
        } else {
            container.classList.remove('fullscreen-active');
            document.getElementById('btn-fullscreen').textContent = '전체화면 시작';
        }
    }

    // 전체화면 토글
    function toggleFullscreen() {
        const target = document.getElementById('slide-fullscreen-target');
        
        const fullscreenElement = document.fullscreenElement || 
                                  document.webkitFullscreenElement || 
                                  document.mozFullScreenElement || 
                                  document.msFullscreenElement;

        if (!fullscreenElement) {
            // 전체화면 시작
            if (target.requestFullscreen) {
                target.requestFullscreen();
            } else if (target.webkitRequestFullscreen) {
                target.webkitRequestFullscreen();
            } else if (target.mozRequestFullScreen) {
                target.mozRequestFullScreen();
            } else if (target.msRequestFullscreen) {
                target.msRequestFullscreen();
            }
        } else {
            // 전체화면 종료
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }

    // 슬라이드 기능 중계
    function nextSlide() {
        const success = window.pdfViewer.nextSlide();
        if (success && sessionId) {
            // 키보드나 마우스 클릭으로 슬라이드를 넘겼을 때도 로깅할 수 있게 처리
            recordAction('next', 1.0);
        }
        return success;
    }

    function prevSlide() {
        const success = window.pdfViewer.prevSlide();
        if (success && sessionId) {
            recordAction('prev', 1.0);
        }
        return success;
    }

    function goToPage(pageNumber) {
        window.pdfViewer.goToPage(pageNumber);
    }

    function getCurrentPage() {
        return window.pdfViewer.getCurrentPage();
    }

    function getTotalPages() {
        return window.pdfViewer.getTotalPages();
    }

    // AI 상태 텍스트 강제 설정
    function setStatus(message) {
        const statusText = document.getElementById('ai-status-text');
        if (statusText) {
            statusText.textContent = message;
        }
    }

    // 세션 시작 API 호출
    async function startSession() {
        if (sessionId) return; // 이미 실행 중인 세션이 있으면 재활용
        
        try {
            const response = await fetch('/api/sessions/start/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({ presentation_id: presentationId })
            });

            if (!response.ok) {
                throw new Error('세션 시작 API 오류');
            }

            const data = await response.json();
            if (data.status === 'success') {
                sessionId = data.session_id;
                console.log('발표 세션 시작됨. ID:', sessionId);
            }
        } catch (error) {
            console.error('세션 생성 실패:', error);
        }
    }

    // 액션 기록 API 호출
    async function recordAction(action, confidence) {
        if (!sessionId) return;

        const currentPage = getCurrentPage();
        try {
            const response = await fetch(`/api/sessions/${sessionId}/action/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': getCsrfToken()
                },
                body: JSON.stringify({
                    action: action,
                    confidence: confidence,
                    slide_number: currentPage
                })
            });

            if (!response.ok) {
                throw new Error('액션 로깅 API 오류');
            }
            
            const data = await response.json();
            console.log('액션 로깅 성공:', data);
        } catch (error) {
            console.error('액션 로깅 실패:', error);
        }
    }

    // 세션 종료 API 호출
    async function endSession() {
        // AI 제어 먼저 중지
        await window.tmPoseControl.stopAIControl();

        if (sessionId) {
            try {
                setStatus("발표가 종료되었습니다.");
                const response = await fetch(`/api/sessions/${sessionId}/end/`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-CSRFToken': getCsrfToken()
                    }
                });

                if (!response.ok) {
                    throw new Error('세션 종료 API 오류');
                }

                const data = await response.json();
                console.log('발표 세션 종료됨:', data);
            } catch (error) {
                console.error('세션 종료 실패:', error);
            } finally {
                sessionId = null;
            }
        }

        // 발표 목록 화면 또는 상세 화면으로 이동
        alert("발표가 종료되었습니다. 상세 화면으로 이동합니다.");
        window.location.href = `/presentations/${presentationId}/`;
    }

    // 전역 컨트롤러 노출
    window.presentationController = {
        nextSlide: nextSlide,
        prevSlide: prevSlide,
        goToPage: goToPage,
        getCurrentPage: getCurrentPage,
        getTotalPages: getTotalPages,
        recordAction: recordAction,
        setStatus: setStatus,
        startSession: startSession,
        endSession: endSession
    };
})();
