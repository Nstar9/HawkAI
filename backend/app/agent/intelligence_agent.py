"""IntelligenceAgent — the core risk analysis engine.

Uses five custom Python tools + MongoDB MCP toolset for ad-hoc Atlas queries.
The MCP server is pre-installed in the Docker image (no runtime npm download).
"""

import os

from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

from app.agent.prompts import INTELLIGENCE_AGENT_INSTRUCTION
from app.agent.tools import (
    classify_and_store_signals,
    extract_and_store_entity,
    find_correlated_entities,
    run_vector_similarity_search,
    synthesize_risk_report,
)
from app.config import get_settings

settings = get_settings()

# Pass credentials to the MCP server process
_mcp_env: dict[str, str] = {**os.environ}
if settings.mongodb_uri:
    _mcp_env["MDB_MCP_CONNECTION_STRING"] = settings.mongodb_uri
if settings.google_api_key:
    _mcp_env["GOOGLE_API_KEY"] = settings.google_api_key

# MongoDB MCP toolset — gives the LLM direct, schema-aware Atlas access.
# Pre-installed at Docker build time so no network download at runtime.
mongodb_mcp_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="mongodb-mcp-server",  # global binary, pre-installed in image
            args=[],
            env=_mcp_env,
        ),
        timeout=60,
    ),
    tool_filter=["find", "aggregate", "insert-one", "update-one", "list-collections"],
)

intelligence_agent = LlmAgent(
    model=settings.gemini_model,
    name="IntelligenceAgent",
    description=(
        "Structures entity profiles, runs vector correlation analysis, classifies risk signals, "
        "and synthesizes final risk reports using custom Python tools and MongoDB Atlas."
    ),
    instruction=INTELLIGENCE_AGENT_INSTRUCTION,
    tools=[
        extract_and_store_entity,
        run_vector_similarity_search,
        find_correlated_entities,
        classify_and_store_signals,
        synthesize_risk_report,
        mongodb_mcp_toolset,  # direct MongoDB access for ad-hoc correlation queries
    ],
    output_key="investigation_result",
)
