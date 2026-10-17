from __future__ import annotations

import json
import pytest
import httpx

from app.config import get_settings
from app.services.gemini_service import GeminiService


def test_gemini_service_configured_and_properties():
    # In test environment, GEMINI_API_KEY is empty by default
    g = GeminiService()
    assert g.configured is False

    # Translation without configuration returns original text
    text = "Inspect your field today; irrigate if soil is dry."
    assert g.translate_advisory(text, "Marathi") == text
    assert g.translate_advisory(text, "English") == text
    assert g.translate_advisory("", "Marathi") == ""

    # Soil Card OCR without configuration returns empty dict
    assert g.extract_soil_card_ocr(b"") == {}
    assert g.extract_soil_card_ocr(b"dummy") == {}


def test_gemini_service_mocked_translation(monkeypatch):
    class MockResponse:
        status_code = 200

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": "आजच शेताची पाहणी करा."}]
                        }
                    }
                ]
            }

    class MockClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, json=None, timeout=None):
            return MockResponse()

    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    get_settings.cache_clear()

    service = GeminiService(client=MockClient())
    assert service.configured is True
    result = service.translate_advisory("Inspect your field today.", "Marathi")
    assert result == "आजच शेताची पाहणी करा."
    get_settings.cache_clear()


def test_gemini_service_mocked_vision_ocr(monkeypatch):
    sample_json = {
        "cardNumber": "MH-YVT-2026-9999",
        "sampleDate": "2026-10-18",
        "labName": "Yavatmal District Lab",
        "params": [
            {"param": "pH", "value": 7.2, "unit": "–", "rating": "ADEQUATE", "critical": False, "ocrConfidence": 0.98, "flagged": False}
        ],
        "recommendations": [
            {"product": "Urea", "productLabel": "Urea", "cardDose": 100.0, "cardDoseUnit": "kg/ha", "kgPerAcre": 40.5, "bagsPerAcre": 0.8, "bagSizeKg": 50.0, "timing": "Basal", "sourceText": "Urea @ 100 kg/ha"}
        ]
    }

    class MockResponse:
        status_code = 200

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [{"text": json.dumps(sample_json)}]
                        }
                    }
                ]
            }

    class MockClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def post(self, url, json=None, timeout=None):
            return MockResponse()

    monkeypatch.setenv("GEMINI_API_KEY", "test_key")
    get_settings.cache_clear()

    service = GeminiService(client=MockClient())
    assert service.configured is True
    extracted = service.extract_soil_card_ocr(b"fake_image_bytes", mime_type="image/jpeg")
    assert extracted["cardNumber"] == "MH-YVT-2026-9999"
    assert extracted["labName"] == "Yavatmal District Lab"
    assert extracted["params"][0]["param"] == "pH"
    assert extracted["params"][0]["value"] == 7.2
    assert extracted["recommendations"][0]["product"] == "Urea"
    get_settings.cache_clear()
