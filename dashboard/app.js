// Token Radar's dashboard, radar-3. It reads window.RADAR (written beside dashboard/ by
// main.ts) and renders the ranked board, a filterable table, and a per-protocol detail drawer
// with the model's own inputs and the protocol's farm plan. No network: every byte it shows
// is in data.js. Farm plans are the board's own rows, not recomputed here, so the page and
// board.json can never disagree about what a protocol's plan says.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtShare(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(2) + '%';
  }
  function fmtShare4(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n * 100).toFixed(4) + '%';
  }
  // The model in one function: the page recomputes a row from the fitted curve and the row's
  // own odds and multipliers, and checks the number board.json carries, so the page's code
  // and the board's data are visibly the same arithmetic. Implied value = launch odds x
  // value if launched; value if launched is the fitted curve times the surviving terms.
  function impliedOf(row, model, fit) {
    var r4 = function (n) { return Math.round(n * 1e4) / 1e4; };
    var curve = Math.exp(fit.intercept + fit.slope * Math.log(row.tvl_usd) + r4(row.category_offset));
    var valueIfLaunched = Math.max(1, Math.round(curve * r4(row.growth_multiplier) * r4(row.maturity_multiplier) * r4(row.chain_multiplier)));
    return { valueIfLaunched: valueIfLaunched, implied: Math.max(1, Math.round(r4(row.launch_odds) * valueIfLaunched)) };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (state.watchlistOnly && !WATCH[r.slug]) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'verdict') { av = { FARM: 2, THIN: 1, SKIP: 0 }[a.farm_verdict] || 0; bv = { FARM: 2, THIN: 1, SKIP: 0 }[b.farm_verdict] || 0; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    var v = DATA.validation;
    var fit = DATA.fit;
    var kept = ['growth', 'maturity', 'breadth'].filter(function (t) { return v.kept[t]; });
    var dropped = v.dropped.length ? 'Dropped: ' + v.dropped.join(', ') + ' — no held-out gain.' : 'All three terms kept.';
    var audit = DATA.audit;
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' more rankable pre-token protocols the watchlist leaves out — every one the snapshot holds, not a top-N cut. Implied value is a model, not a promise: it is the launch odds times the value if launched.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows the list leaves out' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token protocols set aside' }), el('b', { text: String(DATA.live_size) }))
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Fitted curve' }), el('b', { text: 'log(mcap) = ' + fit.intercept + ' + ' + fit.slope + ' x log(TVL)' })),
        el('div', { class: 'fact' }, el('span', { text: 'Fit quality' }), el('b', { text: 'R² ' + fit.r2 + ' on ' + fit.n + ' live comps' })),
        el('div', { class: 'fact' }, el('span', { text: 'Held-out error' }), el('b', { text: 'LOO x' + v.loo_multiple + ' · walk-forward x' + v.wf_multiple + ' vs flat multiple' })),
        el('div', { class: 'fact' }, el('span', { text: 'Terms tested' }), el('b', { text: (kept.length ? 'Kept: ' + kept.join(', ') + '. ' : '') + dropped }))
      ),
      el('p', { class: 'sub', text: 'Audit: all ' + audit.total + ' protocols accounted for — ' + audit.board + ' on the board, ' + audit.live + ' already live, ' + audit.excluded_exchange + ' excluded as exchange, ' + audit.excluded_versioned + ' as versioned pools, ' + audit.excluded_wrapped + ' as wrapped or staked. Farm verdicts: ' + DATA.verdicts.farm + ' FARM, ' + DATA.verdicts.thin + ' THIN, ' + DATA.verdicts.skip + ' SKIP. Deterministic: the same snapshot always gives the same board.' })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var chainSelect = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    chainSelect.addEventListener('change', function () { state.chain = chainSelect.value; writeHash(); render(); });
    var wl = el('button', { type: 'button', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), chainSelect),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'tabs' }, wl)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tag = WATCH[r.slug] ? el('span', { class: 'tag tag-watch', text: 'Watchlist' }) : el('span', { class: 'tag', text: 'Early' });
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('div', { class: 'name-row' }, el('b', { text: r.name }), tag),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'tag tag-' + (r.farm_verdict || 'SKIP').toLowerCase(), text: r.farm_verdict || 'SKIP' })),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('verdict', 'Verdict'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var fit = DATA.fit;
    var v = DATA.validation;
    var odds = DATA.odds;
    var kept = ['growth', 'maturity', 'breadth'].filter(function (t) { return v.kept[t]; });
    var droppedNote = v.dropped.length
      ? 'Dropped after testing: ' + v.dropped.join(', ') + ' — removing each one lowered the held-out error, so the shipped model does not use them. The dashboard says so rather than hiding it.'
      : 'All three terms survived held-out testing.';
    var oddsRows = odds.buckets.map(function (b) {
      return el('tr', null,
        el('td', { text: b.label }),
        el('td', { class: 'num', text: String(b.dated) }),
        el('td', { class: 'num', text: String(b.with_token) }),
        el('td', { class: 'num', text: fmtShare(b.rate) })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked. Implied value is the expected value of a launch: the odds it ever launches, times what it would be worth if it did.' }),
      el('div', { class: 'formula' },
        'implied = round( launch odds x value if launched )'
      ),
      el('div', { class: 'formula' },
        'value if launched = exp( ' + fit.intercept + ' + ' + fit.slope + ' x log(TVL) + category offset ) x growth x maturity x breadth'
      ),
      el('div', { class: 'model-grid' },
        el('div', null, el('b', { text: 'Fitted curve' }), el('p', { class: 'sub', text: 'A least-squares line through log(market cap) on log(TVL), fitted on the ' + fit.n + ' live-token protocols in this snapshot, every run: intercept ' + fit.intercept + ', slope ' + fit.slope + ', R² ' + fit.r2 + '. Size is worth sub-linearly, so giant TVLs are not inflated the way a flat multiple inflates them. The category offset is the median residual of a category with 5+ live protocols, else 0.' })),
        el('div', null, el('b', { text: 'Launch odds' }), el('p', { class: 'sub', text: 'The empirical cohort rate: among dated protocols in the same age bucket, the share that already records a token, shrunk toward the category\u2019s own token rate (pseudo-count 2). Undated protocols take the pooled rate ' + fmtShare(odds.pooled_rate) + '. Older cohorts launch more often; the table below is this snapshot\u2019s own count, not a typed-in curve.' })),
        el('div', null, el('b', { text: 'Growth' }), el('p', { class: 'sub', text: 'Seven-day TVL change, clamped to -60%..+250%, then saturating: 1 + 0.45 x (growth/100) / (1 + max(growth,0)/200). A +4448% week cannot swamp the board; a -60% week costs at most 27%.' + (v.kept.growth ? '' : ' Dropped: no held-out gain.') })),
        el('div', null, el('b', { text: 'Maturity' }), el('p', { class: 'sub', text: '0.65 + 0.35 x (1 - exp(-age/540 days)). Age is time since first listing with no token; unknown age uses 365 days. Longevity counts, with diminishing returns.' + (v.kept.maturity ? '' : ' Dropped: no held-out gain.') })),
        el('div', null, el('b', { text: 'Breadth' }), el('p', { class: 'sub', text: '1 + 0.02 per extra chain, at most 1.10. More chains means wider distribution for a future token.' + (v.kept.breadth ? '' : ' Dropped: no held-out gain.') })),
        el('div', null, el('b', { text: 'Range honesty' }), el('p', { class: 'sub', text: 'Every row carries a P25–P75 band from the fit\u2019s own leave-one-out residuals (σ = ' + fit.sigma + ' in log space). The fit is weak — R² ' + fit.r2 + ' — so the bands are wide, and the dashboard shows them wide rather than pretending the point estimate is precise.' }))
      ),
      el('h2', { text: 'Held-out validation' }),
      el('p', { class: 'sub', text: 'Leave-one-out refits the curve holding each live protocol out once (' + v.loo_n + ' comps); walk-forward fits the older half by listing date and tests the newer half (' + v.wf_n + ' tested). The multiple is the flat-multiple baseline\u2019s error over the model\u2019s: how many times smaller the model\u2019s error is than doing nothing clever. Kept: ' + (kept.length ? kept.join(', ') : 'none') + '. ' + droppedNote }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Test' }),
            el('th', { scope: 'col', text: 'Model error' }),
            el('th', { scope: 'col', text: 'Flat-multiple error' }),
            el('th', { scope: 'col', text: 'Multiple' })
          )),
          el('tbody', null,
            el('tr', null, el('td', { text: 'Leave-one-out' }), el('td', { class: 'num', text: String(v.loo_mae) }), el('td', { class: 'num', text: String(v.loo_baseline_mae) }), el('td', { class: 'num', text: 'x' + v.loo_multiple })),
            el('tr', null, el('td', { text: 'Walk-forward' }), el('td', { class: 'num', text: String(v.wf_mae) }), el('td', { class: 'num', text: String(v.wf_baseline_mae) }), el('td', { class: 'num', text: 'x' + v.wf_multiple }))
          )
        )
      ),
      el('h2', { text: 'Launch odds by age' }),
      el('p', { class: 'sub', text: 'Dated protocols: ' + odds.dated_total + '. Pooled launch rate: ' + fmtShare(odds.pooled_rate) + '.' }),
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('thead', null, el('tr', null,
            el('th', { scope: 'col', text: 'Age bucket' }),
            el('th', { scope: 'col', text: 'Dated' }),
            el('th', { scope: 'col', text: 'With token' }),
            el('th', { scope: 'col', text: 'Launch rate' })
          )),
          el('tbody', null, oddsRows)
        )
      ),
      el('h2', { text: 'Farm verdicts' }),
      el('p', { class: 'sub', text: 'Farm cost is the plan\u2019s gas plus its hours at $' + m.farm_hourly_usd + '/hour. The verdict is the break-even share — farm cost divided by implied value, the share of the launch one wallet would need to receive to cover the farm. FARM below ' + (m.verdict_farm_max * 100) + '%, THIN below ' + (m.verdict_thin_max * 100) + '%, else SKIP. The bands sit inside the observed share range because a ~$60–90 farm costs almost nothing against million-dollar expected values; a single active wallet plausibly captures on the order of 0.001%–0.01% of a launch\u2019s value, so the verdicts separate rows one wallet can cover from rows it cannot. That band is an assumption, stated as one.' }),
      el('p', { class: 'sub', text: 'TVL, growth and age come from the snapshot. Rankable means pre-token and passing the watchlist\u2019s own visible exclusions: no bridge, liquid-staking or exchange product, no wrapped or staked product, no exchange-prefixed or versioned name. The live-token protocols are set aside with their market caps shown.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = row.farm_steps || [];
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (WATCH[row.slug] ? 'Watchlist' : 'Early discovery') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category offset' }), el('b', { class: 'num', text: String(row.category_offset) })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: String(row.chain_multiplier) })),
        el('div', null, el('span', { text: 'Value if launched' }), el('b', { class: 'num', text: fmtUsd(row.value_if_launched_usd) })),
        el('div', null, el('span', { text: 'Launch odds' }), el('b', { class: 'num', text: fmtShare(row.launch_odds) })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) })),
        el('div', null, el('span', { text: 'P25–P75 range' }), el('b', { class: 'num', text: fmtUsd(row.value_low_usd) + ' – ' + fmtUsd(row.value_high_usd) })),
        el('div', null, el('span', { text: 'Farm verdict' }), el('b', { class: 'num', text: row.farm_verdict + ' · break-even ' + fmtShare4(row.break_even_share) + ' · farm cost ' + fmtUsd(row.farm_cost_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': implied value is launch odds x value if launched. The page recomputes this row as ' + fmtUsd(impliedOf(row, DATA.model, DATA.fit).implied) + (impliedOf(row, DATA.model, DATA.fit).implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
