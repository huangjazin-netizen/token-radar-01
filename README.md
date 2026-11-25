# Token Launch Radar

Entry for the make.fun bounty **token-radar-01** — build the best token launch radar.

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

## Model

- Category multiples taken from the snapshot itself: the median live-token
  market-cap / TVL per category, clamped to 0.08–0.60.
- Saturating growth from the 7-day TVL change, a maturity factor from protocol
  age, and a small bonus for multi-chain breadth.
- 197 ranked rows, covering the full 40-protocol watchlist; every row carries a
  7-step farm plan with costs and an exit in stages.

## Dashboard

Open `dashboard/index.html` in a browser. It is fully static and makes no
network requests: the board, a detail view for each protocol, and filters
(watchlist-only, chain, search).

## Screenshots

`screenshots/` holds the board, a protocol detail view, and a filtered view.
