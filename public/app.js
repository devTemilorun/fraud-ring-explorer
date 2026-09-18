
(function () {
  const $ = (sel) => document.querySelector(sel);

  const state = {
    flagged: [],
    connectors: [],
    selectedAccountId: null,
    hops: 2,
    lastQuery: null,
  };

  const graph = new window.GraphView($('#graph'));
  graph.onSelect((node) => showInspector(node));

  // API helper 
  async function api(path, options = {}) {
    const res = await fetch(path, { headers: { Accept: 'application/json' }, ...options });
    let body = null;
    try { body = await res.json(); } catch {  }
    if (!res.ok) {
      const msg = body?.message || body?.error || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return body;
  }

  function toast(msg, ms = 4000) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), ms);
  }

  function setQueryView(text) {
    state.lastQuery = text;
    $('#query-view').textContent = text || '—';
  }

  // Health banner
  async function checkHealth() {
    try {
      const res = await fetch('/api/health');
      const body = await res.json();
      const banner = $('#db-banner');
      if (!body.ok) {
        banner.innerHTML = `<strong>Database unreachable.</strong> ${escapeHtml(body.db?.message || '')} — check <code>COGNODB_URI</code>.`;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    } catch {
      const banner = $('#db-banner');
      banner.innerHTML = `<strong>Cannot reach the API.</strong> Is the server running?`;
      banner.classList.remove('hidden');
    }
  }
  checkHealth();
  setInterval(checkHealth, 30_000);

  // Flagged accounts
  async function loadFlagged() {
    const list = $('#flagged-list');
    list.dataset.state = 'loading';
    list.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
    try {
      const { items } = await api('/api/accounts/flagged');
      state.flagged = items;
      renderFlagged();
    } catch (err) {
      list.dataset.state = 'empty';
      list.innerHTML = `<p class="muted" style="padding:10px">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderFlagged() {
    const list = $('#flagged-list');
    list.innerHTML = '';
    if (!state.flagged.length) {
      list.dataset.state = 'empty';
      return;
    }
    list.dataset.state = 'ready';
    for (const a of state.flagged) {
      const row = document.createElement('div');
      row.className = 'row' + (a.id === state.selectedAccountId ? ' active' : '');
      row.innerHTML = `
        <div class="line1">
          <span class="badge">FLAGGED</span>
          <span class="num">${escapeHtml(a.number)}</span>
        </div>
        <div class="meta">
          <span>${escapeHtml(a.owners.join(', ') || '—')}</span>
          <span>£${formatMoney(a.balance)}</span>
        </div>`;
      row.addEventListener('click', () => selectAccount(a.id, a.number));
      list.appendChild(row);
    }
  }

  // Top connectors
  async function loadConnectors() {
    const list = $('#connectors-list');
    list.dataset.state = 'loading';
    list.innerHTML = '<div class="skeleton-row"></div><div class="skeleton-row"></div><div class="skeleton-row"></div>';
    try {
      const { items } = await api('/api/rings/connectors');
      state.connectors = items;
      renderConnectors();
    } catch (err) {
      list.dataset.state = 'empty';
      list.innerHTML = `<p class="muted" style="padding:10px">${escapeHtml(err.message)}</p>`;
    }
  }

  function renderConnectors() {
    const list = $('#connectors-list');
    list.innerHTML = '';
    if (!state.connectors.length) { list.dataset.state = 'empty'; return; }
    list.dataset.state = 'ready';
    for (const c of state.connectors) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="line1">
          <span class="num">${escapeHtml(c.name || c.id)}</span>
          <span class="badge warn">score ${c.score}</span>
        </div>
        <div class="meta">
          <span>direct ${c.directFlagged}</span>
          <span>indirect ${c.indirectFlagged}</span>
          <span>risk ${c.riskScore}</span>
        </div>`;
      list.appendChild(row);
    }
  }

  // Selection → neighbourhood fetch
  function updateBreadcrumb() {
    if (!state.selectedAccountId) return;
    const label = state.selectedAccountNumber || state.selectedAccountId;
    $('#breadcrumb').textContent = `Exploring ${label} · ${state.hops}-hop neighbourhood`;
  }

  async function selectAccount(id, number) {
    state.selectedAccountId = id;
    state.selectedAccountNumber = number;
    renderFlagged();
    updateBreadcrumb();
    await loadNeighborhood(id, state.hops);
    try {
      const rings = await api('/api/rings?limit=500');
      state.rings = rings.items;
    } catch {  }
  }

  async function loadNeighborhood(rootId, hops) {
    try {
      const data = await api(`/api/paths/neighborhood/${encodeURIComponent(rootId)}?hops=${hops}`);
      if (!data.nodes.length) {
        showEmptyState();
        toast('No neighbours found for this account.');
        return;
      }
      $('#empty-state').classList.add('hidden');
      graph.setData(data);
      graph.setSelected(rootId);
      setQueryView(
        `MATCH (root:Account { id: $rootId })\n` +
        `MATCH path = (root)-[*1..$hops]-(n)\n` +
        `WITH root, path\n` +
        `UNWIND nodes(path) AS node\n` +
        `WITH root, collect(DISTINCT node) AS allNodes, collect(DISTINCT path) AS paths\n` +
        `UNWIND paths AS p\n` +
        `UNWIND relationships(p) AS rel\n` +
        `WITH allNodes, collect(DISTINCT rel) AS allRels\n` +
        `RETURN [n IN allNodes | {...}] AS nodes,\n` +
        `       [r IN allRels | {...}] AS edges\n` +
        `// $rootId = "${rootId}", $hops = ${hops}`
      );
    } catch (err) {
      toast(`Could not load neighbourhood: ${err.message}`);
    }
  }

  function showEmptyState() {
    $('#empty-state').classList.remove('hidden');
    graph.setData({ nodes: [], edges: [] });
  }

  // Inspector
  function showInspector(node) {
    const body = $('#inspector-body');
    body.innerHTML = '';
    const h = document.createElement('h3');
    h.textContent = node.name || node.id;
    body.appendChild(h);

    const rows = [
      ['Type', node.label],
      ['ID', node.id],
      ['Flagged', node.flagged ? 'yes' : 'no'],
    ];
    if (node.label === 'Account') rows.push(['Balance', `£${formatMoney(node.balance)}`]);
    if (node.label === 'Person')  rows.push(['Risk score', String(node.riskScore)]);

    // If this is a flagged account, show how many rings touch it.
    if (node.label === 'Account' && state.rings) {
      const related = state.rings.filter((r) => r.flaggedId === node.id);
      rows.push(['Ring links', String(related.length)]);
    }

    for (const [k, v] of rows) {
      const kv = document.createElement('div');
      kv.className = 'kv';
      kv.innerHTML = `<span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(String(v))}</span>`;
      body.appendChild(kv);
    }
  }

  // Search
  const searchInput = $('#search-input');
  const searchResults = $('#search-results');
  let searchTimer = null;
  let searchAbortController = null;

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    const q = searchInput.value.trim();
    searchTimer = setTimeout(() => runSearch(q), 180);
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim() === '' && state.flagged.length) {
      runSearch('');
    }
  });

  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== searchInput) {
      searchResults.classList.add('hidden');
    }
  });

  async function runSearch(q) {
    if (searchAbortController) searchAbortController.abort();
    searchAbortController = new AbortController();
    try {
      const { items } = await api(`/api/accounts/search?q=${encodeURIComponent(q)}`, {
        signal: searchAbortController.signal,
      });
      searchResults.innerHTML = '';
      if (!items.length) {
        searchResults.innerHTML = `<div class="item"><span class="muted">No matches</span></div>`;
      } else {
        for (const a of items) {
          const item = document.createElement('div');
          item.className = 'item';
          item.innerHTML = `
            <span class="num">${escapeHtml(a.number)}</span>
            <span class="meta">${a.flagged ? 'flagged · ' : ''}${escapeHtml(a.owners.join(', ') || '')}</span>`;
          item.addEventListener('click', () => {
            searchResults.classList.add('hidden');
            searchInput.value = a.number;
            selectAccount(a.id, a.number);
          });
          searchResults.appendChild(item);
        }
      }
      searchResults.classList.remove('hidden');
    } catch (err) {
      if (err.name === 'AbortError') return; 
      toast(`Search failed: ${err.message}`);
    }
  }

  //  refresh
  $('#refresh-flagged').addEventListener('click', () => {
    loadFlagged();
    loadConnectors();
  });

  $('#hops-select').addEventListener('change', (e) => {
    state.hops = Number(e.target.value);
    updateBreadcrumb();
    if (state.selectedAccountId) {
      loadNeighborhood(state.selectedAccountId, state.hops);
    }
  });

  $('#copy-query').addEventListener('click', async () => {
    if (!state.lastQuery) return;
    try {
      await navigator.clipboard.writeText(state.lastQuery);
      toast('Cypher copied to clipboard.', 1800);
    } catch {
      toast('Copy failed — select the text manually.');
    }
  });

  // Utilities
  function formatMoney(n) {
    const v = Number(n) || 0;
    if (v >= 1_000_000) return (v / 1_000_000).toFixed(2) + 'M';
    if (v >= 1_000) return (v / 1_000).toFixed(1) + 'k';
    return v.toFixed(0);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Boot
  (async function boot() {
    await loadFlagged();
    await loadConnectors();
    if (state.flagged.length) {
      const first = state.flagged[0];
      await selectAccount(first.id, first.number);
    } else {
      showEmptyState();
    }
  })();
})();