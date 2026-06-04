from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools import google_search

from app.agent.prompts import (
    RESEARCH_AGENT_INSTRUCTION,
    RESEARCH_AGENT_INSTRUCTION_NO_SEARCH,
)
from app.config import get_settings

settings = get_settings()

# When disable_google_search=true, ResearchAgent uses model knowledge only.
# This is the fallback when Google Search grounding quota is exhausted.
_use_search = not settings.disable_google_search

research_agent = LlmAgent(
    model=settings.gemini_model,
    name="ResearchAgent",
    description=(
        "Gathers open-source intelligence on the target entity via Google Search "
        "and produces a structured intelligence brief."
    ),
    instruction=(
        RESEARCH_AGENT_INSTRUCTION if _use_search
        else RESEARCH_AGENT_INSTRUCTION_NO_SEARCH
    ),
    tools=[google_search] if _use_search else [],
    output_key="research_brief",
)
