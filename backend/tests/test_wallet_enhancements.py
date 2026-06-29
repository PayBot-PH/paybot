"""
Test suite for wallet and SMS enhancements
Tests cover: SMS notifications, admin wallet operations, payment processing improvements
"""
import pytest
from datetime import datetime, timezone


class TestSMSNotifications:
    """Test SMS notification functionality"""

    @pytest.mark.asyncio
    async def test_sms_service_initialization(self):
        """Test that SMS service initializes correctly"""
        from services.notification_service import SMSService
        from core.config import settings
        
        assert SMSService is not None
        assert settings.sms_provider in ["semaphore", "twilio"]
        assert settings.sms_enable_notifications is not None

    @pytest.mark.asyncio
    async def test_sms_methods_exist(self):
        """Test that all required SMS methods exist"""
        from services.notification_service import SMSService
        
        methods = [
            "send_sms",
            "notify_bank_of_failure",
            "notify_user_of_failed_transfer",
            "notify_user_of_successful_transfer",
            "notify_user_of_disbursement",
            "notify_user_of_topup",
        ]
        
        for method in methods:
            assert hasattr(SMSService, method), f"Missing SMS method: {method}"


class TestWalletModels:
    """Test wallet model enhancements"""

    def test_wallet_admin_columns(self):
        """Test that wallet model has admin operation columns"""
        from models.wallets import Wallets
        
        columns = {col.name for col in Wallets.__table__.columns}
        
        required_cols = [
            "is_frozen",
            "freeze_reason",
            "total_credits",
            "total_debits",
            "transaction_count",
            "last_activity",
        ]
        
        for col in required_cols:
            assert col in columns, f"Missing column: {col}"

    def test_wallet_indices(self):
        """Test that wallet has proper indices for admin operations"""
        from models.wallets import Wallets
        
        indices = {idx.name for idx in Wallets.__table__.indexes}
        
        required_indices = ["idx_wallets_user_currency", "idx_wallets_status"]
        
        for idx in required_indices:
            assert idx in indices, f"Missing index: {idx}"


class TestDisbursementModels:
    """Test disbursement model enhancements"""

    def test_disbursement_settlement_columns(self):
        """Test that disbursement model has settlement columns"""
        from models.disbursements import Disbursements
        
        columns = {col.name for col in Disbursements.__table__.columns}
        
        required_cols = [
            "settlement_batch_id",
            "settlement_priority",
            "processing_fee",
            "net_amount",
            "scheduled_at",
            "processed_at",
            "completed_at",
            "failure_reason",
            "retry_count",
        ]
        
        for col in required_cols:
            assert col in columns, f"Missing column: {col}"

    def test_disbursement_indices(self):
        """Test that disbursement has proper indices for settlement"""
        from models.disbursements import Disbursements
        
        indices = {idx.name for idx in Disbursements.__table__.indexes}
        
        required_indices = ["idx_disbursements_settlement_batch"]
        
        for idx in required_indices:
            assert idx in indices, f"Missing index: {idx}"


class TestAdminWalletRouter:
    """Test admin wallet router"""

    def test_admin_router_exists(self):
        """Test that admin wallets router is properly defined"""
        from routers.admin_wallets import router
        
        assert router is not None
        assert len(router.routes) > 0

    def test_admin_router_endpoints(self):
        """Test that admin wallets router has expected endpoints"""
        from routers.admin_wallets import router
        
        route_paths = {route.path for route in router.routes}
        
        required_endpoints = [
            "/user/{user_id}/analytics",
            "/freeze",
            "/unfreeze",
            "/reconcile",
            "/batch-credit",
            "/list-frozen",
        ]
        
        for endpoint in required_endpoints:
            # Check if any route matches (some may have prefix applied)
            found = any(endpoint in path for path in route_paths)
            assert found, f"Missing endpoint: {endpoint}"


class TestConfigSMS:
    """Test SMS configuration"""

    def test_sms_config_fields(self):
        """Test that SMS configuration fields exist"""
        from core.config import settings
        
        config_fields = [
            "sms_provider",
            "semaphore_api_key",
            "semaphore_api_url",
            "twilio_account_sid",
            "twilio_auth_token",
            "twilio_phone_number",
            "sms_max_retries",
            "sms_retry_delay_ms",
            "sms_enable_notifications",
        ]
        
        for field in config_fields:
            assert hasattr(settings, field), f"Missing config field: {field}"

    def test_sms_defaults(self):
        """Test SMS configuration defaults"""
        from core.config import settings
        
        assert settings.sms_provider in ["semaphore", "twilio"]
        assert settings.semaphore_api_url == "https://api.semaphore.co/api/v4"
        assert settings.sms_max_retries >= 1
        assert isinstance(settings.sms_enable_notifications, bool)


class TestDisbursementsService:
    """Test disbursements service enhancements"""

    @pytest.mark.asyncio
    async def test_disbursements_service_methods(self):
        """Test that disbursements service has new methods"""
        from services.disbursements import DisbursementsService
        from sqlalchemy.ext.asyncio import AsyncSession
        from unittest.mock import AsyncMock
        
        # Create mock DB session
        mock_db = AsyncMock(spec=AsyncSession)
        service = DisbursementsService(mock_db)
        
        required_methods = [
            "calculate_fee",
            "create_settlement_batch",
            "mark_settlement_completed",
            "get_settlement_stats",
        ]
        
        for method in required_methods:
            assert hasattr(service, method), f"Missing method: {method}"


class TestWalletsService:
    """Test wallets service enhancements"""

    @pytest.mark.asyncio
    async def test_wallets_service_methods(self):
        """Test that wallets service has new admin methods"""
        from services.wallets import WalletsService
        from sqlalchemy.ext.asyncio import AsyncSession
        from unittest.mock import AsyncMock
        
        # Create mock DB session
        mock_db = AsyncMock(spec=AsyncSession)
        service = WalletsService(mock_db)
        
        required_methods = [
            "freeze_wallet",
            "unfreeze_wallet",
            "get_wallet_analytics",
            "reconcile_wallet",
            "batch_credit_wallets",
            "update_wallet_analytics",
        ]
        
        for method in required_methods:
            assert hasattr(service, method), f"Missing method: {method}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
