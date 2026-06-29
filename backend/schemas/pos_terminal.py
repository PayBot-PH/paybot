from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime
from enum import Enum


class PaymentMethodEnum(str, Enum):
    MAYA = "maya"
    CARD = "card"
    GCASH = "gcash"
    GRABPAY = "grabpay"
    PAYMONGO = "paymongo"
    XENDIT = "xendit"


class TerminalStatusEnum(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ASSIGNED = "assigned"
    UNASSIGNED = "unassigned"


# ============ Terminal Schemas ============

class POSTerminalBase(BaseModel):
    terminal_name: str = Field(..., min_length=1, max_length=255)
    location: Optional[str] = None
    description: Optional[str] = None
    enabled_payment_methods: List[PaymentMethodEnum] = [PaymentMethodEnum.MAYA]
    daily_transaction_limit: Optional[int] = None
    max_transaction_amount: Optional[int] = None
    is_t0_settlement: bool = False


class POSTerminalCreate(POSTerminalBase):
    """Schema for creating a new terminal (admin only)."""
    user_id: str = Field(..., min_length=1)
    terminal_name: str = Field(..., min_length=1, max_length=255)


class POSTerminalUpdate(BaseModel):
    """Schema for updating a terminal."""
    user_id: Optional[str] = None
    terminal_name: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    enabled_payment_methods: Optional[List[PaymentMethodEnum]] = None
    daily_transaction_limit: Optional[int] = None
    max_transaction_amount: Optional[int] = None
    is_t0_settlement: bool = False
    is_active: Optional[bool] = None


class POSTerminalResponse(POSTerminalBase):
    """Schema for POS terminal response."""
    id: int
    terminal_code: str
    user_id: str
    device_id: Optional[str] = None
    merchant_id: Optional[str] = None
    status: TerminalStatusEnum
    is_active: bool
    assigned_by: Optional[str] = None
    assigned_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    deactivated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class POSTerminalListResponse(BaseModel):
    """Schema for list of terminals."""
    success: bool
    data: List[POSTerminalResponse] = []
    total: int = 0
    page: int = 1
    per_page: int = 10


# ============ Terminal Request Schemas ============

class POSTerminalRequestCreate(BaseModel):
    """Schema for creating a terminal request."""
    business_name: str = Field(..., min_length=1, max_length=255)
    business_type: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    required_payment_methods: List[PaymentMethodEnum] = [PaymentMethodEnum.MAYA]
    monthly_transaction_volume: Optional[int] = None
    average_transaction_amount: Optional[int] = None
    user_email: Optional[str] = None
    user_phone: Optional[str] = None


class POSTerminalRequestApprove(BaseModel):
    """Schema for approving a terminal request."""
    approved: bool = True
    rejection_reason: Optional[str] = None


class POSTerminalRequestResponse(BaseModel):
    """Schema for terminal request response."""
    id: int
    user_id: str
    user_name: str
    user_email: Optional[str]
    user_phone: Optional[str]
    business_name: str
    business_type: Optional[str]
    location: Optional[str]
    description: Optional[str]
    required_payment_methods: List[PaymentMethodEnum]
    monthly_transaction_volume: Optional[int]
    average_transaction_amount: Optional[int]
    status: str  # pending, approved, rejected
    rejection_reason: Optional[str] = None
    assigned_terminal_id: Optional[int] = None
    reviewed_by: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class POSTerminalRequestListResponse(BaseModel):
    """Schema for list of terminal requests."""
    success: bool
    data: List[POSTerminalRequestResponse] = []
    total: int = 0
    page: int = 1
    per_page: int = 10


# ============ Terminal Transaction Schemas ============

class POSTerminalTransactionCreate(BaseModel):
    """Schema for creating a terminal transaction."""
    description: str = Field(..., min_length=1, max_length=255)
    amount: int = Field(..., gt=0)  # Amount in PHP (cents)
    payment_method: PaymentMethodEnum
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None


class POSTerminalTransactionResponse(BaseModel):
    """Schema for terminal transaction response."""
    id: int
    terminal_id: int
    user_id: str
    order_id: str
    description: str
    amount: int
    currency: str
    payment_method: str
    maya_checkout_id: Optional[str] = None
    paymongo_checkout_id: Optional[str] = None
    xendit_invoice_id: Optional[str] = None
    payment_url: Optional[str] = None
    qr_content: Optional[str] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    status: str  # pending, completed, failed, cancelled
    failure_reason: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True


class POSTerminalTransactionListResponse(BaseModel):
    """Schema for list of terminal transactions."""
    success: bool
    data: List[POSTerminalTransactionResponse] = []
    total: int = 0
    page: int = 1
    per_page: int = 10


# ============ API Response Schemas ============

class APIResponse(BaseModel):
    """Generic API response."""
    success: bool
    message: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class TerminalAssignmentResponse(BaseModel):
    """Response after assigning a terminal."""
    success: bool
    message: str
    terminal: Optional[POSTerminalResponse] = None
    terminal_code: Optional[str] = None


class CreateCheckoutResponse(BaseModel):
    """Response when creating a checkout."""
    success: bool
    checkout_url: Optional[str] = None
    payment_url: Optional[str] = None
    qr_content: Optional[str] = None
    order_id: str
    message: Optional[str] = None


# ============ Device Schemas ============

class POSTerminalDeviceBase(BaseModel):
    device_id: str
    brand: Optional[str] = None
    model: Optional[str] = None
    os_version: Optional[str] = None
    app_version: Optional[str] = None
    metadata_json: Optional[Dict[str, Any]] = None


class POSTerminalDeviceCreate(POSTerminalDeviceBase):
    """Schema for registering a device."""
    pass


class POSTerminalDeviceResponse(POSTerminalDeviceBase):
    """Schema for device response."""
    id: int
    is_authorized: bool
    last_seen_at: datetime
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class POSTerminalDeviceListResponse(BaseModel):
    """Schema for list of devices."""
    success: bool
    data: List[POSTerminalDeviceResponse] = []
    total: int = 0
