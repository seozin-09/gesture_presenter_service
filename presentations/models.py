from django.db import models

class Presentation(models.Model):
    title = models.CharField(max_length=200)
    original_file = models.FileField(upload_to="presentations/original/")
    pdf_file = models.FileField(upload_to="presentations/pdf/", null=True, blank=True)
    original_filename = models.CharField(max_length=255)
    file_type = models.CharField(max_length=20)
    total_pages = models.PositiveIntegerField(null=True, blank=True)
    conversion_status = models.CharField(max_length=20, default='pending')  # pending, ready, failed
    conversion_error = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.title

class PresentationSession(models.Model):
    presentation = models.ForeignKey(Presentation, on_delete=models.CASCADE)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    next_count = models.PositiveIntegerField(default=0)
    prev_count = models.PositiveIntegerField(default=0)
    total_actions = models.PositiveIntegerField(default=0)

    def __str__(self):
        return f"Session {self.id} for {self.presentation.title}"

class GestureActionLog(models.Model):
    session = models.ForeignKey(PresentationSession, on_delete=models.CASCADE)
    action = models.CharField(max_length=30)
    confidence = models.FloatField(null=True, blank=True)
    slide_number = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Log {self.id} - Session {self.session.id}: {self.action} ({self.confidence})"
