from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.schemas.entity import EntityType
from app.schemas.risk import RiskLevel, RiskSignal


class InvestigationStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class InvestigationStepName(str, Enum):
    RESEARCH = "research"
    INTELLIGENCE = "intelligence"
    COMPLETE = "complete"


class InvestigationStep(BaseModel):
    name: InvestigationStepName
    status: InvestigationStatus
    message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


class InvestigationCreate(BaseModel):
    entity_name: str = Field(..., min_length=1, max_length=500)
    entity_type: EntityType
    context: str | None = None


class RiskCategoryBreakdown(BaseModel):
    """Per-category signal summary shown in the report sidebar."""
    count: int
    max_severity: RiskLevel


class RiskReport(BaseModel):
    overall_risk_score: float = Field(ge=0.0, le=100.0)
    risk_level: RiskLevel

    # One punchy paragraph — the most important finding, specific facts only.
    executive_summary: str

    # 5–7 specific findings, each citing a verifiable fact (amount, date, body).
    key_findings: list[str] = Field(default_factory=list)

    # Actionable compliance recommendations, prioritised and specific.
    recommendations: list[str] = Field(default_factory=list)

    # Distribution of signals across risk categories.
    risk_breakdown: dict[str, RiskCategoryBreakdown] = Field(default_factory=dict)

    # How confident the analyst is in the overall assessment (0–1).
    analyst_confidence: float = Field(default=0.75, ge=0.0, le=1.0)

    # IDs of strongly-correlated entities from vector search.
    correlated_entities: list[str] = Field(default_factory=list)


class InvestigationResult(BaseModel):
    entity_id: str | None = None
    report: RiskReport | None = None
    signals: list[RiskSignal] = Field(default_factory=list)


class Investigation(InvestigationCreate):
    id: str
    status: InvestigationStatus
    steps: list[InvestigationStep] = Field(default_factory=list)
    result: InvestigationResult | None = None
    error: str | None = None
    created_at: datetime
    updated_at: datetime
    metadata: dict[str, Any] = Field(default_factory=dict)
