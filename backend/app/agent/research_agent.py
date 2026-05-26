from google.adk.agents.llm_agent import LlmAgent
from google.adk.tools import google_search

from app.agent.prompts import RESEARCH_AGENT_INSTRUCTION
from app.config import get_settings

settings = get_settings()

research_agent = LlmAgent(
    model=settings.gemini_model,
    name="ResearchAgent",
    description="Gathers open-source web intelligence via Google Search.",
    instruction=RESEARCH_AGENT_INSTRUCTION,
    tools=[google_search],
    output_key="research_brief",
)
