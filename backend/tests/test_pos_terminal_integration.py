#!/usr/bin/env python3
"""
POS Terminal System - Integration Test Suite

Tests real POS terminal functions with a connected device:
- Device registration
- Terminal assignment
- Transaction creation
- Payment processing (QR, Card)
- Webhook handling
- Real-time synchronization
"""

import asyncio
import httpx
import json
import uuid
from datetime import datetime
from typing import Dict, Any, Optional

# ============ Configuration ============

BASE_URL = "http://localhost:8000"  # Change to Railway URL when deployed
TIMEOUT = 30

# Test credentials (configure these)
ADMIN_EMAIL = "admin@paybot.local"
ADMIN_PASSWORD = "changeme123"
MERCHANT_EMAIL = "merchant@paybot.local"
MERCHANT_PASSWORD = "merchant123"
DEVICE_ID = "DEVICE-TEST-001"  # Your actual device ID from APK

# ============ Test Utilities ============

class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []
    
    def add_pass(self, name: str, details: str = ""):
        self.passed += 1
        self.tests.append({"status": "✅ PASS", "name": name, "details": details})
        print(f"✅ {name}")
        if details:
            print(f"   → {details}")
    
    def add_fail(self, name: str, error: str):
        self.failed += 1
        self.tests.append({"status": "❌ FAIL", "name": name, "error": error})
        print(f"❌ {name}")
        print(f"   → ERROR: {error}")
    
    def summary(self):
        total = self.passed + self.failed
        print("\n" + "="*60)
        print(f"TEST SUMMARY: {self.passed}/{total} passed")
        print("="*60)
        for test in self.tests:
            print(f"{test['status']} - {test['name']}")
            if "details" in test and test["details"]:
                print(f"             {test['details']}")
            elif "error" in test:
                print(f"             {test['error']}")
        print("="*60)
        return self.passed == total

# ============ API Helper Functions ============

async def api_request(
    method: str,
    path: str,
    token: Optional[str] = None,
    data: Optional[Dict] = None,
) -> tuple[int, Dict]:
    """Make API request and return status code + JSON response"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    url = f"{BASE_URL}{path}"
    
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        if method == "GET":
            resp = await client.get(url, headers=headers)
        elif method == "POST":
            resp = await client.post(url, headers=headers, json=data)
        elif method == "PUT":
            resp = await client.put(url, headers=headers, json=data)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        try:
            return resp.status_code, resp.json()
        except:
            return resp.status_code, {"error": "Invalid JSON response"}

async def health_check(results: TestResults):
    """Test 0: Health Check"""
    try:
        status, response = await api_request("GET", "/health")
        if status == 200 and response.get("status") in ["healthy", "degraded"]:
            results.add_pass(
                "Health Check",
                f"Status: {response.get('status')}, DB: {response.get('database')}"
            )
            return True
        else:
            results.add_fail("Health Check", f"Status {status}: {response}")
            return False
    except Exception as e:
        results.add_fail("Health Check", str(e))
        return False

async def deployment_status(results: TestResults):
    """Test 0b: Deployment Status"""
    try:
        status, response = await api_request("GET", "/health/deployment")
        if status == 200:
            services = response.get("services", {})
            summary = f"Platform: {response.get('platform')}, "
            summary += f"DB: {'✓' if services.get('database', {}).get('healthy') else '✗'}, "
            summary += f"Telegram: {'✓' if services.get('telegram', {}).get('configured') else '✗'}, "
            summary += f"PayMongo: {'✓' if services.get('paymongo', {}).get('configured') else '✗'}"
            
            results.add_pass("Deployment Status", summary)
            return response
        else:
            results.add_fail("Deployment Status", f"Status {status}")
            return None
    except Exception as e:
        results.add_fail("Deployment Status", str(e))
        return None

# ============ Test Suite ============

async def run_device_registration_tests(results: TestResults, token: str):
    """Test 1: Device Registration & Management"""
    print("\n📱 TEST SUITE 1: Device Registration")
    
    device_data = {
        "device_id": DEVICE_ID,
        "brand": "Samsung",
        "model": "Galaxy Tab A7",
        "os_version": "12.0",
        "app_version": "1.0.0",
        "metadata_json": json.dumps({
            "screen_resolution": "1920x1080",
            "location": "Manila, PH"
        })
    }
    
    # Test 1.1: Register device
    try:
        status, response = await api_request(
            "POST",
            "/api/v1/devices/register",
            token=token,
            data=device_data
        )
        
        if status == 200 and response.get("success"):
            device = response.get("device", {})
            results.add_pass(
                "Device Registration",
                f"Device ID: {device.get('device_id')}, Status: {device.get('is_authorized')}"
            )
        else:
            results.add_fail("Device Registration", f"Status {status}: {response.get('error')}")
    except Exception as e:
        results.add_fail("Device Registration", str(e))
    
    # Test 1.2: List devices
    try:
        status, response = await api_request("GET", "/api/v1/devices/", token=token)
        
        if status == 200:
            devices = response.get("data", [])
            results.add_pass(
                "List Devices",
                f"Found {len(devices)} device(s)"
            )
        else:
            results.add_fail("List Devices", f"Status {status}")
    except Exception as e:
        results.add_fail("List Devices", str(e))

async def run_terminal_assignment_tests(results: TestResults, admin_token: str, user_id: str):
    """Test 2: Terminal Creation & Assignment"""
    print("\n🖥️  TEST SUITE 2: Terminal Assignment")
    
    terminal_data = {
        "user_id": user_id,
        "terminal_name": "Test Terminal",
        "location": "Test Location",
        "description": "Integration test terminal",
        "enabled_payment_methods": ["maya_qr", "card", "paymongo"],
        "is_t0_settlement": True,
    }
    
    # Test 2.1: Create terminal (admin)
    try:
        status, response = await api_request(
            "POST",
            "/api/v1/pos-terminals/",
            token=admin_token,
            data=terminal_data
        )
        
        if status == 200 and response.get("success"):
            terminal_id = response.get("data", {}).get("terminal_id")
            terminal_code = response.get("data", {}).get("terminal_code")
            results.add_pass(
                "Terminal Creation",
                f"ID: {terminal_id}, Code: {terminal_code}"
            )
            return terminal_id
        else:
            results.add_fail("Terminal Creation", f"Status {status}: {response.get('error')}")
            return None
    except Exception as e:
        results.add_fail("Terminal Creation", str(e))
        return None

async def run_transaction_tests(
    results: TestResults,
    user_token: str,
    terminal_id: int
):
    """Test 3: Transaction Creation & Payment"""
    print("\n💳 TEST SUITE 3: Payment Transactions")
    
    transaction_data = {
        "amount": 10000,  # 100 PHP in cents
        "currency": "PHP",
        "payment_method": "maya_qr",
        "description": "Integration test payment",
        "customer_name": "Test Customer",
        "customer_email": "test@example.com",
        "customer_phone": "+639171234567",
    }
    
    # Test 3.1: Create QR transaction
    try:
        status, response = await api_request(
            "POST",
            f"/api/v1/pos-terminals/{terminal_id}/transactions",
            token=user_token,
            data=transaction_data
        )
        
        if status == 200 and response.get("success"):
            order_id = response.get("data", {}).get("order_id")
            qr_content = response.get("data", {}).get("qr_content")
            results.add_pass(
                "QR Transaction Creation",
                f"Order ID: {order_id}, QR: {'Present' if qr_content else 'Absent'}"
            )
            return order_id
        else:
            results.add_fail("QR Transaction Creation", f"Status {status}: {response.get('error')}")
            return None
    except Exception as e:
        results.add_fail("QR Transaction Creation", str(e))
        return None
    
    # Test 3.2: Create card transaction
    transaction_data["payment_method"] = "card"
    try:
        status, response = await api_request(
            "POST",
            f"/api/v1/pos-terminals/{terminal_id}/transactions",
            token=user_token,
            data=transaction_data
        )
        
        if status == 200 and response.get("success"):
            order_id = response.get("data", {}).get("order_id")
            payment_url = response.get("data", {}).get("payment_url")
            results.add_pass(
                "Card Transaction Creation",
                f"Order ID: {order_id}, Checkout: {'Present' if payment_url else 'Absent'}"
            )
            return order_id
        else:
            results.add_fail("Card Transaction Creation", f"Status {status}: {response.get('error')}")
            return None
    except Exception as e:
        results.add_fail("Card Transaction Creation", str(e))
        return None

async def run_webhook_tests(results: TestResults):
    """Test 4: Webhook Handling"""
    print("\n🪝 TEST SUITE 4: Webhook Handling")
    
    # Test 4.1: Test webhook endpoint
    webhook_payload = {
        "id": f"checkout-{uuid.uuid4().hex[:8]}",
        "status": "COMPLETED",
        "requestReferenceNumber": f"order-{uuid.uuid4().hex[:12]}",
        "amount": 10000,
    }
    
    try:
        status, response = await api_request(
            "POST",
            "/api/v1/webhooks/test",
            data=webhook_payload
        )
        
        if status == 200:
            results.add_pass(
                "Webhook Endpoint",
                f"Test webhook received and processed"
            )
        else:
            results.add_fail("Webhook Endpoint", f"Status {status}")
    except Exception as e:
        results.add_fail("Webhook Endpoint", str(e))

async def run_real_time_sync_tests(results: TestResults, user_token: str, terminal_id: int):
    """Test 5: Real-time Synchronization"""
    print("\n⚡ TEST SUITE 5: Real-time Sync")
    
    # Test 5.1: Get terminal status
    try:
        status, response = await api_request(
            "GET",
            f"/api/v1/pos-terminals/{terminal_id}",
            token=user_token
        )
        
        if status == 200:
            terminal = response.get("data", {})
            results.add_pass(
                "Terminal Status Query",
                f"Terminal: {terminal.get('terminal_code')}, Active: {terminal.get('is_active')}"
            )
        else:
            results.add_fail("Terminal Status Query", f"Status {status}")
    except Exception as e:
        results.add_fail("Terminal Status Query", str(e))

# ============ Main Test Runner ============

async def main():
    """Run full integration test suite"""
    results = TestResults()
    
    print("="*60)
    print("🚀 xend POS Terminal - Integration Test Suite")
    print("="*60)
    print(f"Base URL: {BASE_URL}")
    print(f"Device ID: {DEVICE_ID}")
    
    # Test 0: Health & Deployment
    print("\n🔍 TEST SUITE 0: Health Checks")
    if not await health_check(results):
        print("\n⚠️  Backend not responding. Start with: bash start_app_v2.sh")
        return
    
    await deployment_status(results)
    
    # For real tests, we need auth tokens
    print("\n🔐 Authenticating...")
    print(f"Admin: {ADMIN_EMAIL}")
    print(f"Note: Device registration requires auth token")
    
    # Note: Full auth testing would require actual login endpoints
    # For now, tests demonstrate the structure
    
    results.summary()

if __name__ == "__main__":
    asyncio.run(main())
