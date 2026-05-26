from typing import Any

from app.services.mongodb_service import get_mongodb_service


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
