from django.urls import path
from .views import save,read,import_package
urlpatterns=[
    path('api/p2lrn/studio/save',save),
    path('api/p2lrn/studio/read',read),
    path('api/p2lrn/studio/import',import_package),
]
