// Teachable Machine Pose Control Module
(function () {
    let model = null;
    let webcam = null;
    let ctx = null;
    let isRunning = false;
    let animationId = null;

    // 설정값 (오작동 방지용)
    const CONFIDENCE_THRESHOLD = 0.90;    // RIGHT_HAND, LEFT_HAND 명령 확정 기준
    const NEUTRAL_CONFIDENCE_THRESHOLD = 0.80; // 중립 클래스 신뢰도 기준
    const HOLD_MS = 800;                 // 동작 유지 시간 (0.8초)
    const COOLDOWN_MS = 2000;            // 재명령 대기 시간 (2초)
    const NEUTRAL_HOLD_MS = 500;         // 중립 상태 유지 시간 (0.5초)

    // 상태 변수
    let lastTopClass = "NONE";
    let sameClassStartTime = 0;
    let lastCommandTime = 0;
    let waitingForNeutral = true;        // 첫 시작 시에도 중립 상태 한 번 거쳐야 작동하도록 true
    let neutralStartTime = 0;

    // HTML 요소 캐싱
    let statusText = null;
    let detectedClassText = null;
    let confidenceText = null;
    let webcamCanvas = null;

    // 초기 설정
    function init() {
        statusText = document.getElementById('ai-status-text');
        detectedClassText = document.getElementById('detected-class');
        confidenceText = document.getElementById('detection-confidence');
        webcamCanvas = document.getElementById('webcam-canvas');
        if (webcamCanvas) {
            ctx = webcamCanvas.getContext('2d');
        }
        
        // 모델 사전 로드 시도
        loadModel();
    }

    // 모델 로드
    async function loadModel() {
        const MODEL_BASE_URL = "/static/models/tm-pose/";
        const modelURL = MODEL_BASE_URL + "model.json";
        const metadataURL = MODEL_BASE_URL + "metadata.json";

        try {
            updateStatusText("AI 모델을 불러오는 중입니다...");
            
            // fetch를 사용해 model.json 파일이 존재하는지 가볍게 테스트하여
            // 404가 발생하면 바로 catch 블록으로 빠지게 합니다.
            const testResponse = await fetch(modelURL);
            if (!testResponse.ok) {
                throw new Error("model.json 파일이 존재하지 않습니다.");
            }

            model = await tmPose.load(modelURL, metadataURL);
            console.log("Teachable Machine Pose 모델 로드 성공");
            
            updateStatusText("AI 모델 로드 완료. 제어를 시작해 주세요.");
            const btnStartAi = document.getElementById('btn-start-ai');
            if (btnStartAi) {
                btnStartAi.disabled = false;
            }
        } catch (error) {
            console.error("모델 로드 실패:", error);
            updateStatusText("AI 모델 파일을 static/models/tm-pose/ 폴더에 넣어 주세요.");
            if (detectedClassText) {
                detectedClassText.textContent = "에러";
                detectedClassText.className = "status-val font-bold text-danger";
            }
        }
    }

    // 웹캠 및 루프 시작
    async function startAIControl() {
        if (!model) {
            alert("모델이 로드되지 않았습니다.");
            return;
        }

        try {
            updateStatusText("웹캠 권한을 허용해 주세요.");
            
            // 웹캠 초기화 (200x200 크기, Teachable Machine standard)
            const size = 200;
            const flip = true; // 거울 모드
            webcam = new tmPose.Webcam(size, size, flip);
            await webcam.setup(); // 카메라 요청
            await webcam.play();
            
            // 기존에 하드코딩된 canvas를 제거하고, webcam.canvas를 webcam-wrapper 안에 추가
            const wrapper = document.querySelector('.webcam-wrapper');
            if (wrapper) {
                wrapper.innerHTML = ''; // 기존 placeholder 비우기
                webcam.canvas.id = 'webcam-canvas';
                // JS에서 직접 거울 모드 스타일 주입 (캐시 우회)
                webcam.canvas.style.transform = 'scaleX(-1)';
                webcam.canvas.style.webkitTransform = 'scaleX(-1)';
                webcam.canvas.style.width = '100%';
                webcam.canvas.style.height = '100%';
                webcam.canvas.style.objectFit = 'cover';
                
                wrapper.appendChild(webcam.canvas);
                ctx = webcam.canvas.getContext('2d');
            }
            
            isRunning = true;
            waitingForNeutral = false; // 대기 해제하여 시작하자마자 동작 인식 가능하도록 수정
            lastCommandTime = 0;
            sameClassStartTime = 0;
            neutralStartTime = 0;
            lastTopClass = "NONE";
            
            updateStatusText("AI 제어가 시작되었습니다.");
            
            // UI 변경
            document.getElementById('btn-start-ai').style.display = 'none';
            document.getElementById('btn-stop-ai').style.display = 'block';

            // 루프 시작
            animationId = window.requestAnimationFrame(loop);
        } catch (error) {
            console.error("웹캠 실행 실패:", error);
            updateStatusText("웹캠 권한이 필요합니다.");
            alert("웹캠을 켤 수 없습니다. 카메라 접근 권한을 확인해 주세요.");
        }
    }

    // AI 제어 중지
    async function stopAIControl() {
        isRunning = false;
        if (animationId) {
            window.cancelAnimationFrame(animationId);
            animationId = null;
        }
        if (webcam) {
            await webcam.stop();
            webcam = null;
        }
        
        // UI 정리 및 placeholder canvas 원복
        const wrapper = document.querySelector('.webcam-wrapper');
        if (wrapper) {
            wrapper.innerHTML = '<canvas id="webcam-canvas" width="200" height="200"></canvas>';
            webcamCanvas = document.getElementById('webcam-canvas');
            if (webcamCanvas) {
                ctx = webcamCanvas.getContext('2d');
            }
        }
        
        updateStatusText("AI 제어가 중지되었습니다.");
        if (detectedClassText) detectedClassText.textContent = "-";
        if (confidenceText) confidenceText.textContent = "-";
        
        document.getElementById('btn-start-ai').style.display = 'block';
        document.getElementById('btn-stop-ai').style.display = 'none';
    }

    // 프레임 루프
    async function loop(timestamp) {
        if (!isRunning) return;

        try {
            if (webcam) {
                webcam.update(); // 웹캠 프레임 갱신
                await predict();
            }
        } catch (error) {
            console.error("프레임 루프 처리 중 오류 발생:", error);
            updateStatusText("루프 에러: " + error.message);
        }

        if (isRunning) {
            animationId = window.requestAnimationFrame(loop);
        }
    }

    // 포즈 예측 및 제어 로직 적용
    async function predict() {
        if (!webcam) return;
        
        try {
            // 1. 포즈 추정 및 클래스 분류 실행
            // estimatePose는 웹캠 캔버스 드로잉용이며, predict는 예측값을 줍니다.
            const { pose, posenetOutput } = await model.estimatePose(webcam.canvas);
            const prediction = await model.predict(posenetOutput);

            // 2. 웹캠 드로잉 (Canvas에 그리기)
            if (ctx) {
                // 포즈 뼈대만 위에 덧그립니다. (비디오 자체는 webcam.update()가 내부적으로 그림)
                if (pose) {
                    tmPose.drawKeypoints(pose.keypoints, 0.5, ctx);
                    tmPose.drawSkeleton(pose.keypoints, 0.5, ctx);
                }
            }

            // 3. 가장 높은 확률의 클래스 찾기
            let topClass = "NONE";
            let maxConfidence = -1;

            for (let i = 0; i < prediction.length; i++) {
                if (prediction[i].probability > maxConfidence) {
                    maxConfidence = prediction[i].probability;
                    topClass = prediction[i].className; // "STOP", "RIGHT_HAND", "LEFT_HAND", "NONE", "INDICATE"
                }
            }

        // 4. 화면에 임시 인식 상태 표시
        if (detectedClassText) {
            detectedClassText.textContent = topClass;
            // 클래스에 따른 색상 구분
            if (topClass === "RIGHT_HAND" || topClass === "LEFT_HAND") {
                detectedClassText.className = "status-val font-bold text-primary";
            } else if (topClass === "INDICATE") {
                detectedClassText.className = "status-val font-bold text-warning";
            } else {
                detectedClassText.className = "status-val font-bold text-neutral";
            }
        }
        if (confidenceText) {
            confidenceText.textContent = (maxConfidence * 100).toFixed(1) + "%";
        }

        const now = Date.now();

        // 5. [오작동 방지 로직 적용]
        
        // A. 중립 상태 판단 (STOP, NONE, INDICATE)
        if (topClass === "STOP" || topClass === "NONE" || topClass === "INDICATE") {
            if (maxConfidence >= NEUTRAL_CONFIDENCE_THRESHOLD) {
                // 중립 상태가 막 감지되기 시작했거나 유지 중
                if (lastTopClass !== "STOP" && lastTopClass !== "NONE" && lastTopClass !== "INDICATE") {
                    // 이제 막 중립으로 돌아옴
                    neutralStartTime = now;
                }
                
                // 중립 상태가 NEUTRAL_HOLD_MS(500ms) 이상 유지되면, 다음 명령 가능
                if (now - neutralStartTime >= NEUTRAL_HOLD_MS) {
                    if (waitingForNeutral) {
                        waitingForNeutral = false;
                        updateStatusText("준비 완료. 손동작을 취하세요.");
                    }
                }
            }
            lastTopClass = topClass;
            return;
        }

        // B. 중립 복귀 대기 중인지 체크
        if (waitingForNeutral) {
            updateStatusText("STOP, NONE, INDICATE 상태로 돌아오면 다시 명령할 수 있습니다.");
            lastTopClass = topClass;
            return;
        }

        // C. 명령 동작 (RIGHT_HAND, LEFT_HAND) 검증
        if (topClass !== "RIGHT_HAND" && topClass !== "LEFT_HAND") {
            lastTopClass = topClass;
            return; // 사실상 위에서 걸러지므로 안전장치
        }

        // D. 동작 확률(Confidence) 90% 이상인지 확인
        if (maxConfidence < CONFIDENCE_THRESHOLD) {
            lastTopClass = topClass;
            return;
        }

        // E. 800ms 동안 동일 동작 유지했는지 검증
        if (topClass !== lastTopClass) {
            // 동작 클래스가 바뀌었으므로 카운트 타이머 리셋
            sameClassStartTime = now;
        } else {
            // 동일 동작 유지 중인 상태
            const heldDuration = now - sameClassStartTime;
            
            // F. 쿨타임(2000ms) 검증
            if (now - lastCommandTime < COOLDOWN_MS) {
                updateStatusText("쿨타임 중입니다.");
                lastTopClass = topClass;
                return;
            }

            // G. 800ms 유지 완료 시 명령 수행
            if (heldDuration >= HOLD_MS) {
                if (window.presentationController) {
                    if (topClass === "RIGHT_HAND") {
                        const success = window.presentationController.nextSlide();
                        if (success) {
                            window.presentationController.recordAction("RIGHT_HAND", maxConfidence);
                            updateStatusText("RIGHT_HAND 동작이 인식되어 다음 슬라이드로 이동했습니다.");
                        }
                    } else if (topClass === "LEFT_HAND") {
                        const success = window.presentationController.prevSlide();
                        if (success) {
                            window.presentationController.recordAction("LEFT_HAND", maxConfidence);
                            updateStatusText("LEFT_HAND 동작이 인식되어 이전 슬라이드로 이동했습니다.");
                        }
                    }
                    
                    // 명령 발송 완료 처리
                    waitingForNeutral = true;
                    lastCommandTime = now;
                    neutralStartTime = now; // 초기화
                }
            } else {
                // 아직 800ms 미만 유지된 상태
                updateStatusText(`${topClass} 인식 중... (${(heldDuration/10).toFixed(0)}%)`);
            }
        }

        lastTopClass = topClass;
        } catch (error) {
            console.error("동작 예측 중 오류 발생:", error);
            updateStatusText("예측 에러: " + error.message);
        }
    }

    // 상태 메시지 출력 헬퍼
    function updateStatusText(msg) {
        if (statusText) {
            statusText.textContent = msg;
        }
    }

    // 전역 노출
    window.tmPoseControl = {
        init: init,
        startAIControl: startAIControl,
        stopAIControl: stopAIControl
    };
})();
