
import { BaseAgent, AgentGoal, AgentContext, AgentResult, Tool } from '@/lib/agents/BaseAgent';
import { AgentExecutor } from '@/lib/agents/Executor';
import { PlannerAgent } from '@/lib/agents/PlannerAgent';
import { ResearcherAgent } from '@/lib/agents/ResearcherAgent';
import { CoderAgent } from '@/lib/agents/CoderAgent';

export { BaseAgent, AgentExecutor, PlannerAgent, ResearcherAgent, CoderAgent };
export type { AgentGoal, AgentContext, AgentResult, Tool };

// Singleton Executor for the app
export const globalExecutor = new AgentExecutor();
globalExecutor.registerAgent(new PlannerAgent());
globalExecutor.registerAgent(new ResearcherAgent());
globalExecutor.registerAgent(new CoderAgent());

