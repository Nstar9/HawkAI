from typing import Any

from app.services.mongodb_service import get_mongodb_service


async def find_correlated_entities(
    entity_id: str,
    jurisdiction: str = "",
    limit: int = 5,
) -> dict[str, Any]:
    """Find other entities in the database correlated by jurisdiction or risk profile.

    Use this AFTER run_vector_similarity_search to find entities in the same jurisdiction.

    Args:
        entity_id: Current entity's ID (will be excluded from results).
        jurisdiction: Jurisdiction/country to filter by (e.g. 'United States', 'BVI').
        limit: Maximum number of results to return (default 5).

    Returns:
        A dict with 'matches' list. Each match has name, entity_type, risk_level.
    """
    db = get_mongodb_service()

    query: dict[str, Any] = {}
    if jurisdiction:
        query["metadata.jurisdiction"] = {"$regex": jurisdiction, "$options": "i"}

    try:
        raw = await db.db["entities"].find(
            {**query, "_id": {"$ne": entity_id}},
            {"name": 1, "entity_type": 1, "risk_level": 1},
        ).limit(limit).to_list(length=limit)

        matches = [
            {
                "name": doc.get("name", ""),
                "entity_type": doc.get("entity_type", ""),
                "risk_level": doc.get("risk_level", "unknown"),
            }
            for doc in raw
        ]
        return {"status": "success", "matches": matches, "count": len(matches)}
    except Exception as exc:
        return {"status": "error", "matches": [], "message": str(exc)}


async def run_vector_similarity_search(
    entity_id: str,
    limit: int = 8,
) -> dict[str, Any]:
    """Find entities in MongoDB that are semantically similar to the given entity.

    Looks up the entity's embedding by entity_id, then runs vector similarity search.
    Use this AFTER extract_and_store_entity to find correlated risk profiles.

    Args:
        entity_id: The entity_id returned by extract_and_store_entity.
        limit: Maximum number of similar entities to return (default 8).

    Returns:
        A dict with 'matches' list. Each match has entity_id, name, entity_type,
        risk_level, similarity score, and summary.
    """
    db = get_mongodb_service()

    entity = await db.get_entity(entity_id)
    if entity is None or not entity.embedding:
        return {
            "status": "no_embedding",
            "matches": [],
            "message": "Entity has no embedding — vector search skipped.",
        }

    matches = await db.find_similar_entities(
        entity.embedding,
        limit=limit + 1,
        exclude_entity_id=entity_id,
    )

    filtered = [m for m in matches if m.get("entity_id") != entity_id][:limit]

    return {
        "status": "success",
        "matches": filtered,
        "count": len(filtered),
    }
