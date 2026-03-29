"""Unit tests for services/ai_router.py — multi-provider fallback chain."""
import pytest
from unittest.mock import patch, AsyncMock


SAMPLE_PROMPT = "Analyze this portfolio: AAPL 10 shares, MSFT 5 shares."
EXPECTED_RESPONSE = {"dna_score": 74, "investor_type": "Balanced Growth"}


class TestAIRouter:
    @patch("services.ai_router.anthropic_client")
    async def test_uses_claude_first(self, mock_claude):
        mock_claude.messages.create = AsyncMock(
            return_value=MagicMock(content=[MagicMock(text='{"dna_score": 74, "investor_type": "Balanced Growth"}')])
        )
        from services.ai_router import get_ai_analysis
        result = await get_ai_analysis(SAMPLE_PROMPT)
        assert result["dna_score"] == 74
        mock_claude.messages.create.assert_called_once()

    @patch("services.ai_router.anthropic_client", side_effect=Exception("API error"))
    @patch("services.ai_router.gemini_client")
    async def test_falls_back_to_gemini(self, mock_gemini, mock_claude):
        mock_gemini.generate_content = AsyncMock(
            return_value=MagicMock(text='{"dna_score": 74, "investor_type": "Balanced Growth"}')
        )
        from services.ai_router import get_ai_analysis
        result = await get_ai_analysis(SAMPLE_PROMPT)
        assert result is not None

    @patch("services.ai_router.anthropic_client", side_effect=Exception("Claude down"))
    @patch("services.ai_router.gemini_client", side_effect=Exception("Gemini down"))
    @patch("services.ai_router.groq_client", side_effect=Exception("Groq down"))
    @patch("services.ai_router.openai_client", side_effect=Exception("OpenAI down"))
    async def test_raises_when_all_providers_fail(self, mock_oai, mock_groq, mock_gemini, mock_claude):
        from services.ai_router import get_ai_analysis
        with pytest.raises(Exception):
            await get_ai_analysis(SAMPLE_PROMPT)

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
