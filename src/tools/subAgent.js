// src/tools/subAgent.js
import { runAgent } from '../agent.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Spawns a sub-agent to handle a specific sub-task.
 * This keeps the main agent's context clean and allows for specialized "worker" agents.
 *
 * @param {string} task - The specific task for the sub-agent (e.g. "Write the CSS for the Header")
 * @param {string} context - Any additional context needed (e.g. current design tokens)
 */
export async function subAgent({ task, context = '' }) {
  if (!task) throw new Error('task is required');

  console.log(`[subAgent] Spawning worker for: ${task.slice(0, 50)}...`);

  // We reuse runAgent but with a "Worker" persona prompt prefix
  const workerInstruction = `
    You are a specialized WORKER AGENT. Your job is to complete ONE specific sub-task perfectly.
    Current Task: ${task}
    Additional Context: ${context}
    
    You have access to all the same tools as the Main Agent.
    When you are finished with your specific task, use the OUTPUT step to return a summary of what you did.
  `;

  // We pass a modified history to the sub-agent
  const resultHistory = await runAgent(workerInstruction, [], (step) => {
    // Optionally log sub-agent steps with a prefix
    console.log(`  [Worker] ${step.step}: ${step.content?.slice(0, 100)}`);
  });

  const lastMessage = resultHistory[resultHistory.length - 1];
  const output = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.parts);

  return `Worker finished task "${task}". Result: ${output}`;
}
