import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import Settings, get_settings
from app.schemas.entity import Entity, EntityCreate
from app.schemas.investigation import Investigation, InvestigationCreate, InvestigationStatus
from app.schemas.risk import RiskSignal, RiskSignalCreate

_client: AsyncIOMotorClient | None = None


class MongoDBService:
    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()

    @property
    def db(self) -> AsyncIOMotorDatabase:
        if _client is None:
            raise RuntimeError("MongoDB client not initialized — call connect() first.")
        return _client[self._settings.mongodb_database]

    @property
    def _uses_atlas(self) -> bool:
        return "mongodb+srv" in self._settings.mongodb_uri

    async def connect(self) -> None:
        global _client
        import certifi as _certifi
        _client = AsyncIOMotorClient(
            self._settings.mongodb_uri,
            serverSelectionTimeoutMS=10_000,
            tlsCAFile=_certifi.where(),
        )
        await self._ensure_indexes()
        await self._seed_watchlist()

    async def disconnect(self) -> None:
        global _client
        if _client is not None:
            _client.close()
            _client = None

    async def _ensure_indexes(self) -> None:
        await self.db.entities.create_index("name")
        await self.db.entities.create_index([("entity_type", 1), ("name", 1)])
        await self.db.entities.create_index([("name", "text"), ("summary", "text")])
        await self.db.risk_signals.create_index("entity_id")
        await self.db.risk_signals.create_index("investigation_id")
        await self.db.investigations.create_index("created_at")
        await self.db.investigations.create_index("status")
        await self.db.watchlist_seeds.create_index("pattern")

    async def _seed_watchlist(self) -> None:
        seed_path = self._settings.watchlist_seed_path
        path = Path(__file__).resolve().parents[2] / seed_path
        if not path.exists():
            return
        count = await self.db.watchlist_seeds.count_documents({})
        if count > 0:
            return
        seeds = json.loads(path.read_text())
        if seeds:
            await self.db.watchlist_seeds.insert_many(seeds)

    # --- Investigations ---

    async def create_investigation(self, payload: InvestigationCreate) -> Investigation:
        now = datetime.now(UTC)
        inv_id = str(uuid4())
        doc = {
            "_id": inv_id,
            **payload.model_dump(mode="json"),
            "status": InvestigationStatus.PENDING.value,
            "steps": [],
            "result": None,
            "error": None,
            "created_at": now,
            "updated_at": now,
            "metadata": {},
        }
        await self.db.investigations.insert_one(doc)
        return self._to_investigation(doc)

    async def get_investigation(self, investigation_id: str) -> Investigation | None:
        doc = await self.db.investigations.find_one({"_id": investigation_id})
        return self._to_investigation(doc) if doc else None

    async def update_investigation(self, investigation_id: str, **fields: Any) -> None:
        fields["updated_at"] = datetime.now(UTC)
        await self.db.investigations.update_one(
            {"_id": investigation_id},
            {"$set": fields},
        )

    async def list_investigations(self, limit: int = 50) -> list[Investigation]:
        cursor = self.db.investigations.find().sort("created_at", -1).limit(limit)
        return [self._to_investigation(doc) async for doc in cursor]

    # --- Entities ---

    async def create_entity(self, payload: EntityCreate) -> Entity:
        now = datetime.now(UTC)
        entity_id = str(uuid4())
        doc = {
            "_id": entity_id,
            **payload.model_dump(mode="json"),
            "risk_score": None,
            "risk_level": None,
            "signal_count": 0,
            "analyst_notes": [],
            "created_at": now,
            "updated_at": now,
        }
        await self.db.entities.insert_one(doc)
        return self._to_entity(doc)

    async def get_entity(self, entity_id: str) -> Entity | None:
        doc = await self.db.entities.find_one({"_id": entity_id})
        return self._to_entity(doc) if doc else None

    async def find_entities_by_name(
        self,
        name: str,
        entity_type: str | None = None,
        limit: int = 10,
    ) -> list[Entity]:
        query: dict[str, Any] = {"name": {"$regex": f"^{name}$", "$options": "i"}}
        if entity_type:
            query["entity_type"] = entity_type
        cursor = self.db.entities.find(query).limit(limit)
        results = [self._to_entity(doc) async for doc in cursor]
        if not results:
            fuzzy_query: dict[str, Any] = {"name": {"$regex": name[:20], "$options": "i"}}
            if entity_type:
                fuzzy_query["entity_type"] = entity_type
            cursor = self.db.entities.find(fuzzy_query).limit(limit)
            results = [self._to_entity(doc) async for doc in cursor]
        return results

    async def update_entity(self, entity_id: str, **fields: Any) -> Entity | None:
        fields["updated_at"] = datetime.now(UTC)
        await self.db.entities.update_one({"_id": entity_id}, {"$set": fields})
        return await self.get_entity(entity_id)

    async def add_entity_note(self, entity_id: str, author: str, content: str) -> Entity | None:
        note = {
            "id": str(uuid4()),
            "author": author,
            "content": content,
            "created_at": datetime.now(UTC),
        }
        await self.db.entities.update_one(
            {"_id": entity_id},
            {
                "$push": {"analyst_notes": note},
                "$set": {"updated_at": datetime.now(UTC)},
            },
        )
        return await self.get_entity(entity_id)

    async def list_entities(self, limit: int = 50) -> list[Entity]:
        cursor = (
            self.db.entities.find()
            .sort([("risk_score", -1), ("updated_at", -1)])
            .limit(limit)
        )
        return [self._to_entity(doc) async for doc in cursor]

    # --- Risk signals ---

    async def create_risk_signal(self, payload: RiskSignalCreate) -> RiskSignal:
        now = datetime.now(UTC)
        signal_id = str(uuid4())
        doc = {
            "_id": signal_id,
            **payload.model_dump(mode="json"),
            "created_at": now,
        }
        await self.db.risk_signals.insert_one(doc)
        return self._to_risk_signal(doc)

    async def list_risk_signals_for_entity(self, entity_id: str) -> list[RiskSignal]:
        cursor = self.db.risk_signals.find({"entity_id": entity_id}).sort("created_at", -1)
        return [self._to_risk_signal(doc) async for doc in cursor]

    async def list_risk_signals_for_investigation(
        self,
        investigation_id: str,
    ) -> list[RiskSignal]:
        cursor = self.db.risk_signals.find({"investigation_id": investigation_id}).sort(
            "created_at", -1
        )
        return [self._to_risk_signal(doc) async for doc in cursor]

    # --- Vector / similarity search ---

    async def find_similar_entities(
        self,
        embedding: list[float],
        limit: int | None = None,
        exclude_entity_id: str | None = None,
    ) -> list[dict[str, Any]]:
        limit = limit or self._settings.vector_search_limit

        if self._uses_atlas:
            return await self._atlas_vector_search(embedding, limit, exclude_entity_id)
        return await self._numpy_vector_search(embedding, limit, exclude_entity_id)

    async def _atlas_vector_search(
        self,
        embedding: list[float],
        limit: int,
        exclude_entity_id: str | None,
    ) -> list[dict[str, Any]]:
        pipeline: list[dict[str, Any]] = [
            {
                "$vectorSearch": {
                    "index": "entity_vector_index",
                    "path": "embedding",
                    "queryVector": embedding,
                    "numCandidates": limit * 10,
                    "limit": limit + (1 if exclude_entity_id else 0),
                }
            },
            {
                "$project": {
                    "entity_id": {"$toString": "$_id"},
                    "name": 1,
                    "entity_type": 1,
                    "risk_level": 1,
                    "risk_score": 1,
                    "summary": 1,
                    "similarity": {"$meta": "vectorSearchScore"},
                    "_id": 0,
                }
            },
        ]
        if exclude_entity_id:
            pipeline.append({"$match": {"entity_id": {"$ne": exclude_entity_id}}})
        pipeline.append({"$limit": limit})

        results = []
        try:
            async for doc in self.db.entities.aggregate(pipeline):
                results.append(doc)
        except Exception:
            results = await self._numpy_vector_search(embedding, limit, exclude_entity_id)
        return results

    async def _numpy_vector_search(
        self,
        embedding: list[float],
        limit: int,
        exclude_entity_id: str | None,
    ) -> list[dict[str, Any]]:
        import numpy as np

        query_vec = np.array(embedding, dtype=np.float32)
        query_norm = np.linalg.norm(query_vec)

        cursor = self.db.entities.find(
            {"embedding": {"$exists": True, "$ne": None}},
            {"_id": 1, "name": 1, "entity_type": 1, "risk_level": 1, "risk_score": 1, "summary": 1, "embedding": 1},
        )

        scored: list[tuple[float, dict[str, Any]]] = []
        async for doc in cursor:
            eid = str(doc["_id"])
            if exclude_entity_id and eid == exclude_entity_id:
                continue
            emb = doc.get("embedding")
            if not emb or len(emb) != len(embedding):
                continue
            vec = np.array(emb, dtype=np.float32)
            denom = query_norm * np.linalg.norm(vec)
            if denom == 0:
                continue
            score = float(np.dot(query_vec, vec) / denom)
            scored.append((score, {"entity_id": eid, "name": doc["name"], "entity_type": doc["entity_type"], "risk_level": doc.get("risk_level"), "risk_score": doc.get("risk_score"), "summary": doc.get("summary"), "similarity": score}))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in scored[:limit]]

    async def match_watchlist_seeds(self, text: str, limit: int = 5) -> list[dict[str, Any]]:
        cursor = self.db.watchlist_seeds.find({})
        matches: list[tuple[float, dict[str, Any]]] = []
        text_lower = text.lower()

        async for doc in cursor:
            pattern = doc.get("pattern", "").lower()
            keywords = doc.get("keywords", [])
            score = 0.0
            if pattern and pattern in text_lower:
                score += 0.6
            for kw in keywords:
                if kw.lower() in text_lower:
                    score += 0.15
            if score > 0.14:
                matches.append((score, doc))

        matches.sort(key=lambda x: x[0], reverse=True)
        return [doc for _, doc in matches[:limit]]

    # --- Serialization helpers ---

    def _to_investigation(self, doc: dict[str, Any]) -> Investigation:
        from app.schemas.entity import EntityType
        from app.schemas.investigation import InvestigationResult, InvestigationStep

        steps = [InvestigationStep.model_validate(s) for s in doc.get("steps", [])]
        result = (
            InvestigationResult.model_validate(doc["result"])
            if doc.get("result")
            else None
        )
        return Investigation(
            id=str(doc["_id"]),
            entity_name=doc["entity_name"],
            entity_type=EntityType(doc["entity_type"]),
            context=doc.get("context"),
            status=InvestigationStatus(doc["status"]),
            steps=steps,
            result=result,
            error=doc.get("error"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            metadata=doc.get("metadata", {}),
        )

    def _to_entity(self, doc: dict[str, Any]) -> Entity:
        from app.schemas.entity import Address, EntityType, Identifier

        return Entity(
            id=str(doc["_id"]),
            name=doc["name"],
            entity_type=EntityType(doc["entity_type"]),
            aliases=doc.get("aliases", []),
            identifiers=[Identifier.model_validate(i) for i in doc.get("identifiers", [])],
            addresses=[Address.model_validate(a) for a in doc.get("addresses", [])],
            summary=doc.get("summary"),
            embedding=doc.get("embedding"),
            metadata=doc.get("metadata", {}),
            risk_score=doc.get("risk_score"),
            risk_level=doc.get("risk_level"),
            signal_count=doc.get("signal_count", 0),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            analyst_notes=doc.get("analyst_notes", []),
        )

    def _to_risk_signal(self, doc: dict[str, Any]) -> RiskSignal:
        from app.schemas.risk import RiskLevel, SignalType

        return RiskSignal(
            id=str(doc["_id"]),
            entity_id=doc["entity_id"],
            investigation_id=doc.get("investigation_id"),
            signal_type=SignalType(doc["signal_type"]),
            severity=RiskLevel(doc["severity"]),
            title=doc["title"],
            description=doc["description"],
            confidence=doc["confidence"],
            sources=doc.get("sources", []),
            created_at=doc["created_at"],
        )


_mongodb_service: MongoDBService | None = None


def get_mongodb_service() -> MongoDBService:
    global _mongodb_service
    if _mongodb_service is None:
        _mongodb_service = MongoDBService()
    return _mongodb_service
