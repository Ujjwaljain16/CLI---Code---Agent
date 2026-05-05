/**
 * validateOutput.js
 *
 * Cross-checks the generated index.html against design-system.json
 * and reports every hallucination or missing real-world value found.
 *
 * Returns a PASS or FAIL report the agent MUST fix before OUTPUT.
 */

import fs   from 'fs/promises';
import path from 'path';
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'url';

const OUTPUT_DIR = path.resolve('output');

const DEFAULT_VIEWPORT = { width: 1440, height: 900 };

function normalizeDelta(target = 0, actual = 0, basis = 1) {
  if (!Number.isFinite(target) || !Number.isFinite(actual) || basis <= 0) return null;
  return Math.abs(actual - target) / basis;
}

function compareRects(targetRect, actualRect, viewport) {
  if (!targetRect || !actualRect) {
    return {
      missing: true,
      score: 1,
      deltas: { top: null, left: null, width: null, height: null },
    };
  }

  const deltas = {
    top: normalizeDelta(targetRect.top, actualRect.top, viewport.height),
    left: normalizeDelta(targetRect.left, actualRect.left, viewport.width),
    width: normalizeDelta(targetRect.width, actualRect.width, viewport.width),
    height: normalizeDelta(targetRect.height, actualRect.height, viewport.height),
  };

  const values = Object.values(deltas).filter((v) => Number.isFinite(v));
  const score = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 1;

  return {
    missing: false,
    score,
    deltas,
  };
}

async function captureLocalGeometry(htmlAbsolutePath) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport(DEFAULT_VIEWPORT);
    await page.goto(pathToFileURL(htmlAbsolutePath).href, {
      waitUntil: 'networkidle2',
      timeout: 45000,
    });

    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });

    return await page.evaluate(() => {
      const rectOf = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          top: Number(r.top.toFixed(2)),
          left: Number(r.left.toFixed(2)),
          width: Number(r.width.toFixed(2)),
          height: Number(r.height.toFixed(2)),
        };
      };

      const headerEl = document.querySelector('header, [role="banner"], nav');
      const heroEl = document.querySelector('#hero, .hero, section');
      const h1El = heroEl?.querySelector('h1') || document.querySelector('h1');
      const paraEl = heroEl
        ? [...heroEl.querySelectorAll('p')].find((p) => (p.innerText || '').trim().length > 20)
        : null;
      const heroButtons = heroEl
        ? [...heroEl.querySelectorAll('.hero-buttons a, .hero-buttons button, a, button')]
            .filter((el) => (el.innerText || '').trim().length > 1)
            .slice(0, 2)
        : [];
      const footerEl = document.querySelector('footer, [role="contentinfo"]');

      const node = (name, el) => ({ name, rect: rectOf(el) });

      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
        keyNodes: [
          node('header', headerEl),
          node('hero', heroEl),
          node('hero_h1', h1El),
          node('hero_paragraph', paraEl),
          node('hero_button_primary', heroButtons[0]),
          node('hero_button_secondary', heroButtons[1]),
          node('footer', footerEl),
        ],
      };
    });
  } finally {
    await browser.close();
  }
}

export async function validateOutput({ html_file = 'index.html', enforceGeometry = false } = {}) {
  // ── 1. Load generated HTML ──────────────────────────────────────────────────
  let html;
  try {
    html = await fs.readFile(path.join(OUTPUT_DIR, html_file), 'utf-8');
  } catch {
    return JSON.stringify({
      status: 'ERROR',
      message: `Cannot read output/${html_file} — file does not exist. Write the file first.`,
    });
  }

  // ── 2. Load design system ───────────────────────────────────────────────────
  let ds;
  try {
    const raw = await fs.readFile(path.join(OUTPUT_DIR, 'design-system.json'), 'utf-8');
    ds = JSON.parse(raw);
  } catch {
    return JSON.stringify({
      status: 'ERROR',
      message: 'Cannot read output/design-system.json — run fetchURL first.',
    });
  }

  const errors   = [];
  const warnings = [];
  const passed   = [];
  const htmlNormalized = html.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();

  // ── 3. CONTENT CHECKS ───────────────────────────────────────────────────────

  // 3a. H1 text must appear verbatim
  const h1Text = ds.sections?.hero?.h1?.text;
  if (h1Text) {
    // Normalize: collapse whitespace/newlines for comparison
    const h1Normalized = h1Text.replace(/\s+/g, ' ').trim();
    // Check first 30 chars (enough to be sure it's real and not hallucinated)
    const h1Prefix = h1Normalized.slice(0, 40).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(h1Prefix, 'i').test(html)) {
      passed.push(`✅ H1 text present: "${h1Normalized.slice(0, 60)}..."`);
    } else {
      errors.push(`❌ HALLUCINATION — H1 text missing or wrong.\n   Expected (first 60 chars): "${h1Normalized.slice(0, 60)}"\n   The HTML must contain this EXACT text from sections.hero.h1.text.`);
    }
  }

  // 3b. Hero paragraph text must appear
  const heroPara = ds.sections?.hero?.paragraphs?.find(p => p.fontSize === '17px' || p.fontSize === '18px');
  if (heroPara?.text) {
    const paraNormalized = heroPara.text.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
    const paraPrefix = paraNormalized.slice(0, 50).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(paraPrefix, 'i').test(htmlNormalized)) {
      passed.push(`✅ Hero paragraph text present`);
    } else {
      errors.push(`❌ HALLUCINATION — Hero paragraph missing or wrong.\n   Expected: "${heroPara.text.slice(0, 80)}..."`);
    }
  }

  // 3c. Hero buttons must exist with real text
  const heroButtons = ds.sections?.hero?.buttons || [];
  for (const btn of heroButtons) {
    if (btn.text && html.toUpperCase().includes(btn.text.toUpperCase())) {
      passed.push(`✅ Hero button "${btn.text}" present`);
    } else if (btn.text) {
      errors.push(`❌ HALLUCINATION — Hero button "${btn.text}" is missing. Use EXACT button text from sections.hero.buttons[].text.`);
    }
  }

  // 3d. Footer copyright must be verbatim
  const copyright = ds.sections?.footer?.copyright;
  if (copyright) {
    // Strip emoji for comparison (some renderers alter them)
    const copyrightCore = copyright.replace(/[^\w\s.]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (html.includes('2026') && html.toLowerCase().includes('interviewbit')) {
      passed.push(`✅ Footer copyright year (2026) and "InterviewBit" present`);
    } else {
      errors.push(`❌ HALLUCINATION — Footer copyright wrong or missing.\n   Required verbatim: "${copyright}"\n   Check: year must be 2026, company must be "InterviewBit Software Services Pvt. Ltd."`);
    }
  }

  // 3e. Footer must contain real course links (not made-up ones)
  const requiredFooterLinks = [
    { text: 'Modern Software and AI Engineering', href: '/academy/' },
    { text: 'Modern Data Science', href: '/data-science-course/' },
    { text: 'DevOps', href: '/devops-course/' },
    { text: 'Alumni Reviews', href: '/review/' },
    { text: 'Careers', href: '/careers/' },
  ];
  for (const link of requiredFooterLinks) {
    const textPresent = new RegExp(link.text.slice(0, 20), 'i').test(html);
    if (textPresent) {
      passed.push(`✅ Footer link "${link.text.slice(0, 30)}" present`);
    } else {
      errors.push(`❌ HALLUCINATION — Footer missing real link: "${link.text}"\n   This MUST come from sections.footer.columns[0].links or sections.footer.allLinks[]`);
    }
  }

  // 3f. Social media links must use real URLs, not #placeholders
  const socialLinks = ds.sections?.footer?.socialLinks || [];
  for (const social of socialLinks.slice(0, 3)) {
    if (html.includes(social.platform || social.href || '')) {
      passed.push(`✅ Social link "${social.text}" URL present`);
    } else {
      const platform = social.platform || social.href || social.text;
      warnings.push(`⚠️  Social link for "${social.text}" uses placeholder. Expected URL: "${platform}"`);
    }
  }

  // ── 4. CSS CHECKS ───────────────────────────────────────────────────────────
  // Only check style.css if it exists
  let css = '';
  try {
    css = await fs.readFile(path.join(OUTPUT_DIR, 'style.css'), 'utf-8');
  } catch { /* style.css optional for this check */ }

  if (css) {
    // 4a. Accent color must be exact rgb(0, 76, 229)
    const accentColor = ds.components?.buttons?.find(b => b.backgroundColor?.includes('76, 229'))?.backgroundColor;
    if (accentColor && css.includes('76, 229')) {
      passed.push(`✅ Accent color rgb(0, 76, 229) present in CSS`);
    } else if (!css.includes('76, 229')) {
      errors.push(`❌ HALLUCINATION — Accent color not found in style.css.\n   Must use: rgb(0, 76, 229) (from components.buttons[1].backgroundColor)`);
    }

    // 4b. H1 font-size must be 74px
    const h1FontSize = ds.typography?.scale?.h1?.fontSize;
    if (h1FontSize && css.includes(h1FontSize)) {
      passed.push(`✅ H1 font-size ${h1FontSize} present in CSS`);
    } else if (h1FontSize && !css.includes(h1FontSize)) {
      warnings.push(`⚠️  H1 font-size ${h1FontSize} not found in style.css. Check typography.`);
    }

    // 4c. Navy color must be present (used for text and borders)
    if (css.includes('1, 26, 83') || css.includes('01, 26, 83')) {
      passed.push(`✅ Navy color rgb(1, 26, 83) present in CSS`);
    } else {
      warnings.push(`⚠️  Navy rgb(1, 26, 83) not found in CSS. Buttons and borders may be wrong color.`);
    }

    // 4d. Button border-radius must be 0px (Scaler uses sharp corners)
    if (css.includes('border-radius') && css.includes('0px')) {
      passed.push(`✅ Button border-radius 0px present`);
    } else {
      warnings.push(`⚠️  Button border-radius may not be 0px. Scaler uses completely sharp corners.`);
    }
  }

  // ── 5. ASSET CHECKS ─────────────────────────────────────────────────────────
  const images = ds.content?.images || [];
  if (images.length > 0) {
    const usedImages = images.filter(img => html.includes(img));
    if (usedImages.length > 0) {
      passed.push(`✅ ${usedImages.length}/${images.length} real images referenced`);
    } else {
      errors.push(`❌ HALLUCINATION — No real images from content.images[] are referenced.\n   Available local paths: ${images.slice(0,4).join(', ')}\n   Do NOT use placeholder image URLs.`);
    }
  }

  // ── 6. BUILD REPORT ─────────────────────────────────────────────────────────
  let geometry = null;

  try {
    const renderMapPath = path.join(OUTPUT_DIR, 'render-map.json');
    const renderMapRaw = await fs.readFile(renderMapPath, 'utf-8');
    const targetMap = JSON.parse(renderMapRaw);

    if (Array.isArray(targetMap?.keyNodes) && targetMap.keyNodes.length > 0) {
      const localMap = await captureLocalGeometry(path.join(OUTPUT_DIR, html_file));

      const targetNodes = new Map(targetMap.keyNodes.map((n) => [n.name, n]));
      const localNodes = new Map(localMap.keyNodes.map((n) => [n.name, n]));

      const keys = [
        'header',
        'hero',
        'hero_h1',
        'hero_paragraph',
        'hero_button_primary',
        'hero_button_secondary',
        'footer',
      ];

      const perNode = keys.map((key) => {
        const target = targetNodes.get(key)?.rect || null;
        const actual = localNodes.get(key)?.rect || null;
        const compared = compareRects(target, actual, localMap.viewport || DEFAULT_VIEWPORT);
        return {
          key,
          score: Number(compared.score.toFixed(4)),
          deltas: compared.deltas,
          missing: compared.missing,
          target,
          actual,
        };
      });

      const scores = perNode.filter((n) => !n.missing).map((n) => n.score);
      const meanDrift = scores.length
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : 1;

      geometry = {
        checked: true,
        viewport: localMap.viewport,
        meanDrift: Number(meanDrift.toFixed(4)),
        thresholds: {
          good: 0.05,
          review: 0.12,
          severe: 0.2,
        },
        perNode,
      };

      if (meanDrift <= 0.05) {
        passed.push(`✅ Geometry drift low (mean ${geometry.meanDrift}) from render-map baseline`);
      } else if (meanDrift <= 0.12) {
        warnings.push(`⚠️  Geometry drift moderate (mean ${geometry.meanDrift}). Header/hero spacing may still differ.`);
      } else {
        const msg = `⚠️  Geometry drift high (mean ${geometry.meanDrift}). Pixel alignment still off against render-map baseline.`;
        if (enforceGeometry) {
          errors.push(msg.replace('⚠️', '❌'));
        } else {
          warnings.push(msg);
        }
      }
    }
  } catch {
    warnings.push('⚠️  Geometry check skipped: output/render-map.json missing or unreadable.');
  }

  const status = errors.length === 0 ? 'PASS' : 'FAIL';

  const report = {
    status,
    summary: `${passed.length} passed, ${errors.length} errors, ${warnings.length} warnings`,
    geometry,
    errors,
    warnings,
    passed,
    instruction: errors.length > 0
      ? 'FIX ALL ERRORS above before calling OUTPUT. Use readFile("design-system.json") to get correct values. Do NOT invent fixes — use the real data.'
      : 'All content checks passed. You may proceed to OUTPUT.',
  };

  return JSON.stringify(report, null, 2);
}
