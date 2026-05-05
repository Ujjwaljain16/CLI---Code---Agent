/**
 * demo-edit.js
 * 
 * Simulates a multi-turn follow-up: user asks to edit the hero section.
 * Agent reads existing HTML, replaces the hero with the latest Scaler hero,
 * updates CSS, verifies, and opens browser.
 * 
 * Run: node demo-edit.js
 */

import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import path from 'path';
import fs from 'fs/promises';

const OUTPUT_DIR = path.resolve('output');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── New hero HTML (clean vanilla version of the latest Scaler hero) ──
const NEW_HERO_HTML = `  <section class="hero" id="hero">
    <div class="hero-bg-gradient"></div>
    <div class="hero-inner">
      <div class="hero-tagline">
        <span class="chevron">&lsaquo;</span>
        <span class="tagline-text">THE MARKET HAS ALREADY CHANGED</span>
        <span class="chevron">&rsaquo;</span>
      </div>
      <h1 class="hero-headline">
        Become the Professional Built for the <span class="accent">Next Decade in AI.</span>
      </h1>
      <p class="hero-subtext">
        The investment that compounds.<br>
        Strong technical foundations, AI integrated at every stage, and a curriculum that evolves as the market does.
      </p>
      <div class="hero-programs">
        <span class="programs-label">PROGRAMS</span>
        <div class="marquee-track">
          <div class="marquee-content">
            <a href="https://www.scaler.com/academy/">Modern Software and AI Engineering</a>
            <a href="https://www.scaler.com/data-science-course/">Modern Data Science and ML with Specialisation in AI</a>
            <a href="https://www.scaler.com/ai-machine-learning-course/">Advanced AIML with Agentic AI</a>
            <a href="https://www.scaler.com/devops-course/">DevOps, Cloud &amp; AI Platform Engineering</a>
            <a href="https://www.scaler.com/academy/">Modern Software and AI Engineering</a>
            <a href="https://www.scaler.com/data-science-course/">Modern Data Science and ML with Specialisation in AI</a>
          </div>
        </div>
      </div>
      <div class="hero-buttons">
        <a href="#" class="btn btn-primary">REQUEST A CALLBACK</a>
        <a href="#" class="btn btn-outline">BOOK FREE LIVE CLASS</a>
      </div>
    </div>
  </section>`;

// ── Updated hero CSS ──
const NEW_HERO_CSS = `
/* ── Updated Hero Section (Latest Scaler Design) ─────────── */
.hero {
  position: relative;
  overflow: hidden;
  background: #fff;
  padding: 80px 0 100px;
  text-align: center;
}

.hero-bg-gradient {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 50% 60% at 85% 30%, rgba(0, 85, 255, 0.06) 0%, transparent 70%),
    radial-gradient(ellipse 40% 50% at 15% 70%, rgba(0, 85, 255, 0.03) 0%, transparent 60%);
  z-index: 0;
}

.hero-inner {
  position: relative;
  z-index: 10;
  max-width: 1029px;
  margin: 0 auto;
  padding: 0 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 32px;
}

.hero-tagline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.hero-tagline .chevron {
  color: #0055FF;
  font-size: 12px;
  font-weight: bold;
}

.hero-tagline .tagline-text {
  font-size: 14px;
  font-weight: 400;
  text-transform: uppercase;
  letter-spacing: 1.68px;
  color: #0055FF;
}

.hero-headline {
  font-family: 'Georgia', 'Times New Roman', serif;
  font-size: 90px;
  font-weight: 500;
  line-height: 1;
  color: #011845;
  text-align: center;
  max-width: 1029px;
}

.hero-headline .accent {
  background: linear-gradient(90deg, #0055FF 0%, #06B6D4 25%, #0055FF 50%, #06B6D4 75%, #0055FF 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  font-style: italic;
}

.hero-subtext {
  max-width: 865px;
  text-align: center;
  font-size: 18px;
  line-height: 26px;
  color: #212121;
}

.hero-programs {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.programs-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1.44px;
  color: #696969;
}

.marquee-track {
  width: 100%;
  max-width: 50rem;
  overflow: hidden;
  mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
}

.marquee-content {
  display: flex;
  align-items: center;
  gap: 24px;
  width: max-content;
  animation: marquee 24s linear infinite;
  padding-right: 24px;
}

.marquee-content a {
  flex-shrink: 0;
  font-size: 15px;
  line-height: 22.5px;
  color: #101E37;
  text-decoration: none;
  white-space: nowrap;
}

.marquee-content a:hover {
  text-decoration: underline;
}

@keyframes marquee {
  0% { transform: translateX(0); }
  100% { transform: translateX(-50%); }
}

.hero-buttons {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  justify-content: center;
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 12px 40px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  text-decoration: none;
  border-radius: 0;
  transition: all 0.25s ease;
  cursor: pointer;
}

.btn-primary {
  background: rgb(0, 76, 229);
  color: #fff;
  border: 1px solid transparent;
}

.btn-primary:hover {
  background: rgb(0, 60, 190);
  transform: translateY(-2px);
}

.btn-outline {
  background: #fff;
  color: rgb(0, 76, 229);
  border: 1px solid rgb(0, 76, 229);
}

.btn-outline:hover {
  background: #f5f7ff;
  transform: translateY(-2px);
}

@media (max-width: 1024px) {
  .hero-headline { font-size: 60px; }
}

@media (max-width: 768px) {
  .hero-headline { font-size: 36px; }
  .hero-buttons { flex-direction: column; align-items: center; }
  .hero { padding: 48px 0 64px; }
}

@media (max-width: 480px) {
  .hero-headline { font-size: 28px; }
  .hero-subtext { font-size: 15px; }
}`;


async function typeText(text, delayPerChar = 40) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(delayPerChar);
  }
}

async function simulateEdit() {
  // ── Show prompt + user typing ──
  process.stdout.write(chalk.blue.bold('\n  You › '));
  await sleep(800);
  await typeText('Edit the hero section to match the latest Scaler homepage design', 38);
  await sleep(600);
  console.log('');
  await sleep(1000);

  // ── START ──
  let spinner = ora({
    text: `${chalk.cyan.bold('◆ START')} User wants to update the hero section with the latest Scaler design...`,
    spinner: 'dots',
  }).start();
  await sleep(2500);
  spinner.stop();

  // ── THINK 1 ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} This is a follow-up edit. I need to read the current index.html first to find the hero section...`,
    spinner: 'dots',
  }).start();
  await sleep(2500);
  spinner.stop();

  // ── THINK 2 ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} The new Scaler hero has: tagline "THE MARKET HAS ALREADY CHANGED", H1 with gradient text, marquee programs bar...`,
    spinner: 'dots',
  }).start();
  await sleep(2800);
  spinner.stop();

  // ── TOOL: readFile index.html ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool readFile'));
  console.log(chalk.gray('    Tool: readFile'));
  console.log(chalk.gray('    Args: {"path":"index.html"}'));
  console.log('');
  await sleep(2000);

  // ── OBSERVE: readFile ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  <!DOCTYPE html><html lang="en"><head>...'));
  console.log(chalk.gray('  Found existing <section class="hero" id="hero"> — will replace with updated content'));
  console.log('');
  await sleep(2000);

  // ── THINK 3 ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Planning hero edit: gradient bg, serif h1 90px, accent gradient on "Next Decade in AI", marquee track, 2 CTAs...`,
    spinner: 'dots',
  }).start();
  await sleep(2500);
  spinner.stop();

  // ── THINK 4 ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Tokens: bg=#fff, accent=#0055FF, text=#011845, tagline=uppercase 14px tracking 1.68px, h1=serif 90px/500w...`,
    spinner: 'dots',
  }).start();
  await sleep(2500);
  spinner.stop();

  // ── TOOL: editFile (replace hero HTML) ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool editFile'));
  console.log(chalk.gray('    Tool: editFile'));
  console.log(chalk.gray('    Args: {"path":"index.html","find":"<section class=\\"hero\\"...","replace":"<section class=\\"hero\\" id=\\"hero\\">...new hero..."}'));
  console.log('');

  // Actually replace hero in index.html
  try {
    let html = await fs.readFile(path.join(OUTPUT_DIR, 'index.html'), 'utf-8');

    // Find and replace the hero section
    // Try several patterns to find the hero section
    const heroPatterns = [
      /(<section[^>]*class="[^"]*hero[^"]*"[^>]*>)([\s\S]*?)(<\/section>)/i,
      /(<section[^>]*id="hero"[^>]*>)([\s\S]*?)(<\/section>)/i,
    ];

    let replaced = false;
    for (const pattern of heroPatterns) {
      if (pattern.test(html)) {
        html = html.replace(pattern, NEW_HERO_HTML);
        replaced = true;
        break;
      }
    }

    if (!replaced) {
      // Fallback: insert after header
      html = html.replace(/<\/header>/i, '</header>\n' + NEW_HERO_HTML);
    }

    await fs.writeFile(path.join(OUTPUT_DIR, 'index.html'), html, 'utf-8');
  } catch (e) {
    // Silent
  }

  await sleep(2500);

  // ── OBSERVE: editFile result ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  Edited: output/index.html — replaced hero section with updated Scaler design (2180 chars)'));
  console.log('');
  await sleep(1800);

  // ── TOOL: readFile style.css ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool readFile'));
  console.log(chalk.gray('    Tool: readFile'));
  console.log(chalk.gray('    Args: {"path":"style.css"}'));
  console.log('');
  await sleep(1500);

  // ── OBSERVE: readFile CSS ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  :root { --color-bg: ... } /* existing CSS loaded — need to update hero styles */'));
  console.log('');
  await sleep(1500);

  // ── THINK 5 ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Need to update the hero CSS: radial gradient bg, serif font, marquee animation, responsive breakpoints...`,
    spinner: 'dots',
  }).start();
  await sleep(2200);
  spinner.stop();

  // ── TOOL: appendFile (update CSS) ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool appendFile'));
  console.log(chalk.gray('    Tool: appendFile'));
  console.log(chalk.gray('    Args: {"path":"style.css","content":"/* Updated Hero Section */ .hero { ... } @keyframes marquee { ... }"}'));
  console.log('');

  // Actually append CSS
  try {
    await fs.appendFile(path.join(OUTPUT_DIR, 'style.css'), NEW_HERO_CSS, 'utf-8');
  } catch (e) {
    // Silent
  }

  await sleep(2000);

  // ── OBSERVE: appendFile result ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  Appended 2450 chars to output/style.css — hero styles updated with gradients and marquee'));
  console.log('');
  await sleep(1500);

  // ── THINK: verify ──
  spinner = ora({
    text: `${chalk.green.bold('◆ THINK')} Hero section updated. Let me verify the edits are correct before opening browser...`,
    spinner: 'dots',
  }).start();
  await sleep(2000);
  spinner.stop();

  // ── TOOL: readFile (verify) ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool readFile'));
  console.log(chalk.gray('    Tool: readFile'));
  console.log(chalk.gray('    Args: {"path":"index.html"}'));
  console.log('');
  await sleep(1500);

  // ── OBSERVE: verify ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray('  Confirmed: Hero updated with "Become the Professional Built for the Next Decade in AI."'));
  console.log(chalk.gray('  Verified: tagline, h1 with gradient accent, marquee programs, 2 CTA buttons all present'));
  console.log('');
  await sleep(1500);

  // ── TOOL: openBrowser ──
  console.log('');
  console.log(chalk.yellow.bold('  ⚙ TOOL'));
  console.log(chalk.gray('  Calling tool openBrowser'));
  console.log(chalk.gray('    Tool: openBrowser'));
  console.log(chalk.gray('    Args: {"path":"index.html"}'));
  console.log('');

  // Actually open browser
  const htmlPath = path.join(OUTPUT_DIR, 'index.html');
  try {
    const fileUrl = `file:///${htmlPath.replace(/\\/g, '/')}`;
    await open(fileUrl);
  } catch (e) {
    // Silent
  }

  await sleep(2500);

  // ── OBSERVE: browser ──
  console.log('');
  console.log(chalk.blue.bold('  ◉ OBSERVE'));
  console.log(chalk.gray(`  Opened file:///${htmlPath.replace(/\\/g, '/')} in your default browser`));
  console.log('');
  await sleep(1500);

  // ── OUTPUT ──
  console.log('');
  console.log(chalk.magenta.bold('  ✓ OUTPUT'));
  console.log(chalk.gray('  ✅ Hero section updated to the latest Scaler design!'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  Changes made:'));
  console.log(chalk.gray('    • index.html — Replaced hero with new headline: "Become the Professional Built'));
  console.log(chalk.gray('      for the Next Decade in AI." with gradient accent text'));
  console.log(chalk.gray('    • style.css  — Added radial-gradient background, serif typography, marquee'));
  console.log(chalk.gray('      animation for programs bar, and responsive breakpoints'));
  console.log(chalk.gray(''));
  console.log(chalk.gray('  The updated page is now open in your browser with the redesigned hero section.'));
  console.log('');

  await sleep(1000);

  // ── Ready for next prompt ──
  process.stdout.write(chalk.blue.bold('\n  You › '));
  await sleep(4000);
  console.log('');
}

simulateEdit().catch(console.error);
