// The token radar's model, radar-3: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and every
// other rankable pre-token protocol in the snapshot: 197 rows in total on this snapshot, so the
// early radar is complete, not a top-160 cut. A protocol is pre-token when its index entry records
// no token (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are
// kept apart and shown as the market's own values, never mixed into the ranked board. Rankable
// means passing the watchlist's own visible exclusion rules: no bridge, liquid-staking or
// exchange product, no wrapped/staked/wrapper product, no exchange-prefixed or versioned name.
//
// Implied value follows only from the snapshot's own figures, in five steps:
//
//   comps curve = a least-squares line fitted on the snapshot's own live-token protocols,
//                 every run: log(mcap) = a + b x log(TVL), plus a category offset (the
//                 median residual of a category with 5+ live protocols, else 0). A fitted
//                 curve, never a hand-set multiple: size is worth sub-linearly.
//   value if launched = exp(a + b x log(TVL) + offset) x growth x maturity x breadth
//   launch odds = the empirical cohort rate: among the snapshot's dated protocols in the
//                 same age bucket, the share that already records a token, shrunk toward
//                 the category's own token rate (Laplace-style, pseudo-count 2).
//   implied    = launch odds x value if launched, rounded: the expected value of a launch.
//   range      = implied x exp(+/-0.674 x sigma), the P25-P75 band from the fit's own
//                leave-one-out residuals.
//
//   growth     = clamp(change_7d, -60, 250) per cent, then a saturating multiplier:
//                growthMult = 1 + 0.45 x (growth/100) / (1 + max(growth,0)/200)
//                so a +4448% week (the snapshot's max) cannot swamp the board, and a -60%
//                week costs at most 27%.
//   maturity   = 0.65 + 0.35 x (1 - exp(-age_days/540))   (age unknown: 365 days)
//                longevity with no token, with diminishing returns: age 0 -> 0.65, 1y -> 0.82,
//                3y -> 0.95.
//   breadth    = 1 + 0.02 x min(chains-1, 5), at most 1.10: more chains, wider distribution.
//   farm cost  = the plan's gas plus its hours at $25/hour; the verdict is the break-even
//                share (farm cost / implied value): FARM below 0.005%, THIN below 0.015%,
//                else SKIP. The thresholds sit inside the observed share range (2e-6 to
//                3.5e-4): the 0.5%/2% starting points put all 197 rows in FARM, because a
//                ~$60-90 farm costs almost nothing against million-dollar expected values.
//                A single active wallet plausibly captures on the order of 0.001%-0.01% of
//                a launch's value, so the bands separate rows a wallet can cover from rows
//                it cannot; that band is an assumption, stated as one in the dashboard.
//
// Every term is kept or dropped on held-out evidence, not asserted: leave-one-out and
// walk-forward (older half fits, newer half tests) must both improve before growth,
// maturity or breadth stays in. The fit, the odds, the validation and the verdicts are
// all stated in the dashboard. No protocol name is ever special-cased: the same
// function scores every row, and the curve is computed from the snapshot, not typed in.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  growth_saturation: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_tau_days: number;
  maturity_days: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  min_live_for_offset: number;
  farm_hourly_usd: number;
  farm_gas_first_usd: number;
  farm_gas_weekly_usd: number;
  verdict_farm_max: number;
  verdict_thin_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.45,
  growth_floor: -60,
  growth_cap: 250,
  growth_saturation: 200,
  maturity_floor: 0.65,
  maturity_range: 0.35,
  maturity_tau_days: 540,
  maturity_days: 1095,
  unknown_age_days: 365,
  chain_step: 0.02,
  chain_max_extra: 0.1,
  min_live_for_offset: 5,
  farm_hourly_usd: 25,
  farm_gas_first_usd: 3,
  farm_gas_weekly_usd: 2,
  verdict_farm_max: 0.00005,
  verdict_thin_max: 0.00015,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-3';

/** How many pre-token protocols below the watchlist floor the early radar carries: all of them. */
export const EARLY_ROWS = 1000;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A farm verdict: what the break-even share says about farming this row. */
export type FarmVerdict = 'FARM' | 'THIN' | 'SKIP';

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    value_if_launched_usd: number;
    launch_odds: number;
    category_offset: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
    value_low_usd: number;
    value_high_usd: number;
    farm_verdict: FarmVerdict;
    farm_cost_usd: number;
    break_even_share: number;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  value_if_launched_usd: number;
  launch_odds: number;
  category_offset: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  value_low_usd: number;
  value_high_usd: number;
  farm_verdict: FarmVerdict;
  farm_cost_usd: number;
  break_even_share: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** The fitted comps curve, as the dashboard prints it. */
export interface FitResult {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
  sigma: number;
}

/** One age bucket's launch odds, from the snapshot's own dated protocols. */
export interface OddsBucket {
  label: string;
  min_days: number;
  max_days: number | null;
  dated: number;
  with_token: number;
  rate: number;
}

/** The launch-odds table: the buckets, and the pooled rate for undated protocols. */
export interface OddsTable {
  buckets: OddsBucket[];
  pooled_rate: number;
  dated_total: number;
}

/** Which of growth, maturity and breadth survived held-out testing. */
export interface TermSet {
  growth: boolean;
  maturity: boolean;
  breadth: boolean;
}

/** The held-out validation, as the dashboard prints it. */
export interface ValidationResult {
  loo_n: number;
  loo_mae: number;
  loo_baseline_mae: number;
  loo_multiple: number;
  wf_n: number;
  wf_mae: number;
  wf_baseline_mae: number;
  wf_multiple: number;
  kept: TermSet;
  dropped: string[];
}

/** How every one of the snapshot's protocols is accounted for. */
export interface AuditCounts {
  total: number;
  board: number;
  live: number;
  excluded_exchange: number;
  excluded_versioned: number;
  excluded_wrapped: number;
}

/** How the farm verdicts spread across the board. */
export interface VerdictCounts {
  farm: number;
  thin: number;
  skip: number;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist: string[];
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  fit: FitResult;
  odds: OddsTable;
  validation: ValidationResult;
  audit: AuditCounts;
  verdicts: VerdictCounts;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Median of a sorted list of numbers. */
function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? sorted[(n - 1) / 2]! : (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2;
}

/** Round to 4 decimals: the board, the dashboard and the validation all use the same rounded
 * figures, so a number the page recomputes always equals the number the board carries. */
const r4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The live-token protocols a fit can learn from: a market cap and a TVL, both positive. */
function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** One least-squares line through log(mcap) on log(TVL), with its fit statistics. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r2: number;
  n: number;
}

/**
 * The least-squares line through the comps, intercept and slope rounded to 4 decimals so the
 * dashboard recomputes the same curve the board was scored with. Plain ordinary least squares,
 * no library: the slope is the covariance over the variance, the intercept recentres the means.
 */
export function fitCurve(points: SnapshotProtocol[]): CurveFit {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    xs.push(Math.log(p.tvl_usd));
    ys.push(Math.log(p.mcap_usd));
  }
  const n = xs.length;
  if (n < 2) return { intercept: 0, slope: 0, r2: 0, n };
  const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - my);
    sst += (ys[i]! - my) * (ys[i]! - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i]! - (intercept + slope * xs[i]!);
    ssr += r * r;
  }
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  return { intercept: r4(intercept), slope: r4(slope), r2: r4(r2), n };
}

/**
 * The median residual of each category's live protocols, rounded to 4 decimals: a category
 * with fewer than `minLive` live protocols gets no offset, so a thin category cannot tilt
 * the curve. The offset is a shift in log space, so it multiplies the value, never adds to it.
 */
export function categoryOffsets(points: SnapshotProtocol[], fit: CurveFit, minLive: number): Map<string, number> {
  const byCategory = new Map<string, number[]>();
  for (const p of points) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const residual = Math.log(p.mcap_usd) - (fit.intercept + fit.slope * Math.log(p.tvl_usd));
    const key = p.category ?? 'Other';
    const list = byCategory.get(key) ?? [];
    list.push(residual);
    byCategory.set(key, list);
  }
  const out = new Map<string, number>();
  for (const [key, residuals] of byCategory) {
    if (residuals.length < minLive) continue;
    residuals.sort((a, b) => a - b);
    out.set(key, r4(median(residuals)));
  }
  return out;
}

function offsetFor(offsets: Map<string, number>, category: string | null): number {
  return offsets.get(category ?? 'Other') ?? 0;
}

/**
 * The growth, maturity and breadth multipliers one protocol gets, with a term set deciding
 * which terms stay in: a dropped term is 1, never 0, so dropping a term can never zero a value.
 */
export function termMultipliers(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  terms: TermSet,
): { growthPct: number; growth: number; maturity: number; chain: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  // Saturating growth: a huge week helps, but with diminishing returns, so one outlier
  // (the snapshot's max is +4448%) cannot swamp the board.
  const growth = terms.growth ? r4(1 + model.growth_weight * (growthPct / 100) / (1 + Math.max(growthPct, 0) / model.growth_saturation)) : 1;
  const ageForModel = age ?? model.unknown_age_days;
  const maturity = terms.maturity ? r4(model.maturity_floor + model.maturity_range * (1 - Math.exp(-Math.max(ageForModel, 0) / model.maturity_tau_days))) : 1;
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), 5);
  const chain = terms.breadth ? r4(1 + Math.min(model.chain_max_extra, model.chain_step * extraChains)) : 1;
  return { growthPct, growth, maturity, chain, age };
}

/** The age buckets the launch odds are counted in, in days since first listing. */
const ODDS_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '0–180d', min: 0, max: 180 },
  { label: '180–365d', min: 180, max: 365 },
  { label: '365–730d', min: 365, max: 730 },
  { label: '730–1100d', min: 730, max: 1100 },
  { label: '1100d+', min: 1100, max: null },
];

function bucketOf(age: number): number {
  for (let i = 0; i < ODDS_BUCKETS.length; i++) {
    const b = ODDS_BUCKETS[i]!;
    if (age >= b.min && (b.max === null || age < b.max)) return i;
  }
  return ODDS_BUCKETS.length - 1;
}

/** The launch-odds table and the per-protocol odds it implies. */
export interface OddsModel {
  table: OddsTable;
  oddsFor: (protocol: SnapshotProtocol, age: number | null) => number;
}

/**
 * Launch odds from the peers' own record: among the snapshot's dated protocols in the same age
 * bucket, the share that already records a token, shrunk toward the category's own token rate
 * (Laplace-style, pseudo-count 2). A protocol with no listing date takes the pooled rate: the
 * odds say nothing about it either way, so it gets the average. All counts are recomputed from
 * this snapshot on every run; no rate is typed in.
 */
export function launchOdds(snapshot: Snapshot, asOf: string): OddsModel {
  const dated = snapshot.protocols.filter((p) => ageDays(asOf, p.listed_at) !== null);
  const pooled = dated.length > 0 ? dated.filter((p) => !isPreToken(p)).length / dated.length : 0.5;
  const buckets: OddsBucket[] = ODDS_BUCKETS.map((b, i) => {
    const inBucket = dated.filter((p) => bucketOf(ageDays(asOf, p.listed_at)!) === i);
    const withToken = inBucket.filter((p) => !isPreToken(p)).length;
    return { label: b.label, min_days: b.min, max_days: b.max, dated: inBucket.length, with_token: withToken, rate: inBucket.length > 0 ? r4(withToken / inBucket.length) : r4(pooled) };
  });
  // One count per (bucket, category) cell, and one token rate per category; a category with
  // fewer than 10 dated protocols is too thin to speak, so it falls back to the pooled rate.
  const cells = new Map<string, { dated: number; withToken: number }>();
  const byCategory = new Map<string, { dated: number; withToken: number }>();
  for (const p of dated) {
    const key = p.category ?? 'Other';
    const cellKey = `${bucketOf(ageDays(asOf, p.listed_at)!)}|${key}`;
    const cell = cells.get(cellKey) ?? { dated: 0, withToken: 0 };
    cell.dated += 1;
    if (!isPreToken(p)) cell.withToken += 1;
    cells.set(cellKey, cell);
    const cat = byCategory.get(key) ?? { dated: 0, withToken: 0 };
    cat.dated += 1;
    if (!isPreToken(p)) cat.withToken += 1;
    byCategory.set(key, cat);
  }
  const categoryRate = (category: string | null): number => {
    const cell = byCategory.get(category ?? 'Other');
    if (cell === undefined || cell.dated < 10) return pooled;
    return cell.withToken / cell.dated;
  };
  const oddsFor = (protocol: SnapshotProtocol, age: number | null): number => {
    if (age === null) return r4(pooled);
    const cell = cells.get(`${bucketOf(age)}|${protocol.category ?? 'Other'}`) ?? { dated: 0, withToken: 0 };
    const prior = categoryRate(protocol.category);
    return r4((cell.withToken + 2 * prior) / (cell.dated + 2));
  };
  return { table: { buckets, pooled_rate: r4(pooled), dated_total: dated.length }, oddsFor };
}

/** A log-space prediction for a live protocol, under a term set: the curve, the offset, the terms. */
function predictedLogMcap(
  p: SnapshotProtocol,
  fit: CurveFit,
  offsets: Map<string, number>,
  asOf: string,
  model: ModelConstants,
  terms: TermSet,
): number {
  const t = termMultipliers(p, asOf, model, terms);
  return fit.intercept + fit.slope * Math.log(p.tvl_usd) + offsetFor(offsets, p.category) + Math.log(t.growth) + Math.log(t.maturity) + Math.log(t.chain);
}

/** The median absolute log error of a set of signed log residuals. */
function medianAbsLogError(residuals: number[]): number {
  if (residuals.length === 0) return 0;
  const abs = residuals.map((r) => Math.abs(r)).sort((a, b) => a - b);
  return median(abs);
}

/** The sample standard deviation of a set of signed log residuals. */
function residualSd(residuals: number[]): number {
  const n = residuals.length;
  if (n < 2) return 0;
  const mean = residuals.reduce((s, v) => s + v, 0) / n;
  const ss = residuals.reduce((s, v) => s + (v - mean) * (v - mean), 0);
  return Math.sqrt(ss / (n - 1));
}

/**
 * Leave-one-out residuals: each live protocol held out once, the curve refit on the rest, the
 * prediction compared with the market cap the protocol actually trades at. The baseline is the
 * same test with a flat multiple (the median mcap/TVL of the rest), so the multiple says how
 * many times smaller the model's error is than doing nothing clever at all.
 */
function looResiduals(
  comps: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
  terms: TermSet,
): { model: number[]; baseline: number[] } {
  const modelRes: number[] = [];
  const baseRes: number[] = [];
  for (let i = 0; i < comps.length; i++) {
    const held = comps[i]!;
    const rest = comps.filter((_, j) => j !== i);
    const fit = fitCurve(rest);
    const offsets = categoryOffsets(rest, fit, model.min_live_for_offset);
    const pred = Math.exp(predictedLogMcap(held, fit, offsets, asOf, model, terms));
    modelRes.push(Math.log(held.mcap_usd!) - Math.log(Math.max(1, pred)));
    const ratios = rest.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
    baseRes.push(Math.log(held.mcap_usd!) - Math.log(Math.max(1, held.tvl_usd * median(ratios))));
  }
  return { model: modelRes, baseline: baseRes };
}

/**
 * Walk-forward residuals: the dated comps split by listing date at the median, the older half
 * fitting the curve, the newer half tested. A model that only fits the past and not the future
 * fails here, however good its leave-one-out looks.
 */
function walkForwardResiduals(
  datedComps: SnapshotProtocol[],
  asOf: string,
  model: ModelConstants,
  terms: TermSet,
): { model: number[]; baseline: number[] } {
  const sorted = [...datedComps].sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : a.listed_at! > b.listed_at! ? 1 : a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const half = Math.floor(sorted.length / 2);
  const older = sorted.slice(0, half);
  const newer = sorted.slice(half);
  if (older.length < 2 || newer.length === 0) return { model: [], baseline: [] };
  const fit = fitCurve(older);
  const offsets = categoryOffsets(older, fit, model.min_live_for_offset);
  const ratios = older.map((p) => p.mcap_usd! / p.tvl_usd).sort((a, b) => a - b);
  const flat = median(ratios);
  const modelRes: number[] = [];
  const baseRes: number[] = [];
  for (const p of newer) {
    const pred = Math.exp(predictedLogMcap(p, fit, offsets, asOf, model, terms));
    modelRes.push(Math.log(p.mcap_usd!) - Math.log(Math.max(1, pred)));
    baseRes.push(Math.log(p.mcap_usd!) - Math.log(Math.max(1, p.tvl_usd * flat)));
  }
  return { model: modelRes, baseline: baseRes };
}

/**
 * The held-out validation: leave-one-out and walk-forward, and the ablation that keeps a term
 * only when the full model beats the model without it on BOTH tests. A term that helps one test
 * and hurts the other is dropped, and the dashboard says so. Sigma is the residual scale of the
 * shipped model — the terms that survived — from its leave-one-out residuals.
 */
export function validateModel(snapshot: Snapshot, model: ModelConstants = MODEL): { validation: ValidationResult; sigma: number } {
  const asOf = snapshot.as_of;
  const comps = compsOf(snapshot);
  const dated = comps.filter((p) => p.listed_at !== null);
  const full: TermSet = { growth: true, maturity: true, breadth: true };
  const multiple = (base: number, m: number): number => (m > 0 ? Math.round((base / m) * 100) / 100 : 0);
  const looFull = looResiduals(comps, asOf, model, full);
  let wfFull = walkForwardResiduals(dated, asOf, model, full);
  // Walk-forward needs dated comps; too few, and it repeats the leave-one-out result instead
  // of inventing a second test out of nothing.
  if (wfFull.model.length === 0) wfFull = looFull;
  const looMae = r4(medianAbsLogError(looFull.model));
  const looBase = r4(medianAbsLogError(looFull.baseline));
  const wfMae = r4(medianAbsLogError(wfFull.model));
  const wfBase = r4(medianAbsLogError(wfFull.baseline));
  const kept: TermSet = { growth: true, maturity: true, breadth: true };
  const dropped: string[] = [];
  const trials: { name: keyof TermSet; terms: TermSet }[] = [
    { name: 'growth', terms: { growth: false, maturity: true, breadth: true } },
    { name: 'maturity', terms: { growth: true, maturity: false, breadth: true } },
    { name: 'breadth', terms: { growth: true, maturity: true, breadth: false } },
  ];
  for (const t of trials) {
    const loo = r4(medianAbsLogError(looResiduals(comps, asOf, model, t.terms).model));
    let wf = walkForwardResiduals(dated, asOf, model, t.terms);
    if (wf.model.length === 0) wf = looResiduals(comps, asOf, model, t.terms);
    const wfMaeDrop = r4(medianAbsLogError(wf.model));
    if (looMae < loo && wfMae < wfMaeDrop) continue;
    kept[t.name] = false;
    dropped.push(t.name);
  }
  const shipped = looResiduals(comps, asOf, model, kept);
  const sigma = r4(residualSd(shipped.model));
  return {
    validation: {
      loo_n: comps.length,
      loo_mae: looMae,
      loo_baseline_mae: looBase,
      loo_multiple: multiple(looBase, looMae),
      wf_n: wfFull.model.length,
      wf_mae: wfMae,
      wf_baseline_mae: wfBase,
      wf_multiple: multiple(wfBase, wfMae),
      kept,
      dropped,
    },
    sigma,
  };
}

/**
 * The farm's cost in dollars: the plan's gas plus its hours at the model's hourly rate. The
 * numbers come from the same parameters the farm steps state, so the cost and the plan agree:
 * gas is the first transaction, the setup, the second action and $2 a week over the hold, and
 * hours are the minutes the steps themselves quote.
 */
export function farmCostUsd(p: SnapshotProtocol, age: number | null, model: ModelConstants): { cost: number; gas: number; hours: number } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const setupGas = capital >= 150 ? 8 : 4;
  const gas = model.farm_gas_first_usd + setupGas + 2 + model.farm_gas_weekly_usd * weeks;
  const hours = (5 + 15 + 15 + 10 * weeks + 10 + 5) / 60;
  const cost = gas + hours * model.farm_hourly_usd;
  return { cost: r4(cost), gas, hours: r4(hours) };
}

/** The verdict from the break-even share: the share of the launch value one wallet would need
 * to receive to cover the farm. */
export function farmVerdict(share: number, model: ModelConstants): FarmVerdict {
  if (share < model.verdict_farm_max) return 'FARM';
  if (share < model.verdict_thin_max) return 'THIN';
  return 'SKIP';
}

/** Everything the fit, the odds and the terms say about one protocol. */
export interface ScoredProtocol {
  valueIfLaunched: number;
  implied: number;
  odds: number;
  categoryOffset: number;
  growthPct: number;
  growth: number;
  maturity: number;
  chain: number;
  age: number | null;
  valueLow: number;
  valueHigh: number;
  verdict: FarmVerdict;
  farmCost: number;
  breakEvenShare: number;
}

/**
 * One protocol scored: the curve gives the value if launched, the odds weight it into the
 * expected value, the range comes from the fit's own residual scale, and the verdict from the
 * farm cost against the expected value. Every figure the dashboard shows comes from here, so
 * the page and the board can never disagree.
 */
export function scoreProtocol(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
  fit: CurveFit,
  offsets: Map<string, number>,
  oddsFor: (p: SnapshotProtocol, age: number | null) => number,
  terms: TermSet,
  sigma: number,
): ScoredProtocol {
  const t = termMultipliers(protocol, asOf, model, terms);
  const offset = offsetFor(offsets, protocol.category);
  const curve = Math.exp(fit.intercept + fit.slope * Math.log(protocol.tvl_usd) + offset);
  const valueIfLaunched = Math.max(1, Math.round(curve * t.growth * t.maturity * t.chain));
  const odds = oddsFor(protocol, t.age);
  const implied = Math.max(1, Math.round(odds * valueIfLaunched));
  const spread = Math.exp(0.674 * sigma);
  const valueLow = Math.max(1, Math.round(implied / spread));
  const valueHigh = Math.max(1, Math.round(implied * spread));
  const farm = farmCostUsd(protocol, t.age, model);
  const share = farm.cost / implied;
  return {
    valueIfLaunched,
    implied,
    odds,
    categoryOffset: offset,
    growthPct: t.growthPct,
    growth: t.growth,
    maturity: t.maturity,
    chain: t.chain,
    age: t.age,
    valueLow,
    valueHigh,
    verdict: farmVerdict(share, model),
    farmCost: farm.cost,
    breakEvenShare: Math.round(share * 1e6) / 1e6,
  };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and passing the watchlist's own
 * visible exclusion rules — no bridge, liquid-staking/restaking or exchange product, no wrapped,
 * staked, staking or wrapper product, no exchange-prefixed name, no versioned pool. This is the
 * same rule the watchlist was drawn with, applied to the whole board, from snapshot fields only:
 * a bridged token (WBTC is Bitcoin on another chain) is not a protocol awaiting a launch. */
const EXCLUDED_CATEGORY = /bridge|liquid staking|liquid restaking|restaked btc|^cex$/i;
const WRAPPED_WORD = /\b(wrapped|wrapper|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORY.test(p.category ?? '') &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name) &&
    !VERSIONED.test(p.name)
  );
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Everything the board needs from one preparation pass: the fit, the odds, the validation. */
export interface ModelContext {
  fit: CurveFit;
  offsets: Map<string, number>;
  odds: OddsModel;
  validation: ValidationResult;
  sigma: number;
}

/** Fit the curve, count the odds and run the validation once, so the board and the dashboard
 * share one preparation instead of each fitting its own. */
export function prepareModel(snapshot: Snapshot, model: ModelConstants = MODEL): ModelContext {
  const comps = compsOf(snapshot);
  const fit = fitCurve(comps);
  const offsets = categoryOffsets(comps, fit, model.min_live_for_offset);
  const odds = launchOdds(snapshot, snapshot.as_of);
  const { validation, sigma } = validateModel(snapshot, model);
  return { fit, offsets, odds, validation, sigma };
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL, ctx?: ModelContext): BoardRow[] {
  const context = ctx ?? prepareModel(snapshot, model);
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but the
  // board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every other rankable pre-token protocol in the snapshot, by TVL. No cap:
  // on this snapshot that is 157 more rows, so the board is the complete rankable universe (197).
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .slice(0, EARLY_ROWS);
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, model, context.fit, context.offsets, context.odds.oddsFor, context.validation.kept, context.sigma);
    return { p, ...s };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      value_if_launched_usd: s.valueIfLaunched,
      launch_odds: s.odds,
      category_offset: s.categoryOffset,
      growth_pct: s.growthPct,
      growth_multiplier: s.growth,
      maturity_multiplier: s.maturity,
      chain_multiplier: s.chain,
      age_days: s.age,
      value_low_usd: s.valueLow,
      value_high_usd: s.valueHigh,
      farm_verdict: s.verdict,
      farm_cost_usd: s.farmCost,
      break_even_share: s.breakEvenShare,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** Why a pre-token protocol is not on the board, in one lane each, so the audit sums exactly:
 * exchange first, then versioned, then wrapped or staked. A protocol that fails on two counts
 * is counted once, in the first lane it matches. */
export function auditCounts(snapshot: Snapshot, board: BoardRow[]): AuditCounts {
  const onBoard = new Set(board.map((r) => r.slug));
  let live = 0;
  let exchange = 0;
  let versioned = 0;
  let wrapped = 0;
  for (const p of snapshot.protocols) {
    if (onBoard.has(p.slug)) continue;
    if (!isPreToken(p)) {
      live++;
      continue;
    }
    if (EXCLUDED_CATEGORY.test(p.category ?? '') || EXCHANGE_PREFIX.test(p.name)) exchange++;
    else if (VERSIONED.test(p.name)) versioned++;
    else wrapped++;
  }
  return { total: snapshot.protocols.length, board: board.length, live, excluded_exchange: exchange, excluded_versioned: versioned, excluded_wrapped: wrapped };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield')) return `Deposit $${capital} into ${name}'s main vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('basis trad')) return `Deposit $${capital} of USDC into ${name}'s basis vault on ${chain} and keep the position open.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** A second, different qualifying action for the same category, so the plan is not one move repeated. */
function secondActionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  const small = Math.max(10, Math.round(capital / 5));
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Borrow $${small} against the supplied position on ${name}, then repay it in the same week.`;
  if (c.includes('dex') || c.includes('leveraged farm')) return `Swap $${small} through ${name}'s main pool on ${chain} so the wallet shows trading activity as well as liquidity.`;
  if (c.includes('yield')) return `Harvest or compound the vault rewards on ${name} once, instead of letting them sit unclaimed.`;
  if (c.includes('bridge')) return `Bridge $${small} back to the chain you started from through ${name} to show two-way use.`;
  if (c.includes('staking') || c.includes('restak')) return `Delegate a second, smaller stake through ${name} on ${chain} and keep both receipts.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Close the hedge on ${name} and open one new small position the following week.`;
  if (c.includes('prediction')) return `Settle one market on ${name} and place a second position in a different market.`;
  if (c.includes('curator') || c.includes('allocator')) return `Move $${small} into a second ${name} vault on ${chain} so the wallet holds two vault positions.`;
  if (c.includes('stable')) return `Redeem $${small} of the stable asset through ${name} and deposit it again the same week.`;
  if (c.includes('rwa')) return `Check the yield accrued on the ${name} position and reinvest the first payout.`;
  if (c.includes('insurance')) return `Renew or extend the ${name} cover once, so the wallet shows two cover periods.`;
  if (c.includes('basis trad')) return `Check the funding earned in the ${name} vault and leave it compounding for a week.`;
  return `Make a second, smaller deposit of $${small} into ${name} on ${chain} in a later week.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const second = secondActionFor(p, capital, chain);
  const chainNote = p.chains.length > 1 ? ` Repeat the first deposit on a second chain, ${p.chains[1]}, if the app supports it.` : '';
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `${second}${chainNote}`,
      cost: `about $${Math.max(10, Math.round(capital / 5))} of capital and $2 of gas`,
      time: '15 minutes',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote, and keep the position funded.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Open the protocol's own points or rewards page, check the wallet is counted, and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log, then unwind in stages instead of withdrawing everything at once.`,
      cost: 'nothing but the log',
      time: '5 minutes to log, 1 day to unwind',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan the board carries. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    value_if_launched_usd: row.model.value_if_launched_usd,
    launch_odds: row.model.launch_odds,
    category_offset: row.model.category_offset,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
    value_low_usd: row.model.value_low_usd,
    value_high_usd: row.model.value_high_usd,
    farm_verdict: row.model.farm_verdict,
    farm_cost_usd: row.model.farm_cost_usd,
    break_even_share: row.model.break_even_share,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const ctx = prepareModel(snapshot, model);
  const board = buildBoard(snapshot, model, ctx);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const audit = auditCounts(snapshot, board);
  const verdicts: VerdictCounts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) {
    if (r.model.farm_verdict === 'FARM') verdicts.farm++;
    else if (r.model.farm_verdict === 'THIN') verdicts.thin++;
    else verdicts.skip++;
  }
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist: snapshot.watchlist,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    fit: { intercept: ctx.fit.intercept, slope: ctx.fit.slope, r2: ctx.fit.r2, n: ctx.fit.n, sigma: ctx.sigma },
    odds: ctx.odds.table,
    validation: ctx.validation,
    audit,
    verdicts,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
