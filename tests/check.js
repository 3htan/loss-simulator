// Checks the simulation engine in index.html against closed-form results.
// Run from the repo root:  node tests/check.js
// Each check simulates a case with a known answer and fails if the simulated
// value is further from theory than the stated tolerance.

const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const engine = new Function(
  cut("function mulberry32", "// ---------- inputs") +
  cut("function simulate(p)", "// ---------- rendering") +
  "\nreturn { simulate, describe, poisson, seed: (s) => { raw = mulberry32(s); spare = null; } };"
)();
const { simulate, describe, poisson, seed } = engine;

let failed = 0;
function check(name, simulated, theory, tol) {
  const err = Math.abs(simulated / theory - 1);
  const ok = err <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name.padEnd(46)} theory ${theory.toPrecision(6).padStart(12)}  sim ${simulated.toPrecision(6).padStart(12)}  (${(err * 100).toFixed(2)}% off, tol ${tol * 100}%)`);
}

// 1. Poisson sampler, on both sides of the lambda = 30 algorithm switch.
for (const lam of [0.5, 3, 29.5, 30, 120]) {
  seed(7);
  const n = 400000; let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const k = poisson(lam); s += k; s2 += k * k; }
  const m = s / n;
  check(`Poisson(${lam}) mean`, m, lam, 0.01);
  check(`Poisson(${lam}) variance`, s2 / n - m * m, lam, 0.02);
}

// 2. Exponential severity with a deductible and limit: every quantity has a closed form.
const th = 5000, d = 1000, u = 10000, lam = 3;
const p = { lam, dist: "exp", expTheta: th, ded: d, lim: u, years: 300000, seed: 11, thr: 0 };
const r = simulate(p), g = describe(r.G, 0), ins = describe(r.I, 0);
check("E[S] = lambda * theta", g.mean, lam * th, 0.01);
check("SD(S) = sqrt(lambda * 2 theta^2)", g.sd, Math.sqrt(lam * 2 * th * th), 0.01);
check("P(S = 0) = e^-lambda", g.pZero, Math.exp(-lam), 0.03);
check("LER = 1 - e^(-d/theta)", r.ler, 1 - Math.exp(-d / th), 0.01);
check("Insurer mean = lambda*theta*(e^-d/th - e^-(d+u)/th)", ins.mean, lam * th * (Math.exp(-d / th) - Math.exp(-(d + u) / th)), 0.01);
check("Share of claims at limit = e^-(d+u)/theta", r.hitLim / r.claims, Math.exp(-(d + u) / th), 0.03);

// 3. Gamma (including shape below 1) and lognormal severities, no policy terms.
const cases = [
  { dist: "gam", gamAlpha: 0.4, gamTheta: 3000, m1: 0.4 * 3000, m2: 0.4 * 1.4 * 3000 ** 2 },
  { dist: "gam", gamAlpha: 5, gamTheta: 1000, m1: 5000, m2: 5 * 6 * 1000 ** 2 },
  { dist: "ln", lnMu: 8, lnSigma: 0.8, m1: Math.exp(8 + 0.32), m2: Math.exp(16 + 1.28) },
];
for (const c of cases) {
  const q = { lam: 2, ded: 0, lim: Infinity, years: 300000, seed: 5, thr: 0, ...c };
  const rr = simulate(q), gg = describe(rr.G, 0), ii = describe(rr.I, 0);
  const label = c.dist === "gam" ? `Gamma(alpha=${c.gamAlpha})` : `Lognormal(sigma=${c.lnSigma})`;
  check(`${label} E[S]`, gg.mean, 2 * c.m1, 0.01);
  check(`${label} SD(S)`, gg.sd, Math.sqrt(2 * c.m2), 0.02);
  if (gg.mean !== ii.mean) { failed++; console.log(`FAIL ${label}: with d = 0 and no limit, insurer should equal ground-up`); }
}

console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed.");
process.exit(failed ? 1 : 0);
