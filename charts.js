/* Inline-SVG charts. No library, no CDN.
   Colours are referenced as CSS custom properties via inline style="fill:var(--x)",
   so light/dark switching needs no re-render. See _palette/PALETTE.md. */

(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}, style = '') => {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (style) n.setAttribute('style', style);
    return n;
  };
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

  /* ── shared tooltip ────────────────────────────────────────────────────── */
  let tip;
  function tooltip() {
    if (tip) return tip;
    tip = document.createElement('div');
    tip.style.cssText =
      'position:fixed;z-index:50;pointer-events:none;opacity:0;transition:opacity .1s;' +
      'background:var(--ink);color:var(--surface);font-size:12px;line-height:1.4;' +
      'padding:.35rem .5rem;border-radius:5px;max-width:16rem;box-shadow:0 2px 8px rgba(0,0,0,.25)';
    document.body.appendChild(tip);
    return tip;
  }
  function bindTip(node, text) {
    node.style.cursor = 'default';
    node.addEventListener('mouseenter', e => {
      const t = tooltip();
      t.textContent = text;
      t.style.opacity = '1';
      move(e);
    });
    node.addEventListener('mousemove', move);
    node.addEventListener('mouseleave', () => { if (tip) tip.style.opacity = '0'; });
    function move(e) {
      const t = tooltip();
      t.style.left = Math.min(e.clientX + 12, innerWidth - t.offsetWidth - 8) + 'px';
      t.style.top = Math.max(e.clientY - t.offsetHeight - 10, 8) + 'px';
    }
    // Keyboard/AT fallback — the tooltip text is also the accessible name.
    const title = el('title');
    title.textContent = text;
    node.appendChild(title);
  }

  function svgRoot(w, h, label) {
    const s = el('svg', {
      viewBox: `0 0 ${w} ${h}`, width: '100%',
      role: 'img', 'aria-label': label,
    });
    // `auto` is only valid for height as CSS, not as the SVG presentation
    // attribute — setting it there logs "Expected length" on every chart.
    s.style.height = 'auto';
    s.style.display = 'block';
    s.style.maxWidth = '100%';
    s.style.overflow = 'visible';
    return s;
  }

  /* ── 1. Stacked bars: hours per week, by group ─────────────────────────── */
  /* weeks: [{ label, values: { groupName: hours } }]  groups: [name, name] */
  function stackedWeeks(container, weeks, groups) {
    container.textContent = '';
    if (!weeks.length) return;

    /* padB carries the tick labels plus the "Week of" caption below them, and H
       grew by the same 14px the caption needs — so plotH is unchanged and the
       bars sit exactly where they did before the caption existed. */
    const W = 720, H = 254;
    const padL = 46, padR = 12, padT = 16, padB = 48;
    const plotW = W - padL - padR, plotH = H - padT - padB;

    const totals = weeks.map(w => groups.reduce((s, g) => s + (w.values[g] || 0), 0));
    const max = Math.max(1, ...totals);
    const niceMax = Math.ceil(max / 10) * 10 || 10;

    const svg = svgRoot(W, H, 'Hours per week, split by whether the work required being on campus');
    const y = v => padT + plotH - (v / niceMax) * plotH;

    // gridlines + y axis
    for (let i = 0; i <= 4; i++) {
      const v = (niceMax / 4) * i;
      svg.appendChild(el('line',
        { x1: padL, x2: W - padR, y1: y(v), y2: y(v) },
        'stroke:var(--rule-soft);stroke-width:1'));
      const t = el('text',
        { x: padL - 8, y: y(v) + 4, 'text-anchor': 'end' },
        'font-size:10px;fill:var(--ink-muted);font-family:var(--font-mono)');
      t.textContent = v;
      svg.appendChild(t);
    }

    const slot = plotW / weeks.length;
    const barW = Math.min(46, slot * 0.62);

    weeks.forEach((wk, i) => {
      const cx = padL + slot * i + slot / 2;
      let acc = 0;
      groups.forEach((g, gi) => {
        const v = wk.values[g] || 0;
        if (v <= 0) return;
        const yTop = y(acc + v), yBot = y(acc);
        // 2px surface gap between stacked segments
        const h = Math.max(1, yBot - yTop - (acc > 0 ? 2 : 0));
        const rect = el('rect', {
          x: cx - barW / 2, y: yTop, width: barW, height: h, rx: 3,
        }, `fill:var(--series-${gi + 1})`);
        bindTip(rect, `${wk.label} · ${g}: ${fmt1(v)} h`);
        svg.appendChild(rect);
        acc += v;
      });

      // direct label: week total
      if (totals[i] > 0) {
        const t = el('text',
          { x: cx, y: y(totals[i]) - 6, 'text-anchor': 'middle' },
          'font-size:10px;fill:var(--ink-2);font-family:var(--font-mono)');
        t.textContent = fmt1(totals[i]);
        svg.appendChild(t);
      }

      const lbl = el('text',
        { x: cx, y: H - padB + 16, 'text-anchor': 'middle' },
        'font-size:10px;fill:var(--ink-muted)');
      lbl.textContent = wk.label;
      svg.appendChild(lbl);
    });

    svg.appendChild(el('line',
      { x1: padL, x2: W - padR, y1: padT + plotH, y2: padT + plotH },
      'stroke:var(--rule);stroke-width:1'));

    /* One caption for the whole axis, not a prefix on every tick: the labels are
       week-start Mondays, and a bare "Aug 3" reads as a date somebody logged
       hours on — which is exactly the wrong reading, since nobody logged on the
       Mondays in the sample. Same size, fill and family as the tick labels. */
    const axisNote = el('text',
      { x: padL + plotW / 2, y: H - padB + 30, 'text-anchor': 'middle' },
      'font-size:10px;fill:var(--ink-muted)');
    axisNote.textContent = 'Week of';
    svg.appendChild(axisNote);

    container.appendChild(svg);
  }

  /* ── 2. Lag distribution: horizontal bars, ordinal ramp ────────────────── */
  /* rows: [{ bucket, count }] in fixed order; cutAfter = index of last "prompt" bucket */
  function lagPanel(container, rows, cutAfter) {
    container.textContent = '';
    const total = rows.reduce((s, r) => s + r.count, 0);

    const rowH = 30, labelW = 132, valueW = 74;
    /* Rows below the cut are pushed down to open a band for the divider and its
       caption. Without it the caption lands on top of the first bar below the line. */
    const hasCut = cutAfter >= 0 && cutAfter < rows.length - 1;
    const CUT_GAP = hasCut ? 22 : 0;
    const W = 460, H = rows.length * rowH + CUT_GAP + 26;
    const barMaxW = W - labelW - valueW - 8;
    const yFor = i => i * rowH + (i > cutAfter ? CUT_GAP : 0) + 4;

    const svg = svgRoot(W, H, 'Share of appointments by how long the ticket had been assigned');
    const maxCount = Math.max(1, ...rows.map(r => r.count));

    rows.forEach((r, i) => {
      const yTop = yFor(i);
      const cy = yTop + rowH / 2 - 2;

      const lbl = el('text',
        { x: 0, y: cy + 4 },
        'font-size:12px;fill:var(--ink)');
      lbl.textContent = r.bucket;
      svg.appendChild(lbl);

      const w = total ? Math.max(r.count > 0 ? 3 : 0, (r.count / maxCount) * barMaxW) : 0;
      if (w > 0) {
        const bar = el('rect',
          { x: labelW, y: yTop + 4, width: w, height: rowH - 14, rx: 4 },
          `fill:var(--lag-${i + 1})`);
        bindTip(bar,
          `${r.bucket}: ${r.count} appointment${r.count === 1 ? '' : 's'} · ${pct(r.count, total)}% of ${total}`);
        svg.appendChild(bar);
      }

      // direct label — mandatory, not decorative: the lightest ramp step sits
      // below 3:1 contrast, so the value must never be carried by fill alone.
      const val = el('text',
        { x: labelW + w + 8, y: cy + 4 },
        'font-size:11px;fill:var(--ink-2);font-family:var(--font-mono)');
      val.textContent = total ? `${r.count}  ${pct(r.count, total)}%` : '0';
      svg.appendChild(val);
    });

    // the cut line the headline percentage is computed from
    if (hasCut) {
      const yCut = (cutAfter + 1) * rowH + 5;
      svg.appendChild(el('line',
        { x1: 0, x2: W, y1: yCut, y2: yCut },
        'stroke:var(--ink-muted);stroke-width:1;stroke-dasharray:3 3'));
      const t = el('text',
        { x: 0, y: yCut + 13 },
        'font-size:9px;fill:var(--ink-muted);letter-spacing:.05em');
      t.textContent = '↓ DID NOT REQUIRE SAME-DAY ASSISTANCE';
      svg.appendChild(t);
    }

    container.appendChild(svg);
  }

  /* ── 3. Proportion bar ─────────────────────────────────────────────────── */
  /* parts: [{ label, value, cssVar }] */
  function proportionBar(container, parts) {
    container.textContent = '';
    const total = parts.reduce((s, p) => s + p.value, 0);
    const W = 720, H = 52;
    const svg = svgRoot(W, H, 'Split of appointments by how they were conducted');
    if (!total) { container.appendChild(svg); return; }

    let x = 0;
    parts.forEach((p, i) => {
      const w = (p.value / total) * W;
      if (w <= 0) return;
      const gap = i > 0 ? 2 : 0;
      const rect = el('rect',
        { x: x + gap, y: 0, width: Math.max(0, w - gap), height: 22, rx: 4 },
        `fill:var(${p.cssVar})`);
      bindTip(rect, `${p.label}: ${p.value} · ${pct(p.value, total)}%`);
      svg.appendChild(rect);

      const anchor = i === 0 ? 'start' : 'end';
      const tx = i === 0 ? 0 : W;
      const t1 = el('text', { x: tx, y: 38, 'text-anchor': anchor },
        'font-size:12px;fill:var(--ink)');
      t1.textContent = p.label;
      svg.appendChild(t1);
      const t2 = el('text', { x: tx, y: 50, 'text-anchor': anchor },
        'font-size:11px;fill:var(--ink-2);font-family:var(--font-mono)');
      t2.textContent = `${p.value} · ${pct(p.value, total)}%`;
      svg.appendChild(t2);

      x += w;
    });
    container.appendChild(svg);
  }

  global.Charts = { stackedWeeks, lagPanel, proportionBar };
})(window);
