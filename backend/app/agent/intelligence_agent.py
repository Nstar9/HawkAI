"""IntelligenceAgent — the core risk analysis engine.

Six-tool pipeline for structured KYC/AML risk analysis stored in MongoDB Atlas.

MongoDB access — dual-driver architecture
------------------------------------------
Tool 0  lookup_entity_via_mcp     — MongoDB MCP Server (ADK MCPToolset +
                                    StdioServerParameters + pre-installed
                                    mongodb-mcp-server binary). Called first on
                                    every investigation to check for an existing
                                    entity profile and enumerate available MCP
                                    operations. Falls back to Motor if the stdio
                                    subprocess is unavailable in Cloud Run.

Tools 1-5  Motor async driver     — Motor provides atomic upserts, change-stream
                                    support, and guaranteed lifecycle in Cloud Run,
                                    which the MCP Server's stateless stdio interface
                                    cannot guarantee across request boundaries.

  Tool 1  extract_and_store_entity      → entities collection  (upsert)
  Tool 2  run_vector_similarity_search  → $vectorSearch aggregation
  Tool 3  find_correlated_entities      → find() by jurisdiction / signal type
  Tool 4  classify_and_store_signals    → risk_signals collection (insert)
  Tool 5  synthesize_risk_report        → investigations collection (update)
"""

from google.adk.agents.llm_agent import LlmAgent

from app.agent.prompts import INTELLIGENCE_AGENT_INSTRUCTION
from app.agent.tools import (
    check_ofac_sanctions,
    classify_and_store_signals,
    extract_and_store_entity,
    find_correlated_entities,
    lookup_entity_via_mcp,
    run_vector_similarity_search,
    synthesize_risk_report,
)
from app.config import get_settings

settings = get_settings()

intelligence_agent = LlmAgent(
    model=settings.gemini_model,
    name="IntelligenceAgent",
    description=(
        "Structures entity profiles, runs vector correlation analysis, classifies risk signals, "
        "and synthesizes final risk reports. Uses MongoDB MCP Server for initial entity lookup "
        "and Motor async driver for all write operations."
    ),
    instruction=INTELLIGENCE_AGENT_INSTRUCTION,
    tools=[
        lookup_entity_via_mcp,        # Step 0a — MCP Server: check existing entity profile
        check_ofac_sanctions,         # Step 0b — MCP Server: screen against OFAC SDN list (17,557 entries)
        extract_and_store_entity,     # Step 1  — Motor upsert entity
        run_vector_similarity_search, # Step 2  — Atlas $vectorSearch
        find_correlated_entities,     # Step 3  — Motor find correlations
        classify_and_store_signals,   # Step 4  — Gemini-2.5-Pro + Motor insert signals
        synthesize_risk_report,       # Step 5  — Gemini-2.5-Pro + Motor update report
    ],
    output_key="investigation_result",
)
