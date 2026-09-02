/**
 * Development-only verification pass.
 *
 * Starts the RSVP API and a static server for the exported frontend, drives the
 * locally installed Google Chrome over the DevTools Protocol, captures the site
 * at the four target viewport sizes (normal and reduced-motion), submits a real
 * RSVP through the real form, and checks what landed in SQLite.
 *
 * Everything runs and shuts down inside this one process, so there are no
 * lingering background servers.
 *
 * Neither application depends on this file.
 *
 *   node tools/verify.mjs            # screenshots + RSVP end-to-end
 *   node tools/verify.mjs --shots    # screenshots only
 */

import { spawn } from "node:child_process";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(path.join(import.meta.dirname, "../services/rsvp-api/package.json"));
const Database = require("better-sqlite3");

const ROOT = path.resolve(import.meta.dirname, "..");
const WEB_OUT = path.join(ROOT, "apps/web/out");
const API_DIR = path.join(ROOT, "services/rsvp-api");
const OUT_DIR = path.join(ROOT, ".screenshots");
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const WEB_PORT = Number(process.env.VERIFY_WEB_PORT ?? 3000);
const API_PORT = 4000;
const WEB_URL = `http://localhost:${WEB_PORT}/`;

/* Verification runs against a throwaway database, never the developer's own
   `data/rsvp.sqlite`. Reusing that file made assertions read rows left behind
   by an earlier run and report failures the application had not caused. */
const VERIFY_DB = path.join(ROOT, ".screenshots/verify-rsvp.sqlite");

const shotsOnly = process.argv.includes("--shots");
const SECTION_IDS = (process.env.VERIFY_SECTIONS ?? "davet,program,mekan,katilim")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const VIEWPORTS = [
  /* Layout assertions care about CSS pixels. A 1x capture keeps the automated
     pass lightweight; high-density crops are inspected separately in-browser. */
  { name: "390x844", width: 390, height: 844, dsf: 1, mobile: false },
  { name: "430x932", width: 430, height: 932, dsf: 1, mobile: false },
  { name: "768x1024", width: 768, height: 1024, dsf: 1, mobile: false },
  { name: "1440x900", width: 1440, height: 900, dsf: 1, mobile: false },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const teardown = [];

let failures = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

/* ------------------------------------------------------------ static server */

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function startStaticServer(root, port) {
  const server = createServer((req, res) => {
    const requested = decodeURIComponent((req.url ?? "/").split("?")[0]);
    let filePath = path.join(root, requested);

    // Resolve directory requests to their index.html, the way a static host does.
    if (existsSync(filePath) && statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    } else if (!existsSync(filePath) && existsSync(`${filePath}.html`)) {
      filePath = `${filePath}.html`;
    }

    if (!filePath.startsWith(root) || !existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    createReadStream(filePath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      teardown.push(() => new Promise((done) => server.close(done)));
      resolve(server);
    });
  });
}

/* ----------------------------------------------------------------- the API */

async function startApi() {
  const api = spawn(path.join(API_DIR, "node_modules/.bin/tsx"), ["src/server.ts"], {
    cwd: API_DIR,
    stdio: "ignore",
    env: { ...process.env, LOG_LEVEL: "warn", DATABASE_PATH: VERIFY_DB },
  });
  let stopped = false;
  teardown.push(function killApi() {
    if (stopped) return;
    stopped = true;
    api.kill("SIGTERM");
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const res = await fetch(`http://localhost:${API_PORT}/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("RSVP API did not become healthy.");
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
  const img = document.querySelector('.hero-venue-art img');
  const ib = img && img.getBoundingClientRect();
  const hero = document.querySelector('.hero-artwork');
  const hb = hero && hero.getBoundingClientRect();
  const countdown = document.querySelector('.hero-countdown');
  const cb = countdown && countdown.getBoundingClientRect();
  const venueDetail = document.querySelector('#mekan .venue-art-crop img');
  const vdb = venueDetail && venueDetail.getBoundingClientRect();
  const venueDetailFrame = document.querySelector('#mekan .venue-art-crop');
  const vdfb = venueDetailFrame && venueDetailFrame.getBoundingClientRect();
  const venueDetailStyle = venueDetail && getComputedStyle(venueDetail);
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
    names: nb && { w: Math.round(nb.width), left: Math.round(nb.left), right: Math.round(nb.right), fontSize: ns.fontSize },
    illustration: ib && {
      w: Math.round(ib.width), h: Math.round(ib.height),
      top: Math.round(ib.top), bottom: Math.round(ib.bottom),
      left: Math.round(ib.left), right: Math.round(ib.right),
      pctOfViewportWidth: Math.round(ib.width / vw * 100),
      fileServed: (img.currentSrc || '').split('/').pop(),
      artDirectedCrop: ib.left < -0.5 || ib.right > vw + 0.5
    },
    heroAboveFold: cb && hb ? (hb.bottom <= de.clientHeight + 1 && cb.bottom <= de.clientHeight) : null,
    venueDetail: vdb && {
      w: Math.round(vdb.width), h: Math.round(vdb.height),
      fileServed: (venueDetail.currentSrc || venueDetail.getAttribute('src') || '').split('/').pop(),
      aspect: Number((vdb.width / vdb.height).toFixed(3)),
      containedInFrame: Boolean(vdfb && vdb.left >= vdfb.left - 1 && vdb.right <= vdfb.right + 1),
      featheredSides: venueDetailStyle?.maskImage !== 'none',
    },
    venueMapPanelPresent: Boolean(document.querySelector('#mekan .venue-map, #mekan iframe')),
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
    ['hero → invitation', '.hero-artwork', '#davet'],
    ['invitation → program', '#davet', '#program'],
    ['program → venue', '#program', '#mekan'],
    ['venue → RSVP', '#mekan', '#katilim'],
    ['RSVP → footer', '#katilim', 'footer'],
  ].map(([name, fromSelector, toSelector]) => {
    const from = rect(fromSelector);
    const to = rect(toSelector);
    const fromStyle = document.querySelector(fromSelector) && getComputedStyle(document.querySelector(fromSelector));
    const toStyle = document.querySelector(toSelector) && getComputedStyle(document.querySelector(toSelector));
    return {
      name,
      connected: Boolean(from && to && Math.abs(from.bottom - to.top) <= 1),
      fromBackgroundColor: fromStyle?.backgroundColor ?? null,
      toBackgroundColor: toStyle?.backgroundColor ?? null,
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
  const heroPaperStyle = document.querySelector('.hero-paper') && getComputedStyle(document.querySelector('.hero-paper'));
  const heroArtworkStyle = document.querySelector('.hero-venue-art') && getComputedStyle(document.querySelector('.hero-venue-art'));
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
  return {
    boundaries,
    gradients: [gradientStops('.light-experience'), gradientStops('.evening-experience')],
    venueClearsIncomingEveningArtwork: Boolean(venue && botanical && venue.bottom <= botanical.top),
    heroFadesIntoInvitation: Boolean(
      hero && heroPaper && heroArtwork &&
      heroPaper.bottom > hero.bottom + 1 &&
      heroArtwork.bottom > hero.bottom + 1 &&
      heroPaperStyle?.maskImage !== 'none' &&
      heroArtworkStyle?.maskImage !== 'none',
    ),
    invitationUsesOneLeftBotanicalBridge,
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
if (new URL(location.href).searchParams.get('verifyMissingConfig') === '1') {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), document.baseURI);
    if (url.pathname.endsWith('/runtime-config.json')) {
      return Promise.resolve(new Response('Not found', { status: 404 }));
    }
    return nativeFetch(input, init);
  };
}
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

async function loadForm(chrome, { missingConfig = false } = {}) {
  const previous = await chrome.evaluate(`window.__docId ?? null`);
  const query = new URLSearchParams({ verify: String(Date.now()) });
  if (missingConfig) query.set("verifyMissingConfig", "1");
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
    softBlack: parse(styles.getPropertyValue('--color-soft-black')),
  };

  const samples = [
    ['RSVP heading', '#katilim h2', 'olive'],
    ['RSVP intro', '#katilim .rsvp-intro', 'olive'],
    ['Field label', '#katilim .field-label', 'olive'],
    ['Field hint', '#katilim .field-hint', 'olive'],
    ['Choice label', '#katilim label.choice', 'olive'],
    ['Privacy note', '#katilim form > p:last-of-type', 'olive'],
    ['Footer closing', 'footer .footer-closing', 'softBlack'],
    ['Footer date', 'footer time', 'softBlack'],
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
  console.log("\n--- RSVP end-to-end through the real form ---");

  await chrome.send("Emulation.setEmulatedMedia", { features: [] });
  await chrome.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    mobile: true,
  });

  const dbPath = VERIFY_DB;
  const countRows = () => {
    const db = new Database(dbPath, { readonly: true });
    const { n } = db.prepare("select count(*) as n from rsvps").get();
    db.close();
    return n;
  };
  const findByName = (name) => {
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare(
        "select full_name, attendance, guest_count, note, created_at, updated_at from rsvps" +
          " where full_name = ? order by id desc limit 1",
      )
      .get(name);
    db.close();
    return row;
  };

  const before = countRows();
  const guestName = "Elif Şahinoğlu Karadağ";

  /* ------------------------------------------------ required field validation */
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
  check("Nothing was written on a failed validation", countRows() === before);

  /* ------------------------------------------- guest count show / hide / reset */
  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  check("Guest count appears when attending", true);

  await chrome.evaluate(`window.__fill('#katilim select', '4')`);
  const chosen = await chrome.evaluate(`document.querySelector('#katilim select').value`);
  check("Guest count accepts a selection", chosen === "4", `value ${chosen}`);

  await chrome.evaluate(`window.__clickText('label.choice', 'Katılamayacağım')`);
  await sleep(900);
  const selectGone = await chrome.evaluate(`document.querySelector('#katilim select') === null`);
  check("Guest count is hidden when not attending", selectGone);

  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  const reset = await chrome.evaluate(`document.querySelector('#katilim select').value`);
  check("Stale guest count was cleared", reset === "", `value "${reset}"`);

  /* -------------------------------------------------------- valid submission */
  await chrome.evaluate(`window.__fill('#katilim input[type=text]', ${JSON.stringify(guestName)})`);
  await chrome.evaluate(`window.__fill('#katilim select', '3')`);
  await chrome.evaluate(
    `window.__fill('#katilim textarea', 'Nikâhta olacağız, çok mutluyuz. Vejetaryen menü mümkün mü?')`,
  );
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Katılımı Gönder')`);

  await waitFor(chrome, `document.querySelector('#katilim [role=status]')`, {
    label: "success panel",
  });

  const successText = await chrome.evaluate(`window.__text('#katilim [role=status]')`);
  check(
    "Success state confirms attendance in Turkish",
    successText.includes("sizi aramızda görmek bizi çok mutlu edecek"),
    successText.slice(0, 60),
  );

  const created = findByName(guestName);
  check("Submission reached SQLite", Boolean(created));
  check("Row count increased by exactly one", countRows() === before + 1);
  check("Attendance stored as yes", created?.attendance === "yes");
  check("Guest count stored as 3", created?.guest_count === 3);
  check(
    "Turkish characters survived the whole round trip",
    created?.full_name === guestName && created?.note.includes("Nikâhta"),
  );
  check("createdAt equals updatedAt on a first submission", created?.created_at === created?.updated_at);

  /* --------------------------------------------- resubmission from the same browser */
  await chrome.evaluate(`window.__clickText('button', 'Yanıtımı düzenle')`);
  await waitFor(chrome, `document.querySelector('#katilim form')`, { label: "form to return" });

  await chrome.evaluate(`window.__fill('#katilim input[type=text]', ${JSON.stringify(guestName)})`);
  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  await chrome.evaluate(`window.__fill('#katilim select', '5')`);
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Yanıtımı Güncelle')`);

  await waitFor(chrome, `document.querySelector('#katilim [role=status]')`, { label: "success panel" });

  const updatedText = await chrome.evaluate(`window.__text('#katilim [role=status]')`);
  check("Resubmission reports an update", updatedText.includes("Yanıtınız güncellendi"), updatedText.slice(0, 40));

  const updated = findByName(guestName);
  check("Still exactly one row for this browser", countRows() === before + 1);
  check("Guest count was updated to 5", updated?.guest_count === 5);
  check("createdAt was preserved", updated?.created_at === created?.created_at);
  check("updatedAt moved forward", (updated?.updated_at ?? "") > (created?.updated_at ?? ""));

  check(
    "No console errors during the RSVP flow",
    chrome.logs.every((l) => l.level !== "error" && l.level !== "exception"),
    JSON.stringify(chrome.logs.filter((l) => l.level === "error" || l.level === "exception")),
  );

  /* ------------------------------------------------- missing runtime config */
  chrome.logs.length = 0;
  await loadForm(chrome, { missingConfig: true });
  await waitFor(chrome, `document.querySelector('#katilim [role=alert]')`, {
    label: "runtime config error",
  });
  const configError = await chrome.evaluate(`window.__text('#katilim form')`);
  check(
    "Missing runtime-config.json shows a graceful Turkish message",
    configError.includes("Site yapılandırması eksik görünüyor"),
    configError.slice(0, 80),
  );
  check(
    "Form is still rendered when the runtime config is missing",
    await chrome.evaluate(`Boolean(document.querySelector('#katilim input[type=text]'))`),
  );

  /* ---------------------------------------------------- API unavailable */
  console.log("\n--- stopping the API to test the offline path ---");
  const apiKill = teardown.find((fn) => fn.name === "killApi");
  if (apiKill) await apiKill();
  await sleep(1500);

  await loadForm(chrome);
  const keptName = "Burak Yıldırımoğlu";
  await chrome.evaluate(`window.__fill('#katilim input[type=text]', ${JSON.stringify(keptName)})`);
  await chrome.evaluate(`window.__clickText('label.choice', 'Katılacağım')`);
  await waitFor(chrome, `document.querySelector('#katilim select')`, { label: "guest count field" });
  await chrome.evaluate(`window.__fill('#katilim select', '2')`);
  await chrome.evaluate(`window.__clickText('button[type=submit]', 'Katılımı Gönder')`);

  await waitFor(chrome, `document.querySelector('#katilim [role=alert]')`, {
    label: "network error message",
    timeout: 20_000,
  });

  const offlineText = await chrome.evaluate(`window.__text('#katilim form')`);
  check(
    "Unreachable API shows a Turkish retry message",
    offlineText.includes("Sunucuya şu anda ulaşılamıyor"),
    offlineText.slice(0, 80),
  );

  const preserved = await chrome.evaluate(`document.querySelector('#katilim input[type=text]').value`);
  check("Entered values are not lost on failure", preserved === keptName, preserved);

  const retryLabel = await chrome.evaluate(`window.__text('#katilim button[type=submit]')`);
  // The label is uppercased by CSS, so compare case-insensitively.
  check(
    "Submit button offers a retry",
    retryLabel.trim().toLocaleLowerCase("tr") === "tekrar dene",
    retryLabel,
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
  if (!existsSync(WEB_OUT)) {
    throw new Error(`No static export at ${WEB_OUT}. Run: pnpm build:web`);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  for (const suffix of ["", "-wal", "-shm"]) rmSync(`${VERIFY_DB}${suffix}`, { force: true });

  await startApi();
  await startStaticServer(WEB_OUT, WEB_PORT);
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
    check(`${name}: hero fits the opening screen`, m.heroAboveFold === true);
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
        m.venueDetail?.featheredSides === true,
      JSON.stringify(m.venueDetail),
    );
    check(
      `${name}: hero loads the art-directed source for this breakpoint`,
      m.illustration?.fileServed === (m.viewport.w < 1120 ? "venue-hero-mobile-master.webp" : "venue-hero-desktop-master.webp"),
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
        `${name}: ${boundary.name} does not add an opaque section canvas`,
        boundary.fromBackgroundColor === "rgba(0, 0, 0, 0)" && boundary.toBackgroundColor === "rgba(0, 0, 0, 0)",
        `${boundary.fromBackgroundColor} → ${boundary.toBackgroundColor}`,
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
    check(`${name}: hero artwork fades into invitation instead of ending at its boundary`, m.continuity.heroFadesIntoInvitation);
    check(`${name}: one left invitation botanical bridges gently into the program`, m.continuity.invitationUsesOneLeftBotanicalBridge);
  }

  for (const [name, m] of Object.entries(reduced)) {
    check(`${name} (reduced motion): no horizontal overflow`, !m.horizontalOverflow);
    check(`${name} (reduced motion): hero fits the opening screen`, m.heroAboveFold === true);
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

  if (!shotsOnly) {
    await runRsvpFlow(chrome);
  }

  console.log(`\nScreenshots: ${OUT_DIR}`);
  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
} finally {
  await shutdown();
}

process.exit(failures === 0 ? 0 : 1);
