from google.adk.agents.llm_agent import LlmAgent

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
    ],
    output_key="investigation_result",
)
