"""Unit tests for services/ai_router.py — multi-provider fallback chain."""

import asyncio
from unittest.mock import MagicMock, patch

import pytest

SAMPLE_PROMPT = "Analyze this portfolio: AAPL 10 shares, MSFT 5 shares."
EXPECTED_RESPONSE = {"dna_score": 74, "investor_type": "Balanced Growth"}


class TestAIRouter:
    @patch("services.ai_router.Anthropic")
    def test_uses_claude_first(self, mock_anthropic):
        client = MagicMock()
        client.messages.create.return_value = MagicMock(
            content=[MagicMock(text='{"dna_score": 74, "investor_type": "Balanced Growth"}')]
        )
        mock_anthropic.return_value = client

        from services.ai_router import get_ai_analysis

        result = asyncio.run(get_ai_analysis(SAMPLE_PROMPT))
        assert result["dna_score"] == 74
        client.messages.create.assert_called_once()

    @patch("services.ai_router.call_gemini")
    @patch("services.ai_router.OpenAI")
    @patch("services.ai_router.Anthropic")
    def test_falls_back_to_gemini(self, mock_anthropic, mock_openai, mock_call_gemini):
        claude_client = MagicMock()
        claude_client.messages.create.side_effect = Exception("API error")
        mock_anthropic.return_value = claude_client

        oai_client = MagicMock()
        oai_client.chat.completions.create.side_effect = Exception("OpenAI error")
        mock_openai.return_value = oai_client

        mock_call_gemini.return_value = EXPECTED_RESPONSE

        from services.ai_router import get_ai_analysis

        result = asyncio.run(get_ai_analysis(SAMPLE_PROMPT))
        assert result == EXPECTED_RESPONSE

    @patch("services.ai_router.Groq")
    @patch("services.ai_router.call_gemini", side_effect=Exception("Gemini down"))
    @patch("services.ai_router.OpenAI")
    @patch("services.ai_router.Anthropic")
    def test_raises_when_all_providers_fail(
        self, mock_anthropic, mock_openai, mock_call_gemini, mock_groq
    ):
        claude_client = MagicMock()
        claude_client.messages.create.side_effect = Exception("Claude down")
        mock_anthropic.return_value = claude_client

        oai_client = MagicMock()
        oai_client.chat.completions.create.side_effect = Exception("OpenAI down")
        mock_openai.return_value = oai_client

        groq_client = MagicMock()
        groq_client.chat.completions.create.side_effect = Exception("Groq down")
        mock_groq.return_value = groq_client

        from services.ai_router import get_ai_analysis

        with pytest.raises(Exception):
            asyncio.run(get_ai_analysis(SAMPLE_PROMPT))

    def test_json_only_response_parsing(self):
        """AI response with markdown fences should still parse correctly."""
        from services.ai_router import _parse_ai_response

        raw = '```json\n{"dna_score": 74}\n```'
        result = _parse_ai_response(raw)
        assert result["dna_score"] == 74

    def test_plain_json_response_parsing(self):
        from services.ai_router import _parse_ai_response

        raw = '{"dna_score": 74, "investor_type": "Balanced Growth"}'
        result = _parse_ai_response(raw)
        assert result["dna_score"] == 74
