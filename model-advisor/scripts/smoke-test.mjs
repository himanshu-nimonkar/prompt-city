#!/usr/bin/env node
/** Smoke tests against a running model-advisor base URL. */
const BASE = process.env.API_BASE || "http://127.0.0.1:8787";

async function req(path, init) {
  const r = await fetch(`${BASE}${path}`, init);
  const text = await r.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: r.status, body };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const cases = [
  { name: "empty prompt", body: { prompt: "" }, expectStatus: 400 },
  { name: "whitespace prompt", body: { prompt: "   " }, expectStatus: 400 },
  { name: "too long", body: { prompt: "x".repeat(9000) }, expectStatus: 400 },
  { name: "invalid json", raw: "{not json", expectStatus: 400 },
];

async function main() {
  console.log("BASE", BASE);
  const health = await req("/health");
  assert(health.status === 200 && health.body === "OK", "health failed");
  console.log("✓ health");

  const catalog = await req("/api/catalog");
  assert(catalog.status === 200 && Array.isArray(catalog.body), "catalog failed");
  assert(catalog.body.length >= 50, `catalog too small: ${catalog.body.length}`);
  console.log("✓ catalog", catalog.body.length, "models");

  for (const c of cases) {
    const r = c.raw
      ? await fetch(`${BASE}/api/analyze`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: c.raw,
        }).then(async (res) => ({ status: res.status, body: await res.json().catch(() => ({})) }))
      : await req("/api/analyze", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(c.body),
        });
    assert(r.status === c.expectStatus, `${c.name}: expected ${c.expectStatus} got ${r.status}`);
    console.log("✓", c.name);
  }

  const prompts = [
    "Write a TypeScript retry helper",
    "Generate a product hero image for a fintech app",
    "Transcribe this meeting audio",
    "Embed docs for RAG search",
    "Translate hello to Spanish",
  ];

  for (const prompt of prompts) {
    const t0 = Date.now();
    const r = await req("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt, liveLimit: 3 }),
    });
    const ms = Date.now() - t0;
    assert(r.status === 200, `analyze failed for "${prompt}": ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const d = r.body;
    assert(Array.isArray(d.results) && d.results.length >= 50, `results short: ${d.results?.length}`);
    assert(d.results.every((x) => typeof x.quality === "number" && typeof x.estCostUsd === "number"), "metric types");
    assert(d.results[0].rank === 1, "rank start");
    const ids = new Set(d.results.map((x) => x.modelId));
    assert(ids.size === d.results.length, "duplicate model ids");
    console.log(
      `✓ analyze "${prompt.slice(0, 36)}" n=${d.results.length} mode=${d.measurementMode} live=${d.liveMeasured}/${d.liveAttempted} src=${d.scoringSource} ${ms}ms`,
    );
  }

  // cache hit
  const again = await req("/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: prompts[0], liveLimit: 3 }),
  });
  assert(again.status === 200, "cache re-analyze failed");
  if (again.body.measurementMode === "live" || again.body.measurementMode === "live+history") {
    assert(again.body.cacheHit === true, "expected cache hit on second call");
    console.log("✓ cache hit");
  } else {
    console.log("~ skip cache assert (no live mode cached)");
  }

  console.log("\nALL SMOKE TESTS PASSED");
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
