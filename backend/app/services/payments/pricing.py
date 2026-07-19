"""Pricing and commission calculations for pay-per-session human therapy."""

from __future__ import annotations

from typing import Any

from supabase import Client


def get_pricing_config(sb: Client) -> dict[str, Any]:
    """Fetch pricing config from app_config table."""
    res = sb.table("app_config").select("value").eq("key", "pricing").limit(1).execute()
    if res.data:
        return res.data[0]["value"]
    # Fallback default values matching the migration seed
    return {
        "currency": "INR",
        "commission_percent": 25,
        "gateway_fee_borne_by": "platform",
        "refund_policy": {"enabled": False},
        "payouts": {"mode": "manual"},
    }


def calculate_split(
    price_paise: int,
    commission_percent: int,
    gateway_fee_borne_by: str,
    gateway_fee_paise: int | None = None,
) -> tuple[int, int]:
    """Calculate platform commission and therapist gross.

    Formula:
      commission = round(price * commission_percent / 100)
      therapist_gross = price - commission

    If gateway fee is borne by the therapist, the therapist's gross is reduced by the fee.
    If borne by the platform (default), the therapist's gross remains clean.
    """
    commission = round(price_paise * commission_percent / 100)
    therapist_gross = price_paise - commission

    if gateway_fee_borne_by == "therapist" and gateway_fee_paise is not None:
        therapist_gross -= gateway_fee_paise

    return commission, therapist_gross
