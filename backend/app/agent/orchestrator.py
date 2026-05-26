from google.adk.agents.sequential_agent import SequentialAgent

from app.agent.intelligence_agent import intelligence_agent
from app.agent.prompts import SCOUT_ORCHESTRATOR_DESCRIPTION
from app.agent.research_agent import research_agent

scout_orchestrator = SequentialAgent(
    name="ScoutOrchestrator",
    description=SCOUT_ORCHESTRATOR_DESCRIPTION,
    sub_agents=[research_agent, intelligence_agent],
)

# ADK convention: root_agent is the deployable entrypoint.
root_agent = scout_orchestrator
