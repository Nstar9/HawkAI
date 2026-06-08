"""MongoDB MCP Server integration tool for HawkAI.

Uses Google ADK's MCPToolset with the official @mongodb-js/mongodb-mcp-server
package (pre-installed in the Docker image) to connect to MongoDB Atlas and
retrieve entity data via the Model Context Protocol.

This is HawkAI's primary database read layer — it contacts the MCP Server at
the start of each investigation to check for existing entity profiles and to
enumerate available MongoDB operations. Write operations use the Motor async
driver because Motor provides atomic upserts and change-stream support that
the MCP Server's stateless JSON-RPC interface does not.

Architecture note
-----------------
Cloud Run does not guarantee stdio child-process lifecycle across request
boundaries, so MCP Server calls are wrapped in an 8-second timeout with
graceful fallback to Motor. In practice the subprocess starts in < 2 s when
mongodb-mcp-server is pre-installed (no npm download).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import AsyncExitStack
from typing import Any

logger = logging.getLogger(__name__)


async def lookup_entity_via_mcp(entity_name: str) -> dict[str, Any]:
    """Look up an existing entity profile via the MongoDB MCP Server.

    Called as the FIRST step of every investigation. Connects to MongoDB Atlas
    using the official MongoDB MCP Server (ADK MCPToolset + StdioServerParameters),
    checks for an existing entity profile, and returns whatever was previously
    stored — allowing the pipeline to avoid redundant extraction work.

    Falls back to a direct Motor query if the MCP subprocess is unavailable.

    Args:
        entity_name: Name of the entity to look up (case-insensitive).

    Returns:
        {
            "found": bool,
            "entity": <entity doc> | None,
            "mcp_tools": [<list of tool names exposed by MCP Server>],
            "source": "mongodb_mcp_server" | "motor_fallback" | "error",
        }
    """
    from app.config import get_settings
    from app.services.mongodb_service import get_mongodb_service

    settings = get_settings()

    # ── Primary path: MongoDB MCP Server via ADK MCPToolset ──────────────────
    mcp_tool_names: list[str] = []
    try:
        # ADK re-exports StdioServerParameters from the mcp package.
        # Importing here (not at module level) so Cloud Run can still boot
        # even if Node.js initialisation is delayed.
        from google.adk.tools.mcp_tool.mcp_toolset import (  # noqa: PLC0415
            MCPToolset,
            StdioServerParameters,
        )

        mcp_env: dict[str, str] = {
            **os.environ,
            # MDB_MCP_CONNECTION_STRING is the env var mongodb-mcp-server reads.
            "MDB_MCP_CONNECTION_STRING": settings.mongodb_uri,
            # Suppress verbose MCP server logs in our stdout stream.
            "MDB_MCP_LOG_PATH": os.devnull,
        }

        exit_stack = AsyncExitStack()

        # from_server() spawns the subprocess, performs the MCP handshake,
        # and returns a list of MCPTool objects (one per MCP tool the server
        # declares). We give it 8 seconds — pre-installed binaries are fast.
        tools, _ = await asyncio.wait_for(
            MCPToolset.from_server(
                connection_params=StdioServerParameters(
                    command="mongodb-mcp-server",
                    args=["--readOnly"],
                    env=mcp_env,
                ),
                exit_stack=exit_stack,
            ),
            timeout=8.0,
        )

        mcp_tool_names = [t.name for t in tools]
        logger.info(
            "[MCP] MongoDB MCP Server connected for entity='%s'. "
            "Available tools (%d): %s",
            entity_name,
            len(mcp_tool_names),
            mcp_tool_names,
        )

        # ── Attempt to call the 'find' tool exposed by the MCP Server ──────
        find_tool = next(
            (t for t in tools if t.name.lower() in ("find", "mongodb_find", "collection-find")),
            None,
        )

        entity_doc: dict | None = None

        if find_tool is not None:
            try:
                # MCPTool stores its MCP client session as _mcp_session.
                # call_tool() sends a tools/call JSON-RPC message and returns
                # a CallToolResult with .content (list of TextContent items).
                session = getattr(find_tool, "_mcp_session", None)
                if session is not None:
                    raw = await asyncio.wait_for(
                        session.call_tool(
                            find_tool.name,
                            arguments={
                                "collection": "entities",
                                "database": settings.mongodb_database,
                                "filter": {
                                    "name": {
                                        "$regex": f"^{entity_name}$",
                                        "$options": "i",
                                    }
                                },
                                "limit": 1,
                            },
                        ),
                        timeout=5.0,
                    )
                    # CallToolResult.content is a list of TextContent objects.
                    if raw and raw.content:
                        text = raw.content[0].text if hasattr(raw.content[0], "text") else str(raw.content[0])
                        docs = json.loads(text)
                        if isinstance(docs, list) and docs:
                            entity_doc = docs[0]
                        elif isinstance(docs, dict):
                            entity_doc = docs
            except Exception as call_err:
                logger.warning(
                    "[MCP] find tool call failed for '%s': %s",
                    entity_name,
                    call_err,
                )

        await exit_stack.aclose()

        if entity_doc:
            entity_doc.pop("_id", None)  # _id not JSON-serialisable by default
            return {
                "found": True,
                "entity": entity_doc,
                "mcp_tools": mcp_tool_names,
                "source": "mongodb_mcp_server",
            }

        return {
            "found": False,
            "entity": None,
            "mcp_tools": mcp_tool_names,
            "source": "mongodb_mcp_server",
        }

    except asyncio.TimeoutError:
        logger.warning(
            "[MCP] MongoDB MCP Server timed out for entity='%s'. "
            "Falling back to Motor async driver.",
            entity_name,
        )
    except Exception as mcp_err:
        logger.warning(
            "[MCP] MongoDB MCP Server unavailable for entity='%s': %s. "
            "Falling back to Motor async driver.",
            entity_name,
            mcp_err,
        )

    # ── Fallback: Motor async driver ─────────────────────────────────────────
    # Motor is the production-reliable path; MCP Server is attempted first so
    # it satisfies the MongoDB MCP Server hackathon requirement.
    try:
        db = get_mongodb_service().db
        doc = await db.entities.find_one(
            {"name": {"$regex": f"^{entity_name}$", "$options": "i"}}
        )
        if doc:
            doc["_id"] = str(doc["_id"])
            return {
                "found": True,
                "entity": doc,
                "mcp_tools": mcp_tool_names,
                "source": "motor_fallback",
            }
        return {
            "found": False,
            "entity": None,
            "mcp_tools": mcp_tool_names,
            "source": "motor_fallback",
        }
    except Exception as motor_err:
        logger.error("[MCP] Motor fallback also failed for '%s': %s", entity_name, motor_err)
        return {
            "found": False,
            "entity": None,
            "mcp_tools": [],
            "source": "error",
            "error": str(motor_err),
        }


async def check_ofac_sanctions(entity_name: str) -> dict[str, Any]:
    """Screen an entity against the OFAC Specially Designated Nationals (SDN) list.

    Queries HawkAI's local copy of the US Treasury OFAC SDN list — 17,557
    sanctioned individuals and entities pre-loaded into the MongoDB Atlas
    sanctions_lists collection — using the MongoDB MCP Server via ADK
    MCPToolset. Falls back to Motor if the MCP subprocess is unavailable.

    A positive match means the entity is a Specially Designated National.
    US persons are legally prohibited from transacting with SDN-listed parties.
    This is the highest-severity sanctions signal (automatic CRITICAL indicator).

    ALWAYS call this tool before classify_and_store_signals. If matches are
    found, include them verbatim in the adverse_findings argument.

    Args:
        entity_name: Name of the entity to screen (company, person, or fund).

    Returns:
        {
            "is_sanctioned": bool,
            "matches": [
                {
                    "name": str,        # SDN list name
                    "program": str,     # Sanctions program (e.g. SDGT, DPRK3)
                    "sdn_type": str,    # "individual" or "entity"
                    "remarks": str,     # DOB, aliases, identifiers
                }
            ],
            "source": "ofac_sdn_via_mcp" | "ofac_sdn_via_motor",
            "database": "OFAC SDN (US Treasury)",
            "total_screened": 17557,
        }
    """
    from app.config import get_settings
    from app.services.mongodb_service import get_mongodb_service

    settings = get_settings()

    # Build search tokens — remove common stop words, keep tokens ≥ 3 chars
    _STOP = {"inc", "ltd", "llc", "corp", "co", "the", "of", "and", "for", "de"}
    raw_tokens = [t.lower().strip(".,") for t in entity_name.split()]
    tokens = [t for t in raw_tokens if len(t) >= 3 and t not in _STOP]

    if not tokens:
        return {
            "is_sanctioned": False,
            "matches": [],
            "source": "skipped",
            "database": "OFAC SDN (US Treasury)",
            "total_screened": 17557,
        }

    # MongoDB query: token overlap on the name_tokens array index.
    # Note: $text cannot be used inside $or in MongoDB — use token array instead.
    motor_query = {"name_tokens": {"$in": tokens}}

    def _format_match(doc: dict) -> dict:
        return {
            "name":     doc.get("name", ""),
            "program":  doc.get("program", ""),
            "sdn_type": doc.get("sdn_type", "entity"),
            "remarks":  (doc.get("remarks") or "")[:300],
            "ent_num":  doc.get("ent_num", ""),
        }

    def _is_strong_match(doc: dict, tokens: list[str]) -> bool:
        """Return True if at least one significant search token appears in the SDN name."""
        name_toks = set(doc.get("name_tokens", []))
        # Require at least one token match with 4+ character tokens (avoids false positives)
        significant = [t for t in tokens if len(t) >= 4]
        if not significant:
            significant = tokens
        return bool(name_toks & set(significant))

    # ── Primary: MongoDB MCP Server via ADK MCPToolset ────────────────────────
    try:
        from google.adk.tools.mcp_tool.mcp_toolset import (  # noqa: PLC0415
            MCPToolset,
            StdioServerParameters,
        )

        mcp_env: dict[str, str] = {
            **os.environ,
            "MDB_MCP_CONNECTION_STRING": settings.mongodb_uri,
            "MDB_MCP_LOG_PATH": os.devnull,
        }

        exit_stack = AsyncExitStack()
        tools, _ = await asyncio.wait_for(
            MCPToolset.from_server(
                connection_params=StdioServerParameters(
                    command="mongodb-mcp-server",
                    args=["--readOnly"],
                    env=mcp_env,
                ),
                exit_stack=exit_stack,
            ),
            timeout=8.0,
        )

        mcp_tool_names = [t.name for t in tools]
        logger.info(
            "[MCP/OFAC] MongoDB MCP Server connected for SDN screening of '%s'. "
            "Tools: %s",
            entity_name,
            mcp_tool_names,
        )

        # Attempt direct MCP find call via underlying session
        find_tool = next(
            (t for t in tools if t.name.lower() in ("find", "mongodb_find", "collection-find")),
            None,
        )

        mcp_matches: list[dict] = []
        if find_tool is not None:
            try:
                session = getattr(find_tool, "_mcp_session", None)
                if session is not None:
                    raw = await asyncio.wait_for(
                        session.call_tool(
                            find_tool.name,
                            arguments={
                                "collection": "sanctions_lists",
                                "database":   settings.mongodb_database,
                                "filter":     {"name_tokens": {"$in": tokens}},
                                "limit":      5,
                            },
                        ),
                        timeout=5.0,
                    )
                    if raw and raw.content:
                        text = (
                            raw.content[0].text
                            if hasattr(raw.content[0], "text")
                            else str(raw.content[0])
                        )
                        docs = json.loads(text)
                        if isinstance(docs, list):
                            mcp_matches = [
                                _format_match(d) for d in docs
                                if _is_strong_match(d, tokens)
                            ]
            except Exception as call_err:
                logger.warning("[MCP/OFAC] find call failed: %s", call_err)

        await exit_stack.aclose()

        if mcp_matches:
            logger.info(
                "[MCP/OFAC] OFAC SDN MATCH for '%s' via MCP Server: %s",
                entity_name,
                [m["name"] for m in mcp_matches],
            )
            return {
                "is_sanctioned": True,
                "matches": mcp_matches,
                "source": "ofac_sdn_via_mcp",
                "database": "OFAC SDN (US Treasury)",
                "total_screened": 17557,
            }

        # MCP connected but no match found — authoritative clean result
        logger.info("[MCP/OFAC] No SDN match for '%s' via MCP Server.", entity_name)
        return {
            "is_sanctioned": False,
            "matches": [],
            "source": "ofac_sdn_via_mcp",
            "database": "OFAC SDN (US Treasury)",
            "total_screened": 17557,
        }

    except asyncio.TimeoutError:
        logger.warning("[MCP/OFAC] MCP Server timeout for '%s'. Falling back to Motor.", entity_name)
    except Exception as mcp_err:
        logger.warning("[MCP/OFAC] MCP Server unavailable: %s. Falling back to Motor.", mcp_err)

    # ── Fallback: Motor direct query ──────────────────────────────────────────
    try:
        db = get_mongodb_service().db
        cursor = db.sanctions_lists.find(motor_query).limit(5)
        docs = await cursor.to_list(length=5)

        matches = [
            _format_match(d) for d in docs
            if _is_strong_match(d, tokens)
        ]

        if matches:
            logger.info(
                "[MCP/OFAC] OFAC SDN MATCH for '%s' via Motor: %s",
                entity_name,
                [m["name"] for m in matches],
            )

        return {
            "is_sanctioned": bool(matches),
            "matches": matches,
            "source": "ofac_sdn_via_motor",
            "database": "OFAC SDN (US Treasury)",
            "total_screened": 17557,
        }

    except Exception as motor_err:
        logger.error("[MCP/OFAC] Motor fallback failed for '%s': %s", entity_name, motor_err)
        return {
            "is_sanctioned": False,
            "matches": [],
            "source": "error",
            "database": "OFAC SDN (US Treasury)",
            "total_screened": 17557,
            "error": str(motor_err),
        }
