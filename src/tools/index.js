import { writeFile } from './writeFile.js';
import { readFile } from './readFile.js';
import { listDir } from './listDir.js';
import { executeCommand } from './executeCommand.js';
import { openBrowser } from './openBrowser.js';
import { fetchURL } from './fetchURL.js';
import { editFile } from './editFile.js';
import { validateOutput } from './validateOutput.js';
import { appendFile } from './appendFile.js';
import { subAgent } from './subAgent.js';

// Central registry — add new tools here only
const TOOLS = {
  writeFile,
  appendFile,
  readFile,
  listDir,
  executeCommand,
  openBrowser,
  fetchURL,
  editFile,
  validateOutput,
  subAgent,
};

/**
 * Safely dispatch a tool call.
 * @param {string} name - Tool name
 * @param {object} args - Tool arguments
 * @returns {Promise<any>} Tool result
 */
export async function dispatch(name, args) {
  if (!TOOLS[name]) {
    throw new Error(
      `Tool not found: ${name}. Available tools: ${Object.keys(TOOLS).join(', ')}`
    );
  }

  const tool = TOOLS[name];

  try {
    const result = await tool(args);
    return result;
  } catch (err) {
    throw new Error(`Tool "${name}" failed: ${err.message}`);
  }
}

export { TOOLS };
