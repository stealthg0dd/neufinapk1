from dataclasses import dataclass, field
from datetime import datetime, UTC
import uuid


@dataclass
class Issue:
    severity: str  # critical|high|medium|low
    type: str      # type_error|auth_bug|secret|mock_data|api_drift|performance|runtime_error
    file: str
    line: int
    message: str
    suggested_fix: str
    auto_fixable: bool
    requires_human: bool
    repo: str
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    detected_at: str = field(default_factory=lambda: datetime.now(UTC).isoformat())

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
