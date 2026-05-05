import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';

/**
 * Fetches a URL using a real headless browser and extracts a full Design System.
 * Output is a structured designSystem object — NOT a raw data dump.
 *
 * Extracts:
 *  - Layout grid (container width, section padding/spacing)
 *  - Spacing system (detected common values across 100 elements)
 *  - Color roles (primary, accent, muted, background)
 *  - Component structure (hero, navbar — presence, alignment, button count)
 *  - Typography scale (h1/h2/h3/body as parsed pixel floats + raw CSS)
 *  - Navbar behavior (sticky, height, blur)
 *  - Animations (named CSS animations found in the page)
 *  - Button system (top 5 buttons with full computed styles)
 *  - Hover sweep (what changed on hover for the primary CTA)
 *  - Real content (headings, body paragraphs, nav links, local image paths)
 *  - Render map (viewport, key node geometry, and computed style snapshots)
 */
export async function fetchURL({ url }) {
  if (!url) throw new Error('url is required');

  console.log(`[fetchURL] Launching headless browser for ${url}...`);
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });

    // Extra wait: React SPAs (like Scaler) hydrate AFTER networkidle2.
    // Scroll to trigger lazy-load and wait for JS to settle.
    await page.evaluate(() => window.scrollTo(0, 300));
    await new Promise(r => setTimeout(r, 2500));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 800));

    // ── FULL DESIGN SYSTEM EXTRACTION ─────────────────────────────────────────
    const rawData = await page.evaluate(() => {
      const cs = (el) => el ? window.getComputedStyle(el) : null;

      const detectTechStack = () => {
        const scripts = [...document.querySelectorAll('script[src]')].map((el) => el.src.toLowerCase());
        const links = [...document.querySelectorAll('link[href]')].map((el) => el.href.toLowerCase());
        const html = document.documentElement.outerHTML.toLowerCase();

        const tech = [];

        if (window.__NEXT_DATA__ || scripts.some((src) => src.includes('/_next/')) || html.includes('nextjs')) {
          tech.push('Next.js');
        }
        if (window.__NUXT__ || html.includes('nuxt') || scripts.some((src) => src.includes('/_nuxt/'))) {
          tech.push('Nuxt');
        }
        if (html.includes('react') || scripts.some((src) => src.includes('react'))) {
          tech.push('React');
        }
        if (html.includes('vue') || scripts.some((src) => src.includes('vue'))) {
          tech.push('Vue');
        }
        if (html.includes('angular') || html.includes('ng-version')) {
          tech.push('Angular');
        }
        if (scripts.some((src) => src.includes('tailwind')) || links.some((href) => href.includes('tailwind'))) {
          tech.push('Tailwind CSS');
        }
        if (html.includes('bootstrap') || links.some((href) => href.includes('bootstrap'))) {
          tech.push('Bootstrap');
        }

        return [...new Set(tech)];
      };

      const getStyles = (el) => {
        const s = cs(el);
        if (!s) return null;
        return {
          fontSize:        s.fontSize,
          fontWeight:      s.fontWeight,
          lineHeight:      s.lineHeight,
          fontFamily:      s.fontFamily,
          color:           s.color,
          backgroundColor: s.backgroundColor,
          padding:         s.padding,
          margin:          s.margin,
          borderRadius:    s.borderRadius,
          boxShadow:       s.boxShadow,
          border:          s.border,
          letterSpacing:   s.letterSpacing,
          textTransform:   s.textTransform,
          display:         s.display,
          textAlign:       s.textAlign,
        };
      };

      // ── 1. TYPOGRAPHY SCALE ──────────────────────────────────────────────────
      const typographyScale = {};
      for (const tag of ['h1', 'h2', 'h3', 'h4', 'p']) {
        const el = document.querySelector(tag);
        if (el) {
          const s = cs(el);
          typographyScale[tag] = {
            ...getStyles(el),
            fontSizePx: parseFloat(s.fontSize),
            lineHeightPx: parseFloat(s.lineHeight),
          };
        }
      }

      // Real body paragraph (not hero-sized — must be < 30px and meaningful text)
      const bodyParagraph = [...document.querySelectorAll('p')]
        .find(el => parseFloat(cs(el).fontSize) < 30 && el.innerText.trim().length > 30);

      // ── 2. COLOR ROLES ───────────────────────────────────────────────────────
      const bodyS = cs(document.body);
      const primaryBtn  = document.querySelector('button, a[class*="btn"], a[class*="cta"], a[class*="primary"]');
      const mutedTextEl = [...document.querySelectorAll('p, span')]
        .find(el => parseFloat(cs(el).fontSize) < 18 && el.innerText.trim().length > 10);

      const colorRoles = {
        background:  bodyS.backgroundColor,
        textPrimary: bodyS.color,
        primaryCTA:  primaryBtn  ? cs(primaryBtn).backgroundColor  : null,
        mutedText:   mutedTextEl ? cs(mutedTextEl).color            : null,
        textOnCTA:   primaryBtn  ? cs(primaryBtn).color             : null,
      };

      // ── 3. BUTTON SYSTEM ─────────────────────────────────────────────────────
      const buttonSystem = [...document.querySelectorAll('button, a')]
        .filter(el => {
          const s   = cs(el);
          const txt = el.innerText.trim();
          return s.display !== 'none'
            && s.visibility !== 'hidden'
            && s.backgroundColor !== 'rgba(0, 0, 0, 0)'
            && txt.length > 1 && txt.length < 60;
        })
        .slice(0, 5)
        .map(el => {
          const s = cs(el);
          return {
            text:            el.innerText.trim(),
            tag:             el.tagName.toLowerCase(),
            backgroundColor: s.backgroundColor,
            color:           s.color,
            padding:         s.padding,
            borderRadius:    s.borderRadius,
            fontWeight:      s.fontWeight,
            fontSize:        s.fontSize,
            border:          s.border,
            boxShadow:       s.boxShadow,
            textTransform:   s.textTransform,
          };
        });

      // ── 4. LAYOUT GRID ───────────────────────────────────────────────────────
      const mainEl    = document.querySelector('main, [role="main"], .main, #main');
      const containerEl = document.querySelector('[class*="container"], [class*="wrapper"], [class*="inner"]');
      const sections  = [...document.querySelectorAll('section')].slice(0, 6);

      const layout = {
        containerWidth:    containerEl ? containerEl.offsetWidth      : mainEl?.offsetWidth || 1200,
        maxWidth:          containerEl ? cs(containerEl).maxWidth      : bodyS.maxWidth,
        sectionCount:      sections.length,
        sectionPaddings:   sections.map(el => cs(el).padding),
        sectionBackgrounds: sections.map(el => ({
          backgroundColor: cs(el).backgroundColor,
          color:           cs(el).color,
        })),
      };

      // ── 5. SPACING SYSTEM ────────────────────────────────────────────────────
      const allMargins = [...document.querySelectorAll('*')]
        .slice(0, 150)
        .map(el => {
          const s = cs(el);
          return [
            parseFloat(s.marginTop),
            parseFloat(s.marginBottom),
            parseFloat(s.paddingTop),
            parseFloat(s.paddingBottom),
          ];
        })
        .flat()
        .filter(v => v > 0 && v < 200);

      // Count frequency of each spacing value
      const spacingFreq = {};
      allMargins.forEach(v => {
        const rounded = Math.round(v);
        spacingFreq[rounded] = (spacingFreq[rounded] || 0) + 1;
      });
      // Keep top 8 most common values
      const spacingScale = Object.entries(spacingFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([val]) => Number(val))
        .sort((a, b) => a - b);

      // ── 6. EXACT HEADER SNAPSHOT ──────────────────────────────────────────────
      // Scaler uses a sticky div, not a semantic <header>. Try many selectors.
      const headerEl =
        document.querySelector('header') ||
        document.querySelector('[role="banner"]') ||
        document.querySelector('nav') ||
        // sticky/fixed top-level divs (common in React/Tailwind SPAs)
        [...document.querySelectorAll('div')].find(el => {
          const s = cs(el);
          return (s.position === 'sticky' || s.position === 'fixed') &&
                 parseInt(s.top || '99') <= 0 &&
                 el.offsetHeight > 40 &&
                 el.offsetHeight < 120;
        }) ||
        document.querySelector('body > div > div:first-child') ||
        document.body.firstElementChild;

      const headerSnapshot = headerEl ? {
        styles: {
          backgroundColor: cs(headerEl).backgroundColor,
          height:          headerEl.offsetHeight + 'px',
          position:        cs(headerEl).position,
          borderBottom:    cs(headerEl).borderBottom,
          backdropFilter:  cs(headerEl).backdropFilter,
          padding:         cs(headerEl).padding,
          zIndex:          cs(headerEl).zIndex,
        },
        isSticky: cs(headerEl).position === 'sticky' || cs(headerEl).position === 'fixed',
        hasBlur:  cs(headerEl).backdropFilter !== 'none',
        logo: (() => {
          const img = headerEl.querySelector('img');
          if (img) return { src: img.src || null, alt: img.alt || '', width: img.width + 'px' };
          // SVG logo fallback — grab the outerHTML briefly
          const svg = headerEl.querySelector('svg');
          return svg ? { src: null, alt: 'logo', isSvg: true } : null;
        })(),
        navLinks: [...headerEl.querySelectorAll('a')]
          .filter(a => {
            const txt = a.innerText.trim();
            const s   = cs(a);
            return txt.length > 1 && txt.length < 50 &&
                   s.display !== 'none' && s.visibility !== 'hidden';
          })
          .map(a => ({
            text:       a.innerText.trim(),
            href:       a.getAttribute('href') || '#',
            color:      cs(a).color,
            fontWeight: cs(a).fontWeight,
            fontSize:   cs(a).fontSize,
          }))
          .slice(0, 12),
        ctaButtons: [...headerEl.querySelectorAll('button, a')]
          .filter(el => {
            const bg  = cs(el).backgroundColor;
            const txt = el.innerText.trim();
            return bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' &&
                   txt.length > 1 && txt.length < 40;
          })
          .slice(0, 3)
          .map(el => ({
            text:            el.innerText.trim(),
            backgroundColor: cs(el).backgroundColor,
            color:           cs(el).color,
            padding:         cs(el).padding,
            borderRadius:    cs(el).borderRadius,
            border:          cs(el).border,
            fontWeight:      cs(el).fontWeight,
            fontSize:        cs(el).fontSize,
          })),
      } : null;

      // ── 7. EXACT HERO SNAPSHOT ────────────────────────────────────────────────
      // Try to find the hero — the section containing the h1 is the most reliable
      const h1Global = document.querySelector('h1');
      const heroEl =
        (h1Global?.closest('section')) ||
        (h1Global?.closest('[class*="hero"]')) ||
        document.querySelector('[class*="hero"]') ||
        document.querySelector('section') ||
        document.querySelector('main > div');

      const heroSnapshot = heroEl ? {
        styles: {
          backgroundColor:     cs(heroEl).backgroundColor,
          backgroundImage:     cs(heroEl).backgroundImage,
          minHeight:           cs(heroEl).minHeight,
          padding:             cs(heroEl).padding,
          display:             cs(heroEl).display,
          flexDirection:       cs(heroEl).flexDirection,
          justifyContent:      cs(heroEl).justifyContent,
          alignItems:          cs(heroEl).alignItems,
          textAlign:           cs(heroEl).textAlign,
          gridTemplateColumns: cs(heroEl).gridTemplateColumns,
        },
        h1: (() => {
          const el = heroEl.querySelector('h1') || document.querySelector('h1');
          return el ? {
            text:        el.innerText.trim(),
            fontSize:    cs(el).fontSize,
            fontWeight:  cs(el).fontWeight,
            lineHeight:  cs(el).lineHeight,
            color:       cs(el).color,
            fontFamily:  cs(el).fontFamily,
            maxWidth:    cs(el).maxWidth,
            textAlign:   cs(el).textAlign,
          } : null;
        })(),
        subheadings: [...heroEl.querySelectorAll('h2, h3')]
          .map(el => ({ text: el.innerText.trim(), fontSize: cs(el).fontSize, color: cs(el).color }))
          .filter(e => e.text.length > 0)
          .slice(0, 2),
        paragraphs: [...heroEl.querySelectorAll('p')]
          .map(p => ({ text: p.innerText.trim(), fontSize: cs(p).fontSize, color: cs(p).color }))
          .filter(p => p.text.length > 10)
          .slice(0, 3),
        buttons: [...heroEl.querySelectorAll('button, a')]
          .filter(el => {
            const bg  = cs(el).backgroundColor;
            const txt = el.innerText.trim();
            return bg !== 'rgba(0, 0, 0, 0)' && txt.length > 1 && txt.length < 60;
          })
          .slice(0, 3)
          .map(el => ({
            text:            el.innerText.trim(),
            backgroundColor: cs(el).backgroundColor,
            color:           cs(el).color,
            padding:         cs(el).padding,
            borderRadius:    cs(el).borderRadius,
            border:          cs(el).border,
            fontWeight:      cs(el).fontWeight,
            fontSize:        cs(el).fontSize,
          })),
        images: [...heroEl.querySelectorAll('img')].map(img => img.src).filter(Boolean).slice(0, 3),
      } : null;

      // ── 8. HERO COMPONENT STRUCTURE (layout analysis) ────────────────────────
      const heroStructure = heroEl ? {
        hasH1:       !!heroEl.querySelector('h1'),
        hasSubtext:  !!heroEl.querySelector('p'),
        buttonCount: heroEl.querySelectorAll('button, a').length,
        textAlign:   cs(heroEl).textAlign,
        background:  cs(heroEl).backgroundColor,
        minHeight:   cs(heroEl).minHeight,
        layout:      cs(heroEl).display,
        flexDir:     cs(heroEl).flexDirection,
        gridCols:    cs(heroEl).gridTemplateColumns,
      } : null;

      // ── EXACT FOOTER SNAPSHOT ─────────────────────────────────────────────────
      const footerEl = document.querySelector('footer, [role="contentinfo"]');
      const footerSnapshot = footerEl ? {
        styles: {
          backgroundColor: cs(footerEl).backgroundColor,
          color:           cs(footerEl).color,
          padding:         cs(footerEl).padding,
        },
        logo: (() => {
          const img = footerEl.querySelector('img, svg');
          return img ? { src: img.src || null, alt: img.alt || '' } : null;
        })(),
        // Group links by their parent column containers
        columns: (() => {
          const cols = [...footerEl.querySelectorAll('div, ul, section')]
            .filter(el => el.querySelectorAll('a').length >= 2)
            .slice(0, 6)
            .map(col => {
              const heading = col.querySelector('h2,h3,h4,h5,strong,b,span');
              const links   = [...col.querySelectorAll('a')]
                .map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') || '#' }))
                .filter(l => l.text.length > 0)
                .slice(0, 8);
              return { heading: heading?.innerText.trim() || null, links };
            })
            .filter(col => col.links.length > 0);
          return cols;
        })(),
        // All footer links flat
        allLinks: [...footerEl.querySelectorAll('a')]
          .map(a => ({ text: a.innerText.trim(), href: a.getAttribute('href') || '#' }))
          .filter(l => l.text.length > 0)
          .slice(0, 40),
        copyright: (() => {
          const match = footerEl.innerText.match(/(©|copyright|\(c\)).{0,100}/i);
          return match ? match[0].trim() : null;
        })(),
        socialLinks: [...footerEl.querySelectorAll('a')]
          .filter(a => /twitter|linkedin|instagram|facebook|youtube|x\.com/i.test(a.href || ''))
          .map(a => ({ platform: a.href, text: a.innerText.trim() || 'social' }))
          .slice(0, 6),
      } : null;

      // ── 9. LAYOUT PATTERNS (flex/grid alignment per section) ─────────────────
      const layoutPatterns = [...document.querySelectorAll('section')]
        .slice(0, 6)
        .map((el, i) => {
          const s = cs(el);
          return {
            sectionIndex:        i,
            display:             s.display,
            flexDirection:       s.flexDirection,
            justifyContent:      s.justifyContent,
            alignItems:          s.alignItems,
            gap:                 s.gap,
            gridTemplateColumns: s.gridTemplateColumns,
            padding:             s.padding,
            backgroundColor:     s.backgroundColor,
          };
        });

      // ── 10. HERO TEXT METRICS (text width + line break behavior) ─────────────
      const heroH1 = document.querySelector('h1');
      const heroTextMetrics = {
        h1MaxWidth:     heroH1 ? cs(heroH1).maxWidth          : null,
        h1TextAlign:    heroH1 ? cs(heroH1).textAlign         : null,
        h1OffsetWidth:  heroH1 ? heroH1.offsetWidth + 'px'    : null,
        heroTextAlign:  heroEl ? cs(heroEl).textAlign         : null,
        heroJustify:    heroEl ? cs(heroEl).justifyContent    : null,
        heroAlignItems: heroEl ? cs(heroEl).alignItems        : null,
      };

      // ── 11. FONT WEIGHT HIERARCHY ────────────────────────────────────────────
      const allWeights = [...document.querySelectorAll('*')]
        .slice(0, 120)
        .map(el => cs(el).fontWeight)
        .filter(Boolean);
      const weightFreq = {};
      allWeights.forEach(w => { weightFreq[w] = (weightFreq[w] || 0) + 1; });
      const fontWeightHierarchy = Object.entries(weightFreq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([weight, count]) => ({ weight, count }));

      // ── 12. BORDER + SHADOW SYSTEM ───────────────────────────────────────────
      const shadowPatterns = [...document.querySelectorAll('*')]
        .map(el => cs(el).boxShadow)
        .filter(s => s && s !== 'none')
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 5);

      const borderPatterns = [...document.querySelectorAll('*')]
        .map(el => cs(el).border)
        .filter(b => b && b !== '0px none rgb(0, 0, 0)' && !b.startsWith('0px'))
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 4);

      // ── 13. CSS ANIMATIONS ───────────────────────────────────────────────────
      const animations = [...document.querySelectorAll('*')]
        .map(el => cs(el).animationName)
        .filter(a => a && a !== 'none')
        .filter((v, i, arr) => arr.indexOf(v) === i)
        .slice(0, 8);

      // ── 14. CONTENT ──────────────────────────────────────────────────────────
      const headings   = [...document.querySelectorAll('h1, h2, h3')]
        .map(e => e.innerText.trim()).filter(Boolean).slice(0, 12);
      const paragraphs = [...document.querySelectorAll('p')]
        .map(e => e.innerText.trim()).filter(t => t.length > 20).slice(0, 8);
      const images     = [...document.querySelectorAll('img')]
        .map(img => img.src).filter(Boolean).slice(0, 8);

      return {
        techStack: detectTechStack(),
        meta: {
          title: document.title,
          description: document.querySelector('meta[name="description"]')?.content,
        },
        typographyScale,
        bodyParagraph: bodyParagraph ? {
          text:   bodyParagraph.innerText.trim().slice(0, 150),
          styles: getStyles(bodyParagraph),
        } : null,
        colorRoles,
        buttonSystem,
        layout,
        spacingScale,
        navbarInfo: headerSnapshot?.styles,
        navLinks: headerSnapshot?.navLinks,
        heroStructure,
        headerSnapshot,
        heroSnapshot,
        footerSnapshot,
        heroTextMetrics,
        layoutPatterns,
        fontWeightHierarchy,
        shadowPatterns,
        borderPatterns,
        animations,
        content: { headings, paragraphs, images },
      };
    });

    // ── HOVER SWEEP ───────────────────────────────────────────────────────────
    try {
      const ctaHandle = await page.$('button, a[class*="btn"], a[class*="cta"], a[class*="primary"]')
                     || await page.$('a, button');
      if (ctaHandle) {
        const before = await page.evaluate(el => ({
          boxShadow:       window.getComputedStyle(el).boxShadow,
          backgroundColor: window.getComputedStyle(el).backgroundColor,
          transform:       window.getComputedStyle(el).transform,
          color:           window.getComputedStyle(el).color,
        }), ctaHandle);

        await ctaHandle.hover();
        await new Promise(r => setTimeout(r, 450));

        const after = await page.evaluate(el => ({
          boxShadow:       window.getComputedStyle(el).boxShadow,
          backgroundColor: window.getComputedStyle(el).backgroundColor,
          transform:       window.getComputedStyle(el).transform,
          color:           window.getComputedStyle(el).color,
        }), ctaHandle);

        rawData.hoverSweep = {
          note:    'Mouse hovered over primary CTA. CSS recorded before and after.',
          before,
          after,
          changed: {
            boxShadow:       before.boxShadow       !== after.boxShadow,
            backgroundColor: before.backgroundColor !== after.backgroundColor,
            transform:       before.transform       !== after.transform,
            color:           before.color           !== after.color,
          },
        };
      }
    } catch (err) {
      console.log('[fetchURL] Hover sweep skipped:', err.message);
    }

    // ── RENDER MAP EXTRACTION (geometry + computed styles) ──────────────────
    const renderMap = await page.evaluate(() => {
      const cs = (el) => (el ? window.getComputedStyle(el) : null);

      const getRect = (el) => {
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: Number(rect.x.toFixed(2)),
          y: Number(rect.y.toFixed(2)),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
          top: Number(rect.top.toFixed(2)),
          left: Number(rect.left.toFixed(2)),
          right: Number(rect.right.toFixed(2)),
          bottom: Number(rect.bottom.toFixed(2)),
        };
      };

      const getSelector = (el) => {
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        const className = (el.className || '').toString().trim();
        if (className) {
          const firstClass = className.split(/\s+/)[0];
          if (firstClass) return `${el.tagName.toLowerCase()}.${firstClass}`;
        }
        return el.tagName.toLowerCase();
      };

      const snapshotNode = (name, el) => {
        if (!el) {
          return { name, selector: null, exists: false };
        }
        const s = cs(el);
        return {
          name,
          selector: getSelector(el),
          exists: true,
          text: (el.innerText || '').trim().slice(0, 160),
          rect: getRect(el),
          styles: {
            display: s.display,
            position: s.position,
            zIndex: s.zIndex,
            width: s.width,
            height: s.height,
            margin: s.margin,
            padding: s.padding,
            color: s.color,
            backgroundColor: s.backgroundColor,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing,
            textAlign: s.textAlign,
            border: s.border,
            borderRadius: s.borderRadius,
            boxShadow: s.boxShadow,
            transform: s.transform,
            opacity: s.opacity,
          },
        };
      };

      const headerEl = document.querySelector('header, [role="banner"], nav');
      const h1El = document.querySelector('h1');
      const heroEl = h1El?.closest('section') || document.querySelector('[class*="hero"]') || document.querySelector('section');
      const heroParaEl = heroEl
        ? [...heroEl.querySelectorAll('p')].find((p) => {
            const fs = parseFloat(cs(p).fontSize || '0');
            return fs >= 16 && fs <= 20 && (p.innerText || '').trim().length > 20;
          })
        : null;
      const heroButtons = heroEl ? [...heroEl.querySelectorAll('a,button')].slice(0, 2) : [];
      const footerEl = document.querySelector('footer, [role="contentinfo"]');

      const keyNodes = [
        snapshotNode('header', headerEl),
        snapshotNode('hero', heroEl),
        snapshotNode('hero_h1', h1El),
        snapshotNode('hero_paragraph', heroParaEl),
        snapshotNode('hero_button_primary', heroButtons[0]),
        snapshotNode('hero_button_secondary', heroButtons[1]),
        snapshotNode('footer', footerEl),
      ];

      const sectionRects = [...document.querySelectorAll('section')]
        .slice(0, 12)
        .map((el, i) => ({
          index: i,
          selector: getSelector(el),
          rect: getRect(el),
          backgroundColor: cs(el).backgroundColor,
        }));

      const dpr = window.devicePixelRatio || 1;
      const viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: dpr,
      };

      const documentMetrics = {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        bodyWidth: document.body.scrollWidth,
        bodyHeight: document.body.scrollHeight,
      };

      return {
        meta: {
          url: window.location.href,
          title: document.title,
          capturedAt: new Date().toISOString(),
          fontsStatus: document.fonts?.status || 'unknown',
        },
        viewport,
        documentMetrics,
        keyNodes,
        sectionRects,
      };
    });

    await browser.close();

    // ── ASSET DOWNLOADING ─────────────────────────────────────────────────────
    const outputImagesDir = path.resolve('output', 'images');
    await fs.mkdir(outputImagesDir, { recursive: true });

    const localImages = [];
    for (let i = 0; i < rawData.content.images.length; i++) {
      try {
        let imgUrl = rawData.content.images[i];
        if (!imgUrl || imgUrl.startsWith('data:') || imgUrl.startsWith('blob:')) continue;
        if (imgUrl.startsWith('/')) {
          const base = new URL(url);
          imgUrl = `${base.protocol}//${base.host}${imgUrl}`;
        }

        console.log(`[fetchURL] Downloading asset ${i + 1}: ${imgUrl}`);
        const res = await fetch(imgUrl, { timeout: 8000 });
        if (!res.ok) continue;

        const buffer   = await res.arrayBuffer();
        const extMatch = imgUrl.match(/\.(png|jpg|jpeg|svg|webp|avif|gif)/i);
        const ext      = extMatch ? extMatch[1].toLowerCase() : 'png';
        const filename = `asset-${i + 1}.${ext}`;

        await fs.writeFile(path.join(outputImagesDir, filename), Buffer.from(buffer));
        localImages.push(`./images/${filename}`);
      } catch (err) {
        console.log(`[fetchURL] Asset ${i + 1} skipped: ${err.message}`);
      }
    }
    rawData.content.images = localImages;

    // ── BUILD STRUCTURED DESIGN SYSTEM ───────────────────────────────────────
    // This is the key insight: we don't dump raw data.
    // We convert everything into a structured, role-based design system
    // that the agent can directly reference without interpretation.
    const designSystem = {
      _meta: {
        url,
        extractedAt: new Date().toISOString(),
        note: 'All values are exact browser-computed measurements. Use them as-is. Do NOT invent or substitute any value.',
      },

      techStack: rawData.techStack,

      colors: {
        background:    rawData.colorRoles.background,
        text:          rawData.colorRoles.textPrimary,
        accent:        rawData.colorRoles.primaryCTA,
        accentText:    rawData.colorRoles.textOnCTA,
        mutedText:     rawData.colorRoles.mutedText,
        // Section alternation — pick the most common non-body background
        sections: rawData.layout.sectionBackgrounds,
      },

      typography: {
        displayFont: rawData.typographyScale.h1?.fontFamily || rawData.typographyScale.h2?.fontFamily,
        bodyFont:    rawData.typographyScale.h3?.fontFamily || rawData.bodyParagraph?.styles?.fontFamily,
        scale: {
          h1:   rawData.typographyScale.h1,
          h2:   rawData.typographyScale.h2,
          h3:   rawData.typographyScale.h3,
          body: rawData.bodyParagraph?.styles || rawData.typographyScale.p,
        },
      },

      spacing: {
        detectedScale: rawData.spacingScale,
        sectionPaddings: rawData.layout.sectionPaddings,
        note: 'Use detectedScale values for margins/gaps. Use sectionPaddings for section padding.',
      },

      layout: {
        containerWidth:  rawData.layout.containerWidth,
        maxWidth:        rawData.layout.maxWidth,
        sectionCount:    rawData.layout.sectionCount,
        patterns:        rawData.layoutPatterns,
        heroTextMetrics: rawData.heroTextMetrics,
      },

      typographySystem: {
        fontWeightHierarchy: rawData.fontWeightHierarchy,
        note: 'fontWeightHierarchy[0] is the most common weight (body), highest values are used for headings.',
      },

      shadowSystem: {
        shadows: rawData.shadowPatterns,
        borders: rawData.borderPatterns,
        note: 'Use shadows[0] for cards, shadows that contain blur are for modals/dropdowns.',
      },

      components: {
        navbar: {
          ...rawData.navbarInfo,
          links: rawData.navLinks,
        },
        hero:    rawData.heroStructure,
        buttons: rawData.buttonSystem,
      },

      // ─── EXACT SECTION SNAPSHOTS (use these to build HTML A-to-Z) ───────────
      sections: {
        header: rawData.headerSnapshot,
        hero:   rawData.heroSnapshot,
        footer: rawData.footerSnapshot,
        note: 'These are exact DOM snapshots. Use header.navLinks for nav items, hero.h1.text for the headline, footer.columns for footer link groups, footer.copyright for copyright text. Do NOT invent any of this content.',
      },

      interactions: {
        hoverSweep: rawData.hoverSweep,
        animations:  rawData.animations,
      },

      content: {
        headings:   rawData.content.headings,
        paragraphs: rawData.content.paragraphs,
        images:     rawData.content.images, // Already local ./images/ paths
        bodyText:   rawData.bodyParagraph?.text,
      },
    };

    // ── SAVE FULL DESIGN SYSTEM TO FILE ──────────────────────────────────────
    // We write the full JSON to disk so the agent can readFile it on demand.
    // We do NOT return the full 20KB string — that causes context overflow
    // and kills the Gemini API connection mid-generation.
    const outputDir = path.resolve('output');
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(
      path.join(outputDir, 'design-system.json'),
      JSON.stringify(designSystem, null, 2),
      'utf-8',
    );

    await fs.writeFile(
      path.join(outputDir, 'render-map.json'),
      JSON.stringify(renderMap, null, 2),
      'utf-8',
    );

    // ── RETURN COMPACT SUMMARY (safe for context) ─────────────────────────────
    const summary = {
      _status: 'SUCCESS',
      _savedTo: 'output/design-system.json',
      _renderMapSavedTo: 'output/render-map.json',
      _note: 'Full design system saved to file. Use readFile("design-system.json") to access any field. Key data inlined below.',

      techStack: designSystem.techStack,

      // Colors
      bg:      designSystem.colors.background,
      text:    designSystem.colors.text,
      accent:  designSystem.colors.accent,
      muted:   designSystem.colors.mutedText,
      sectionAlt: designSystem.colors.sections.find(s => s.backgroundColor !== 'rgba(0, 0, 0, 0)')?.backgroundColor || null,

      // Typography (key values only)
      h1: { text: designSystem.sections?.hero?.h1?.text, fontSize: designSystem.typography.scale.h1?.fontSize, fontWeight: designSystem.typography.scale.h1?.fontWeight, color: designSystem.typography.scale.h1?.color },
      h2: { fontSize: designSystem.typography.scale.h2?.fontSize, fontWeight: designSystem.typography.scale.h2?.fontWeight },
      bodyFontSize: designSystem.typography.scale.body?.fontSize,
      displayFont: designSystem.typography.displayFont,
      bodyFont:    designSystem.typography.bodyFont,

      // Layout
      containerWidth: designSystem.layout.containerWidth,
      spacingScale:   designSystem.spacing.detectedScale,

      // Buttons (top 2)
      primaryBtn:   designSystem.components.buttons?.[1],
      secondaryBtn: designSystem.components.buttons?.[0],

      // Section snapshots summary
      header: {
        isSticky:   designSystem.sections.header?.isSticky,
        hasBlur:    designSystem.sections.header?.hasBlur,
        height:     designSystem.sections.header?.styles?.height,
        logo:       designSystem.sections.header?.logo,
        navLinks:   designSystem.sections.header?.navLinks?.slice(0, 8),
        ctaButtons: designSystem.sections.header?.ctaButtons,
      },
      hero: {
        h1:         designSystem.sections.hero?.h1,
        paragraph:  designSystem.sections.hero?.paragraphs?.[1],
        buttons:    designSystem.sections.hero?.buttons,
        bgColor:    designSystem.sections.hero?.styles?.backgroundColor,
        bgImage:    designSystem.sections.hero?.styles?.backgroundImage !== 'none' ? designSystem.sections.hero?.styles?.backgroundImage : null,
      },
      footer: {
        bgColor:     designSystem.sections.footer?.styles?.backgroundColor,
        logo:        designSystem.sections.footer?.logo,
        columns:     designSystem.sections.footer?.columns?.slice(0, 4),
        allLinks:    designSystem.sections.footer?.allLinks?.slice(0, 10),
        copyright:   designSystem.sections.footer?.copyright,
        socialLinks: designSystem.sections.footer?.socialLinks,
      },

      // Content
      headings:  designSystem.content.headings,
      paragraphs: designSystem.content.paragraphs,
      images:    designSystem.content.images,
      animations: designSystem.interactions.animations,

      // Shadow/border
      cardShadow:    designSystem.shadowSystem.shadows?.[0],
      primaryBorder: designSystem.shadowSystem.borders?.[0],
    };

    return JSON.stringify(summary, null, 2);

  } catch (error) {
    await browser.close();
    throw new Error(`Puppeteer failed to fetch ${url}: ${error.message}`);
  }
}
