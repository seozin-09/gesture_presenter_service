import subprocess
import os
import sys

def convert_office_to_pdf(input_path, output_dir):
    """
    LibreOffice를 사용하여 PPT, PPTX 파일을 PDF로 변환합니다.
    """
    # Windows와 Linux/macOS 환경에 대응하기 위해 실행 파일 후보들을 정의합니다.
    libreoffice_commands = ['libreoffice', 'soffice']
    
    # Windows의 경우 기본 설치 경로도 후보에 추가합니다.
    if sys.platform.startswith('win'):
        default_paths = [
            r"C:\Program Files\LibreOffice\program\soffice.exe",
            r"C:\Program Files (x86)\LibreOffice\program\soffice.exe",
            r"C:\Program Files\LibreOffice\program\libreoffice.exe",
        ]
        for path in default_paths:
            if os.path.exists(path):
                libreoffice_commands.insert(0, path)

    # 변환 성공 여부를 추적합니다.
    last_error = None
    
    for cmd in libreoffice_commands:
        try:
            # subprocess.run 실행
            # command: cmd --headless --convert-to pdf --outdir output_dir input_path
            run_cmd = [cmd, '--headless', '--convert-to', 'pdf', '--outdir', output_dir, input_path]
            
            result = subprocess.run(
                run_cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=60  # 60초 타임아웃
            )
            
            if result.returncode == 0:
                # 변환 성공 시, 생성된 파일 경로 확인
                # LibreOffice는 input_path의 파일명에서 확장자만 .pdf로 바꿔 output_dir에 저장함.
                basename = os.path.basename(input_path)
                filename_without_ext = os.path.splitext(basename)[0]
                expected_pdf_path = os.path.join(output_dir, filename_without_ext + '.pdf')
                
                if os.path.exists(expected_pdf_path):
                    return expected_pdf_path
                else:
                    raise FileNotFoundError(f"변환된 PDF 파일을 찾을 수 없습니다: {expected_pdf_path}")
            else:
                last_error = Exception(f"LibreOffice 변환 실패 (반환 코드: {result.returncode}): {result.stderr}")
        except FileNotFoundError:
            # cmd가 시스템에 없을 경우 다음 cmd 시도
            last_error = FileNotFoundError(f"LibreOffice 실행 파일을 찾을 수 없습니다: {cmd}")
            continue
        except subprocess.TimeoutExpired as e:
            last_error = subprocess.TimeoutExpired(e.cmd, e.timeout, output=e.stdout, stderr=e.stderr)
            break
        except Exception as e:
            last_error = e
            break

    if last_error:
        raise last_error
    else:
        raise Exception("LibreOffice 변환을 수행할 수 없습니다. 시스템에 LibreOffice가 설치되어 있는지 확인해 주세요.")
