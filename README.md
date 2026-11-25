# Token Launch Radar

[![make.fun bounty](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/huangjazin-netizen/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/huangjazin-netizen/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

Entry for the [make.fun bounty token-radar-01](https://make.fun/bounty/token-radar-01) — build the best token launch radar.

It ranks DefiLlama protocols that have no token yet by what their launch would be
worth, and ships an offline dashboard with the board, a detail view for every
protocol, and concrete steps to farm each one.

## How it works

`main.ts` (Node 22, standard library only, no dependencies) reads a snapshot of
DefiLlama protocols and writes `board.json`, the dashboard data, screenshots and
`dossier.json` into `out/`:

```sh
node main.ts --input <snapshot.json>
```

## Model (radar-3)

- A log-log comps curve fitted on the snapshot's own live-token protocols,
  every run: `log(mcap) = 6.96 + 0.52 x log(TVL)` (R² 0.19 on 128 comps),
  plus a category offset (median residual, 5+ live protocols).
- Launch odds from the peers' record: the share of dated protocols in the
  same age bucket that already have a token (26% under 180 days, 79% over
  3 years), shrunk toward the category rate. Implied value is the
  odds-weighted expected value: launch odds x value if launched.
- Every term kept or dropped on held-out evidence (leave-one-out and
  walk-forward): on this snapshot growth, maturity and breadth all failed
  to improve both tests, so the shipped model does not use them — the
  dashboard says so.
- 197 ranked rows, covering the full 40-protocol watchlist; every row carries
  a P25–P75 range, a FARM/THIN/SKIP verdict from its break-even share, and
  a 7-step farm plan with costs and an exit in stages.

## Dashboard

Open `dashboard/index.html` in a browser. It is fully static and makes no
network requests: the board, a detail view for each protocol, and filters
(watchlist-only, chain, search).

## Screenshots

`screenshots/` holds the board, a protocol detail view, and a filtered view.
