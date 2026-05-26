#!/usr/bin/env python3
"""
Seed HawkAI MongoDB with demo entities for hackathon presentation.

Usage (from repo root):
    cd backend
    python ../scripts/seed_demo.py

Set MONGODB_URI and GOOGLE_API_KEY env vars or create a .env file first.
"""
import asyncio
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "gemini-embedding-001")
EMBEDDING_DIMS = 768


async def compute_embedding(text: str) -> list[float]:
    from google import genai
    from google.genai import types as genai_types
    client = genai.Client(api_key=GOOGLE_API_KEY)
    result = await client.aio.models.embed_content(
        model=EMBEDDING_MODEL,
        contents=text[:3000],
        config=genai_types.EmbedContentConfig(output_dimensionality=EMBEDDING_DIMS),
    )
    return list(result.embeddings[0].values)


DEMO_ENTITIES = [
    {
        "id": "meridian-trade-solutions-001",
        "name": "Meridian Trade Solutions Ltd",
        "entity_type": "company",
        "aliases": ["MTS Ltd", "Meridian Trade"],
        "summary": (
            "Meridian Trade Solutions Ltd is a British Virgin Islands-registered trading company "
            "with no verifiable physical operations. Its sole director shares a registered address "
            "with 11 other shell companies, two of which appeared in a 2023 SEC enforcement action. "
            "Wire transfers totaling $4.2M were routed through the entity to accounts in sanctioned jurisdictions."
        ),
        "risk_score": 91.0,
        "risk_level": "critical",
        "signal_count": 5,
        "metadata": {
            "key_facts": [
                "Registered in BVI with nominee director",
                "Registered address shared with 11 other companies",
                "Two co-located companies in 2023 SEC enforcement",
                "$4.2M wire transfers to sanctioned jurisdictions",
                "No employees or physical operations verified"
            ],
            "adverse_findings": [
                "Co-located entities subject to SEC enforcement action (2023)",
                "Wire transfers to accounts in sanctioned jurisdictions",
                "Director is professional nominee with 300+ other directorships",
                "No verifiable business operations or clients"
            ],
            "jurisdiction": "British Virgin Islands",
            "industry": "Trading / Financial Services",
        },
        "embedding_text": (
            "Meridian Trade Solutions Ltd BVI shell company nominee director SEC enforcement "
            "sanctioned jurisdiction wire fraud money laundering offshore high risk"
        ),
        "signals": [
            {
                "signal_type": "governance",
                "severity": "critical",
                "title": "BVI shell company with nominee director",
                "description": "Entity registered in BVI using a professional nominee director with 300+ other directorships — no substance or genuine ownership disclosed.",
                "confidence": 0.95,
                "sources": ["Companies House BVI Registry"],
            },
            {
                "signal_type": "reputational",
                "severity": "critical",
                "title": "Co-location with SEC enforcement targets",
                "description": "Entity shares registered address with 2 companies named in 2023 SEC enforcement action for market manipulation.",
                "confidence": 0.91,
                "sources": ["SEC EDGAR Enforcement Actions 2023"],
            },
            {
                "signal_type": "sanctions",
                "severity": "critical",
                "title": "Wire transfers to sanctioned jurisdictions",
                "description": "$4.2M in wire transfers routed through entity to correspondent accounts in OFAC-sanctioned jurisdictions over 18 months.",
                "confidence": 0.88,
                "sources": ["SWIFT transaction analysis", "FinCEN SAR database"],
            },
            {
                "signal_type": "governance",
                "severity": "high",
                "title": "Address reuse network — 11 co-located companies",
                "description": "Registered agent address shared with 11 other companies across 7 jurisdictions, a pattern consistent with mass shell company incorporation.",
                "confidence": 0.93,
                "sources": ["BVI Registry cross-reference"],
            },
            {
                "signal_type": "fraud",
                "severity": "high",
                "title": "No verifiable business operations",
                "description": "Despite claiming to be an active trading company, no clients, contracts, employees, or physical premises can be verified.",
                "confidence": 0.85,
                "sources": ["OSINT investigation", "LinkedIn", "Companies House"],
            },
        ],
        "investigation": {
            "report": {
                "executive_summary": (
                    "Meridian Trade Solutions Ltd presents CRITICAL financial crime risk. "
                    "The entity exhibits the hallmarks of a shell company used for illicit fund flows: "
                    "BVI incorporation with a professional nominee director, address sharing with SEC-enforcement-adjacent entities, "
                    "and documented wire transfers to sanctioned jurisdictions totaling $4.2M. "
                    "Onboarding this entity would expose the institution to severe regulatory and reputational harm."
                ),
                "key_findings": [
                    "BVI registration with professional nominee director holding 300+ directorships — no genuine beneficial ownership disclosed",
                    "Registered address shared with 11 companies; 2 co-located entities named in 2023 SEC market manipulation enforcement action",
                    "$4.2M wire transfers routed to OFAC-sanctioned jurisdiction correspondent accounts over 18 months",
                    "No employees, physical premises, clients, or verifiable business operations identified",
                    "Vector similarity search matched 94% cosine similarity to known SDN-adjacent entity profile in intelligence database",
                ],
                "recommendations": [
                    "Do NOT onboard — decline relationship immediately",
                    "File Suspicious Activity Report (SAR) with FinCEN citing potential structuring and sanctions evasion",
                    "Freeze any existing accounts and notify BSA compliance officer",
                ],
            }
        },
    },
    {
        "id": "shopify-inc-001",
        "name": "Shopify Inc",
        "entity_type": "company",
        "aliases": ["Shopify", "SHOP"],
        "summary": (
            "Shopify Inc is a publicly traded Canadian multinational e-commerce company "
            "headquartered in Ottawa, Ontario. Listed on NYSE and TSX under ticker SHOP. "
            "Founded in 2006, the company provides e-commerce platforms for over 4 million businesses worldwide. "
            "No adverse regulatory, sanctions, or financial crime risk identified."
        ),
        "risk_score": 4.5,
        "risk_level": "low",
        "signal_count": 0,
        "metadata": {
            "key_facts": [
                "NYSE/TSX listed (SHOP)",
                "Ottawa, Ontario Canada — regulated market",
                "4M+ merchant customers globally",
                "Audited financial statements — no material concerns",
                "No regulatory enforcement or sanctions history"
            ],
            "adverse_findings": [],
            "jurisdiction": "Canada",
            "industry": "E-commerce / Technology",
        },
        "embedding_text": (
            "Shopify Inc public company NYSE TSX SHOP Canada e-commerce technology "
            "clean regulated listed no adverse findings low risk"
        ),
        "signals": [],
        "investigation": {
            "report": {
                "executive_summary": (
                    "Shopify Inc presents LOW financial crime risk and is cleared for standard onboarding. "
                    "The entity is a publicly traded company with transparent ownership, audited financials, "
                    "and no adverse regulatory, sanctions, or financial crime history. "
                    "Standard periodic monitoring is appropriate."
                ),
                "key_findings": [
                    "Publicly traded on NYSE and TSX (ticker: SHOP) — highest transparency standard",
                    "Regulated under Canadian and US securities law with regular SEC/SEDAR filings",
                    "No OFAC, EU, UN, or HMT sanctions matches identified",
                    "No regulatory enforcement actions, material litigation, or fraud allegations",
                    "Audited annual financial statements filed — no material going-concern issues",
                ],
                "recommendations": [
                    "Clear for standard onboarding — no enhanced due diligence required",
                    "Apply standard periodic monitoring schedule (annual KYC refresh)",
                ],
            }
        },
    },
    {
        "id": "alpine-capital-partners-001",
        "name": "Alpine Capital Partners LLC",
        "entity_type": "fund",
        "aliases": ["Alpine Capital", "ACP Fund"],
        "summary": (
            "Alpine Capital Partners LLC is a Delaware-registered private equity fund claiming $280M AUM. "
            "The fund manager has a prior SEC enforcement action for misleading investors, "
            "and the fund has not filed required Form ADV disclosures in 18 months. "
            "Multiple former investors have filed civil suits alleging misrepresentation of returns."
        ),
        "risk_score": 72.0,
        "risk_level": "high",
        "signal_count": 3,
        "metadata": {
            "key_facts": [
                "Delaware LLC, $280M claimed AUM",
                "Manager has prior SEC enforcement (2019)",
                "Form ADV not filed in 18 months",
                "3 civil investor lawsuits pending"
            ],
            "adverse_findings": [
                "Fund manager fined $450K by SEC in 2019 for misleading investors on fee structures",
                "Form ADV registration lapsed — not filed for 18 months",
                "Three civil suits by investors alleging misrepresentation of fund performance"
            ],
            "jurisdiction": "United States",
            "industry": "Private Equity / Fund Management",
        },
        "embedding_text": (
            "Alpine Capital Partners private equity fund SEC enforcement misleading investors "
            "Form ADV lapsed civil suits misrepresentation regulatory violation high risk"
        ),
        "signals": [
            {
                "signal_type": "regulatory",
                "severity": "high",
                "title": "Fund manager prior SEC enforcement action",
                "description": "Fund manager fined $450,000 by SEC in 2019 for misleading investors on fee disclosure and performance attribution.",
                "confidence": 0.95,
                "sources": ["SEC EDGAR Enforcement Actions", "In the Matter of Alpine Capital Partners (2019)"],
            },
            {
                "signal_type": "regulatory",
                "severity": "high",
                "title": "Form ADV registration lapsed",
                "description": "Investment adviser registration (Form ADV) has not been updated in 18 months, a potential violation of Investment Advisers Act Section 204.",
                "confidence": 0.90,
                "sources": ["SEC IAPD database", "EDGAR search"],
            },
            {
                "signal_type": "litigation",
                "severity": "medium",
                "title": "Three pending investor civil lawsuits",
                "description": "Three former investors have filed civil suits in Delaware Chancery Court alleging misrepresentation of fund performance and undisclosed fees.",
                "confidence": 0.82,
                "sources": ["Delaware Chancery Court filings", "Pacer"],
            },
        ],
        "investigation": {
            "report": {
                "executive_summary": (
                    "Alpine Capital Partners LLC presents HIGH financial crime risk requiring enhanced due diligence before any engagement. "
                    "The fund manager has a documented history of SEC enforcement, regulatory filings are lapsed, "
                    "and multiple civil investor suits are pending. These indicators suggest ongoing compliance deficiencies "
                    "and elevated risk of investor harm."
                ),
                "key_findings": [
                    "Fund manager hit with $450K SEC fine in 2019 for misleading investors on fees and performance",
                    "Form ADV investment adviser registration lapsed for 18 months — possible securities law violation",
                    "Three civil investor lawsuits pending in Delaware Chancery Court alleging misrepresentation",
                    "No recent audited financial statements filed — claimed $280M AUM unverified",
                ],
                "recommendations": [
                    "Do not engage without completing enhanced due diligence",
                    "Obtain audited fund financials and current Form ADV before any investment decision",
                    "Escalate to senior compliance officer for independent review",
                ],
            }
        },
    },
]


async def seed_entity(db, entity_data: dict) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    print(f"\nSeeding: {entity_data['name']}...")

    if not GOOGLE_API_KEY:
        print("  WARNING: No GOOGLE_API_KEY — generating zero embedding as placeholder")
        embedding = [0.0] * 768
    else:
        print(f"  Computing embedding via {EMBEDDING_MODEL}...")
        embedding = await compute_embedding(entity_data["embedding_text"])
        print(f"  Embedding computed: {len(embedding)} dims")

    now = datetime.now(UTC)
    entity_id = entity_data["id"]

    entity_doc = {
        "_id": entity_id,
        "name": entity_data["name"],
        "entity_type": entity_data["entity_type"],
        "aliases": entity_data["aliases"],
        "identifiers": [],
        "addresses": [],
        "summary": entity_data["summary"],
        "embedding": embedding,
        "risk_score": entity_data["risk_score"],
        "risk_level": entity_data["risk_level"],
        "signal_count": entity_data["signal_count"],
        "analyst_notes": [],
        "metadata": entity_data["metadata"],
        "created_at": now,
        "updated_at": now,
    }

    await db.entities.replace_one({"_id": entity_id}, entity_doc, upsert=True)
    print(f"  Entity stored: {entity_id}")

    signals = entity_data.get("signals", [])
    investigation_id = f"demo-{entity_id}"
    for sig in signals:
        signal_doc = {
            "_id": str(uuid4()),
            "entity_id": entity_id,
            "investigation_id": investigation_id,
            "signal_type": sig["signal_type"],
            "severity": sig["severity"],
            "title": sig["title"],
            "description": sig["description"],
            "confidence": sig["confidence"],
            "sources": sig.get("sources", []),
            "created_at": now,
        }
        await db.risk_signals.insert_one(signal_doc)
    print(f"  {len(signals)} risk signals stored")

    inv_report = entity_data.get("investigation", {}).get("report", {})
    if inv_report:
        risk_report = {
            "overall_risk_score": entity_data["risk_score"],
            "risk_level": entity_data["risk_level"],
            "executive_summary": inv_report.get("executive_summary", ""),
            "key_findings": inv_report.get("key_findings", []),
            "recommendations": inv_report.get("recommendations", []),
            "correlated_entities": [],
        }
        signals_for_result = []
        async for sig_doc in db.risk_signals.find({"investigation_id": investigation_id}):
            sig_doc["id"] = sig_doc.pop("_id")
            signals_for_result.append(sig_doc)

        inv_doc = {
            "_id": investigation_id,
            "entity_name": entity_data["name"],
            "entity_type": entity_data["entity_type"],
            "context": "Pre-seeded demo investigation",
            "status": "completed",
            "steps": [
                {"name": "research", "status": "completed", "message": "Pre-seeded", "started_at": now, "completed_at": now},
                {"name": "intelligence", "status": "completed", "message": "Pre-seeded", "started_at": now, "completed_at": now},
                {"name": "complete", "status": "completed", "message": "Pre-seeded", "started_at": now, "completed_at": now},
            ],
            "result": {
                "entity_id": entity_id,
                "report": risk_report,
                "signals": signals_for_result,
            },
            "error": None,
            "created_at": now,
            "updated_at": now,
            "metadata": {"seeded": True},
        }
        await db.investigations.replace_one({"_id": investigation_id}, inv_doc, upsert=True)
        print(f"  Demo investigation stored: {investigation_id}")

    print(f"  Done: {entity_data['name']} [{entity_data['risk_level'].upper()} RISK]")


async def main() -> None:
    import certifi
    from motor.motor_asyncio import AsyncIOMotorClient

    print(f"Connecting to MongoDB: {MONGODB_URI[:40]}...")
    client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=10_000, tlsCAFile=certifi.where())

    try:
        await client.admin.command("ping")
        print("MongoDB connected.")
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        sys.exit(1)

    db = client["hawkai"]

    seed_path = Path(__file__).resolve().parents[1] / "backend" / "data" / "watchlist_seeds.json"
    existing_seeds = await db.watchlist_seeds.count_documents({})
    if existing_seeds == 0 and seed_path.exists():
        seeds = json.loads(seed_path.read_text())
        await db.watchlist_seeds.insert_many(seeds)
        print(f"Watchlist seeds loaded: {len(seeds)} patterns")
    else:
        print(f"Watchlist seeds already loaded ({existing_seeds} patterns)")

    for entity in DEMO_ENTITIES:
        await seed_entity(db, entity)

    count = await db.entities.count_documents({})
    inv_count = await db.investigations.count_documents({})
    sig_count = await db.risk_signals.count_documents({})

    print(f"\nSeeding complete!")
    print(f"  Entities: {count}")
    print(f"  Investigations: {inv_count}")
    print(f"  Risk signals: {sig_count}")
    print("\nDemo entities ready:")
    print("  'Meridian Trade Solutions Ltd' — CRITICAL risk (demo: 45-second investigation)")
    print("  'Shopify Inc' — LOW risk (demo: system correctly clears clean entities)")
    print("  'Alpine Capital Partners LLC' — HIGH risk (demo: regulatory violation case)")
    client.close()


if __name__ == "__main__":
    asyncio.run(main())
