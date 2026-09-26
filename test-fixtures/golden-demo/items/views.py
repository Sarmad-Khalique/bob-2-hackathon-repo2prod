import json

from django.db import connection, Error as DbError
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from .models import Item


def health(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except DbError:
        return JsonResponse(
            {"status": "error", "database": "unavailable"},
            status=503,
        )
    return JsonResponse({"status": "ok", "database": "ok"})


@csrf_exempt
@require_http_methods(["GET", "POST"])
def item_list(request):
    if request.method == "GET":
        items = list(Item.objects.values("id", "name", "created_at"))
        return JsonResponse(items, safe=False)

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, ValueError):
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    name = body.get("name", "")
    if not name or not isinstance(name, str) or len(name.strip()) == 0:
        return JsonResponse({"error": "name is required"}, status=400)
    if len(name) > 100:
        return JsonResponse({"error": "name exceeds 100 characters"}, status=400)

    item = Item.objects.create(name=name)
    return JsonResponse(
        {"id": item.id, "name": item.name, "created_at": item.created_at},
        status=201,
    )
