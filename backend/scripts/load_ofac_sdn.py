#!/usr/bin/env python3
"""One-time loader: OFAC SDN list → MongoDB Atlas sanctions_lists collection.

Usage:
    cd backend
    python scripts/load_ofac_sdn.py /path/to/sdn.csv

Downloads:
    https://www.treasury.gov/ofac/downloads/sdn.csv
"""

from __future__ import annotations

import asyncio
import csv
import os
import sys
from pathlib import Path

# Allow running from backend/ directory
sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

import certifi
import motor.motor_asyncio

MONGODB_URI = os.getenv("MONGODB_URI", "")
MONGODB_DATABASE = os.getenv("MONGODB_DATABASE", "hawkai")

VESSEL_TYPES = {
    "cargo", "pleasure", "military", "patrol", "tug", "fishing",
    "container", "tanker", "bulk", "ferry", "barge", "vessel",
    "oil", "chemical", "lng", "lpg", "drybulk", "highspeed",
    "special", "refrigerated",
}


def _clean(val: str) -> str | None:
    """Strip quotes/whitespace; return None for -0- placeholder."""
    v = val.strip().strip('"').strip("'").strip()
    return None if v in ("-0-", "", "N/A") else v


def _is_vessel(sdn_type: str | None) -> bool:
    """Return True if row represents a vessel, not a person or entity."""
    if sdn_type is None:
        return False
    return sdn_type.lower() in VESSEL_TYPES


async def load_sdn(csv_path: str) -> None:
    print(f"Connecting to MongoDB ({MONGODB_DATABASE})...")
    client = motor.motor_asyncio.AsyncIOMotorClient(
        MONGODB_URI, tlsCAFile=certifi.where()
    )
    db = client[MONGODB_DATABASE]

    print("Dropping existing sanctions_lists collection...")
    await db.sanctions_lists.drop()

    docs: list[dict] = []
    skipped = 0

    with open(csv_path, encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) < 4:
                skipped += 1
                continue

            name     = _clean(row[1])
            sdn_type = _clean(row[2])
            program  = _clean(row[3])
            title    = _clean(row[4]) if len(row) > 4 else None
            remarks  = _clean(row[11]) if len(row) > 11 else None

            if not name:
                skipped += 1
                continue

            # Skip vessels — irrelevant for KYC entity screening
            if _is_vessel(sdn_type):
                skipped += 1
                continue

            # Normalise type: "individual" | "entity"
            etype = "individual" if sdn_type and sdn_type.lower() == "individual" else "entity"

            # Build searchable tokens for partial name matching
            # SDN names are in "LAST, FIRST MIDDLE" format — also store reversed
            name_clean = name.replace(",", " ").lower()
            tokens = [t for t in name_clean.split() if len(t) > 1]

            docs.append({
                "ent_num":      _clean(row[0]),
                "name":         name,
                "name_lower":   name.lower(),
                "name_tokens":  tokens,
                "sdn_type":     etype,
                "program":      program or "UNKNOWN",
                "title":        title,
                "remarks":      remarks,
                "source":       "OFAC_SDN",
            })

    if not docs:
        print("No documents parsed — check the CSV path.")
        client.close()
        return

    print(f"Parsed {len(docs)} entries ({skipped} skipped — vessels/empty rows).")
    print("Inserting into MongoDB (batches of 500)...")

    batch_size = 500
    inserted = 0
    for i in range(0, len(docs), batch_size):
        batch = docs[i : i + batch_size]
        result = await db.sanctions_lists.insert_many(batch)
        inserted += len(result.inserted_ids)
        print(f"  {inserted}/{len(docs)} inserted...", end="\r")

    print(f"\nAll {inserted} documents inserted.")

    print("Creating indexes...")
    # Text index for full-text search
    await db.sanctions_lists.create_index(
        [("name", "text"), ("title", "text"), ("remarks", "text")],
        name="sdn_fulltext",
    )
    # Exact lower-case match
    await db.sanctions_lists.create_index([("name_lower", 1)], name="sdn_name_lower")
    # Token array index for partial matching
    await db.sanctions_lists.create_index([("name_tokens", 1)], name="sdn_tokens")
    # Program filter
    await db.sanctions_lists.create_index([("program", 1)], name="sdn_program")

    print("Indexes created.")

    # Quick sanity check
    total = await db.sanctions_lists.count_documents({})
    sample = await db.sanctions_lists.find_one({"program": "SDGT"})
    print(f"\nVerification: {total} total documents in sanctions_lists.")
    if sample:
        print(f"Sample SDGT entry: {sample['name']} ({sample['sdn_type']})")

    client.close()
    print("\nDone. sanctions_lists collection is ready.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/load_ofac_sdn.py /path/to/sdn.csv")
        sys.exit(1)

    csv_path = sys.argv[1]
    if not Path(csv_path).exists():
        print(f"File not found: {csv_path}")
        sys.exit(1)

    asyncio.run(load_sdn(csv_path))
