from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EntityType(str, Enum):
    COMPANY = "company"
    PERSON = "person"
    FUND = "fund"


class Identifier(BaseModel):
    type: str
    value: str


class Address(BaseModel):
    line1: str | None = None
    city: str | None = None
    region: str | None = None
    country: str | None = None
    postal_code: str | None = None


class EntityCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    entity_type: EntityType
    aliases: list[str] = Field(default_factory=list)
    identifiers: list[Identifier] = Field(default_factory=list)
    addresses: list[Address] = Field(default_factory=list)
    summary: str | None = None
    embedding: list[float] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class Entity(EntityCreate):
    id: str
    risk_score: float | None = None
    risk_level: str | None = None
    signal_count: int = 0
    created_at: datetime
    updated_at: datetime
    analyst_notes: list[dict[str, Any]] = Field(default_factory=list)
