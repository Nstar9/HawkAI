from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SignalType(str, Enum):
    REPUTATIONAL = "reputational"
    FINANCIAL = "financial"
    REGULATORY = "regulatory"
    LITIGATION = "litigation"
    SANCTIONS = "sanctions"
    GOVERNANCE = "governance"
    FRAUD = "fraud"
    OTHER = "other"


class RiskSignalCreate(BaseModel):
    entity_id: str
    investigation_id: str | None = None
    signal_type: SignalType
    severity: RiskLevel
    title: str
    description: str
    confidence: float = Field(ge=0.0, le=1.0)
    sources: list[str] = Field(default_factory=list)


class RiskSignal(RiskSignalCreate):
    id: str
    created_at: datetime
