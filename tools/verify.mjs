/**
 * Development-only verification pass.
 *
 * Starts the production Next.js server, drives the locally installed Google
 * Chrome over the DevTools Protocol, and captures the site at the target
 * viewport sizes. With --live-rsvp it also exercises the configured Neon-backed
 * form; DATABASE_URL, RSVP_ADMIN_TOKEN and RATE_LIMIT_SECRET must then be set.
 *
 * Everything runs and shuts down inside this one process, so there are no
 * lingering background servers.
 *
 * Neither application depends on this file.
 *
 *   node tools/verify.mjs                 # screenshots and layout checks
 *   node tools/verify.mjs --live-rsvp     # plus RSVP create/update checks
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB_DIR = path.join(ROOT, "apps/web");
const NEXT_BUILD = path.join(WEB_DIR, ".next/BUILD_ID");
const OUT_DIR = path.join(ROOT, ".screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WEB_PORT = Number(process.env.VERIFY_WEB_PORT ?? 3000);
const WEB_URL = `http://localhost:${WEB_PORT}/`;

const runLiveRsvp = process.argv.includes("--live-rsvp");
const SECTION_IDS = (process.env.VERIFY_SECTIONS ?? "davet,program,mekan,katilim")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const ALL_VIEWPORTS = [
  /* Layout assertions care about CSS pixels. A 1x capture keeps the automated
     pass lightweight; high-density crops are inspected separately in-browser. */
  { name: "390x844", width: 390, height: 844, dsf: 1, mobile: false },
  { name: "430x932", width: 430, height: 932, dsf: 1, mobile: false },
  { name: "768x1024", width: 768, height: 1024, dsf: 1, mobile: false },
  { name: "1119x900", width: 1119, height: 900, dsf: 1, mobile: false },
  { name: "1121x900", width: 1121, height: 900, dsf: 1, mobile: false },
  { name: "1366x768", width: 1366, height: 768, dsf: 1, mobile: false },
  { name: "1440x900", width: 1440, height: 900, dsf: 1, mobile: false },
  { name: "1920x1080", width: 1920, height: 1080, dsf: 1, mobile: false },
];
const requestedViewports = (process.env.VERIFY_VIEWPORTS ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const VIEWPORTS = requestedViewports.length === 0
  ? ALL_VIEWPORTS
  : ALL_VIEWPORTS.filter((viewport) => requestedViewports.includes(viewport.name));

if (VIEWPORTS.length === 0) {
  throw new Error(`No configured viewport matches VERIFY_VIEWPORTS=${process.env.VERIFY_VIEWPORTS}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const teardown = [];

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

/* ---------------------------------------------------------- Next.js server */

async function startWeb() {
  const web = spawn("pnpm", ["exec", "next", "start", "--hostname", "127.0.0.1", "--port", String(WEB_PORT)], {
    cwd: WEB_DIR,
    stdio: "ignore",
    env: { ...process.env, RSVP_MAX_GUESTS: process.env.RSVP_MAX_GUESTS ?? "10" },
  });
  let stopped = false;
  teardown.push(function killWeb() {
    if (stopped) return;
    stopped = true;
    web.kill("SIGTERM");
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(WEB_URL);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("Next.js did not become ready.");
}

/* ------------------------------------------------------------------ chrome */

async function startChrome() {
  const profile = mkdtempSync(path.join(tmpdir(), "chrome-verify-"));
  const port = 9400 + Math.floor(Math.random() * 300);

  const chrome = spawn(
    CHROME,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--headless=new",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
    ],
    { stdio: "ignore" },
  );

  teardown.push(() => {
    chrome.kill();
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* Chrome may still be releasing files; the OS will clean up /tmp. */
    }
  });

  let wsUrl = null;
  for (let attempt = 0; attempt < 60 && !wsUrl; attempt += 1) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      wsUrl = targets.find((t) => t.type === "page")?.webSocketDebuggerUrl ?? null;
    } catch {
      /* not up yet */
    }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error("Chrome did not expose a debugging target.");

  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  teardown.push(() => ws.close());

  let messageId = 0;
  const pending = new Map();
  const logs = [];

  ws.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const msg = JSON.parse(event.data);

    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }

    if (msg.method === "Runtime.consoleAPICalled") {
      logs.push({
        level: msg.params.type,
        text: msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "),
      });
    } else if (msg.method === "Log.entryAdded") {
      logs.push({ level: msg.params.entry.level, text: msg.params.entry.text });
    } else if (msg.method === "Runtime.exceptionThrown") {
      logs.push({
        level: "exception",
        text: msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text,
      });
    }
  });

  const send = (method, params = {}) => {
    const id = ++messageId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? "evaluate failed");
    }
    return result.value;
  };

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");

  /* Injected per document rather than after each navigation. The RSVP form is
     part of the prerendered markup, so waiting for it to appear can be
     satisfied by the document we are navigating away from; helpers and typed
     values would then land in a page that is about to be discarded. The
     `__docId` marker lets `loadForm` wait for a genuinely new document. */
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `${FILL_HELPERS}\nwindow.__docId = Math.random().toString(36).slice(2);`,
  });

  return { send, evaluate, logs };
}

/* -------------------------------------------------------------- page probes */

const MEASURE = `(() => {
  const de = document.documentElement;
  const vw = de.clientWidth;
  const names = document.querySelector('.hero-title');
  const nb = names && names.getBoundingClientRect();
  const ns = names && getComputedStyle(names);
  const img = document.querySelector(vw < 864 ? '.hero-venue-image-mobile' : '.hero-venue-image-desktop');
  const ib = img && img.getBoundingClientRect();
  const countdown = document.querySelector('.hero-countdown');
  const cb = countdown && countdown.getBoundingClientRect();
  const countdownBand = document.querySelector('.hero-countdown-band');
  const cbb = countdownBand && countdownBand.getBoundingClientRect();
  const heroDetails = document.querySelector('.hero-details');
  const hdb = heroDetails && heroDetails.getBoundingClientRect();
  const verticalDate = document.querySelector('.hero-vertical-date');
  const vdtb = verticalDate && verticalDate.getBoundingClientRect();
  const titleParts = names && [...names.querySelectorAll('span, i')].map((el) => el.getBoundingClientRect());
  const venueDetail = document.querySelector('#mekan .venue-art-crop img');
  const vdb = venueDetail && venueDetail.getBoundingClientRect();
  const venueDetailFrame = document.querySelector('#mekan .venue-art-crop');
  const vdfb = venueDetailFrame && venueDetailFrame.getBoundingClientRect();
  const venueDetailStyle = venueDetail && getComputedStyle(venueDetail);
  const venueCopy = document.querySelector('#mekan .venue-copy');
  const vcb = venueCopy && venueCopy.getBoundingClientRect();
  const venueTitle = document.querySelector('#mekan .venue-copy h2');
  const venueTitleWordsUnbroken = venueTitle ? (() => {
    const node = venueTitle.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    return [...node.textContent.matchAll(/\S+/g)].every((match) => {
      const range = document.createRange();
      range.setStart(node, match.index);
      range.setEnd(node, match.index + match[0].length);
      return range.getClientRects().length === 1;
    });
  })() : false;
  /* The honeypot is parked off-screen and is never focused or tapped, so it is
     excluded from the touch-target and font-size checks. */
  const controls = [...document.querySelectorAll('#katilim .field-input, #katilim label.choice, #katilim button[type=submit]')]
    .map(el => ({ el: el.tagName.toLowerCase() + (el.classList.contains('choice') ? '.choice' : ''),
                  fontSize: parseFloat(getComputedStyle(el).fontSize),
                  h: Math.round(el.getBoundingClientRect().height) }));
  const typedFields = controls.filter(c => ['input', 'select', 'textarea'].includes(c.el));
  return {
    viewport: { w: vw, h: de.clientHeight },
    horizontalOverflow: de.scrollWidth > vw,
    scrollWidth: de.scrollWidth,
    names: nb && {
      w: Math.round(nb.width),
      top: Math.round(nb.top),
      bottom: Math.round(nb.bottom),
      left: Math.round(nb.left),
      right: Math.round(nb.right),
      fontSize: ns.fontSize,
      stacked: Boolean(titleParts && titleParts.length === 3 && titleParts[0].top < titleParts[1].top && titleParts[1].top < titleParts[2].top),
    },
    illustration: ib && {
      w: Math.round(ib.width), h: Math.round(ib.height),
      top: Math.round(ib.top), bottom: Math.round(ib.bottom),
      left: Math.round(ib.left), right: Math.round(ib.right),
      pctOfViewportWidth: Math.round(ib.width / vw * 100),
      fileServed: (img.currentSrc || '').split('/').pop(),
      artDirectedCrop: ib.left < -0.5 || ib.right > vw + 0.5
    },
    /* Mobile art is intentionally cropped past the viewport edges; it still
       fills the opening when it fully covers the viewport's vertical span. */
    heroArtworkFillsOpeningScreen: ib ? ib.top <= 1 && ib.bottom >= de.clientHeight - 1 : null,
    heroDetails: hdb && {
      top: Math.round(hdb.top),
      left: Math.round(hdb.left),
      gapBelowNames: nb ? Math.round(hdb.top - nb.bottom) : null,
    },
    heroCountdown: cb && {
      left: Math.round(cb.left),
      top: Math.round(cb.top),
      width: Math.round(cb.width),
      gapAfterArtworkFade: cbb ? Math.round(cb.top - cbb.top) : null,
      clearsArtworkFade: cbb ? cb.top >= cbb.top - 1 : null,
      insideBand: cbb ? cb.top >= cbb.top - 1 && cb.bottom <= cbb.bottom + 1 : null,
    },
    heroCountdownBand: cbb && {
      top: Math.round(cbb.top),
      liftIntoFadedTail: ib ? Math.round(ib.bottom - cbb.top) : null,
      beginsInsideFadedTail: ib ? cbb.top < ib.bottom : null,
    },
    heroVerticalDate: vdtb && {
      rightGap: Math.round(vw - vdtb.right),
      verticallyInside: vdtb.top >= 0 && vdtb.bottom <= de.clientHeight,
    },
    venueDetail: vdb && {
      w: Math.round(vdb.width), h: Math.round(vdb.height),
      right: Math.round(vdb.right),
      rightEdgeGap: Math.round(vw - vdb.right),
      fileServed: (venueDetail.currentSrc || venueDetail.getAttribute('src') || '').split('/').pop(),
      aspect: Number((vdb.width / vdb.height).toFixed(3)),
      pctOfViewportWidth: Math.round(vdb.width / vw * 100),
      gapFromCopy: vcb ? Math.round(vdb.left - vcb.right) : null,
      containedInFrame: Boolean(vdfb && vdb.left >= vdfb.left - 1 && vdb.right <= vdfb.right + 1),
      featheredSides: venueDetailStyle?.maskImage !== 'none',
      fadesOnMultipleEdges: (venueDetailStyle?.maskImage.match(/linear-gradient/g) || []).length >= 2,
    },
    venueMapPanelPresent: Boolean(document.querySelector('#mekan .venue-map, #mekan iframe')),
    venueTitleHasEditorialLine: Boolean(document.querySelector('#mekan .editorial-line')),
    venueTitleWordsUnbroken,
    formControls: controls,
    smallestTypedFieldFontSize: typedFields.length ? Math.min(...typedFields.map(i => i.fontSize)) : null,
    smallestControlHeight: controls.length ? Math.min(...controls.map(i => i.h)) : null,
    smallestControlFontSize: controls.length ? Math.min(...controls.map(i => i.fontSize)) : null,
    hiddenRevealsAfterHydration: [...document.querySelectorAll('[data-reveal],[data-choreography],[data-timeline-stop]')]
      .filter(el => {
        const b = el.getBoundingClientRect();
        const onScreen = b.top < de.clientHeight && b.bottom > 0;
        return onScreen && parseFloat(getComputedStyle(el).opacity) < 0.9;
      }).length,
    timelineStops: document.querySelectorAll('[data-timeline-stop]').length,
    timelineHiddenStops: [...document.querySelectorAll('[data-timeline-stop]')]
      .filter(el => parseFloat(getComputedStyle(el).opacity) < 0.9).length,
    timelineScaleY: (() => {
      const el = document.querySelector('[data-timeline-progress]');
      if (!el) return null;
      const transform = getComputedStyle(el).transform;
      return transform === 'none' ? 1 : Number(new DOMMatrix(transform).d.toFixed(3));
    })()
  };
})()`;

/* Every visual handoff is checked against the actual rendered layout. The
   gradient check uses Chrome's resolved stop positions, so it catches the
   Safari failure mode where mixed units cause later stops to be clamped onto
   an earlier stop and create a hard horizontal colour line. */
const CONTINUITY_PROBE = `(() => {
  const rect = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return {
      top: box.top + scrollY,
      right: box.right + scrollX,
      bottom: box.bottom + scrollY,
      left: box.left + scrollX,
    };
  };
  const boundaries = [
    ['hero → invitation', '.hero-artwork', '#davet', '.hero-paper', '#davet'],
    ['invitation → program', '#davet', '#program'],
    ['program → venue', '#program', '#mekan'],
    ['venue → RSVP', '#mekan', '#katilim'],
    ['RSVP → footer', '#katilim', 'footer'],
  ].map(([name, fromSelector, toSelector, fromCanvasSelector = fromSelector, toCanvasSelector = toSelector]) => {
    const from = rect(fromSelector);
    const to = rect(toSelector);
    const fromStyle = document.querySelector(fromCanvasSelector) && getComputedStyle(document.querySelector(fromCanvasSelector));
    const toStyle = document.querySelector(toCanvasSelector) && getComputedStyle(document.querySelector(toCanvasSelector));
    return {
      name,
      connected: Boolean(from && to && Math.abs(from.bottom - to.top) <= 1),
      fromBackgroundImage: fromStyle?.backgroundImage ?? null,
      toBackgroundImage: toStyle?.backgroundImage ?? null,
    };
  });
  const gradientStops = (selector) => {
    const el = document.querySelector(selector);
    if (!el) return { selector, missing: true };
    const image = getComputedStyle(el).backgroundImage;
    const match = image.match(/linear-gradient\\((.*)\\)$/);
    const height = el.getBoundingClientRect().height;
    const stops = [...(match?.[1] ?? '').matchAll(/(?:^|[,\\s])(-?\\d+(?:\\.\\d+)?)(px|%)(?=\\s*(?:,|\\)))/g)]
      .map(([, value, unit]) => Number(value) * (unit === '%' ? height / 100 : 1));
    return {
      selector,
      stops: stops.map((value) => Math.round(value * 100) / 100),
      strictlyIncreasing: stops.every((value, index) => index === 0 || value > stops[index - 1]),
    };
  };
  const venue = rect('#mekan');
  const botanical = rect('.evening-botanical-upper');
  const hero = rect('.hero-artwork');
  const heroPaper = rect('.hero-paper');
  const heroArtwork = rect('.hero-venue-art');
  const countdownBand = rect('.hero-countdown-band');
  const heroPaperStyle = document.querySelector('.hero-paper') && getComputedStyle(document.querySelector('.hero-paper'));
  const heroArtworkStyle = document.querySelector('.hero-venue-art') && getComputedStyle(document.querySelector('.hero-venue-art'));
  const countdownBandStyle = document.querySelector('.hero-countdown-band') && getComputedStyle(document.querySelector('.hero-countdown-band'));
  const invitation = rect('#davet');
  const program = rect('#program');
  const invitationBotanicals = [...document.querySelectorAll('.invitation-botanical')].map((el) => {
    const box = el.getBoundingClientRect();
    return {
      top: box.top + scrollY,
      right: box.right + scrollX,
      bottom: box.bottom + scrollY,
      left: box.left + scrollX,
    };
  });
  const invitationUsesOneLeftBotanicalBridge = Boolean(
    invitation && program && invitationBotanicals.length === 1 &&
    invitationBotanicals[0].left < invitation.left + (invitation.right - invitation.left) / 2 &&
    invitationBotanicals[0].top >= invitation.top &&
    invitationBotanicals[0].bottom > invitation.bottom + 1 &&
    invitationBotanicals[0].bottom <= program.top + (program.bottom - program.top) * 0.55,
  );
  const botanicalBridgeSelectors = [
    '.hero-countdown-botanical',
    '.invitation-botanical',
    '.evening-botanical-upper',
    '.evening-botanical-lower',
  ];
  const botanicalsFadeAtCanvasEdges = botanicalBridgeSelectors.every((selector) => {
    const el = document.querySelector(selector);
    if (!el) return false;
    const style = getComputedStyle(el);
    return Number(style.opacity) > 0 && style.maskImage !== 'none';
  });
  const botanicalParentsAllowOverflow = [
    '.hero-artwork',
    '#davet',
    '.evening-experience',
  ].every((selector) => getComputedStyle(document.querySelector(selector)).overflow !== 'hidden');
  return {
    boundaries,
    gradients: [gradientStops('#davet'), gradientStops('#program'), gradientStops('#mekan'), gradientStops('#katilim'), gradientStops('footer')],
    venueClearsIncomingEveningArtwork: Boolean(venue && botanical && venue.bottom <= botanical.top),
    heroTransitionsThroughCountdownBand: Boolean(
      hero && heroPaper && heroArtwork && countdownBand &&
      heroPaper.bottom > hero.bottom + 1 &&
      heroArtwork.bottom > countdownBand.top &&
      heroArtwork.bottom - countdownBand.top <= 200 &&
      heroPaperStyle?.maskImage !== 'none' &&
      heroArtworkStyle?.maskImage !== 'none',
    ),
    countdownBandKeepsContinuousCanvas: Boolean(
      countdownBandStyle?.backgroundColor === 'rgba(0, 0, 0, 0)' &&
      countdownBandStyle?.backgroundImage === 'none',
    ),
    invitationUsesOneLeftBotanicalBridge,
    botanicalsFadeAtCanvasEdges,
    botanicalParentsAllowOverflow,
  };
})()`;

/* --------------------------------------------------------------------- run */

async function captureViewports(chrome, { suffix, reducedMotion }) {
  const results = {};

  await chrome.send("Emulation.setEmulatedMedia", {
    features: reducedMotion ? [{ name: "prefers-reduced-motion", value: "reduce" }] : [],
  });

  await chrome.send("Page.navigate", { url: WEB_URL });
  await waitFor(chrome, `document.readyState === 'complete'`, { label: "viewport document" });

  for (const vp of VIEWPORTS) {
    await chrome.send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: vp.dsf,
      mobile: vp.mobile,
    });

    chrome.logs.length = 0;
    await chrome.evaluate(`window.scrollTo(0, 0); true`);
    // Let the reveal animations finish so the capture shows the settled page.
    await sleep(1800);

    const measured = await chrome.evaluate(MEASURE);
    if (measured.viewport.w !== vp.width) {
      throw new Error(`Viewport override failed: wanted ${vp.width}, page reports ${measured.viewport.w}`);
    }

    const tag = `${vp.name}${suffix ? `-${suffix}` : ""}`;
    /* Full-page captures at a 3x device scale can exceed Chrome's practical
       raster size for this long invitation. Each section is captured after it
       is scrolled into view below, so the fold image is the useful viewport
       artifact here and keeps the verifier fast and deterministic. */
    const shot = await chrome.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(path.join(OUT_DIR, `${tag}-fold.png`), Buffer.from(shot.data, "base64"));

    await chrome.evaluate(`document.querySelector('.hero-countdown-band')?.scrollIntoView({ block: 'center' }); true`);
    await sleep(250);
    const countdownShot = await chrome.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(path.join(OUT_DIR, `${tag}-countdown.png`), Buffer.from(countdownShot.data, "base64"));

    results[vp.name] = {
      ...measured,
      continuity: await chrome.evaluate(CONTINUITY_PROBE),
      consoleOutput: [...chrome.logs],
    };
  }

  return results;
}

/**
 * Fills a React Hook Form field the way a person would.
 *
 * Assigning `.value` directly does not notify React, so the native property
 * setter is called and an `input` event dispatched, which is what React's
 * delegated listener is waiting for.
 */
const FILL_HELPERS = `
window.__fill = (selector, value) => {
  const el = document.querySelector(selector);
  if (!el) throw new Error('No element for ' + selector);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
              : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
              : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
  return true;
};
window.__clickText = (selector, text) => {
  const el = [...document.querySelectorAll(selector)].find(e => e.textContent.trim() === text);
  if (!el) throw new Error('No ' + selector + ' with text ' + text);
  el.click();
  return true;
};
window.__text = (selector) => (document.querySelector(selector)?.innerText ?? '');
true;
`;

async function waitFor(chrome, expression, { timeout = 12_000, label = expression } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      if (await chrome.evaluate(`Boolean(${expression})`)) return true;
    } catch {
      /* Mid-navigation the execution context is torn down and evaluation
         fails. That is expected here, so keep polling until the deadline. */
    }
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${label}`);
    await sleep(150);
  }
}

async function loadForm(chrome) {
  const previous = await chrome.evaluate(`window.__docId ?? null`);
  const query = new URLSearchParams({ verify: String(Date.now()) });
  await chrome.send("Page.navigate", { url: `${WEB_URL}?${query}` });

  await waitFor(
    chrome,
    `(window.__docId != null && window.__docId !== ${JSON.stringify(previous)}
      && document.readyState === 'complete'
      && typeof window.__fill === 'function'
      && Boolean(document.querySelector('#katilim form'))) || null`,
    { label: "a fresh document with the RSVP form" },
  );
}

/**
 * Scrolls each section into view and captures it.
 *
 * A whole-page capture is useless for this site: the scroll-revealed sections
 * never enter the viewport during such a capture, so they photograph at
 * `opacity: 0`. Scrolling to each one is what shows the real rendered page, and
 * it doubles as a check that every reveal does fire.
 */
async function captureSections(chrome, viewport) {
  const sections = SECTION_IDS;
  const results = {};

  await chrome.send("Emulation.setEmulatedMedia", { features: [] });
  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.dsf,
    mobile: viewport.mobile,
  });

  await chrome.send("Page.navigate", { url: WEB_URL });
  await waitFor(chrome, `document.readyState === 'complete'`, { label: `${viewport.name} document` });
  await sleep(2500);

  for (const id of sections) {
    const sectionRange = await chrome.evaluate(`(() => {
      const section = document.getElementById(${JSON.stringify(id)});
      const box = section.getBoundingClientRect();
      return { top: box.top + scrollY, height: box.height };
    })()`);

    /* Walk the section through the viewport before returning to its opening
       composition. This verifies the intended progressive choreography: a
       tall timeline should not be expected to reveal every stop at once. */
    const lastScroll = Math.max(sectionRange.top, sectionRange.top + sectionRange.height - viewport.height * 0.72);
    const scrollStops = [
      sectionRange.top,
      sectionRange.top + sectionRange.height * 0.34,
      sectionRange.top + sectionRange.height * 0.68,
      lastScroll,
    ];
    for (const y of scrollStops) {
      await chrome.evaluate(`window.scrollTo({ top: ${JSON.stringify(y)}, behavior: 'instant' }); true`);
      await sleep(600);
    }
    await chrome.evaluate(`window.scrollTo({ top: ${JSON.stringify(sectionRange.top)}, behavior: 'instant' }); true`);
    await sleep(1200);

    const shot = await chrome.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(
      path.join(OUT_DIR, `section-${id}-${viewport.name}.png`),
      Buffer.from(shot.data, "base64"),
    );

    results[id] = await chrome.evaluate(`(() => {
      const de = document.documentElement;
      const section = document.getElementById(${JSON.stringify(id)});
      const reveals = [...section.querySelectorAll('[data-reveal],[data-choreography],[data-timeline-stop]')]
        .filter(el => el.textContent.trim().length > 0);
      const stillHidden = reveals.filter(el => {
        const box = el.getBoundingClientRect();
        const visiblePixels = Math.min(box.bottom, innerHeight) - Math.max(box.top, 0);
        const visibleRatio = Math.max(0, visiblePixels) / Math.max(1, Math.min(box.height, innerHeight));
        /* useInView intentionally waits until a meaningful portion is visible.
           A decorative edge or the next timeline stop grazing the viewport is
           still in its pre-reveal state by design. */
        const meaningfullyVisible = visibleRatio >= 0.62;
        return meaningfullyVisible && parseFloat(getComputedStyle(el).opacity) < 0.9;
      });
      const quote = section.querySelector('.invitation-copy p');
      let quoteLines = null;
      if (quote) {
        const cs = getComputedStyle(quote);
        quoteLines = Math.round(quote.getBoundingClientRect().height / parseFloat(cs.lineHeight));
      }

      return {
        revealCount: reveals.length,
        stillHidden: stillHidden.length,
        hiddenDetails: stillHidden.map(el => ({
          tag: el.tagName.toLowerCase(),
          className: el.className,
          text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
          opacity: getComputedStyle(el).opacity,
        })),
        horizontalOverflow: de.scrollWidth > de.clientWidth,
        quoteLines,
        textSample: section.innerText.replace(/\\s+/g, ' ').trim().slice(0, 70)
      };
    })()`);
  }

  // Footer, which has no id.
  await chrome.evaluate(`window.scrollTo(0, document.body.scrollHeight); true`);
  await sleep(1200);
  const footerShot = await chrome.send("Page.captureScreenshot", { format: "png" });
  writeFileSync(
    path.join(OUT_DIR, `section-footer-${viewport.name}.png`),
    Buffer.from(footerShot.data, "base64"),
  );

  return results;
}

/**
 * Text contrast in the two dark sections.
 *
 * Both sit on gradients, so an ancestor walk finds no solid colour to compare
 * against. Each sample therefore names the band colour it is painted on and is
 * measured against that.
 */
const CONTRAST_PROBE = `(() => {
  const srgb = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const luminance = ([r, g, b]) => 0.2126 * srgb(r / 255) + 0.7152 * srgb(g / 255) + 0.0722 * srgb(b / 255);
  /* Design tokens are authored as hex, while getComputedStyle().color always
     comes back as rgb(). Both forms have to be understood here. */
  const parse = (value) => {
    const v = value.trim();
    if (v.startsWith('#')) {
      const h = v.slice(1);
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
    }
    return v.match(/[\\d.]+/g).slice(0, 3).map(Number);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  };

  const styles = getComputedStyle(document.documentElement);
  const bands = {
    olive: parse(styles.getPropertyValue('--color-olive')),
    deepEspresso: parse(styles.getPropertyValue('--color-deep-espresso')),
    softBlack: parse(styles.getPropertyValue('--color-soft-black')),
  };

  const samples = [
    ['RSVP heading', '#katilim h2', 'olive'],
    ['RSVP intro', '#katilim .rsvp-intro', 'olive'],
    ['Field label', '#katilim .field-label', 'olive'],
    ['Field hint', '#katilim .field-hint', 'olive'],
    ['Choice label', '#katilim label.choice', 'olive'],
    ['Privacy note', '#katilim form > p:last-of-type', 'olive'],
    ['Footer closing / espresso', 'footer .footer-closing', 'deepEspresso'],
    ['Footer date / espresso', 'footer time', 'deepEspresso'],
    ['Footer closing / night', 'footer .footer-closing', 'softBlack'],
    ['Footer date / night', 'footer time', 'softBlack'],
  ];

  return samples.map(([label, selector, band]) => {
    const el = document.querySelector(selector);
    if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    return {
      label,
      fontSize: size,
      ratio: ratio(parse(cs.color), bands[band]),
      required: large ? 3 : 4.5,
    };
  });
})()`;

async function runRsvpFlow(chrome) {
  console.log("\n--- RSVP end-to-end through the same-origin route ---");

  await chrome.send("Emulation.setEmulatedMedia", { features: [] });
  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  chrome.logs.length = 0;
  await loadForm(chrome);
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Katılımı Gönder')`);
  await waitFor(chrome, `document.querySelector('#katilim [role=alert]')`, {
    label: "validation messages",
  });

  const validationText = await chrome.evaluate(`window.__text('#katilim form')`);
  check(
    "Empty form shows the Turkish name error",
    validationText.includes("Lütfen adınızı ve soyadınızı yazın."),
  );
  check(
    "Empty form shows the Turkish attendance error",
    validationText.includes("Lütfen katılım durumunuzu seçin."),
  );

  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  await chrome.evaluate(`window.__fill('#katilim select', '3')`);

  const guestName = `Doğrulama Misafiri ${Date.now()}`;
  await chrome.evaluate(`window.__fill('#katilim input[type=text]', ${JSON.stringify(guestName)})`);
  await chrome.evaluate(
    `window.__fill('#katilim textarea', 'Nikâhta olacağız, çok mutluyuz. Vejetaryen menü mümkün mü?')`,
  );
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Katılımı Gönder')`);

  await waitFor(chrome, `document.querySelector('#katilim [role=status]')`, {
    label: "success panel",
    timeout: 20_000,
  });
  const successText = await chrome.evaluate(`window.__text('#katilim [role=status]')`);
  check(
    "Live submission confirms attendance in Turkish",
    successText.includes("sizi aramızda görmek bizi çok mutlu edecek"),
    successText.slice(0, 60),
  );

  await chrome.evaluate(`window.__clickText('button', 'Yanıtımı düzenle')`);
  await waitFor(chrome, `document.querySelector('#katilim form')`, { label: "form to return" });
  await chrome.evaluate(`window.__fill('#katilim input[type=text]', ${JSON.stringify(guestName)})`);
  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  await chrome.evaluate(`window.__fill('#katilim select', '5')`);
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Yanıtımı Güncelle')`);

  await waitFor(chrome, `document.querySelector('#katilim [role=status]')`, {
    label: "updated success panel",
    timeout: 20_000,
  });
  const updatedText = await chrome.evaluate(`window.__text('#katilim [role=status]')`);
  check("Same-browser resubmission reports an update", updatedText.includes("Yanıtınız güncellendi"));

  const exportResponse = await fetch(`${WEB_URL}v1/rsvp/export.csv`, {
    headers: { Authorization: `Bearer ${process.env.RSVP_ADMIN_TOKEN}` },
  });
  const csv = await exportResponse.text();
  check("Protected CSV export succeeds", exportResponse.ok);
  check("CSV contains the verification response", csv.includes(guestName));
  check(
    "No console errors during the RSVP flow",
    chrome.logs.every((entry) => entry.level !== "error" && entry.level !== "exception"),
    JSON.stringify(chrome.logs.filter((entry) => entry.level === "error" || entry.level === "exception")),
  );
}
/* ---------------------------------------------------------------- teardown */

async function shutdown() {
  for (const fn of teardown.reverse()) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
}

try {
  if (!existsSync(NEXT_BUILD)) {
    throw new Error(`No production build at ${NEXT_BUILD}. Run: pnpm build:web`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  if (runLiveRsvp && (!process.env.DATABASE_URL || !process.env.RSVP_ADMIN_TOKEN || !process.env.RATE_LIMIT_SECRET)) {
    throw new Error("--live-rsvp requires DATABASE_URL, RSVP_ADMIN_TOKEN and RATE_LIMIT_SECRET.");
  }

  await startWeb();
  const chrome = await startChrome();

  console.log("--- layout, normal motion ---");
  const normal = await captureViewports(chrome, { suffix: "", reducedMotion: false });

  for (const [name, m] of Object.entries(normal)) {
    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(m, null, 2));
  }

  console.log("\n--- layout, prefers-reduced-motion ---");
  const reduced = await captureViewports(chrome, { suffix: "reduced", reducedMotion: true });

  writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify({ normal, reduced }, null, 2),
  );

  /* ---------------------------------------------------------- assertions */

  console.log("\n--- assertions ---");
  for (const [name, m] of Object.entries(normal)) {
    check(`${name}: no horizontal overflow`, !m.horizontalOverflow, `scrollWidth ${m.scrollWidth}`);
    check(
      `${name}: names stay inside the art-directed viewport`,
      (m.names?.left ?? -1) >= -1 && (m.names?.right ?? 99_999) <= m.viewport.w + 1,
      `${m.names?.left}..${m.names?.right} within ${m.viewport.w}`,
    );
    check(`${name}: artwork stage fills the opening screen`, m.heroArtworkFillsOpeningScreen === true);
    check(`${name}: hero names form a stacked editorial lockup`, m.names?.stacked === true);
    check(
      `${name}: countdown occupies its own band below the artwork`,
      m.heroCountdown?.clearsArtworkFade === true &&
        m.heroCountdown?.insideBand === true &&
        m.heroCountdownBand?.beginsInsideFadedTail === true &&
        (m.heroCountdownBand?.liftIntoFadedTail ?? 0) >= 48 &&
        (m.viewport.w < 864 || (m.heroCountdownBand?.liftIntoFadedTail ?? 999) <= 200) &&
        (m.heroCountdown?.gapAfterArtworkFade ?? 0) >= 8 &&
        (m.heroCountdown?.gapAfterArtworkFade ?? 999) <= 18,
      JSON.stringify({ countdown: m.heroCountdown, band: m.heroCountdownBand }),
    );
    check(
      `${name}: countdown shares the hero's left editorial alignment`,
      Math.abs((m.heroCountdown?.left ?? 0) - (m.names?.left ?? 99_999)) <= 2,
      `${m.heroCountdown?.left}px / ${m.names?.left}px`,
    );
    if (m.viewport.w >= 1120) {
      check(
        `${name}: hero information shares the left editorial column`,
        (m.names?.left ?? 0) >= m.viewport.w * 0.1 &&
          (m.names?.left ?? m.viewport.w) <= m.viewport.w * 0.135 &&
          Math.abs((m.heroDetails?.left ?? 0) - (m.names?.left ?? 99_999)) <= 2,
        `${m.names?.left}px / ${m.heroDetails?.left}px`,
      );
      check(
        `${name}: hero details retain breathing room below the names`,
        (m.heroDetails?.gapBelowNames ?? 0) >= 24,
        `${m.heroDetails?.gapBelowNames}px gap`,
      );
      check(
        `${name}: vertical date stays at the upper-right edge`,
        m.heroVerticalDate?.verticallyInside === true &&
          (m.heroVerticalDate?.rightGap ?? 0) >= m.viewport.w * 0.015 &&
          (m.heroVerticalDate?.rightGap ?? m.viewport.w) <= m.viewport.w * 0.035,
        JSON.stringify(m.heroVerticalDate),
      );
    }
    check(
      `${name}: illustration reads as a full composition layer`,
      (m.illustration?.pctOfViewportWidth ?? 0) >= 70,
      `${m.illustration?.pctOfViewportWidth}% of viewport width`,
    );
    check(
      `${name}: venue uses the approved interior asset with no map panel`,
      m.venueDetail?.fileServed === "venue-interior-approved.png" && !m.venueMapPanelPresent,
      `${m.venueDetail?.fileServed ?? "missing detail"}; map panel ${m.venueMapPanelPresent}`,
    );
    check(
      `${name}: venue artwork keeps its full aspect ratio inside a feathered frame`,
      Math.abs((m.venueDetail?.aspect ?? 0) - 1.5) <= 0.01 &&
        m.venueDetail?.containedInFrame === true &&
        m.venueDetail?.featheredSides === true &&
        m.venueDetail?.fadesOnMultipleEdges === true,
      JSON.stringify(m.venueDetail),
    );
    check(
      `${name}: venue artwork reaches the right viewport edge`,
      Math.abs(m.venueDetail?.rightEdgeGap ?? 999) <= 1,
      `${m.venueDetail?.rightEdgeGap ?? "missing"}px from edge`,
    );
    check(
      `${name}: venue interior is a substantial visual moment`,
      (m.venueDetail?.pctOfViewportWidth ?? 0) >= (m.viewport.w < 480 ? 90 : m.viewport.w >= 1600 ? 45 : 50),
      `${m.venueDetail?.pctOfViewportWidth ?? 0}% of viewport width`,
    );
    if (m.viewport.w >= 768) {
      const minimumVenueGap = Math.min(160, Math.max(48, m.viewport.w * 0.07));
      check(
        `${name}: venue artwork separates fluidly from the title column`,
        (m.venueDetail?.gapFromCopy ?? 0) >= minimumVenueGap,
        `${m.venueDetail?.gapFromCopy ?? 0}px gap; needs ${Math.round(minimumVenueGap)}px`,
      );
    }
    check(`${name}: venue title retains its intentional editorial rule`, m.venueTitleHasEditorialLine === true);
    check(`${name}: venue title never splits a word`, m.venueTitleWordsUnbroken === true);
    check(
      `${name}: hero loads the art-directed source for this breakpoint`,
      m.illustration?.fileServed === (m.viewport.w < 864 ? "venue-hero-mobile-master.webp" : "venue-hero-desktop-master.webp"),
      m.illustration?.fileServed,
    );
    check(`${name}: timeline exposes all four real stops`, m.timelineStops === 4, `${m.timelineStops} stops`);
    check(
      `${name}: typed fields are at least 16px (no iOS zoom)`,
      (m.smallestTypedFieldFontSize ?? 0) >= 16,
      `${m.smallestTypedFieldFontSize}px`,
    );
    check(
      `${name}: every form control is at least 44px tall`,
      (m.smallestControlHeight ?? 0) >= 44,
      `${m.smallestControlHeight}px`,
    );
    check(
      `${name}: no control label smaller than 13px`,
      (m.smallestControlFontSize ?? 0) >= 13,
      `${m.smallestControlFontSize}px`,
    );
    check(`${name}: no console errors`, m.consoleOutput.every((l) => l.level !== "error" && l.level !== "exception"),
      JSON.stringify(m.consoleOutput.filter((l) => l.level === "error" || l.level === "exception")));
    for (const boundary of m.continuity.boundaries) {
      check(`${name}: ${boundary.name} has no layout gap`, boundary.connected);
      check(
        `${name}: ${boundary.name} is backed by blended section canvases`,
        boundary.fromBackgroundImage !== "none" && boundary.toBackgroundImage !== "none",
        `${boundary.fromBackgroundImage} → ${boundary.toBackgroundImage}`,
      );
    }
    for (const gradient of m.continuity.gradients) {
      check(
        `${name}: ${gradient.selector} gradient stops are strictly increasing`,
        !gradient.missing && gradient.strictlyIncreasing,
        gradient.missing ? "missing" : gradient.stops.join(" < "),
      );
    }
    check(`${name}: venue clears incoming evening artwork`, m.continuity.venueClearsIncomingEveningArtwork);
    check(`${name}: hero artwork hands off through the countdown band`, m.continuity.heroTransitionsThroughCountdownBand);
    check(`${name}: countdown band preserves the continuous background canvas`, m.continuity.countdownBandKeepsContinuousCanvas);
    check(`${name}: one left invitation botanical bridges gently into the program`, m.continuity.invitationUsesOneLeftBotanicalBridge);
    check(`${name}: canvas-crossing botanicals use soft edge masks`, m.continuity.botanicalsFadeAtCanvasEdges);
    check(`${name}: botanical parents do not crop canvas crossings`, m.continuity.botanicalParentsAllowOverflow);
  }

  const justBelowFormerBreakpoint = normal["1119x900"];
  const justAboveFormerBreakpoint = normal["1121x900"];
  if (justBelowFormerBreakpoint && justAboveFormerBreakpoint) {
    check(
      "hero remains continuous across the former 70rem breakpoint",
      justBelowFormerBreakpoint.illustration?.fileServed === justAboveFormerBreakpoint.illustration?.fileServed &&
        Math.abs((justBelowFormerBreakpoint.names?.left ?? 0) - (justAboveFormerBreakpoint.names?.left ?? 999)) <= 2 &&
        Math.abs((justBelowFormerBreakpoint.names?.top ?? 0) - (justAboveFormerBreakpoint.names?.top ?? 999)) <= 2 &&
        Math.abs((justBelowFormerBreakpoint.heroCountdown?.top ?? 0) - (justAboveFormerBreakpoint.heroCountdown?.top ?? 999)) <= 2 &&
        Math.abs((justBelowFormerBreakpoint.heroCountdown?.width ?? 0) - (justAboveFormerBreakpoint.heroCountdown?.width ?? 999)) <= 3,
      JSON.stringify({ below: justBelowFormerBreakpoint, above: justAboveFormerBreakpoint }),
    );
  }

  for (const [name, m] of Object.entries(reduced)) {
    check(`${name} (reduced motion): no horizontal overflow`, !m.horizontalOverflow);
    check(`${name} (reduced motion): artwork stage fills the opening screen`, m.heroArtworkFillsOpeningScreen === true);
    check(
      `${name} (reduced motion): countdown remains below the artwork`,
      m.heroCountdown?.clearsArtworkFade === true && m.heroCountdownBand?.beginsInsideFadedTail === true,
    );
    check(
      `${name} (reduced motion): nothing is left faded out`,
      m.hiddenRevealsAfterHydration === 0,
      `${m.hiddenRevealsAfterHydration} hidden`,
    );
    check(
      `${name} (reduced motion): timeline is fully drawn`,
      m.timelineScaleY === 1,
      `scaleY ${m.timelineScaleY}`,
    );
    check(
      `${name} (reduced motion): all timeline stops are readable`,
      m.timelineHiddenStops === 0,
      `${m.timelineHiddenStops} hidden`,
    );
  }

  console.log("\n--- text contrast on the dark bands ---");
  const contrast = await chrome.evaluate(CONTRAST_PROBE);
  for (const s of contrast) {
    check(
      `Contrast: ${s.label}`,
      !s.missing && s.ratio >= s.required,
      s.missing ? "element not found" : `${s.ratio}:1 (needs ${s.required}:1, ${s.fontSize}px)`,
    );
  }

  console.log("\n--- sections, scrolled into view ---");
  for (const viewport of VIEWPORTS) {
    const sections = await captureSections(chrome, viewport);
    for (const [id, s] of Object.entries(sections)) {
      check(
        `${viewport.name} #${id}: every reveal fired`,
        s.stillHidden === 0,
        `${s.stillHidden} of ${s.revealCount} still hidden ${JSON.stringify(s.hiddenDetails)}`,
      );
      check(`${viewport.name} #${id}: no horizontal overflow`, !s.horizontalOverflow);
      check(`${viewport.name} #${id}: section has visible copy`, s.textSample.length > 10, s.textSample);
      if (id === "davet") {
        const limit = viewport.width >= 1200 ? 4 : 7;
        check(
          `${viewport.name} #davet: invitation sets in a comfortable measure`,
          s.quoteLines !== null && s.quoteLines >= 2 && s.quoteLines <= limit,
          `${s.quoteLines} line(s), max ${limit}`,
        );
      }
    }
  }

  if (runLiveRsvp) {
    await runRsvpFlow(chrome);
  }

  console.log(`\nScreenshots: ${OUT_DIR}`);
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
} finally {
  await shutdown();
}

process.exit(failures === 0 ? 0 : 1);
