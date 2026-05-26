import os

from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools.mcp_tool import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

from app.agent.prompts import INTELLIGENCE_AGENT_INSTRUCTION
from app.agent.tools import (
    classify_and_store_signals,
    extract_and_store_entity,
    run_vector_similarity_search,
    synthesize_risk_report,
)
from app.config import get_settings

settings = get_settings()

_mcp_env: dict[str, str] = {**os.environ}
if settings.mongodb_uri:
    _mcp_env["MDB_MCP_CONNECTION_STRING"] = settings.mongodb_uri
if settings.google_api_key:
    _mcp_env["GOOGLE_API_KEY"] = settings.google_api_key

mongodb_mcp_toolset = McpToolset(
    connection_params=StdioConnectionParams(
        server_params=StdioServerParameters(
            command="npx",
            args=["-y", "mongodb-mcp-server@latest"],
            env=_mcp_env,
        ),
        timeout=120,
    ),
    tool_filter=[
        "find",
        "insert-one",
        "insert-many",
        "update-one",
        "aggregate",
        "list-collections",
    ],
)

intelligence_agent = LlmAgent(
    model=settings.gemini_model,
    name="IntelligenceAgent",
    description=(
        "Structures entity profiles, runs vector correlation analysis, classifies risk signals, "
        "and synthesizes final risk reports using MongoDB MCP and custom Gemini-powered tools."
    ),
    instruction=INTELLIGENCE_AGENT_INSTRUCTION,
    tools=[
        mongodb_mcp_toolset,
        extract_and_store_entity,
        run_vector_similarity_search,
        classify_and_store_signals,
        synthesize_risk_report,
    ],
    output_key="investigation_result",
)
