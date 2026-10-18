"""TextBee SMS gateway client for KrishiMitra.

Sends approved advisories through the TextBee Android gateway
(https://api.textbee.dev/api/v1) and reads back per-recipient delivery status.
Only numbers on the SMS_ALLOWED_NUMBERS list are ever sent to.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


class TextBeeError(RuntimeError):
    pass


def normalize_number(phone: str) -> str:
    return re.sub(r"[^\d+]", "", phone or "")


def mask_number(phone: str) -> str:
    n = normalize_number(phone)
    if n.startswith("+91") and len(n) == 13:
        return f"+91 {n[3:5]}xxxx{n[-4:]}"
    return f"{n[:-4]}xxxx" if len(n) > 4 else n


class TextBeeService:
    def __init__(self, client: Optional[httpx.Client] = None) -> None:
        self.settings = get_settings()
        self._client = client

    @property
    def configured(self) -> bool:
        return self.settings.textbee_configured

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        if not self.configured:
            raise TextBeeError("TextBee is not configured (TEXTBEE_API_KEY missing).")
        url = f"{self.settings.textbee_base_url.rstrip('/')}{path}"
        headers = {"x-api-key": self.settings.textbee_api_key or ""}
        try:
            if self._client:
                resp = self._client.request(method, url, headers=headers, **kwargs)
            else:
                with httpx.Client(timeout=self.settings.http_timeout_seconds) as client:
                    resp = client.request(method, url, headers=headers, **kwargs)
        except httpx.HTTPError as exc:
            raise TextBeeError(f"TextBee request failed: {exc}") from exc
        if resp.status_code >= 400:
            raise TextBeeError(f"TextBee HTTP {resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except ValueError:
            return {}

    def filter_allowed(self, recipients: list[str]) -> tuple[list[str], list[str]]:
        """Split recipients into (allowed, blocked) against SMS_ALLOWED_NUMBERS."""
        allowed_list = set(self.settings.sms_allowed_number_list)
        allowed, blocked = [], []
        for r in dict.fromkeys(normalize_number(x) for x in recipients if x):
            (allowed if r in allowed_list else blocked).append(r)
        return allowed, blocked

    def send_sms(self, recipients: list[str], message: str) -> dict[str, Any]:
        """Send one message to the recipients. Returns {"batchId", "raw"}."""
        payload: dict[str, Any] = {"recipients": recipients, "message": message}
        if self.settings.textbee_device_id:
            payload["deviceId"] = self.settings.textbee_device_id
        raw = self._request("POST", "/gateway/send-sms", json=payload)
        data = raw.get("data") if isinstance(raw.get("data"), dict) else raw
        batch_id = data.get("smsBatchId") or data.get("_id") or data.get("id")
        return {"batchId": batch_id, "raw": raw}

    def batch_status(self, batch_id: str) -> dict[str, int]:
        """Count per-recipient statuses for a send batch."""
        raw = self._request("GET", "/gateway/messages", params={"smsBatchId": batch_id, "limit": 100})
        items = raw.get("data") if isinstance(raw.get("data"), list) else raw.get("data", {}).get("messages", [])
        counts = {"pending": 0, "sent": 0, "delivered": 0, "failed": 0}
        for item in items or []:
            status = str(item.get("status", "pending")).lower()
            if status in ("delivered",):
                counts["delivered"] += 1
            elif status in ("failed", "error", "rejected"):
                counts["failed"] += 1
            elif status in ("sent",):
                counts["sent"] += 1
            else:
                counts["pending"] += 1
        counts["total"] = len(items or [])
        return counts
