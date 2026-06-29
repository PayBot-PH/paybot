import pytest
from unittest.mock import AsyncMock, patch

from services.xendit_service import XenditService


@pytest.mark.asyncio
async def test_create_invoice_uses_click_store_descriptor_by_default():
    class FakeResponse:
        def __init__(self, payload):
            self._payload = payload

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    class FakeClient:
        def __init__(self, payload):
            self.payload = payload

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return False

        async def post(self, url, json=None, auth=None, timeout=None):
            self.last_request = {"url": url, "json": json, "auth": auth, "timeout": timeout}
            return FakeResponse({"id": "inv_123", "invoice_url": "https://example.test/pay"})

    fake_client = FakeClient({})

    with patch("httpx.AsyncClient", return_value=fake_client):
        service = XenditService(secret_key="test-key")
        result = await service.create_invoice(amount=100, external_id="ext-1", payer_email="customer@example.com")

    assert result["success"] is True
    assert fake_client.last_request["json"]["description"] == "Click Store"
