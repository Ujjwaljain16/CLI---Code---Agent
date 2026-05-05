import chalk from 'chalk';
import ora from 'ora';

let spinner = null;

const STEP_STYLES = {
  START: { label: '◆ START', color: chalk.cyan.bold, icon: '◆' },
  THINK: { label: '◆ THINK', color: chalk.green.bold, icon: '◆' },
  TOOL: { label: '⚙ TOOL', color: chalk.yellow.bold, icon: '⚙' },
  OBSERVE: { label: '◉ OBSERVE', color: chalk.blue.bold, icon: '◉' },
  OUTPUT: { label: '✓ OUTPUT', color: chalk.magenta.bold, icon: '✓' },
  ERROR: { label: '✗ ERROR', color: chalk.red.bold, icon: '✗' },
};

export function renderStep(parsed) {
  // Stop any running spinner
  stopSpinner();

  const style = STEP_STYLES[parsed.step] || STEP_STYLES.OUTPUT;
  const content =
    typeof parsed.content === 'string'
      ? parsed.content
      : parsed.content != null
      ? typeof parsed.content === 'object'
        ? JSON.stringify(parsed.content, null, 2)
        : String(parsed.content)
      : '...';

  if (parsed.step === 'THINK' || parsed.step === 'START') {
    // Show spinner for thinking
    spinner = ora({
      text: `${style.color(style.label)} ${content.substring(0, 50)}...`,
      spinner: 'dots',
    }).start();
  } else {
    // Print step immediately
    console.log('');
    console.log(style.color(`  ${style.label}`));
    console.log(chalk.gray(`  ${content}`));

    if (parsed.step === 'TOOL') {
      console.log(chalk.gray(`    Tool: ${parsed.tool_name}`));
      if (parsed.tool_args) {
        console.log(chalk.gray(`    Args: ${JSON.stringify(parsed.tool_args)}`));
      }
    }

    console.log('');
  }
}

export function renderBanner() {
  console.log('');
  console.log(
    chalk.cyan.bold('  ╔════════════════════════════════════════════════════╗')
  );
  console.log(
    chalk.cyan.bold('  ║        AI Agent CLI - Scaler Website Cloner         ║')
  );
  console.log(
    chalk.cyan.bold('  ║                    v1.0.0                          ║')
  );
  console.log(
    chalk.cyan.bold('  ╚════════════════════════════════════════════════════╝')
  );
  console.log('');
  console.log(chalk.green('  ✓ Connected to Gemini API'));
  console.log(chalk.gray('  Type "help" for available commands'));
  console.log(chalk.gray('  Try: "Clone the Scaler Academy website"'));
  console.log('');
}

export function stopSpinner() {
  if (spinner) {
    spinner.stop();
    spinner = null;
  }
}

export function renderError(message) {
  console.log('');
  console.log(chalk.red.bold('  ✗ ERROR'));
  console.log(chalk.red(`  ${message}`));
  console.log('');
}

export function renderSuccess(message) {
  console.log('');
  console.log(chalk.green.bold('  ✓ SUCCESS'));
  console.log(chalk.green(`  ${message}`));
  console.log('');
}
