import logging
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, Literal, Optional, Tuple

import stripe
from core.config import settings
from pydantic import BaseModel, Field, field_validator, model_validator

logger = logging.getLogger(__name__)


class CheckoutSessionRequest(BaseModel):
    """Request model for creating a checkout session."""

    amount: Optional[Decimal] = Field(None, description="The amount to charge in the specified currency (per unit)")
    currency: str = Field("usd", description="The currency code")
    stripe_price_id: Optional[str] = Field(
        None, description="The Stripe Price ID to use for the payment or subscription"
    )
    quantity: int = Field(1, description="The quantity of items to purchase")
    mode: Literal["payment", "subscription"] = Field("payment", description="Checkout mode")
    ui_mode: Literal["hosted", "embedded"] = Field("hosted", description="Checkout UI mode")
    return_url: Optional[str] = Field(
        None, description="For embedded Checkout: URL to return to; must include {CHECKOUT_SESSION_ID}"
    )
    success_url: Optional[str] = Field(
        None, description="For hosted Checkout: URL to redirect after success; must include {CHECKOUT_SESSION_ID}"
    )
    cancel_url: Optional[str] = Field(None, description="For hosted Checkout: URL to redirect if payment is cancelled")
    metadata: Optional[Dict[str, str]] = Field(None, description="Additional metadata to store with the session")
    idempotency_key: Optional[str] = Field(None, description="Idempotency key to avoid duplicate sessions")

    @field_validator("amount")
    @classmethod
    def validate_amount(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Amount must be greater than 0")
        return v

    @field_validator("quantity")
    @classmethod
    def validate_quantity(cls, v):
        if v < 1:
            raise ValueError("Quantity must be greater than 0")
        return v

    @model_validator(mode="after")
    def validate_model(self):
        # Mode/payment field rules
        if self.mode == "subscription":
            if not self.stripe_price_id:
                raise ValueError("stripe_price_id is required for subscription mode")
            if self.amount is not None:
                raise ValueError("amount must not be provided for subscription mode")
        else:  # payment
            if self.amount is None and not self.stripe_price_id:
                raise ValueError("Either amount or stripe_price_id must be provided for payment mode")
            if self.amount is not None and self.stripe_price_id is not None:
                raise ValueError("Cannot provide both amount and stripe_price_id for payment mode")

        # UI mode rules
        if self.ui_mode == "embedded":
            if not self.return_url:
                raise ValueError("return_url is required when ui_mode='embedded'")
            if "{CHECKOUT_SESSION_ID}" not in self.return_url:
                raise ValueError("return_url must include {CHECKOUT_SESSION_ID}")
        else:  # hosted
            if not self.success_url or not self.cancel_url:
                raise ValueError("success_url and cancel_url are required when ui_mode='hosted'")
            if "{CHECKOUT_SESSION_ID}" not in (self.success_url or ""):
                raise ValueError("success_url must include {CHECKOUT_SESSION_ID}")

        return self


class CheckoutSessionResponse(BaseModel):
    """Response model for checkout session creation."""

    url: Optional[str] = Field(None, description="The Checkout Session URL (hosted mode)")
    client_secret: Optional[str] = Field(None, description="Client secret for embedded Checkout (embedded mode)")
    session_id: str = Field(..., description="The ID of the created session")


class CheckoutStatusResponse(BaseModel):
    """Response model for checkout session status."""

    status: str = Field(..., description="The status of the checkout session")
    payment_status: str = Field(..., description="The payment status")
    amount_total: int = Field(..., description="The total amount in cents")
    currency: str = Field(..., description="The currency code")
    metadata: Dict[str, str] = Field(..., description="The metadata of the checkout session")


def _classify_stripe_error(error: stripe.error.StripeError) -> Tuple[str, bool, bool, Optional[str]]:
    """Classify Stripe error and return error type, retryable, fixable, and fix suggestion.

    Returns:
        Tuple of (error_type, is_retryable, fixable, fix_suggestion)
    """
    error_type = "api_error"
    is_retryable = False
    fixable = False
    fix_suggestion = None

    if isinstance(error, stripe.error.AuthenticationError):
        error_type = "authentication"
        fixable = True
        fix_suggestion = "Check and update STRIPE_SECRET_KEY in environment variables or settings"
    elif isinstance(error, stripe.error.APIConnectionError):
        error_type = "network"
        is_retryable = True
        fixable = False
        fix_suggestion = "Check network connectivity and Stripe API status"
    elif isinstance(error, stripe.error.APIError):
        error_type = "api_error"
        # 5xx errors are retryable
        if hasattr(error, "http_status") and error.http_status and 500 <= error.http_status < 600:
            is_retryable = True
        fixable = False
        fix_suggestion = "Check Stripe API status and retry if it's a temporary server error"
    elif isinstance(error, stripe.error.InvalidRequestError):
        error_type = "validation"
        fixable = True
        fix_suggestion = (
            "Review request parameters and fix invalid values (e.g., invalid price_id, currency, or amount)"
        )
    elif isinstance(error, stripe.error.CardError):
        error_type = "card_error"
        fixable = False
        fix_suggestion = "User needs to provide a valid payment method"
    elif isinstance(error, stripe.error.RateLimitError):
        error_type = "rate_limit"
        is_retryable = True
        fixable = False
        fix_suggestion = "Wait and retry after rate limit resets"
    elif isinstance(error, stripe.error.IdempotencyError):
        error_type = "idempotency"
        fixable = True
        fix_suggestion = "Use a different idempotency_key or wait for the previous request to complete"

    return error_type, is_retryable, fixable, fix_suggestion


async def initialize_stripe():
    """Initialize Stripe configuration

    Raises:
        CheckoutError: If Stripe initialization fails with a fixable error
    """

    stripe_key = settings.stripe_secret_key
    if not stripe_key:
        logger.warning("Error: Stripe key is empty or None")
        return

    try:
        stripe.api_key = stripe_key
        # Test Stripe connection
        await stripe.Account.retrieve_async()
        logger.info("Stripe API key set successfully")

    except stripe.error.AuthenticationError as e:
        stripe.api_key = ""
        error_type, is_retryable, fixable, fix_suggestion = _classify_stripe_error(e)
        raise CheckoutError(
            f"Stripe authentication failed: {str(e)}",
            error_type=error_type,
            is_retryable=is_retryable,
            fixable=fixable,
            fix_suggestion=fix_suggestion,
            original_error=e,
        )
    except stripe.error.APIConnectionError as e:
        error_type, is_retryable, fixable, fix_suggestion = _classify_stripe_error(e)
        raise CheckoutError(
            f"Stripe API connection failed: {str(e)}",
            error_type=error_type,
            is_retryable=is_retryable,
            fixable=fixable,
            fix_suggestion=fix_suggestion,
            original_error=e,
        )
    except stripe.error.StripeError as e:
        error_type, is_retryable, fixable, fix_suggestion = _classify_stripe_error(e)
        raise CheckoutError(
            f"Stripe error during initialization: {str(e)}",
            error_type=error_type,
            is_retryable=is_retryable,
            fixable=fixable,
            fix_suggestion=fix_suggestion,
            original_error=e,
        )
    except Exception as e:
        raise CheckoutError(
            f"Unexpected error during Stripe initialization: {str(e)}",
            error_type="unexpected",
            is_retryable=False,
            fixable=False,
            fix_suggestion="Check application logs and system configuration",
            original_error=e,
        )


class PaymentService:
    """Payment service class, handles Stripe integration"""

    async def create_checkout_session(self, request: CheckoutSessionRequest) -> CheckoutSessionResponse:
        """
        Creates a Stripe checkout session for a payment.

        Args:
            request (CheckoutSessionRequest): The request model containing payment details.

        Returns:
            CheckoutSessionResponse: A response model containing the checkout session URL and ID.

        Raises:
            CheckoutError: If there"s an error creating the checkout session.
        """
        try:
            logger.info(f"create checkout session with request: {request}")

            # Prepare line items based on payment method/mode
            if request.mode == "subscription":
                line_items = [
                    {
                        "price": request.stripe_price_id,
                        "quantity": request.quantity,
                    }
                ]
            elif request.amount is not None:
                # Convert amount to cents/smallest currency unit with safe rounding
                amount_in_cents = int((request.amount * Decimal("100")).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
                line_items = [
                    {
                        "price_data": {
                            "currency": request.currency,
                            "product_data": {
                                "name": "Payment",
                            },
                            "unit_amount": amount_in_cents,
                        },
                        "quantity": request.quantity,
                    }
                ]
            else:
                line_items = [
                    {
                        "price": request.stripe_price_id,
                        "quantity": request.quantity,
                    }
                ]

            # Ensure stripe
            await self._auto_reload_stripe_config()

            # Create the checkout session
            logger.info("Calling Stripe API to create checkout session...")

            params = {
                "line_items": line_items,
                "mode": request.mode,
                "metadata": request.metadata or {},
            }

            if request.ui_mode == "embedded":
                params["ui_mode"] = "embedded"
                params["return_url"] = request.return_url
            else:
                params["success_url"] = request.success_url
                params["cancel_url"] = request.cancel_url

            creation_kwargs = {}
            if request.idempotency_key:
                creation_kwargs["idempotency_key"] = request.idempotency_key

            session = await stripe.checkout.Session.create_async(
                **params,
                **creation_kwargs,
            )

            return CheckoutSessionResponse(
                url=getattr(session, "url", None),
                client_secret=getattr(session, "client_secret", None),
                session_id=session.id,
            )

        except stripe.error.StripeError as e:
            error_type, is_retryable, fixable, fix_suggestion = _classify_stripe_error(e)
            error_msg = f"Failed to create checkout session: {str(e)}"
            if hasattr(e, "param"):
                error_msg += f" (parameter: {e.param})"
            if hasattr(e, "code"):
                error_msg += f" (code: {e.code})"
            raise CheckoutError(
                error_msg,
                error_type=error_type,
                is_retryable=is_retryable,
                fixable=fixable,
                fix_suggestion=fix_suggestion,
                original_error=e,
            )
        except CheckoutError:
            # Re-raise CheckoutError as-is (from _auto_reload_stripe_config)
            raise
        except Exception as e:
            raise CheckoutError(
                f"Unexpected error creating checkout session: {str(e)}",
                error_type="unexpected",
                is_retryable=False,
                fixable=False,
                fix_suggestion="Check application logs and request parameters",
                original_error=e,
            )

    async def get_checkout_status(self, checkout_session_id: str) -> CheckoutStatusResponse:
        """
        Retrieves the status of a Stripe checkout session.

        Args:
            checkout_session_id (str): The ID of the checkout session to check.

        Returns:
            CheckoutStatusResponse: A response model containing the session status information.

        Raises:
            CheckoutError: If there"s an error retrieving the session status.
        """
        try:
            # Ensure stripe config is loaded
            await self._auto_reload_stripe_config()

            session = await stripe.checkout.Session.retrieve_async(checkout_session_id)

            return CheckoutStatusResponse(
                status=session.status,
                payment_status=session.payment_status,
                amount_total=session.amount_total,
                currency=session.currency,
                metadata=session.metadata,
            )

        except stripe.error.StripeError as e:
            error_type, is_retryable, fixable, fix_suggestion = _classify_stripe_error(e)
            error_msg = f"Failed to retrieve session status for session_id={checkout_session_id}: {str(e)}"
            if hasattr(e, "param"):
                error_msg += f" (parameter: {e.param})"
            if hasattr(e, "code"):
                error_msg += f" (code: {e.code})"
            raise CheckoutError(
                error_msg,
                error_type=error_type,
                is_retryable=is_retryable,
                fixable=fixable,
                fix_suggestion=fix_suggestion,
                original_error=e,
            )
        except CheckoutError:
            # Re-raise CheckoutError as-is (from _auto_reload_stripe_config)
            raise
        except Exception as e:
            raise CheckoutError(
                f"Unexpected error retrieving session status for session_id={checkout_session_id}: {str(e)}",
                error_type="unexpected",
                is_retryable=False,
                fixable=False,
                fix_suggestion="Check application logs and verify session_id format",
                original_error=e,
            )

    @staticmethod
    async def _auto_reload_stripe_config():
        """Auto reload Stripe configuration"""
        if stripe.api_key:
            return

        # Settings are automatically read from environment variables
        await initialize_stripe()


class CheckoutError(Exception):
    """Exception raised for errors in the Stripe checkout process.

    Attributes:
        error_type: Type of error (e.g., 'authentication', 'validation', 'api_error', 'network')
        is_retryable: Whether the error is retryable
        fixable: Whether the error can be fixed by the agent
        fix_suggestion: Suggested fix for the error
        original_error: The original exception that caused this error
    """

    def __init__(
        self,
        message: str,
        error_type: str = "unknown",
        is_retryable: bool = False,
        fixable: bool = False,
        fix_suggestion: Optional[str] = None,
        original_error: Optional[Exception] = None,
    ):
        super().__init__(message)
        self.error_type = error_type
        self.is_retryable = is_retryable
        self.fixable = fixable
        self.fix_suggestion = fix_suggestion
        self.original_error = original_error

    def __str__(self):
        base_msg = super().__str__()
        details = [f"[Type: {self.error_type}]"]
        if self.is_retryable:
            details.append("[Retryable: Yes]")
        if self.fixable:
            details.append("[Fixable: Yes]")
            if self.fix_suggestion:
                details.append(f"[Fix: {self.fix_suggestion}]")
        else:
            details.append("[Fixable: No]")
        return f"{base_msg} {' '.join(details)}"
