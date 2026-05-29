import json
import re
from typing import Any

from app.agent.tools._gemini_retry import get_tools_model, gemini_with_retry
from app.config import get_settings
from app.schemas.risk import RiskLevel, RiskSignalCreate, SignalType
from app.services.mongodb_service import get_mongodb_service


def _gemini_client():
    from google import genai
    settings = get_settings()
    return genai.Client(api_key=settings.google_api_key)


def _parse_json_safely(text: str) -> Any:
    text = text.strip()
    text = re.sub(r"^```json\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


async def classify_and_store_signals(
    investigation_id: str,
    entity_id: str,
    research_brief: str,
    adverse_findings: str = "",
) -> dict[str, Any]:
    """Classify all risk signals from the research and store them in MongoDB.

    Uses Gemini to analyze the research for financial crime risk indicators,
    then persists each signal. Call this AFTER extract_and_store_entity.

    Args:
        investigation_id: The active investigation ID.
        entity_id: The entity ID from extract_and_store_entity.
        research_brief: Full research text from ResearchAgent.
        adverse_findings: Comma-separated list of specific adverse findings to classify (optional).

    Returns:
        A dict with 'signals' list and 'count'. Each signal has type, severity, title, description.
    """
    from google.genai import types as genai_types

    settings = get_settings()
    client = _gemini_client()

    db = get_mongodb_service()
    entity = await db.get_entity(entity_id)
    entity_name = entity.name if entity else "Unknown entity"

    classification_prompt = f"""You are a senior AML/KYC analyst. Classify all financial crime risk signals for this entity.

Entity: {entity_name}
Entity ID: {entity_id}

Research brief:
{research_brief[:6000]}

Specific adverse findings noted:
{adverse_findings[:2000] if adverse_findings else "See research brief above"}

Analyze for ALL of these risk signal types:
- sanctions: OFAC SDN list, EU, UN, HMT sanctions
- reputational: adverse media, fraud allegations, corruption, criminal charges
- regulatory: SEC/CFTC/FCA/regulatory enforcement actions, fines, license revocations
- litigation: significant lawsuits, judgments against the entity
- financial: bankruptcy, insolvency, fraud, significant financial distress
- governance: undisclosed beneficial owners, complex opaque structures, PEP connections
- fraud: Ponzi schemes, market manipulation, accounting fraud, wire fraud
- other: anything else concerning

Return ONLY a valid JSON array. Include ALL signals with evidence. If no risk signals are found, return [].

[
  {{
    "signal_type": "sanctions|reputational|regulatory|litigation|financial|governance|fraud|other",
    "severity": "low|medium|high|critical",
    "title": "Short descriptive title (max 80 chars)",
    "description": "1-2 sentence factual description with specifics (dates, amounts, counterparties)",
    "confidence": 0.0 to 1.0,
    "sources": ["source URL or description"]
  }}
]

Rules:
- Only include signals with actual evidence from the research
- Do NOT fabricate signals, cases, or regulatory actions
- confidence reflects evidence strength (0.9+ = verified, 0.5-0.89 = probable, <0.5 = possible)
- severity: critical=sanctions/convicted fraud, high=regulatory enforcement/clear fraud, medium=adverse media/litigation, low=minor concerns"""

    response = await gemini_with_retry(
        lambda: client.aio.models.generate_content(
            model=get_tools_model(),
            contents=classification_prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
    )

    raw_signals: list[dict] = _parse_json_safely(response.text or "[]")
    if not isinstance(raw_signals, list):
        raw_signals = []

    watchlist_hits = await db.match_watchlist_seeds(research_brief)
    for hit in watchlist_hits:
        raw_signals.append({
            "signal_type": hit.get("signal_type", "other"),
            "severity": hit.get("severity", "medium"),
            "title": f"Pattern match: {hit.get('pattern', 'risk pattern')}",
            "description": hit.get("description", "Matched against internal watchlist pattern."),
            "confidence": 0.70,
            "sources": ["hawkai_watchlist"],
        })

    created: list[dict[str, Any]] = []
    for item in raw_signals:
        try:
            signal_type_val = item.get("signal_type", "other")
            if signal_type_val not in [e.value for e in SignalType]:
                signal_type_val = "other"
            severity_val = item.get("severity", "medium")
            if severity_val not in [e.value for e in RiskLevel]:
                severity_val = "medium"

            signal = RiskSignalCreate(
                entity_id=entity_id,
                investigation_id=investigation_id,
                signal_type=SignalType(signal_type_val),
                severity=RiskLevel(severity_val),
                title=str(item.get("title", "Risk signal"))[:200],
                description=str(item.get("description", ""))[:1000],
                confidence=float(max(0.0, min(1.0, item.get("confidence", 0.5)))),
                sources=[str(s) for s in item.get("sources", []) if s],
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
            continue

    return {
        "status": "success",
        "signals": created,
        "count": len(created),
        "signal_types_found": list({s["signal_type"] for s in created}),
    }


async def synthesize_risk_report(
    investigation_id: str,
    entity_id: str,
) -> dict[str, Any]:
    """Synthesize the final risk intelligence report and mark the investigation complete.

    Reads entity profile and all classified signals from MongoDB, uses Gemini to
    reason over everything, produces a scored risk report, and updates investigation status.
    Call this as the FINAL step in the intelligence pipeline.

    Args:
        investigation_id: The active investigation ID.
        entity_id: The entity ID from extract_and_store_entity.

    Returns:
        The complete investigation result including risk score, level, summary, findings.
    """
    from google.genai import types as genai_types

    from app.schemas.investigation import InvestigationResult, RiskReport

    settings = get_settings()
    client = _gemini_client()
    db = get_mongodb_service()

    entity = await db.get_entity(entity_id)
    if entity is None:
        return {"status": "error", "message": f"Entity {entity_id} not found."}

    signals = await db.list_risk_signals_for_investigation(investigation_id)

    severity_weights = {"low": 10.0, "medium": 30.0, "high": 65.0, "critical": 100.0}
    if signals:
        weighted_sum = sum(
            severity_weights.get(s.severity.value, 30.0) * s.confidence
            for s in signals
        )
        count_weight = min(len(signals) / 3.0, 1.0)
        raw_score = (weighted_sum / len(signals)) * (0.7 + 0.3 * count_weight)
        risk_score = round(min(100.0, max(0.0, raw_score)), 1)
    else:
        risk_score = 5.0

    if risk_score >= 75:
        risk_level = "critical"
    elif risk_score >= 50:
        risk_level = "high"
    elif risk_score >= 25:
        risk_level = "medium"
    else:
        risk_level = "low"

    signal_summaries = [
        f"[{s.severity.value.upper()}] {s.title} — {s.description}"
        for s in signals
    ]

    adverse_facts = "\n".join(
        (entity.metadata or {}).get("adverse_findings", [])[:5]
    ) or "None identified."

    synthesis_prompt = f"""You are a senior financial crime analyst briefing a risk committee at a tier-1 bank.

Entity: {entity.name} ({entity.entity_type.value})
Risk Score: {risk_score}/100
Risk Level: {risk_level.upper()}
Signals Found: {len(signals)}

Signal Details:
{chr(10).join(signal_summaries[:15]) if signal_summaries else 'No signals identified.'}

Adverse Findings from Research:
{adverse_facts}

Entity Jurisdiction: {(entity.metadata or {}).get('jurisdiction', 'Unknown')}
Entity Industry: {(entity.metadata or {}).get('industry', 'Unknown')}
Entity Summary: {entity.summary or 'No summary available.'}

Write the report as a senior analyst briefing a committee. Return ONLY valid JSON:
{{
  "executive_summary": "One powerful sentence (max 40 words) that captures the core risk finding — lead with the most damning fact. If low risk, state clearly that the entity appears legitimate with no adverse findings.",
  "key_findings": [
    "Finding 1 — start with a specific fact: dollar amount, date, counterparty, jurisdiction, or regulatory body. No vague language.",
    "Finding 2 — same rule: cite specifics.",
    "Finding 3 — same rule."
  ],
  "recommendations": [
    "Primary action — must be specific and immediately actionable. Examples: 'File SAR with FinCEN within 24 hours citing sanctions evasion pattern', 'Decline onboarding — entity presents unacceptable AML risk', 'Clear for standard onboarding — no adverse findings identified', 'Escalate to MLRO for enhanced due diligence before any transaction'. Never say just 'investigate further'."
  ],
  "analyst_confidence": 0.85
}}

Rules:
- executive_summary: under 40 words, one sentence, leads with the strongest fact
- key_findings: 3 to 5 items, each must cite a specific verifiable fact — no vague concerns
- recommendations: exactly 1 primary action that is specific, actionable, and time-bound where appropriate
- analyst_confidence: 0.9+ if multiple corroborating signals, 0.6-0.89 if moderate evidence, below 0.6 if limited data
- If risk is LOW: executive_summary should say entity appears legitimate, key_findings should list positive indicators, recommendation should be 'Clear for standard onboarding'
- If risk is CRITICAL or HIGH: lead with the most severe finding, recommend decisive action"""

    synthesis_response = await gemini_with_retry(
        lambda: client.aio.models.generate_content(
            model=get_tools_model(),
            contents=synthesis_prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
    )

    synthesis: dict[str, Any] = _parse_json_safely(synthesis_response.text or "{}")

    await db.update_entity(
        entity_id,
        risk_score=risk_score,
        risk_level=risk_level,
        signal_count=len(signals),
    )

    report = RiskReport(
        overall_risk_score=risk_score,
        risk_level=RiskLevel(risk_level),
        executive_summary=synthesis.get("executive_summary", "Investigation completed."),
        key_findings=synthesis.get("key_findings", []),
        recommendations=synthesis.get("recommendations", []),
        correlated_entities=[],
    )
    result = InvestigationResult(
        entity_id=entity_id,
        report=report,
        signals=signals,
    )

    await db.update_investigation(
        investigation_id,
        status="completed",
        result=result.model_dump(mode="json"),
    )

    return {
        "status": "success",
        "investigation_id": investigation_id,
        "entity_id": entity_id,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "signal_count": len(signals),
        "executive_summary": synthesis.get("executive_summary", ""),
        "key_findings": synthesis.get("key_findings", []),
        "recommendations": synthesis.get("recommendations", []),
    }
