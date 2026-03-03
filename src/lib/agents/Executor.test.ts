import { describe, it, expect } from 'vitest';
import { AgentExecutor } from './Executor';
import { BaseAgent, AgentGoal, AgentResult } from './BaseAgent';

// Mock Agent
class MockAgent extends BaseAgent {
  getSystemPrompt() { return "mock"; }
  async run({ description }: AgentGoal): Promise<AgentResult> {
    return {
      success: true,
      output: `Executed: ${description}`
    };
  }
}

describe('AgentExecutor', () => {
  it('should register and execute an agent', async () => {
    const executor = new AgentExecutor();
    const mockAgent = new MockAgent('MockAgent');
    
    executor.registerAgent(mockAgent);
    
    const result = await executor.execute('MockAgent', 'Do something');
    expect(result).toBe('Executed: Do something');
  });

  it('should throw if agent not found', async () => {
    const executor = new AgentExecutor();
    await expect(executor.execute('MissingAgent', 'test')).rejects.toThrow(/not found/);
  });
});
