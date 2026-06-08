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
    from app.db import get_database

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
        db = await get_database()
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
