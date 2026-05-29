import json
import re
from typing import Any

from app.agent.tools._gemini_retry import get_tools_model, gemini_with_retry
from app.config import get_settings
from app.schemas.entity import Address, EntityCreate, EntityType, Identifier
from app.services.mongodb_service import get_mongodb_service


def _gemini_client():
    from google import genai
    settings = get_settings()
    return genai.Client(api_key=settings.google_api_key)


async def extract_and_store_entity(
    investigation_id: str,
    entity_name: str,
    entity_type: str,
    research_brief: str,
) -> dict[str, Any]:
    """Extract a structured entity profile via Gemini, compute its embedding, and store in MongoDB.

    This is the single tool that handles profile extraction, embedding computation, and persistence.
    Call this FIRST in the intelligence pipeline.

    Args:
        investigation_id: The active investigation ID.
        entity_name: The canonical entity name to investigate.
        entity_type: Must be 'company', 'person', or 'fund'.
        research_brief: Raw research text produced by ResearchAgent.

    Returns:
        A dict containing entity_id (str), entity_name, profile_summary, and any existing_matches.
    """
    from google.genai import types as genai_types

    settings = get_settings()
    client = _gemini_client()

    extraction_prompt = f"""You are a financial crime compliance analyst extracting structured entity data.

Entity under investigation: "{entity_name}" (type: {entity_type})

Research brief:
{research_brief[:8000]}

Extract and return ONLY valid JSON with this exact structure:
{{
  "entity_type": "{entity_type}",
  "canonical_name": "the most accurate/official name found",
  "aliases": ["alternative names, trading names, former names"],
  "addresses": [
    {{"line1": "street address or null", "city": "city or null", "region": "state/region or null", "country": "country or null", "postal_code": "zip/postal or null"}}
  ],
  "identifiers": [
    {{"type": "registration|tax|passport|lei|ticker|other", "value": "the id value"}}
  ],
  "summary": "2-3 sentence factual profile of the entity based on research",
  "key_facts": ["important fact 1", "important fact 2", "important fact 3"],
  "adverse_findings": ["any adverse finding, sanction, lawsuit, or red flag found in research"],
  "jurisdiction": "primary jurisdiction/country of incorporation or operation",
  "industry": "industry sector if company"
}}

Rules:
- Only include data with clear evidence from the research
- Do not fabricate registration numbers, addresses, or legal cases
- If a field has no evidence, use null or empty array
- adverse_findings should include EVERYTHING suspicious"""

    extraction_response = await gemini_with_retry(
        lambda: client.aio.models.generate_content(
            model=get_tools_model(),
            contents=extraction_prompt,
            config=genai_types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.1,
            ),
        )
    )

    raw_text = extraction_response.text or "{}"
    raw_text = re.sub(r"^```json\s*", "", raw_text.strip())
    raw_text = re.sub(r"\s*```$", "", raw_text.strip())
    extracted: dict[str, Any] = json.loads(raw_text)

    canonical_name = extracted.get("canonical_name") or entity_name
    embedding_text = (
        f"{canonical_name}. "
        f"{extracted.get('summary', '')}. "
        f"Jurisdiction: {extracted.get('jurisdiction', '')}. "
        f"Industry: {extracted.get('industry', '')}. "
        f"Aliases: {', '.join(extracted.get('aliases', []))}. "
        f"Adverse: {'; '.join(extracted.get('adverse_findings', []))}"
    )[:3000]

    embed_response = await gemini_with_retry(
        lambda: client.aio.models.embed_content(
            model=settings.embedding_model,
            contents=embedding_text,
            config=genai_types.EmbedContentConfig(output_dimensionality=settings.embedding_dims),
        )
    )
    embedding: list[float] = list(embed_response.embeddings[0].values)

    db = get_mongodb_service()
    existing = await db.find_entities_by_name(canonical_name, entity_type, limit=3)

    addresses = [
        Address.model_validate(a)
        for a in extracted.get("addresses", [])
        if isinstance(a, dict)
    ]
    identifiers = [
        Identifier.model_validate(i)
        for i in extracted.get("identifiers", [])
        if isinstance(i, dict) and i.get("value")
    ]

    if existing:
        entity = await db.update_entity(
            existing[0].id,
            summary=extracted.get("summary"),
            embedding=embedding,
            aliases=extracted.get("aliases", []),
            addresses=[a.model_dump() for a in addresses],
            identifiers=[i.model_dump() for i in identifiers],
            metadata={
                "last_investigation_id": investigation_id,
                "key_facts": extracted.get("key_facts", []),
                "adverse_findings": extracted.get("adverse_findings", []),
                "jurisdiction": extracted.get("jurisdiction"),
                "industry": extracted.get("industry"),
            },
        )
        entity_id = existing[0].id
    else:
        entity = await db.create_entity(
            EntityCreate(
                name=canonical_name,
                entity_type=EntityType(entity_type),
                aliases=extracted.get("aliases", []),
                identifiers=identifiers,
                addresses=addresses,
                summary=extracted.get("summary"),
                embedding=embedding,
                metadata={
                    "created_by_investigation": investigation_id,
                    "key_facts": extracted.get("key_facts", []),
                    "adverse_findings": extracted.get("adverse_findings", []),
                    "jurisdiction": extracted.get("jurisdiction"),
                    "industry": extracted.get("industry"),
                },
            )
        )
        entity_id = entity.id

    return {
        "status": "success",
        "entity_id": entity_id,
        "entity_name": canonical_name,
        "profile_summary": extracted.get("summary", ""),
        "adverse_findings_count": len(extracted.get("adverse_findings", [])),
        "existing_match": existing[0].id if existing else None,
        "embedding_dimensions": len(embedding),
    }
