import 'dotenv/config';
import readline from 'readline';
import chalk from 'chalk';
import { runAgent } from './src/agent.js';
import { renderStep, renderBanner, stopSpinner, renderError } from './src/renderer.js';
import { SessionMemory } from './src/memory.js';

// Validate environment
if (!process.env.GEMINI_API_KEY) {
  console.error(chalk.red('✗ Error: GEMINI_API_KEY is not set in .env'));
  console.error(chalk.yellow('  Please create a .env file with your API key'));
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const memory = new SessionMemory(20);
let lastFailedInput = null;



async function handleAgentQuery(input, { recordUser = true } = {}) {
  try {
    if (recordUser) {
      memory.addUserMessage(input);
    }

    const updatedHistory = await runAgent(
      input,
      memory.getFormattedHistory(),
      (step) => {
        renderStep(step);
        if (step.step === 'TOOL') {
          memory.logTask(
            `${step.tool_name}`,
            'executing',
            step.tool_args
          );
        }
      }
    );

    for (const msg of updatedHistory) {
      const text =
        typeof msg.content === 'string'
          ? msg.content
          : Array.isArray(msg.parts)
          ? msg.parts
              .map((p) => (typeof p?.text === 'string' ? p.text : ''))
              .join('')
          : '';

      if (!text) {
        continue;
      }

      if (msg.role === 'user' && text !== input) {
        memory.addUserMessage(text);
      } else if (msg.role === 'model' || msg.role === 'assistant') {
        memory.addAssistantMessage(text);
      }
    }

    lastFailedInput = null;
    stopSpinner();
  } catch (err) {
    lastFailedInput = input;
    stopSpinner();
    renderError(err.message);
    console.log(chalk.yellow('  Tip: type "continue" (or "retry") to rerun the last failed request.'));
  }
}

function prompt() {
  stopSpinner();
  rl.question(chalk.blue.bold('\n  You › '), async (input) => {
    if (!input.trim()) {
      prompt();
      return;
    }

    const cmd = input.toLowerCase().trim();

    // === BUILT-IN COMMANDS ===
    if (cmd === 'exit' || cmd === 'quit') {
      console.log(chalk.green('\n  Goodbye! 👋\n'));
      rl.close();
      process.exit(0);
    }

    if (cmd === 'clear') {
      memory.clear();
      lastFailedInput = null;
      console.log(chalk.green('  ✓ Session cleared'));
      prompt();
      return;
    }

    if (cmd === 'continue' || cmd === 'retry') {
      if (!lastFailedInput) {
        console.log(chalk.yellow('  No failed request to retry yet.'));
        prompt();
        return;
      }

      console.log(chalk.cyan(`  ↻ Retrying: ${lastFailedInput}`));
      await handleAgentQuery(lastFailedInput, { recordUser: false });
      prompt();
      return;
    }

    if (cmd === 'history') {
      const hist = memory.getHistory();
      if (hist.length === 0) {
        console.log(chalk.yellow('  No history yet'));
      } else {
        console.log(chalk.blue.bold('\n  📜 Conversation History\n'));
        hist.forEach((msg, i) => {
          const role = msg.role === 'user' ? chalk.cyan('You') : chalk.magenta('Agent');
          const content = msg.content.substring(0, 80);
          console.log(`  ${i + 1}. ${role}: ${content}...`);
        });
      }
      prompt();
      return;
    }

    if (cmd === 'files') {
      const files = memory.getAllGeneratedFiles();
      if (files.length === 0) {
        console.log(chalk.yellow('  No files generated yet'));
      } else {
        console.log(chalk.blue.bold('\n  📁 Generated Files\n'));
        files.forEach((file, i) => {
          const size = file.content.length;
          console.log(`  ${i + 1}. ${chalk.green(file.path)} (${size} bytes)`);
        });
      }
      prompt();
      return;
    }

    if (cmd === 'explain') {
      const summary = memory.getTaskSummary();
      console.log(chalk.blue.bold('\n  💭 What I Did\n'));
      console.log(chalk.gray(summary));
      console.log('');
      prompt();
      return;
    }

    if (cmd.startsWith('open ')) {
      const filePath = cmd.substring(5).trim();
      try {
        const { openBrowser } = await import('./src/tools/openBrowser.js');
        await openBrowser({ path: filePath });
        console.log(chalk.green(`  ✓ Opened ${filePath}`));
      } catch (err) {
        console.log(chalk.red(`  ✗ Error: ${err.message}`));
      }
      prompt();
      return;
    }

    if (cmd === 'help' || cmd === '?') {
      console.log(chalk.blue.bold('\n  📚 Available Commands\n'));
      console.log(chalk.gray('  exit           Exit the CLI'));
      console.log(chalk.gray('  clear          Clear session memory'));
      console.log(chalk.gray('  continue       Retry last failed request'));
      console.log(chalk.gray('  retry          Retry last failed request'));
      console.log(chalk.gray('  history        Show conversation history'));
      console.log(chalk.gray('  files          List generated files'));
      console.log(chalk.gray('  explain        Summarize what was done'));
      console.log(chalk.gray('  open <file>    Open a file in browser'));
      console.log(chalk.gray('  help           Show this message'));
      console.log('');
      prompt();
      return;
    }

    // === NORMAL AGENT QUERY ===
    try {
      await handleAgentQuery(input);
    } catch (err) {
      renderError(`Fatal Error: ${err.message}`);
    }

    prompt();
  });
}

// Global error handlers to prevent crash
process.on('unhandledRejection', (reason, p) => {
  renderError(`Unhandled Rejection: ${reason}`);
  prompt();
});

process.on('uncaughtException', (err) => {
  renderError(`Uncaught Exception: ${err.message}`);
  prompt();
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n\n  Interrupted. Goodbye! 👋\n'));
  rl.close();
  process.exit(0);
});

// Start the CLI
(async () => {
  try {
    renderBanner();
    prompt();
  } catch (err) {
    renderError(`Startup Error: ${err.message}`);
  }
})();
