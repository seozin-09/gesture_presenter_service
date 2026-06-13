// PDF Viewer Module using PDF.js
(function () {
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    let scale = 1.5;
    let canvas = null;
    let ctx = null;
    let presentationId = null;

    // CSRF 토큰을 쿠키 또는 DOM에서 가져오기
    function getCsrfToken() {
        const csrfInput = document.querySelector('[name=csrfmiddlewaretoken]');
        if (csrfInput) {
            return csrfInput.value;
        }
        return '';
    }

    // PDF 뷰어 초기화
    function initPdfViewer(pdfUrl, canvasId, presId) {
        canvas = document.getElementById(canvasId);
        ctx = canvas.getContext('2d');
        presentationId = presId;

        // PDF 로딩 시작
        pdfjsLib.getDocument(pdfUrl).promise.then(function (pdfDoc_) {
            pdfDoc = pdfDoc_;
            document.getElementById('total-pages').textContent = pdfDoc.numPages;
            
            // 첫 페이지 렌더링
            renderPage(pageNum);
            
            // 로딩 오버레이 끄기
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }

            // 서버에 페이지 수 업데이트 통보
            updateTotalPagesOnServer(pdfDoc.numPages);
        }).catch(function (error) {
            console.error('PDF 로딩 실패:', error);
            const overlayMsg = document.getElementById('overlay-message');
            if (overlayMsg) {
                overlayMsg.textContent = 'PDF 파일을 불러오지 못했습니다. 파일이 깨졌거나 지원되지 않는 형태일 수 있습니다.';
            }
            const spinner = document.querySelector('.spinner');
            if (spinner) {
                spinner.style.display = 'none';
            }
        });
    }

    // 특정 페이지 렌더링
    function renderPage(num) {
        pageRendering = true;
        
        // 페이지 가져오기
        pdfDoc.getPage(num).then(function (page) {
            // 반응형 렌더링: 캔버스 크기를 뷰포트 크기에 맞춤
            const viewport = page.getViewport({ scale: scale });
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            // 렌더링 컨텍스트 설정
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            const renderTask = page.render(renderContext);

            // 렌더링 완료 대기
            renderTask.promise.then(function () {
                pageRendering = false;
                if (pageNumPending !== null) {
                    // 보류 중인 렌더링이 있으면 실행
                    renderPage(pageNumPending);
                    pageNumPending = null;
                }
            });
        });

        // 페이지 인디케이터 업데이트
        document.getElementById('current-page').textContent = num;
        
        // window.presentationController가 있고 session_id가 정의되어 있다면 
        // 컨트롤러 쪽을 통해서도 알릴 수 있게 연동
    }

    // 보류 중인 페이지 렌더링 큐
    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    }

    // 다음 페이지
    function nextSlide() {
        if (!pdfDoc) return false;
        if (pageNum >= pdfDoc.numPages) {
            return false; // 마지막 페이지
        }
        pageNum++;
        queueRenderPage(pageNum);
        return true;
    }

    // 이전 페이지
    function prevSlide() {
        if (!pdfDoc) return false;
        if (pageNum <= 1) {
            return false; // 첫 페이지
        }
        pageNum--;
        queueRenderPage(pageNum);
        return true;
    }

    // 특정 페이지 이동
    function goToPage(num) {
        if (!pdfDoc) return;
        if (num < 1 || num > pdfDoc.numPages) return;
        pageNum = num;
        queueRenderPage(pageNum);
    }

    // 현재 페이지 번호 조회
    function getCurrentPage() {
        return pageNum;
    }

    // 전체 페이지 수 조회
    function getTotalPages() {
        return pdfDoc ? pdfDoc.numPages : 0;
    }

    // 서버에 전체 페이지 수 저장 API 호출
    function updateTotalPagesOnServer(totalPages) {
        if (!presentationId) return;
        
        const url = `/api/presentations/${presentationId}/update-pages/`;
        fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({ total_pages: totalPages })
        })
        .then(response => response.json())
        .then(data => {
            console.log('페이지 수 업데이트 완료:', data);
        })
        .catch(err => {
            console.error('페이지 수 업데이트 실패:', err);
        });
    }

    // 전역 네임스페이스에 노출
    window.pdfViewer = {
        initPdfViewer: initPdfViewer,
        renderPage: renderPage,
        nextSlide: nextSlide,
        prevSlide: prevSlide,
        goToPage: goToPage,
        getCurrentPage: getCurrentPage,
        getTotalPages: getTotalPages
    };
})();
