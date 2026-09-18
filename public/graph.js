
(function () {
  const COLORS = {
    Account: '#6ea8fe',
    Person: '#7ee0c0',
    Company: '#ffb454',
    Address: '#c792ea',
    Phone: '#ff8fb1',
  };
  const FLAGGED = '#ff5d73';

  function GraphView(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.nodes = [];
    this.edges = [];
    this.byId = new Map();
    this.selectedId = null;
    this.hoverId = null;
    this._selectCb = null;
    this._raf = null;
    this._dpr = Math.max(1, window.devicePixelRatio || 1);

    this._bindEvents();
    this._resize();
    this._tick = this._tick.bind(this);
    this._raf = requestAnimationFrame(this._tick);
  }

  GraphView.prototype.onSelect = function (cb) { this._selectCb = cb; };

  GraphView.prototype.setData = function ({ nodes, edges }) {
    const prev = this.byId;
    const layout = { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
    this.nodes = (nodes || []).map((n) => {
      const old = prev.get(n.id);
      const angle = Math.random() * Math.PI * 2;
      const r = Math.min(layout.w, layout.h) * 0.28;
      return {
        ...n,
        x: old ? old.x : layout.w / 2 + Math.cos(angle) * r,
        y: old ? old.y : layout.h / 2 + Math.sin(angle) * r,
        vx: 0, vy: 0,
        r: n.label === 'Account' ? (n.flagged ? 11 : 8) : 7,
      };
    });
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.edges = (edges || []).filter((e) => this.byId.has(e.source) && this.byId.has(e.target));
    this.selectedId = this.selectedId && this.byId.has(this.selectedId) ? this.selectedId : null;
  };

  GraphView.prototype.setSelected = function (id) {
    this.selectedId = id;
  };

  GraphView.prototype._bindEvents = function () {
    const c = this.canvas;
    c.addEventListener('mousemove', (e) => {
      const { x, y } = this._local(e);
      this.hoverId = this._hit(x, y)?.id ?? null;
      c.style.cursor = this.hoverId ? 'pointer' : 'default';
    });
    c.addEventListener('mouseleave', () => { this.hoverId = null; });
    c.addEventListener('click', (e) => {
      const { x, y } = this._local(e);
      const node = this._hit(x, y);
      if (node) {
        this.selectedId = node.id;
        if (this._selectCb) this._selectCb(node);
      }
    });
    window.addEventListener('resize', () => this._resize());
  };

  GraphView.prototype._local = function (e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  GraphView.prototype._hit = function (x, y) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const dx = n.x - x, dy = n.y - y;
      if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
    }
    return null;
  };

  GraphView.prototype._resize = function () {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    this.canvas.width = w * this._dpr;
    this.canvas.height = h * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  };

  GraphView.prototype._tick = function () {
    const { w, h } = { w: this.canvas.clientWidth, h: this.canvas.clientHeight };
    const nodes = this.nodes;
    const edges = this.edges;

    // Repulsion 
    const repulsion = 900;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d2 = 0.01; }
        const d = Math.sqrt(d2);
        const f = repulsion / d2;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    // Springs
    const springLen = 90, springK = 0.02;
    for (const e of edges) {
      const a = this.byId.get(e.source), b = this.byId.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const f = (d - springLen) * springK;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Center gravity + damping + integrate
    for (const n of nodes) {
      n.vx += (w / 2 - n.x) * 0.002;
      n.vy += (h / 2 - n.y) * 0.002;
      n.vx *= 0.85; n.vy *= 0.85;
      n.x += n.vx; n.y += n.vy;

      const pad = 24;
      if (n.x < pad) { n.x = pad; n.vx = 0; }
      if (n.y < pad) { n.y = pad; n.vy = 0; }
      if (n.x > w - pad) { n.x = w - pad; n.vx = 0; }
      if (n.y > h - pad) { n.y = h - pad; n.vy = 0; }
    }

    this._draw(w, h);
    this._raf = requestAnimationFrame(this._tick);
  };

  GraphView.prototype._draw = function (w, h) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);

    // Edges
    ctx.lineWidth = 1;
    for (const e of this.edges) {
      const a = this.byId.get(e.source), b = this.byId.get(e.target);
      if (!a || !b) continue;
      const dim = this.selectedId && a.id !== this.selectedId && b.id !== this.selectedId;
      ctx.strokeStyle = dim ? 'rgba(120,130,150,0.12)' : 'rgba(120,130,150,0.35)';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // Nodes
    for (const n of this.nodes) {
      const base = COLORS[n.label] || '#8892a6';
      const isFlag = n.label === 'Account' && n.flagged;
      const color = isFlag ? FLAGGED : base;
      const dim = this.selectedId && n.id !== this.selectedId && !this._isNeighbor(n.id);
      ctx.globalAlpha = dim ? 0.35 : 1;

      if (isFlag) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r + 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,93,115,0.15)';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = (n.id === this.selectedId) ? '#ffffff' : 'rgba(0,0,0,0.35)';
      ctx.stroke();

      if (n.id === this.selectedId || n.id === this.hoverId) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#e8ecf3';
        ctx.font = '11px ui-sans-serif, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(shortLabel(n), n.x, n.y - n.r - 6);
      }
    }
    ctx.globalAlpha = 1;
  };

  GraphView.prototype._isNeighbor = function (id) {
    if (!this.selectedId) return false;
    for (const e of this.edges) {
      if (e.source === this.selectedId && e.target === id) return true;
      if (e.target === this.selectedId && e.source === id) return true;
    }
    return false;
  };

  function shortLabel(n) {
    const s = String(n.name || n.id || '');
    return s.length > 22 ? s.slice(0, 20) + '…' : s;
  }

  window.GraphView = GraphView;
})();
