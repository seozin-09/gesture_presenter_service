import os
import json
from django.shortcuts import render, redirect, get_object_or_404
from django.http import JsonResponse, HttpResponseBadRequest
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_POST
from django.utils import timezone
from django.core.files import File
from django.conf import settings

from .models import Presentation, PresentationSession, GestureActionLog
from .forms import PresentationUploadForm
from .utils import convert_office_to_pdf



def home(request):
    return render(request, 'presentations/home.html')

def upload_presentation(request):
    if request.method == 'POST':
        form = PresentationUploadForm(request.POST, request.FILES)
        if form.is_valid():
            title = form.cleaned_data['title']
            uploaded_file = form.cleaned_data['file']
            
            # 파일 정보 분석
            filename = uploaded_file.name
            ext = os.path.splitext(filename)[1].lower()
            file_type = ext[1:]  # 'pdf', 'ppt', 'pptx'
            
            # Presentation 인스턴스 생성 및 original_file 저장 (이 시점에 파일이 media/presentations/original/ 에 저장됨)
            presentation = Presentation(
                title=title,
                original_file=uploaded_file,
                original_filename=filename,
                file_type=file_type,
                conversion_status='pending'
            )
            presentation.save()
            
            # PDF인 경우
            if file_type == 'pdf':
                # original_file을 pdf_file에도 할당하여 저장
                presentation.pdf_file.save(filename, presentation.original_file.file, save=False)
                presentation.conversion_status = 'ready'
                presentation.save()
                return redirect('presentations:list')
            
            # PPT, PPTX인 경우
            else:
                # 1. output 디렉토리 설정
                pdf_output_dir = os.path.join(settings.MEDIA_ROOT, 'presentations', 'pdf')
                os.makedirs(pdf_output_dir, exist_ok=True)
                
                # 2. original_file 경로 가져오기
                input_path = presentation.original_file.path
                
                try:
                    # 3. 변환 실행
                    converted_pdf_path = convert_office_to_pdf(input_path, pdf_output_dir)
                    
                    # 4. 변환된 PDF 파일을 Django File 객체로 열어 pdf_file 필드에 저장
                    with open(converted_pdf_path, 'rb') as f:
                        pdf_filename = os.path.splitext(filename)[0] + '.pdf'
                        presentation.pdf_file.save(pdf_filename, File(f), save=False)
                    
                    presentation.conversion_status = 'ready'
                    presentation.save()
                    
                    # 임시 생성된 파일이 media root 하위 pdf 폴더 외에 남아있지 않도록 정리 (만약 다른 경로에 생성되었다면)
                    # convert_office_to_pdf는 pdf_output_dir에 바로 생성하므로 Django save 시 덮어쓰거나 중복될 수 있으나 큰 문제는 없음
                    
                except Exception as e:
                    # 실패 시 예외 처리
                    presentation.conversion_status = 'failed'
                    presentation.conversion_error = str(e)
                    presentation.save()
                    
                    # 폼 에러와 함께 화면에 전달하기 위해 렌더링
                    context = {
                        'form': form,
                        'error_message': f"PPT/PPTX 변환에 실패했습니다. PDF로 다시 업로드해 주세요. (에러: {str(e)})"
                    }
                    return render(request, 'presentations/upload.html', context)
                
                return redirect('presentations:list')
    else:
        form = PresentationUploadForm()
    
    return render(request, 'presentations/upload.html', {'form': form})

def presentation_list(request):
    presentations = Presentation.objects.all().order_by('-uploaded_at')
    return render(request, 'presentations/list.html', {'presentations': presentations})

def presentation_detail(request, pk):
    presentation = get_object_or_404(Presentation, pk=pk)
    return render(request, 'presentations/detail.html', {'presentation': presentation})

@ensure_csrf_cookie
def presentation_show(request, pk):
    presentation = get_object_or_404(Presentation, pk=pk)
    
    if presentation.conversion_status != 'ready':
        return redirect('presentations:detail', pk=pk)
        
    return render(request, 'presentations/show.html', {
        'presentation': presentation,
        'pdf_url': presentation.pdf_file.url if presentation.pdf_file else ''
    })

def guide(request):
    return render(request, 'presentations/guide.html')

def session_history(request):
    sessions = PresentationSession.objects.select_related('presentation').order_by('-started_at')
    return render(request, 'presentations/history.html', {'sessions': sessions})

# API Views

@csrf_exempt
@require_POST
def update_pages_api(request, pk):
    presentation = Presentation.objects.filter(pk=pk).first()
    if not presentation:
        return JsonResponse({'error': '발표 자료를 찾을 수 없습니다.'}, status=404)
    
    try:
        data = json.loads(request.body)
        total_pages = data.get('total_pages')
        if total_pages is not None:
            presentation.total_pages = int(total_pages)
            presentation.save()
            return JsonResponse({'status': 'success', 'total_pages': presentation.total_pages})
        return JsonResponse({'error': 'total_pages가 누락되었습니다.'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def start_session_api(request):
    try:
        data = json.loads(request.body)
        presentation_id = data.get('presentation_id')
        presentation = Presentation.objects.filter(id=presentation_id).first()
        
        if not presentation:
            return JsonResponse({'error': '발표 자료를 찾을 수 없습니다.'}, status=404)
            
        session = PresentationSession.objects.create(presentation=presentation)
        return JsonResponse({'status': 'success', 'session_id': session.id})
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def action_session_api(request, session_id):
    session = PresentationSession.objects.filter(id=session_id).first()
    if not session:
        return JsonResponse({'error': '세션을 찾을 수 없습니다.'}, status=404)
        
    try:
        data = json.loads(request.body)
        action = data.get('action')
        confidence = data.get('confidence')
        slide_number = data.get('slide_number')
        
        # 로그 저장
        GestureActionLog.objects.create(
            session=session,
            action=action,
            confidence=confidence,
            slide_number=slide_number
        )
        
        # 카운트 업데이트
        if action in ['RIGHT_HAND', 'next']:
            session.next_count += 1
        elif action in ['LEFT_HAND', 'prev']:
            session.prev_count += 1
            
        session.total_actions += 1
        session.save()
        
        return JsonResponse({
            'status': 'success', 
            'next_count': session.next_count,
            'prev_count': session.prev_count,
            'total_actions': session.total_actions
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

@csrf_exempt
@require_POST
def end_session_api(request, session_id):
    session = PresentationSession.objects.filter(id=session_id).first()
    if not session:
        return JsonResponse({'error': '세션을 찾을 수 없습니다.'}, status=404)
        
    try:
        session.ended_at = timezone.now()
        session.save()
        return JsonResponse({
            'status': 'success',
            'ended_at': session.ended_at.isoformat()
        })
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)
