import { BaseAgent, AgentContext, AgentResult } from './BaseAgent';

export class AgentExecutor {
  private agents: Map<string, BaseAgent>;
  private executionHistory: { agent: string, query: string, status: 'success'|'failed', timestamp: number }[] = [];

  constructor() {
    this.agents = new Map();
  }

  registerAgent(agent: BaseAgent) {
    console.log(`[Executor] Registering agent: ${agent.constructor.name}`);
    this.agents.set(agent.constructor.name, agent);
  }

  getAgent(name: string): BaseAgent | undefined {
    return this.agents.get(name);
  }

  getAvailableAgents(): string[] {
    return Array.from(this.agents.keys());
  }

  async execute(agentName: string, query: string, context: AgentContext = {}): Promise<string> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      const errorMsg = `Agent ${agentName} not found. Available: ${this.getAvailableAgents().join(', ')}`;
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      console.log(`[Executor] Starting execution for ${agentName}`);
      const result: AgentResult = await agent.run({ description: query }, context);
      
      this.executionHistory.push({
        agent: agentName,
        query,
        status: result.success ? 'success' : 'failed',
        timestamp: Date.now()
      });

      if (!result.success) {
        console.warn(`[Executor] Agent ${agentName} reported failure.`);
      }

      return result.output;
    } catch (error: any) {
      console.error(`[Executor] Critical failure in ${agentName}:`, error);
      this.executionHistory.push({
        agent: agentName,
        query,
        status: 'failed',
        timestamp: Date.now()
      });
      throw error;
    }
  }
}
