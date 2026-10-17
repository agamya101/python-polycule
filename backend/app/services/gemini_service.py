"""Google Gemini AI Service for KrishiMitra.

Provides:
1. High-accuracy multilingual translation (Hindi, Marathi, Punjabi, Gujarati, etc.) for farmer advisories.
2. Soil Health Card multimodal Vision OCR extraction (12 macro & micro nutrients, dosages, confidence ratings).
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-flash-latest"
GEMINI_ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"


class GeminiService:
    def __init__(self, client: Optional[httpx.Client] = None) -> None:
        self.settings = get_settings()
        self._client = client

    @property
    def configured(self) -> bool:
        return self.settings.gemini_configured

    def _get_client(self) -> httpx.Client:
        return self._client or httpx.Client(timeout=self.settings.http_timeout_seconds)

    def translate_advisory(self, text_en: str, target_lang: str) -> str:
        """Translate advisory text into regional Indian languages using Gemini Flash.
        
        Falls back to original text or caller's template on error or when unconfigured.
        """
        if not self.configured or not text_en or target_lang.lower() in ("english", "en"):
            return text_en

        prompt = (
            f"You are an agricultural translation engine for KrishiMitra, an Indian precision agriculture platform. "
            f"Translate the following farmer advisory / SMS message accurately into {target_lang}.\n"
            f"STRICT RULES:\n"
            f"1. Preserve all numerical figures, phone numbers, units (kg/ha, acre, ppm, dS/m), dates, and chemical names (Urea, DAP, Zinc Sulphate) accurately.\n"
            f"2. Return ONLY the direct translation in {target_lang}. Do NOT include explanations, transliterations, parenthetical notes, or quotation marks.\n\n"
            f"Input text:\n{text_en}"
        )

        payload = {
            "contents": [
                {
                    "parts": [{"text": prompt}]
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 300,
            },
        }

        url = f"{GEMINI_ENDPOINT}?key={self.settings.gemini_api_key}"

        try:
            with self._get_client() as client:
                resp = client.post(url, json=payload)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts and "text" in parts[0]:
                            translated = parts[0]["text"].strip()
                            if translated:
                                return translated
                else:
                    logger.warning("Gemini translation API returned HTTP %s: %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.warning("Gemini translation request failed: %s", exc)

        return text_en

    def extract_soil_card_ocr(
        self,
        image_bytes: bytes,
        mime_type: str = "image/jpeg",
        default_card_number: Optional[str] = None,
    ) -> dict[str, Any]:
        """Extract 12 soil parameters and fertilizer dosages from a Soil Health Card image using Gemini Vision."""
        if not self.configured or not image_bytes:
            return {}

        b64_image = base64.b64encode(image_bytes).decode("utf-8")

        prompt = (
            "You are a computer vision soil analyst for the KrishiMitra precision agriculture platform. "
            "Inspect this Government of India Soil Health Card (or lab soil test report). "
            "Extract all available soil parameters and fertilizer recommendations.\n\n"
            "Respond ONLY with a valid JSON object matching this exact schema (no markdown fences, no explanatory text):\n"
            "{\n"
            '  "cardNumber": "string or null",\n'
            '  "sampleDate": "YYYY-MM-DD or null",\n'
            '  "labName": "string or null",\n'
            '  "params": [\n'
            '    {"param": "pH", "value": 7.4, "unit": "–", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "EC", "value": 0.35, "unit": "dS/m", "rating": "NORMAL", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "OC", "value": 0.42, "unit": "%", "rating": "LOW", "critical": true, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "N", "value": 180.0, "unit": "kg/ha", "rating": "DEFICIENT", "critical": true, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "P", "value": 12.0, "unit": "kg/ha", "rating": "DEFICIENT", "critical": true, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "K", "value": 240.0, "unit": "kg/ha", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "S", "value": 8.5, "unit": "ppm", "rating": "DEFICIENT", "critical": true, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "Zn", "value": 0.55, "unit": "ppm", "rating": "DEFICIENT", "critical": true, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "Fe", "value": 6.8, "unit": "ppm", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "Cu", "value": 0.8, "unit": "ppm", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "Mn", "value": 4.2, "unit": "ppm", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false},\n'
            '    {"param": "B", "value": 0.65, "unit": "ppm", "rating": "ADEQUATE", "critical": false, "ocrConfidence": 0.95, "flagged": false}\n'
            "  ],\n"
            '  "recommendations": [\n'
            '    {"product": "Urea", "productLabel": "Urea", "cardDose": 110.0, "cardDoseUnit": "kg/ha", "kgPerAcre": 44.5, "bagsPerAcre": 1.0, "bagSizeKg": 45.0, "timing": "Split application", "sourceText": "Urea @ 110 kg/ha"}\n'
            "  ]\n"
            "}"
        )

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt},
                        {
                            "inlineData": {
                                "mimeType": mime_type,
                                "data": b64_image,
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
            },
        }

        url = f"{GEMINI_ENDPOINT}?key={self.settings.gemini_api_key}"

        try:
            with self._get_client() as client:
                resp = client.post(url, json=payload)
                if resp.status_code == 200:
                    body = resp.json()
                    candidates = body.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        clean_json = raw_text.strip()
                        if clean_json.startswith("```json"):
                            clean_json = clean_json.removeprefix("```json").removesuffix("```").strip()
                        elif clean_json.startswith("```"):
                            clean_json = clean_json.removeprefix("```").removesuffix("```").strip()
                        return json.loads(clean_json)
                else:
                    logger.warning("Gemini Vision OCR returned HTTP %s: %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.warning("Gemini Vision OCR extraction failed: %s", exc)

        return {}
