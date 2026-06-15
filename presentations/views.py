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
            
            filename = uploaded_file.name
            ext = os.path.splitext(filename)[1].lower()
            file_type = ext[1:]  # 'pdf', 'ppt', 'pptx'
            
            presentation = Presentation(
                title=title,
                original_file=uploaded_file,
                original_filename=filename,
                file_type=file_type,
                conversion_status='pending'
            )
            presentation.save()
            
            if file_type == 'pdf':
                presentation.pdf_file.save(filename, presentation.original_file.file, save=False)
                presentation.conversion_status = 'ready'
                presentation.save()
                return redirect('presentations:list')
            
            else:
                pdf_output_dir = os.path.join(settings.MEDIA_ROOT, 'presentations', 'pdf')
                os.makedirs(pdf_output_dir, exist_ok=True)
                
                input_path = presentation.original_file.path
                
                try: # -> PPT/PPTX 변환하는건데 try-except 써서 에러 발생시 업로드한 파일은 유지하고 변환 실패만 띄움
                    converted_pdf_path = convert_office_to_pdf(input_path, pdf_output_dir)
                    
                    with open(converted_pdf_path, 'rb') as f:
                        pdf_filename = os.path.splitext(filename)[0] + '.pdf'
                        presentation.pdf_file.save(pdf_filename, File(f), save=False)
                    
                    presentation.conversion_status = 'ready'
                    presentation.save()
                    
                except Exception as e:
                    presentation.conversion_status = 'failed'
                    presentation.conversion_error = str(e)
                    presentation.save()

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

# 세션 코드 -> AI의 힘을 빌림

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
        
        GestureActionLog.objects.create(
            session=session,
            action=action,
            confidence=confidence,
            slide_number=slide_number
        )
        
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
