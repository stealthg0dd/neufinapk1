from dataclasses import dataclass, field
from datetime import datetime, UTC
import uuid


@dataclass
class Issue:
    severity: str  # critical|high|medium|low
    type: str      # type_error|auth_bug|secret|mock_data|api_drift|performance|runtime_error
    file: str
    message: str
    suggested_fix: str
    repo: str
    line: int = 0
    auto_fixable: bool = False
    requires_human: bool = False
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    detected_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    resolved_at: str | None = None
    resolution: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "severity": self.severity,
            "type": self.type,
            "file": self.file,
            "line": self.line,
            "message": self.message,
            "suggested_fix": self.suggested_fix,
            "auto_fixable": self.auto_fixable,
            "requires_human": self.requires_human,
            "repo": self.repo,
            "detected_at": self.detected_at,
        }

    # Alias so callers using .dict() (Pydantic-style) also work
    def dict(self) -> dict:
        return self.to_dict()
