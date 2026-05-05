import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';

const execAsync = promisify(exec);
const OUTPUT_DIR = path.resolve('output');

// Hard-blocked patterns regardless of context
const BLOCKED = [
  'rm -rf /',
  'sudo',
  'dd if=',
  ':(){:|:&};:',
  'fork()',
  '&& rm',
];

export async function executeCommand({ cmd, cwd = 'output' }) {
  if (!cmd) throw new Error('cmd is required');

  // Security: reject dangerous commands
  for (const pattern of BLOCKED) {
    if (cmd.includes(pattern)) {
      throw new Error(`Dangerous command blocked: "${pattern}"`);
    }
  }

  // Ensure cwd is safe
  const safeCwd = cwd === 'output' ? OUTPUT_DIR : path.resolve(OUTPUT_DIR, cwd);
  if (!safeCwd.startsWith(OUTPUT_DIR)) {
    throw new Error('cwd outside output directory');
  }

  try {
    const { stdout } = await execAsync(cmd, {
      cwd: safeCwd,
      timeout: 10000,
    });
    return stdout || `Command executed: ${cmd}`;
  } catch (err) {
    throw new Error(`Command failed: ${err.message}`);
  }
}
