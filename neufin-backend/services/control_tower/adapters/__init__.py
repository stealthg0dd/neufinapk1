"""Provider-specific connectors."""

from services.control_tower.adapters.anthropic_admin import AnthropicAdminConnector
from services.control_tower.adapters.cursor_import import CursorImportConnector
from services.control_tower.adapters.github_copilot import GitHubCopilotConnector
from services.control_tower.adapters.openai_usage import OpenAIConnector
from services.control_tower.adapters.railway_graphql import RailwayConnector
from services.control_tower.adapters.vercel_api import VercelConnector

ALL_CONNECTORS = [
    OpenAIConnector,
    AnthropicAdminConnector,
    GitHubCopilotConnector,
    CursorImportConnector,
    RailwayConnector,
    VercelConnector,
]

__all__ = [
    "ALL_CONNECTORS",
    "AnthropicAdminConnector",
    "CursorImportConnector",
    "GitHubCopilotConnector",
    "OpenAIConnector",
    "RailwayConnector",
    "VercelConnector",
]
