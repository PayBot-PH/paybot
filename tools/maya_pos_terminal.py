#!/usr/bin/env python3
"""Termux-friendly Maya Manager POS checkout helper.

Usage:
    export MAYA_SECRET_KEY="your-secret"
    export MAYA_MODE="sandbox"   # or live
    python3 tools/maya_pos_terminal.py --amount 250 --description "Coffee"

If you omit --amount, the script will prompt for the amount interactively.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from typing import Optional

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.services.maya_service import MayaService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create a Maya Manager checkout URL from your Android terminal."
    )
    parser.add_argument(
        "--amount",
        type=float,
        help="Amount in PHP. If omitted, the script will ask interactively.",
    )
    parser.add_argument(
        "--description",
        default="Maya POS sale",
        help="Short description shown on the Maya checkout.",
    )
    parser.add_argument(
        "--customer-name",
        default="",
        help="Optional customer name for the checkout.",
    )
    parser.add_argument(
        "--customer-email",
        default="",
        help="Optional customer email for the checkout.",
    )
    parser.add_argument(
        "--mobile-number",
        default="",
        help="Optional mobile number for the checkout.",
    )
    parser.add_argument(
        "--external-id",
        default="",
        help="Optional external reference ID. Auto-generated if omitted.",
    )
    parser.add_argument(
        "--success-url",
        default="",
        help="Optional success redirect URL. Defaults to backend URL /payment/success.",
    )
    parser.add_argument(
        "--failure-url",
        default="",
        help="Optional failure redirect URL. Defaults to backend URL /payment/failed.",
    )
    parser.add_argument(
        "--cancel-url",
        default="",
        help="Optional cancel redirect URL. Defaults to backend URL /payment/cancelled.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the server response as JSON.",
    )
    return parser


def get_input(prompt: str, default: str = "") -> str:
    try:
        value = input(f"{prompt}: ").strip()
    except EOFError:
        value = ""
    return value or default


def validate_amount(amount: Optional[float]) -> float:
    if amount is None:
        raw = get_input("Enter amount in PHP")
        if not raw:
            raise ValueError("Amount is required")
        try:
            amount = float(raw)
        except ValueError as exc:
            raise ValueError("Amount must be a valid number") from exc

    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    return amount


async def run_cli(args: argparse.Namespace) -> int:
    if not os.environ.get("MAYA_SECRET_KEY"):
        print("❌ Missing MAYA_SECRET_KEY.")
        print("Set it in your environment or .env file before running this script.")
        return 1

    amount = validate_amount(args.amount)
    description = args.description.strip() or "Maya POS sale"
    customer_name = args.customer_name.strip()
    customer_email = args.customer_email.strip()
    mobile_number = args.mobile_number.strip()
    external_id = args.external_id.strip()

    service = MayaService()
    result = await service.create_checkout(
        amount=amount,
        description=description,
        customer_name=customer_name,
        customer_email=customer_email,
        mobile_number=mobile_number,
        external_id=external_id,
        success_redirect_url=args.success_url,
        failure_redirect_url=args.failure_url,
        cancel_redirect_url=args.cancel_url,
    )

    if not result.get("success"):
        print("❌ Maya checkout failed.")
        print(result.get("error", "Unknown error"))
        return 1

    if args.json:
        import json

        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0

    checkout_id = result.get("checkout_id") or ""
    checkout_url = result.get("checkout_url") or ""
    external_id = result.get("external_id") or ""

    print("✅ Maya POS checkout created")
    print(f"Mode: {os.environ.get('MAYA_MODE', 'sandbox')}")
    print(f"Checkout ID: {checkout_id or 'n/a'}")
    print(f"External ID: {external_id or 'n/a'}")
    print("\nOpen this URL in your browser or copy it into your Android browser:")
    print(checkout_url)
    print("\nAfter payment, Maya will redirect you back to your configured callback URL.")
    return 0


def main() -> int:
    args = build_parser().parse_args()
    try:
        return asyncio.run(run_cli(args))
    except ValueError as exc:
        print(f"❌ {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
