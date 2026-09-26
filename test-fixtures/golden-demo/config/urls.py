from django.urls import path
from items import views

urlpatterns = [
    path("health/", views.health, name="health"),
    path("api/items/", views.item_list, name="item-list"),
]
