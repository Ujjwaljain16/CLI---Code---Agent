/**
 * demo-ending.js
 * 
 * Simulates the final steps of the agent CLI for demo recording purposes.
 * Shows: validate → PASS → openBrowser → OUTPUT summary
 * 
 * Run: node demo-ending.js
 */

import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import path from 'path';
import { access } from 'fs/promises';

const OUTPUT_DIR = path.resolve('output');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function simulateEnding() {
  // ── Simulate a THINK step with spinner ──
  let spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Verifying all sections are written correctly...`,
    spinner: 'dots',
  }).start();

  await sleep(2500);
  spinner.stop();

  // ── TOOL: readFile (verify) ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool readFile'));
  console.log(chalk.gray('    Tool: readFile'));
  console.log(chalk.gray('    Args: {"path":"index.html"}'));
  console.log('');

  await sleep(1500);

  // ── OBSERVE: readFile result ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  <!DOCTYPE html><html lang="en"><head>...'));
  console.log(chalk.gray('  Verified: <header>, <section class="hero">, <footer> all present'));
  console.log('');

  await sleep(2000);

  // ── THINK: time to validate ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} All files written. Running validateOutput to check for hallucinations...`,
    spinner: 'dots',
  }).start();

  await sleep(2500);
  spinner.stop();

  // ── TOOL: validateOutput ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool validateOutput'));
  console.log(chalk.gray('    Tool: validateOutput'));
  console.log(chalk.gray('    Args: {"html_file":"index.html"}'));
  console.log('');

  await sleep(3000);

  // ── OBSERVE: validateOutput result ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  {'));
  console.log(chalk.gray('    "status": "PASS",'));
  console.log(chalk.gray('    "summary": "12 passed, 0 errors, 2 warnings",'));
  console.log(chalk.gray('    "passed": ['));
  console.log(chalk.gray('      "✅ H1 text present: \\"Modern Software and AI Engineering...\\"",'));
  console.log(chalk.gray('      "✅ Hero paragraph text present",'));
  console.log(chalk.gray('      "✅ Hero button \\"DOWNLOAD BROCHURE\\" present",'));
  console.log(chalk.gray('      "✅ Hero button \\"TALK TO AN ADVISOR\\" present",'));
  console.log(chalk.gray('      "✅ Footer copyright year (2026) and \\"InterviewBit\\" present",'));
  console.log(chalk.gray('      "✅ Accent color rgb(0, 76, 229) present in CSS",'));
  console.log(chalk.gray('      "✅ 4/4 real images referenced",'));
  console.log(chalk.gray('      "✅ Geometry drift low (mean 0.0312)"'));
  console.log(chalk.gray('    ],'));
  console.log(chalk.gray('    "instruction": "All content checks passed. You may proceed to OUTPUT."'));
  console.log(chalk.gray('  }'));
  console.log('');

  await sleep(2000);

  // ── THINK: validation passed ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Validation passed with 0 errors. Opening in browser now...`,
    spinner: 'dots',
  }).start();

  await sleep(2000);
  spinner.stop();

  // ── TOOL: openBrowser ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool openBrowser'));
  console.log(chalk.gray('    Tool: openBrowser'));
  console.log(chalk.gray('    Args: {"path":"index.html"}'));
  console.log('');

  // Actually open the browser
  const htmlPath = path.join(OUTPUT_DIR, 'index.html');
  try {
    await access(htmlPath);
    const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
    await open(fileUrl);
  } catch {
    console.log(chalk.yellow('  (index.html not found — skipping browser open)'));
  }

  await sleep(2500);

  // ── OBSERVE: browser opened ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray(`  Opened file:///${htmlPath.replace(/\\/g, '/')} in your default browser`));
  console.log('');

  await sleep(1500);

  // ── OUTPUT ──
  console.log('');
  console.log(chalk.magenta.bold('  ✓ OUTPUT'));
  console.log(chalk.gray('  ✅ Scaler Academy website cloned successfully!'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  Generated files:'));
  console.log(chalk.gray('    • output/style.css — Full design system with CSS custom properties'));
  console.log(chalk.gray('    • output/index.html — Semantic HTML with Header, Hero, and Footer'));
  console.log(chalk.gray('    • output/script.js — Scroll animations, mobile menu, IntersectionObserver'));
  console.log(chalk.gray('    • output/design-system.json — Extracted design tokens from live site'));
  console.log(chalk.gray('    • output/images/ — Downloaded assets (logo, hero bg, icons)'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  The page is now open in your browser. All content was extracted from'));
  console.log(chalk.gray('  the real scaler.com — no placeholders or hallucinated text.'));
  console.log(chalk.gray('  validateOutput confirmed: 12 checks passed, 0 errors.'));
  console.log('');

  await sleep(1000);

  // ── Show prompt again (ready for next input) ──
  process.stdout.write(chalk.blue.bold('\n  You › '));

  // Keep it alive for a few seconds so the recording captures the prompt
  await sleep(4000);
  console.log('');
}

simulateEnding().catch(console.error);
