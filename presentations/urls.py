from django.urls import path
from . import views

app_name = 'presentations'

urlpatterns = [
    # Page views
    path('', views.home, name='home'),
    path('upload/', views.upload_presentation, name='upload'),
    path('presentations/', views.presentation_list, name='list'),
    path('presentations/<int:pk>/', views.presentation_detail, name='detail'),
    path('presentations/<int:pk>/show/', views.presentation_show, name='show'),
    path('guide/', views.guide, name='guide'),
    path('history/', views.session_history, name='history'),
    
    # API views
    path('api/presentations/<int:pk>/update-pages/', views.update_pages_api, name='api_update_pages'),
    path('api/sessions/start/', views.start_session_api, name='api_start_session'),
    path('api/sessions/<int:session_id>/action/', views.action_session_api, name='api_action_session'),
    path('api/sessions/<int:session_id>/end/', views.end_session_api, name='api_end_session'),
]
