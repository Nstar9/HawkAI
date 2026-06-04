"""Risk signal classification and report synthesis tools.

These are the two most critical tools in the pipeline — they determine the
quality of the final investigation report. Both use the synthesis_model
(default: gemini-2.5-pro) for maximum output quality.
"""

import json
import logging
import re
from typing import Any

from app.agent.tools._gemini_retry import gemini_with_retry
from app.config import get_settings
from app.schemas.investigation import RiskCategoryBreakdown, RiskReport
from app.schemas.risk import RiskLevel, RiskSignalCreate, SignalType
from app.services.mongodb_service import get_mongodb_service

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Severity → risk score mapping (used in the scoring algorithm)
# ---------------------------------------------------------------------------

_SEVERITY_BASE: dict[str, float] = {
    "critical": 88.0,
    "high": 62.0,
    "medium": 36.0,
    "low": 12.0,
}

# Signal type → risk weight (1.0 = most severe for compliance purposes)
_TYPE_WEIGHTS: dict[str, float] = {
    "sanctions": 1.00,  # OFAC SDN / EU / UN matches — must-block
    "fraud": 0.95,      # Confirmed or alleged financial fraud
    "regulatory": 0.85, # SEC/FCA/FINRA enforcement actions
    "governance": 0.75, # Opaque ownership, PEPs, beneficial owner issues
    "financial": 0.70,  # Bankruptcy, insolvency, material financial distress
    "litigation": 0.65, # Active or pending significant lawsuits
    "reputational": 0.55,  # Adverse media, controversy
    "other": 0.45,
}


def _gemini_client():
    from google import genai
    return genai.Client(api_key=get_settings().google_api_key)


def _parse_json(text: str) -> Any:
    """Strip markdown fences and parse JSON, returning None on failure."""
    try:
        text = text.strip()
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        return json.loads(text)
    except Exception:
        return None


def _calculate_risk_score(signals: list) -> float:
    """
    Evidence-weighted risk scoring algorithm.

    Logic:
      - Maximum severity signal sets a floor on the final score.
      - All signals contribute via an evidence-weighted average.
      - Final score blends floor (60%) + average (40%) + breadth bonus.
      - Ensures one CRITICAL signal always produces a CRITICAL final score.
    """
    if not signals:
        return 3.0

    # Maximum severity signal (sets the floor)
    max_base = max(_SEVERITY_BASE.get(s.severity.value, 36.0) for s in signals)

    # Weighted evidence average across all signals
    total, weight_sum = 0.0, 0.0
    for s in signals:
        base = _SEVERITY_BASE.get(s.severity.value, 36.0)
        w = _TYPE_WEIGHTS.get(s.signal_type.value, 0.5) * s.confidence
        total += base * w
        weight_sum += w

    avg = (total / weight_sum) if weight_sum > 0 else 0.0

    # Breadth bonus: more unique signal categories = systemic risk
    unique_types = len({s.signal_type.value for s in signals})
    breadth_bonus = min(unique_types * 2.5, 12.0)

    score = 0.60 * max_base + 0.40 * avg + breadth_bonus
    return round(min(100.0, max(1.0, score)), 1)


def _score_to_level(score: float) -> str:
    if score >= 75:
        return "critical"
    if score >= 50:
        return "high"
    if score >= 22:
        return "medium"
    return "low"


def _build_breakdown(signals: list) -> dict[str, RiskCategoryBreakdown]:
    """Aggregate signal counts and max severity per category."""
    buckets: dict[str, dict] = {}
    severity_order = ["low", "medium", "high", "critical"]

    for s in signals:
        cat = s.signal_type.value
        if cat not in buckets:
            buckets[cat] = {"count": 0, "max_severity": "low"}
        buckets[cat]["count"] += 1
        current = buckets[cat]["max_severity"]
        if severity_order.index(s.severity.value) > severity_order.index(current):
            buckets[cat]["max_severity"] = s.severity.value

    return {
        cat: RiskCategoryBreakdown(
            count=data["count"],
            max_severity=RiskLevel(data["max_severity"]),
        )
        for cat, data in buckets.items()
    }


# ---------------------------------------------------------------------------
# Tool: classify_and_store_signals
# ---------------------------------------------------------------------------

async def classify_and_store_signals(
    investigation_id: str,
    entity_id: str,
    research_brief: str,
    adverse_findings: str = "",
) -> dict[str, Any]:
    """Classify all financial crime risk signals from the research and store them.

    Analyzes the research brief for AML/KYC risk indicators across 8 categories,
    applies evidence-based severity ratings, deduplicates, and persists to MongoDB.
    Call this AFTER extract_and_store_entity.

    Args:
        investigation_id: The active investigation ID.
        entity_id: The entity ID from extract_and_store_entity.
        research_brief: Full research text produced by ResearchAgent.
        adverse_findings: Comma-separated adverse findings to prioritise (optional).

    Returns:
        Dict with 'signals' list and 'count'. Each signal has type, severity,
        title, description, confidence, and sources.
    """
    from google.genai import types as genai_types

    settings = get_settings()
    client = _gemini_client()
    db = get_mongodb_service()

    entity = await db.get_entity(entity_id)
    entity_name = entity.name if entity else "Unknown entity"

    classification_prompt = f"""You are a senior AML/KYC compliance analyst at a tier-1 financial institution.
Classify ALL financial crime risk signals for this entity from the research provided.

ENTITY: {entity_name}

RESEARCH BRIEF:
{research_brief[:7000]}

ADVERSE FINDINGS TO PRIORITISE:
{adverse_findings[:2000] if adverse_findings else "See research brief."}

SIGNAL CATEGORIES (classify into ALL that apply):
• sanctions — OFAC SDN, EU/UN/HMT/OFSI lists, export controls violations
• fraud — Ponzi, market manipulation, accounting fraud, wire fraud, embezzlement
• regulatory — SEC, CFTC, FCA, FINRA, OCC, ESMA enforcement, fines, license issues
• governance — undisclosed beneficial ownership, PEP connections, opaque structures
• financial — bankruptcy, insolvency, material financial distress, SPAC/accounting issues
• litigation — active significant lawsuits with financial exposure >$1M
• reputational — confirmed adverse media, bribery allegations, misconduct investigations
• other — anything material that doesn't fit above categories

SEVERITY CALIBRATION (be precise):
• critical — confirmed sanctions match OR convicted fraud OR criminal indictment
• high — regulatory enforcement with >$1M fine OR credible fraud allegations OR active SDN investigation
• medium — regulatory inquiry <$1M OR civil lawsuit OR adverse media with named sources
• low — minor regulatory notice OR old resolved issue OR unconfirmed allegation

CONFIDENCE GUIDE:
• 0.90–1.00 — confirmed by official regulatory/court record or company disclosure
• 0.70–0.89 — reported by multiple credible news sources with specific details
• 0.50–0.69 — reported by single source or lacks key specifics
• below 0.50 — allegation only, no corroboration — OMIT these

Return ONLY a valid JSON array. Include every signal that meets the 0.50+ confidence threshold.
Deduplicate — one signal per distinct incident (do not list the same regulatory action twice).
If no qualifying signals found, return [].

[
  {{
    "signal_type": "sanctions|fraud|regulatory|governance|financial|litigation|reputational|other",
    "severity": "critical|high|medium|low",
    "title": "Concise title under 80 chars — include the body name or dollar amount if known",
    "description": "2-3 sentences: what happened, when, who was involved, what the outcome was. Be specific — cite amounts, dates, regulatory bodies, case numbers where available.",
    "confidence": 0.0_to_1.0,
    "sources": ["source URL or 'Official regulatory filing', 'SEC enforcement action', etc."]
  }}
]"""

    response = await gemini_with_retry(
        lambda: client.aio.models.generate_content(
            model=settings.synthesis_model,
            contents=classification_prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
    )

    raw_signals = _parse_json(response.text or "[]")
    if not isinstance(raw_signals, list):
        raw_signals = []
        logger.warning("classify_and_store_signals: invalid JSON response, using empty list")

    # Add watchlist seed matches
    watchlist_hits = await db.match_watchlist_seeds(research_brief)
    for hit in watchlist_hits:
        raw_signals.append({
            "signal_type": hit.get("signal_type", "other"),
            "severity": hit.get("severity", "medium"),
            "title": f"Watchlist pattern: {hit.get('pattern', 'risk indicator')}",
            "description": hit.get("description", "Matched against HawkAI watchlist pattern."),
            "confidence": 0.72,
            "sources": ["hawkai_internal_watchlist"],
        })

    # Filter out low-confidence signals before persisting
    raw_signals = [s for s in raw_signals if float(s.get("confidence", 0)) >= 0.50]

    created: list[dict[str, Any]] = []
    for item in raw_signals:
        try:
            stype = item.get("signal_type", "other")
            if stype not in {e.value for e in SignalType}:
                stype = "other"
            sev = item.get("severity", "medium")
            if sev not in {e.value for e in RiskLevel}:
                sev = "medium"

            signal = RiskSignalCreate(
                entity_id=entity_id,
                investigation_id=investigation_id,
                signal_type=SignalType(stype),
                severity=RiskLevel(sev),
                title=str(item.get("title", "Risk signal"))[:200],
                description=str(item.get("description", ""))[:1500],
                confidence=float(max(0.0, min(1.0, item.get("confidence", 0.5)))),
                sources=[str(s) for s in item.get("sources", []) if s][:5],
            )
            record = await db.create_risk_signal(signal)
            created.append({
                "id": record.id,
                "signal_type": record.signal_type.value,
                "severity": record.severity.value,
                "title": record.title,
                "confidence": record.confidence,
            })
        except Exception:
            logger.exception("Failed to persist signal: %s", item.get("title"))
            continue

    logger.info(
        "classify_and_store_signals: %d signals for investigation %s",
        len(created),
        investigation_id,
    )
    return {
        "status": "success",
        "signals": created,
        "count": len(created),
        "signal_types_found": sorted({s["signal_type"] for s in created}),
    }


# ---------------------------------------------------------------------------
# Tool: synthesize_risk_report
# ---------------------------------------------------------------------------

async def synthesize_risk_report(
    investigation_id: str,
    entity_id: str,
) -> dict[str, Any]:
    """Synthesize the final risk report and mark the investigation complete.

    Reads the entity profile and all classified signals from MongoDB, applies
    the evidence-weighted risk scoring algorithm, then uses the synthesis model
    (gemini-2.5-pro by default) to produce a professional-grade compliance report.
    Call this as the FINAL step in the pipeline.

    Args:
        investigation_id: The active investigation ID.
        entity_id: The entity ID from extract_and_store_entity.

    Returns:
        The complete investigation result including risk score, report, and signals.
    """
    from google.genai import types as genai_types

    from app.schemas.investigation import InvestigationResult

    settings = get_settings()
    client = _gemini_client()
    db = get_mongodb_service()

    entity = await db.get_entity(entity_id)
    if entity is None:
        return {"status": "error", "message": f"Entity '{entity_id}' not found in database."}

    signals = await db.list_risk_signals_for_investigation(investigation_id)

    # --- Score and level ---
    risk_score = _calculate_risk_score(signals)
    risk_level = _score_to_level(risk_score)
    breakdown = _build_breakdown(signals)

    # --- Build signal summary for the prompt ---
    # Sort by severity then confidence descending
    _sev_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
    sorted_signals = sorted(
        signals,
        key=lambda s: (_sev_order.get(s.severity.value, 0), s.confidence),
        reverse=True,
    )
    signal_lines = [
        f"[{s.severity.upper()}] [{s.signal_type.upper()}] {s.title} "
        f"(confidence {s.confidence:.0%}): {s.description}"
        for s in sorted_signals[:20]
    ]

    entity_meta = entity.metadata or {}
    adverse_facts = entity_meta.get("adverse_findings", [])[:8]
    key_facts = entity_meta.get("key_facts", [])[:5]

    synthesis_prompt = f"""You are a senior compliance officer writing an investigation report for a Risk Committee at a tier-1 bank.
This report will be used to make an actual onboarding or transaction decision.

ENTITY PROFILE
Name: {entity.name}
Type: {entity.entity_type.value}
Jurisdiction: {entity_meta.get('jurisdiction', 'Unknown')}
Industry: {entity_meta.get('industry', 'Unknown')}
Summary: {entity.summary or 'See signals below.'}

RISK ASSESSMENT
Score: {risk_score}/100  |  Level: {risk_level.upper()}
Total Signals: {len(signals)}  |  Distribution: {', '.join(f"{k}: {v.count}" for k, v in breakdown.items())}

KEY FACTS FROM RESEARCH
{chr(10).join(f'• {f}' for f in key_facts) if key_facts else '• None identified in research.'}

ADVERSE FINDINGS FROM RESEARCH
{chr(10).join(f'• {f}' for f in adverse_facts) if adverse_facts else '• None identified in research.'}

CLASSIFIED RISK SIGNALS (sorted by severity)
{chr(10).join(signal_lines) if signal_lines else '• No signals identified — entity appears clean.'}

Write a professional compliance report. Return ONLY valid JSON:
{{
  "executive_summary": "2-3 sentences. Lead with the single most significant risk finding (cite specific dollar amount, regulatory body, or date). Second sentence provides context. Third sentence states the overall compliance posture. For LOW risk entities: state clearly that no material adverse findings were identified and entity appears suitable for standard onboarding.",

  "key_findings": [
    "Finding 1 — FORMAT: '[Category] Specific fact with verifiable detail.' Example: '[SANCTIONS] Microsoft paid $3.3M to OFAC in April 2023 for 1,339 transactions totaling $12M in sales to SDN-listed entities — employees intentionally bypassed screening controls.' Write 5–7 findings of this quality. Each must cite at least one specific fact.",
    "Finding 2 — same format",
    "Finding 3 — same format"
  ],

  "recommendations": [
    "PRIMARY ACTION: One of — 'CLEAR FOR STANDARD ONBOARDING' / 'ENHANCED DUE DILIGENCE REQUIRED' / 'DECLINE — UNACCEPTABLE AML RISK' / 'ESCALATE TO MLRO'. Then explain specifically what due diligence is needed and why. Be decisive.",
    "MONITORING: If onboarding is approved, state what transaction monitoring rules apply — thresholds, jurisdictions, counterparties to watch.",
    "PERIODIC REVIEW: State review timeline and what triggers an earlier review."
  ],

  "analyst_confidence": 0.0_to_1.0_float
}}

RULES:
- executive_summary: max 3 sentences, no vague language, leads with the strongest fact
- key_findings: minimum 5 items, maximum 8 items, each must cite a specific verifiable detail
- recommendations: exactly 3 items using the PRIMARY ACTION / MONITORING / PERIODIC REVIEW structure
- analyst_confidence: 0.90+ if multiple corroborating signals with official sources; 0.65–0.89 if moderate evidence; below 0.65 if limited data
- For LOW RISK entities (score < 22): key_findings should note POSITIVE indicators (regulated entity, clean record, transparent structure)
- Never invent regulatory actions, dollar amounts, or case numbers not present in the signals above"""

    synthesis_response = await gemini_with_retry(
        lambda: client.aio.models.generate_content(
            model=settings.synthesis_model,
            contents=synthesis_prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.15,
            ),
        )
    )

    synthesis = _parse_json(synthesis_response.text or "{}") or {}

    # --- Update entity with final risk score ---
    await db.update_entity(
        entity_id,
        risk_score=risk_score,
        risk_level=risk_level,
        signal_count=len(signals),
    )

    # --- Build and persist the report ---
    report = RiskReport(
        overall_risk_score=risk_score,
        risk_level=RiskLevel(risk_level),
        executive_summary=synthesis.get(
            "executive_summary",
            f"{entity.name} investigation complete. Risk score: {risk_score}/100 ({risk_level.upper()}).",
        ),
        key_findings=synthesis.get("key_findings", []),
        recommendations=synthesis.get("recommendations", []),
        risk_breakdown=breakdown,
        analyst_confidence=float(synthesis.get("analyst_confidence", 0.75)),
        correlated_entities=[],
    )

    from app.schemas.investigation import InvestigationResult as IR
    result = IR(entity_id=entity_id, report=report, signals=signals)

    await db.update_investigation(
        investigation_id,
        status="completed",
        result=result.model_dump(mode="json"),
    )

    logger.info(
        "synthesize_risk_report: investigation %s completed | score=%.1f level=%s signals=%d",
        investigation_id,
        risk_score,
        risk_level,
        len(signals),
    )

    return {
        "status": "success",
        "investigation_id": investigation_id,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "signal_count": len(signals),
        "executive_summary": report.executive_summary,
        "key_findings": report.key_findings,
        "recommendations": report.recommendations,
        "analyst_confidence": report.analyst_confidence,
    }
