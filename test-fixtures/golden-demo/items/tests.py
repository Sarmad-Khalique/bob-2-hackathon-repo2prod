import json

from django.test import TestCase


class HealthCheckTest(TestCase):
    def test_health_returns_ok(self):
        response = self.client.get("/health/")
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["database"], "ok")


class ItemAPITest(TestCase):
    def test_create_and_list_item(self):
        create_response = self.client.post(
            "/api/items/",
            data=json.dumps({"name": "Widget"}),
            content_type="application/json",
        )
        self.assertEqual(create_response.status_code, 201)
        created = json.loads(create_response.content)
        self.assertEqual(created["name"], "Widget")

        list_response = self.client.get("/api/items/")
        self.assertEqual(list_response.status_code, 200)
        items = json.loads(list_response.content)
        self.assertTrue(any(i["id"] == created["id"] for i in items))

    def test_create_empty_name_returns_400(self):
        response = self.client.post(
            "/api/items/",
            data=json.dumps({"name": ""}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 400)
