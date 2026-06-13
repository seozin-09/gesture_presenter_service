from django.contrib import admin
from .models import Presentation, PresentationSession, GestureActionLog

@admin.register(Presentation)
class PresentationAdmin(admin.ModelAdmin):
    list_display = ('title', 'original_filename', 'file_type', 'conversion_status', 'uploaded_at')
    list_filter = ('file_type', 'conversion_status')
    search_fields = ('title', 'original_filename')

@admin.register(PresentationSession)
class PresentationSessionAdmin(admin.ModelAdmin):
    list_display = ('id', 'presentation', 'started_at', 'ended_at', 'next_count', 'prev_count', 'total_actions')
    list_filter = ('started_at',)
    search_fields = ('presentation__title',)

@admin.register(GestureActionLog)
class GestureActionLogAdmin(admin.ModelAdmin):
    list_display = ('id', 'session', 'action', 'confidence', 'slide_number', 'created_at')
    list_filter = ('action', 'created_at')
    search_fields = ('session__presentation__title', 'action')
