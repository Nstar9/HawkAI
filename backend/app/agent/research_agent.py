import os

from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools import google_search

from app.agent.prompts import RESEARCH_AGENT_INSTRUCTION, RESEARCH_AGENT_INSTRUCTION_NO_SEARCH
from app.config import get_settings

settings = get_settings()

# When DISABLE_GOOGLE_SEARCH=true (set if grounding quota is exhausted),
# the ResearchAgent uses model knowledge only — no live web search.
_use_search = os.environ.get("DISABLE_GOOGLE_SEARCH", "false").lower() != "true"

research_agent = LlmAgent(
    model=settings.gemini_model,
    name="ResearchAgent",
    description="Gathers open-source web intelligence on the target entity.",
    instruction=RESEARCH_AGENT_INSTRUCTION if _use_search else RESEARCH_AGENT_INSTRUCTION_NO_SEARCH,
    tools=[google_search] if _use_search else [],
    output_key="research_brief",
)
