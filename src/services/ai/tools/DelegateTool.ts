
import { Tool } from '@/lib/agents/BaseAgent';
import { globalExecutor } from '../agentSystem';

export class DelegateTool implements Tool {
  name = 'delegate_task';
  description = 'Delegate a specific sub-task to a specialized agent (ResearcherAgent or CoderAgent). Returns their result.';
  
  schema = {
    type: 'object',
    properties: {
      agentName: {
        type: 'string',
        enum: ['ResearcherAgent', 'CoderAgent'],
        description: 'The name of the agent to hire.'
      },
      task: {
        type: 'string',
        description: 'The specific instruction or question for the agent.'
      }
    },
    required: ['agentName', 'task']
  };

  async execute(args: { agentName: string, task: string }): Promise<string> {
    console.log(`[DelegateTool] Delegating to ${args.agentName}: ${args.task.substring(0, 50)}...`);
    try {
        // Pass empty context for now, or inherit if we can pass it down
        const result = await globalExecutor.execute(args.agentName, args.task, { useRAG: true });
        return `[AGENT RESULT FROM ${args.agentName}]\n${result}\n[END RESULT]`;
    } catch (e: any) {
        return `Error delegating task: ${e.message}`;
    }
  }
}
