import os
from django import forms
from django.core.exceptions import ValidationError

class PresentationUploadForm(forms.Form):
    title = forms.CharField(
        max_length=200,
        required=True,
        error_messages={
            'required': '발표 제목을 입력해 주세요.'
        },
        widget=forms.TextInput(attrs={
            'class': 'form-control',
            'placeholder': '발표 제목을 입력하세요'
        })
    )
    file = forms.FileField(
        required=True,
        error_messages={
            'required': '발표 파일을 선택해 주세요.'
        },
        widget=forms.FileInput(attrs={
            'class': 'form-control-file',
            'accept': '.pdf,.ppt,.pptx'
        })
    )

    def clean_file(self):
        file = self.cleaned_data.get('file')
        if not file:
            raise ValidationError('파일이 존재하지 않습니다.')

        # 확장자 검증
        ext = os.path.splitext(file.name)[1].lower()
        valid_extensions = ['.pdf', '.ppt', '.pptx']
        if ext not in valid_extensions:
            raise ValidationError('업로드 가능한 파일 형식은 PDF, PPT, PPTX입니다.')

        # 크기 검증 (50MB = 50 * 1024 * 1024 bytes)
        limit = 50 * 1024 * 1024
        if file.size > limit:
            raise ValidationError('파일 크기는 50MB를 초과할 수 없습니다.')

        return file
