/* HUCTW Time Tracking — page logic.
   Talks to a single Power Automate flow; falls back to a local demo backend
   when no flow URL is configured so the whole UI can be exercised offline. */

(function () {
  'use strict';

  const CFG = window.HUCTW_CONFIG;
  const LIVE = !!(CFG.FLOW_URL && CFG.FLOW_URL.trim());

  /* Fixed vocabulary. The lag buckets are ordered; the first two count as
     prompt service, and the headline percentage is everything below them. */
  const LAG_BUCKETS = [
    'Immediately', 'Same day', 'Next day',
    'Two days', 'Three to four days', 'Five or more days',
  ];
  const PROMPT_COUNT = 2;               // Immediately + Same day
  const CUT_AFTER = PROMPT_COUNT - 1;   // index of the last prompt bucket

  const $ = id => document.getElementById(id);
  const KEY = 'huctw.session';
  const MOCK_KEY = 'huctw.demo';

  /* Composite-key separator. Must be a character that cannot appear in a
     category, group, bucket or mode name — "Required on campus" and "Same day"
     both contain spaces, so a space would split them apart. */
  const SEP = '\u0000';

  const state = {
    pin: null, name: null,
    config: null,
    mine: { hours: [], appointments: [] },
    team: null,
    scope: 'mine',
    rangeDays: 30,
    hours: new Map(),      // "group<SEP>category" -> number
    appts: new Map(),      // "bucket<SEP>mode"    -> integer
  };

  /* ── dates ─────────────────────────────────────────────────────────────── */
  /* Always built from local calendar parts. toISOString() would convert to UTC
     and push an evening entry onto tomorrow's date. */
  function localDate(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function parseDate(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDate(d);
  }
  function mondayOf(s) {
    const d = parseDate(s);
    const off = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - off);
    return localDate(d);
  }
  const MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function shortLabel(s) {
    const d = parseDate(s);
    return `${MON[d.getMonth()]} ${d.getDate()}`;
  }
  /* AP style abbreviates months of six or more letters when a date follows and
     spells out March through July, so this is not MON with periods added — a
     chart axis wants the bare "Aug 9" but prose wants "Aug. 9", and June is
     "June 15", never "Jun. 15". Collection runs Aug 2026 to Jun 2027, so both
     the abbreviated and the spelled-out months really do appear. */
  const AP_MON = ['Jan.','Feb.','March','April','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
  function proseDate(s) {
    const d = parseDate(s);
    return `${AP_MON[d.getMonth()]} ${d.getDate()}`;
  }

  /* ── transport ─────────────────────────────────────────────────────────── */
  async function api(action, payload) {
    if (!LIVE) return demo(action, payload);
    // text/plain keeps this a "simple" request, so the browser sends no CORS
    // preflight — the flow endpoint does not reliably answer one.
    const res = await fetch(CFG.FLOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ pin: state.pin, action, payload: payload || {} }),
    });
    if (res.status === 401) throw new Error('unauthorised');
    if (!res.ok) throw new Error(`Flow returned ${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); }
    catch { throw new Error('Flow did not return JSON'); }
  }

  /* getConfig returns categories flat — one entry per category, already in SortOrder —
     because grouping them in Power Automate is far more work than grouping them here.
     Groups come out in first-appearance order, so SortOrder in HTT_Categories decides
     both the order of the groups and the order within each one. A flow that returns the
     grouped hoursGroups shape instead is passed straight through. */
  function normalizeConfig(raw) {
    if (raw && Array.isArray(raw.hoursGroups)) return raw;
    const groups = [];
    const byName = new Map();
    ((raw && raw.hoursCategories) || []).forEach(({ group, category }) => {
      let g = byName.get(group);
      if (!g) { g = { group, categories: [] }; byName.set(group, g); groups.push(g); }
      if (!g.categories.includes(category)) g.categories.push(category);
    });
    return { ...raw, hoursGroups: groups, modes: (raw && raw.modes) || [] };
  }

  /* ── demo backend ──────────────────────────────────────────────────────── */
  // Flat, matching what the flow actually sends, so demo mode exercises normalizeConfig.
  const DEMO_CONFIG = {
    hoursCategories: [
      { group: 'Required on campus', category: 'Appointments' },
      { group: 'Required on campus', category: 'Meetings' },
      { group: 'Required on campus', category: 'Other' },
      { group: 'Remote or could have been remote', category: 'Appointments' },
      { group: 'Remote or could have been remote', category: 'Meetings' },
      { group: 'Remote or could have been remote', category: 'Other' },
    ],
    modes: ['In person', 'Remote'],
  };
  const DEMO_GROUPS = normalizeConfig(DEMO_CONFIG).hoursGroups;

  function demoStore() {
    try { return JSON.parse(localStorage.getItem(MOCK_KEY)) || { hours: [], appointments: [] }; }
    catch { return { hours: [], appointments: [] }; }
  }
  function demoSave(s) { localStorage.setItem(MOCK_KEY, JSON.stringify(s)); }

  // Deterministic pseudo-random so the demo numbers don't jump around on reload.
  function rng(seed) {
    let s = seed;
    return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  }

  /* Emits daily rows in exactly the shape HTT_TeamHoursDaily and
     HTT_TeamApptsDaily send, so demo mode exercises the same roll-up in
     viewModel() that the live flow will. Weekends produce no rows at all,
     which is also what the live 3-contributor floor will do to them. */
  const DEMO_TECHS = 5;
  function demoTeam(days) {
    const r = rng(20260729);
    const hours = [];
    const appointments = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = daysAgo(i);
      const dow = parseDate(date).getDay();
      if (dow === 0 || dow === 6) continue;
      DEMO_GROUPS.forEach(g => {
        g.categories.forEach(c => {
          const onCampus = g.group === 'Required on campus';
          const base = onCampus ? (c === 'Appointments' ? 1.6 : c === 'Meetings' ? 0.5 : 0.7)
                                : (c === 'Appointments' ? 2.1 : c === 'Meetings' ? 1.1 : 1.6);
          // Round per technician, then sum: each one logs half-hour increments.
          let v = 0;
          for (let t = 0; t < DEMO_TECHS; t++) {
            v += Math.max(0, Math.round((base + (r() - 0.5) * 1.2) * 2) / 2);
          }
          hours.push({ date, group: g.group, category: c, hours: v });
        });
      });
      // Appointments skew away from same-day, but not absolutely.
      const shape = [0.05, 0.16, 0.22, 0.21, 0.21, 0.15];
      const counts = {};
      for (let t = 0; t < DEMO_TECHS; t++) {
        DEMO_CONFIG.modes.forEach(mode => {
          const n = Math.round(r() * 3);
          for (let a = 0; a < n; a++) {
            let x = r(), acc = 0, idx = 0;
            for (let b = 0; b < shape.length; b++) { acc += shape[b]; if (x <= acc) { idx = b; break; } }
            const k = LAG_BUCKETS[idx] + SEP + mode;
            counts[k] = (counts[k] || 0) + 1;
          }
        });
      }
      Object.entries(counts).forEach(([k, count]) => {
        const [bucket, mode] = k.split(SEP);
        appointments.push({ date, bucket, mode, count });
      });
    }
    /* Demo only: ?contributors=2 used to force the small-team suppression path.
       MIN_CONTRIBUTORS is 0 as of 12 Aug 2026, so this never fires and demo mode
       matches live. Kept, with the render path below, so reinstating a floor is
       one number in config.js rather than a rebuild. */
    const contributors = Number(new URLSearchParams(location.search).get('contributors') || DEMO_TECHS);
    if (contributors < CFG.MIN_CONTRIBUTORS) return { contributors, suppressed: true };

    return { contributors, suppressed: false, hours, appointments };
  }

  async function demo(action, p) {
    await new Promise(r => setTimeout(r, 120));       // make latency visible
    const s = demoStore();
    switch (action) {
      case 'auth':
        return /^\d{6}$/.test(state.pin)
          ? { ok: true, name: 'Demo Technician' }
          : (() => { throw new Error('unauthorised'); })();
      case 'getConfig':
        return DEMO_CONFIG;
      case 'submitHours':
        s.hours = s.hours.filter(r => r.date !== p.date)
          .concat(p.entries.map(e => ({ ...e, date: p.date, notes: p.notes })));
        demoSave(s); return { ok: true };
      case 'submitAppointments':
        s.appointments = s.appointments.filter(r => r.date !== p.date)
          .concat(p.entries.map(e => ({ ...e, date: p.date })));
        demoSave(s); return { ok: true };
      case 'getData': {
        const from = daysAgo(p.days);
        return {
          mine: {
            hours: s.hours.filter(r => r.date >= from),
            appointments: s.appointments.filter(r => r.date >= from),
          },
          team: demoTeam(p.days),
        };
      }
      default: throw new Error('unknown action ' + action);
    }
  }

  /* ── PIN gate ──────────────────────────────────────────────────────────── */
  function showGate(msg) {
    $('gateView').hidden = false;
    $('appView').hidden = true;
    $('who').hidden = true;
    $('pinError').hidden = !msg;
    if (msg) $('pinError').textContent = msg;
  }

  async function signIn(pin) {
    state.pin = pin;
    const r = await api('auth');
    state.name = r.name;
    sessionPersist();
    $('gateView').hidden = true;
    $('appView').hidden = false;
    $('who').hidden = false;
    $('whoName').textContent = r.name;
    $('demoBanner').hidden = LIVE;
    await boot();
  }

  function sessionPersist() {
    try { localStorage.setItem(KEY, JSON.stringify({ pin: state.pin, name: state.name })); } catch {}
  }
  function sessionRestore() {
    try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
  }

  $('pinForm').addEventListener('submit', async e => {
    e.preventDefault();
    const pin = $('pinInput').value.trim();
    if (!/^\d{4,6}$/.test(pin)) return showGate('Enter the six digits you were given.');
    try { await signIn(pin); }
    catch (err) {
      showGate(err.message === 'unauthorised'
        ? 'That PIN was not recognised. Check with your supervisor.'
        : 'Could not reach the server. Try again in a moment.');
    }
  });

  $('signOut').addEventListener('click', () => {
    localStorage.removeItem(KEY);
    state.pin = state.name = null;
    $('pinInput').value = '';
    showGate();
  });

  /* ── steppers ──────────────────────────────────────────────────────────── */
  function stepper(value, onChange, opts) {
    const wrap = document.createElement('div');
    wrap.className = 'stepper';
    const mk = (txt, delta, big, label) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = txt;
      if (big) b.className = 'big';
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => set(read() + delta));
      return b;
    };
    const input = document.createElement('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    input.setAttribute('aria-label', opts.label);

    const read = () => {
      const v = parseFloat(input.value);
      return isNaN(v) ? 0 : v;
    };
    const set = v => {
      v = Math.max(0, Math.min(opts.max, Math.round(v / opts.step) * opts.step));
      input.value = opts.decimals ? v.toFixed(2) : String(v);
      input.classList.toggle('zero', v === 0);
      onChange(v);
    };
    input.addEventListener('change', () => set(read()));
    input.addEventListener('blur', () => set(read()));

    if (opts.bigStep) wrap.appendChild(mk('−−', -opts.bigStep, true, `Subtract ${opts.bigStep} from ${opts.label}`));
    wrap.appendChild(mk('−', -opts.step, false, `Subtract ${opts.step} from ${opts.label}`));
    wrap.appendChild(input);
    wrap.appendChild(mk('+', opts.step, false, `Add ${opts.step} to ${opts.label}`));
    if (opts.bigStep) wrap.appendChild(mk('++', opts.bigStep, true, `Add ${opts.bigStep} to ${opts.label}`));

    set(value);
    return { node: wrap, set, read };
  }

  /* ── Step 1: hours ──────────────────────────────────────────────────── */
  const hKey = (g, c) => g + SEP + c;
  const hoursControls = new Map();

  function renderHoursForm() {
    const host = $('hoursGroups');
    host.textContent = '';
    hoursControls.clear();

    state.config.hoursGroups.forEach(g => {
      const box = document.createElement('div');
      box.className = 'group';

      const head = document.createElement('div');
      head.className = 'group-head';
      const h3 = document.createElement('h3');
      h3.textContent = g.group;
      const sub = document.createElement('div');
      sub.className = 'subtotal';
      sub.innerHTML = '<span>subtotal</span>0.00';
      head.append(h3, sub);
      box.appendChild(head);

      g.categories.forEach(c => {
        const row = document.createElement('div');
        row.className = 'row';
        const lab = document.createElement('div');
        lab.className = 'label';
        lab.textContent = c;
        row.appendChild(lab);

        const key = hKey(g.group, c);
        const ctl = stepper(state.hours.get(key) || 0, v => {
          state.hours.set(key, v);
          updateHoursTotals();
        }, { step: 0.5, bigStep: 1, max: 24, decimals: 2, label: `${g.group}, ${c}, hours` });
        row.appendChild(ctl.node);
        hoursControls.set(key, ctl);
        box.appendChild(row);
      });

      box._subtotal = sub;
      box._group = g.group;
      host.appendChild(box);
    });
    updateHoursTotals();
  }

  function updateHoursTotals() {
    let day = 0;
    $('hoursGroups').querySelectorAll('.group').forEach(box => {
      let sum = 0;
      state.config.hoursGroups.find(g => g.group === box._group).categories
        .forEach(c => { sum += state.hours.get(hKey(box._group, c)) || 0; });
      box._subtotal.innerHTML = `<span>subtotal</span>${sum.toFixed(2)}`;
      day += sum;
    });
    $('dayTotal').textContent = day.toFixed(2);

    const w = $('hoursWarn');
    if (day === 0) {
      w.hidden = false;
      w.textContent = 'Nothing entered yet — the day totals zero hours.';
    } else if (day > 8) {
      w.hidden = false;
      w.textContent = `That's ${day.toFixed(2)} hours in one day. Save it if it's right — this is only a check.`;
    } else {
      w.hidden = true;
    }
  }

  function loadHoursFor(date) {
    state.hours.clear();
    let notes = '';
    state.mine.hours.filter(r => r.date === date).forEach(r => {
      state.hours.set(hKey(r.group, r.category), r.hours);
      if (r.notes) notes = r.notes;
    });
    const found = state.mine.hours.some(r => r.date === date);
    $('hoursNotes').value = notes;
    $('saveHours').textContent = found ? 'Update and continue' : 'Save and continue';
    if (found) stepsDone.add(1);
    $('hoursLoaded').textContent = found ? 'Already saved — editing will replace it.' : '';
    hoursControls.forEach((ctl, key) => ctl.set(state.hours.get(key) || 0));
    updateHoursTotals();
  }

  $('saveHours').addEventListener('click', async () => {
    const date = $('hoursDate').value || localDate();
    const entries = [];
    state.config.hoursGroups.forEach(g => g.categories.forEach(c => {
      const v = state.hours.get(hKey(g.group, c)) || 0;
      if (v > 0) entries.push({ group: g.group, category: c, hours: v });
    }));
    const st = $('hoursStatus');
    st.className = 'status'; st.textContent = 'Saving…';
    $('saveHours').disabled = true;
    try {
      await api('submitHours', { date, notes: $('hoursNotes').value.trim(), entries });
      state.mine.hours = state.mine.hours.filter(r => r.date !== date)
        .concat(entries.map(e => ({ ...e, date, notes: $('hoursNotes').value.trim() })));
      st.className = 'status ok'; st.textContent = 'Saved.';
      $('saveHours').textContent = 'Update and continue';
      $('hoursLoaded').textContent = 'Already saved — editing will replace it.';
      renderData();
      stepsDone.add(1);
      goStep(2);
    } catch (err) {
      st.className = 'status err';
      st.textContent = err.message === 'unauthorised' ? 'PIN rejected — sign in again.' : 'Could not save. Try again.';
    } finally {
      $('saveHours').disabled = false;
      setTimeout(() => { if (st.textContent === 'Saved.') st.textContent = ''; }, 2500);
    }
  });

  /* ── Step 2: appointments ───────────────────────────────────────────── */
  const aKey = (b, m) => b + SEP + m;
  const apptControls = new Map();

  function renderApptGrid() {
    const head = $('apptHead');
    head.textContent = '';
    const th0 = document.createElement('th');
    th0.scope = 'col';
    th0.textContent = 'Ticket assigned';
    head.appendChild(th0);
    state.config.modes.forEach(m => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = m;
      head.appendChild(th);
    });

    const body = $('apptBody');
    body.textContent = '';
    apptControls.clear();

    LAG_BUCKETS.forEach((bucket, i) => {
      const tr = document.createElement('tr');
      if (i === CUT_AFTER) tr.className = 'cut-below';
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = bucket;
      tr.appendChild(th);

      state.config.modes.forEach(mode => {
        const td = document.createElement('td');
        const key = aKey(bucket, mode);
        const ctl = stepper(state.appts.get(key) || 0, v => {
          state.appts.set(key, v);
          updateApptTotal();
        }, { step: 1, max: 99, decimals: 0, label: `${bucket}, ${mode}, appointments` });
        td.appendChild(ctl.node);
        apptControls.set(key, ctl);
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    updateApptTotal();
  }

  function updateApptTotal() {
    let n = 0;
    state.appts.forEach(v => { n += v; });
    $('apptTotal').textContent = String(n);
  }

  function loadApptsFor(date) {
    state.appts.clear();
    state.mine.appointments.filter(r => r.date === date)
      .forEach(r => state.appts.set(aKey(r.bucket, r.mode), r.count));
    const found = state.mine.appointments.some(r => r.date === date);
    $('saveAppts').textContent = found ? 'Update and continue' : 'Save and continue';
    if (found) stepsDone.add(2);
    $('apptLoaded').textContent = found ? 'Already saved — editing will replace it.' : '';
    apptControls.forEach((ctl, key) => ctl.set(state.appts.get(key) || 0));
    updateApptTotal();
  }

  $('saveAppts').addEventListener('click', async () => {
    const date = $('apptDate').value || localDate();
    const entries = [];
    state.appts.forEach((count, key) => {
      if (count > 0) {
        const [bucket, mode] = key.split(SEP);
        entries.push({ bucket, mode, count });
      }
    });
    const st = $('apptStatus');
    st.className = 'status'; st.textContent = 'Saving…';
    $('saveAppts').disabled = true;
    try {
      await api('submitAppointments', { date, entries });
      state.mine.appointments = state.mine.appointments.filter(r => r.date !== date)
        .concat(entries.map(e => ({ ...e, date })));
      st.className = 'status ok'; st.textContent = 'Saved.';
      $('saveAppts').textContent = 'Update and continue';
      $('apptLoaded').textContent = 'Already saved — editing will replace it.';
      renderData();
      stepsDone.add(2);
      goStep(3);
    } catch (err) {
      st.className = 'status err';
      st.textContent = err.message === 'unauthorised' ? 'PIN rejected — sign in again.' : 'Could not save. Try again.';
    } finally {
      $('saveAppts').disabled = false;
      setTimeout(() => { if (st.textContent === 'Saved.') st.textContent = ''; }, 2500);
    }
  });

  /* ── Step 3: the data ───────────────────────────────────────────────── */

  /* One roll-up serves both scopes, because both arrive as daily rows with
     identical fields — "mine" straight out of HTT_DailyHours, "team" out of the
     pre-aggregated HTT_TeamHoursDaily and HTT_TeamApptsDaily. Team rows are
     already summed across technicians, so nothing here needs to know about
     summing across people. That is the whole privacy boundary: the page is sent
     rows that are already anonymous, never the per-technician rows behind them.

     This is also why the project has exactly one Monday-of-week implementation.
     Team weeks used to be bucketed by the flow and mine by mondayOf() here; two
     implementations that disagreed by a day would have split one week across two
     columns of the same chart. Now both go through mondayOf(). */
  function rollUp(rows, appointmentRows, groups) {
    const hoursByGroup = {}, byGroupCat = {}, weeks = {}, appts = {};
    groups.forEach(g => { hoursByGroup[g] = 0; });
    rows.forEach(r => {
      hoursByGroup[r.group] = (hoursByGroup[r.group] || 0) + r.hours;
      const k = hKey(r.group, r.category);
      byGroupCat[k] = (byGroupCat[k] || 0) + r.hours;
      const wk = mondayOf(r.date);
      (weeks[wk] = weeks[wk] || {})[r.group] = (weeks[wk][r.group] || 0) + r.hours;
    });
    appointmentRows.forEach(r => {
      appts[aKey(r.bucket, r.mode)] = (appts[aKey(r.bucket, r.mode)] || 0) + r.count;
    });
    return {
      groups, hoursByGroup, weeks, appts,
      byGroupCategory: Object.entries(byGroupCat).map(([k, hours]) => {
        const [group, category] = k.split(SEP); return { group, category, hours };
      }),
    };
  }

  function viewModel() {
    const groups = state.config.hoursGroups.map(g => g.group);
    const src = state.scope === 'team' ? state.team : state.mine;
    if (!src || src.suppressed) return null;

    const from = daysAgo(state.rangeDays);
    const hours = (src.hours || []).filter(r => r.date >= from);
    const appointments = (src.appointments || []).filter(r => r.date >= from);

    /* The "totals through" watermark is read off the data rather than sent by the
       flow, so it names the last day actually present in the response. A
       watermark supplied by the writer flow could name a day whose rows hadn't
       been written yet. YYYY-MM-DD sorts lexicographically, so max is a compare. */
    const dates = hours.concat(appointments).map(r => r.date);
    return {
      ...rollUp(hours, appointments, groups),
      through: dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : null,
    };
  }

  function bucketsFor(appts, mode) {
    return LAG_BUCKETS.map(b => ({
      bucket: b,
      count: mode ? (appts[aKey(b, mode)] || 0)
                  : state.config.modes.reduce((s, m) => s + (appts[aKey(b, m)] || 0), 0),
    }));
  }
  const sumCounts = rows => rows.reduce((s, r) => s + r.count, 0);
  /* Returns the counts as well as the percentage: the hero's detail line states
     the underlying figures the same way the hours hero does. Null means no
     appointments of that mode in range, which is different from 0%. */
  function notSameDay(rows) {
    const total = sumCounts(rows);
    if (!total) return null;
    const later = rows.slice(PROMPT_COUNT).reduce((s, r) => s + r.count, 0);
    return { later, total, pct: Math.round((later / total) * 100) };
  }

  function renderData() {
    const host = $('dataBody');
    const empty = $('dataEmpty');
    host.textContent = '';

    const vm = viewModel();
    if (!vm) {
      host.hidden = true; empty.hidden = false;
      empty.textContent =
        `Team totals stay hidden until at least ${CFG.MIN_CONTRIBUTORS} technicians have entered ` +
        `data in this range. This keeps a small group from working out each other's numbers by subtraction.`;
      return;
    }
    host.hidden = false; empty.hidden = true;

    const [gOnCampus, gRemote] = vm.groups;
    const onC = vm.hoursByGroup[gOnCampus] || 0;
    const rem = vm.hoursByGroup[gRemote] || 0;
    const totalH = onC + rem;

    if (totalH === 0 && !Object.keys(vm.appts).length) {
      host.hidden = true; empty.hidden = false;
      empty.textContent = state.scope === 'mine'
        ? 'Nothing recorded in this range yet. Save some hours above and it will show up here.'
        : 'No team data in this range yet.';
      return;
    }

    /* Two buckets, one per entry step, in the same order as the wizard.
       Hours and appointments used to alternate down the page — hero, hero,
       hours, appointments, appointments, hours — which read as one stream and
       made it hard to tell which number belonged to which question. Each bucket
       now leads with its own hero and carries only its own evidence. */
    const hoursSec = bucketSection('Hours', 'from Step 1');
    const apptSec = bucketSection('Appointments', 'from Step 2');

    /* ── Hours ─────────────────────────────────────────────────────────────
       Hero — share of hours that could have been worked remotely. Skipped
       entirely with no hours in range: a 0% hero over an empty table reads as
       a broken page rather than an empty one. */
    if (totalH > 0) {
      const hero = document.createElement('div');
      hero.className = 'hero';
      const remPct = Math.round((rem / totalH) * 100);
      hero.innerHTML =
        `<div class="figure" style="${heroTint(remPct)}">${remPct}%</div>` +
        `<div class="caption">of working hours could have been done remotely</div>` +
        `<div class="detail">${rem.toFixed(1)} of ${totalH.toFixed(1)} hours</div>`;
      hoursSec.appendChild(hero);

      /* Hours over time. */
      const weekKeys = Object.keys(vm.weeks).sort();
      if (weekKeys.length) {
        hoursSec.appendChild(title('Hours per week'));
        /* Crimson goes to the remote segment, not the on-campus one: it is both
           the larger share and the finding the hero figure states, so the two
           have to agree in colour. */
        hoursSec.appendChild(legend([
          [gOnCampus, 'var(--series-2)'],
          [gRemote, 'var(--series-1)'],
        ]));
        const c = document.createElement('div');
        c.className = 'chart';
        hoursSec.appendChild(c);
        Charts.stackedWeeks(c,
          weekKeys.map(k => ({ label: shortLabel(k), values: vm.weeks[k] })),
          [gOnCampus, gRemote],
          ['--series-2', '--series-1']);
      }

      /* Breakdown table — the detail behind the hero, so it stays in this bucket. */
      hoursSec.appendChild(title('Hours by category'));
      hoursSec.appendChild(breakdownTable(vm));
    }

    if (hoursSec.children.length > 1) host.appendChild(hoursSec);

    /* ── Appointments ──────────────────────────────────────────────────────
       Headline lag finding, in-person first. Same hero treatment as the hours
       bucket — big figure, caption, mono detail — so the two sections read as
       one system. Which buckets fall on the "did not require" side is now shown
       only by the dashed cut in the lag panels below. */
    const inPersonMode = state.config.modes[0];
    const remoteMode = state.config.modes[1];
    const ipRows = bucketsFor(vm.appts, inPersonMode);
    const rmRows = bucketsFor(vm.appts, remoteMode);
    const ip = notSameDay(ipRows);
    const rm = notSameDay(rmRows);

    if (ip || rm) {
      /* Adjectival form: "In person" is right as a column label, but reads as
         "in-person appointments" inside a sentence. */
      const adj = s => s.toLowerCase().replace(/\s+/g, '-');
      const plural = n => (n === 1 ? 'appointment' : 'appointments');
      const h = document.createElement('div');
      h.className = 'hero';
      h.innerHTML =
        (ip
          ? `<div class="figure" style="${heroTint(ip.pct)}">${ip.pct}%</div>` +
            `<div class="caption">of ${adj(inPersonMode)} appointments did not require ` +
            `same-day assistance</div>` +
            `<div class="detail">${ip.later} of ${ip.total} ${plural(ip.total)}</div>`
          : `<div class="caption">No ${adj(inPersonMode)} appointments recorded in this range.</div>`) +
        /* Omitted entirely with no remote appointments — an empty note would
           still take its top margin. */
        (rm
          ? `<div class="note">${rm.pct}% of ${adj(remoteMode)} appointments did not ` +
            `require same-day assistance (${rm.later} of ${rm.total}).</div>`
          : '');
      apptSec.appendChild(h);
    }

    /* Lag distribution, two panels, in person on the left. */
    if (sumCounts(ipRows) + sumCounts(rmRows) > 0) {
      apptSec.appendChild(title('How long the ticket had been assigned'));
      const panels = document.createElement('div');
      panels.className = 'panels';
      /* Each panel takes its mode's hue — teal in person, crimson remote — so a
         reader never has to check the heading to know which panel they are in. */
      [[inPersonMode, ipRows, '--lagteal'], [remoteMode, rmRows, '--lag']]
        .forEach(([mode, rows, ramp]) => {
        const p = document.createElement('div');
        p.className = 'panel';
        const h = document.createElement('h4');
        h.textContent = mode;
        const n = document.createElement('p');
        n.className = 'n';
        n.textContent = `${sumCounts(rows)} appointment${sumCounts(rows) === 1 ? '' : 's'}`;
        const c = document.createElement('div');
        c.className = 'chart';
        p.append(h, n, c);
        panels.appendChild(p);
        Charts.lagPanel(c, rows, CUT_AFTER, ramp);
      });
      apptSec.appendChild(panels);

      /* Mode split. */
      apptSec.appendChild(title('How appointments were conducted'));
      const mc = document.createElement('div');
      mc.className = 'chart';
      apptSec.appendChild(mc);
      Charts.proportionBar(mc, [
        /* Same pairing as the hours chart above — remote crimson, on campus
           teal — so one colour means one thing across the whole tab. */
        { label: inPersonMode, value: sumCounts(ipRows), cssVar: '--series-2' },
        { label: remoteMode, value: sumCounts(rmRows), cssVar: '--series-1' },
      ]);
    }

    /* Child 0 is the label, so anything above 1 means there is real content.
       An empty labelled section reads as missing data rather than none entered. */
    if (apptSec.children.length > 1) host.appendChild(apptSec);

    /* Team totals are computed overnight, not on this request, so the note has to
       say how current they are. It states no technician count: the figure
       available without an extra query is the most who logged on any one day,
       which understates a team that rotates, and a wrong number is worse than
       none.

       The contributor floor was scrapped 12 Aug 2026 — the union needs the
       complete data set — so the old "these figures will not match a row-by-row
       count" disclosure came out with it. Team totals now do reconcile against
       HTT_DailyHours. If a floor is ever reinstated, that sentence has to come
       back with it. */
    if (state.scope === 'team') {
      const note = document.createElement('p');
      note.className = 'status';
      note.style.marginTop = '1rem';
      note.textContent =
        (vm.through ? `Team totals through ${proseDate(vm.through)}, including` : 'Team totals include') +
        ` your own entries. Individual figures for other technicians are never sent to this page.`;
      host.appendChild(note);
    }
  }

  function title(text) {
    const h = document.createElement('div');
    h.className = 'chart-title';
    h.textContent = text;
    return h;
  }

  /* Diverging tint for a hero figure: the number's own value places it on a
     teal → white → crimson scale, so a glance at the colour says which way the
     finding leans before the caption is read. The outline runs teal → black →
     crimson on the same axis, which is what keeps the midpoint legible — a
     white fill alone would vanish into the surface at 50%.

     Both ends stay as var(--series-N) rather than resolved hex, so the figure
     re-tints itself on a light/dark switch with no re-render, the same contract
     the SVG charts hold. The plain `color` ahead of each color-mix() is the
     fallback for browsers without it: an invalid declaration is dropped and the
     earlier one stands, so the figure lands on its nearer end instead of
     inheriting nothing. */
  function heroTint(value) {
    const t = Math.max(0, Math.min(100, value)) / 100;
    const near = t <= 0.5 ? 'var(--series-2)' : 'var(--series-1)';
    let fill, line;
    if (t <= 0.5) {
      const m = (t / 0.5) * 100;   // 0 = teal, 100 = white / black
      fill = `color-mix(in srgb, #fff ${m}%, var(--series-2))`;
      line = `color-mix(in srgb, #000 ${m}%, var(--series-2))`;
    } else {
      const m = ((t - 0.5) / 0.5) * 100;   // 0 = white / black, 100 = crimson
      fill = `color-mix(in srgb, var(--series-1) ${m}%, #fff)`;
      line = `color-mix(in srgb, var(--series-1) ${m}%, #000)`;
    }
    return `color:${near};color:${fill};` +
      `-webkit-text-stroke:1px ${near};-webkit-text-stroke:1px ${line}`;
  }
  /* h3 sits between the section's h2 ("The Data") and the panel h4s, so the
     heading order stays walkable. Labels match the step nav wording exactly. */
  function bucketSection(label, from) {
    const s = document.createElement('section');
    s.className = 'bucket';
    const h = document.createElement('h3');
    h.className = 'bucket-label';
    const l = document.createElement('span');
    l.textContent = label;
    h.appendChild(l);
    if (from) {
      const f = document.createElement('span');
      f.className = 'from';
      f.textContent = from;
      /* Whitespace-only text nodes between flex items aren't rendered, so this
         costs nothing visually but keeps the heading from being announced as
         "Hoursfrom Step 1". */
      h.append(document.createTextNode(' '), f);
    }
    s.appendChild(h);
    return s;
  }
  function legend(items) {
    const l = document.createElement('div');
    l.className = 'legend';
    items.forEach(([label, color]) => {
      const s = document.createElement('span');
      const i = document.createElement('i');
      i.style.background = color;
      s.append(i, document.createTextNode(label));
      l.appendChild(s);
    });
    return l;
  }
  function breakdownTable(vm) {
    const t = document.createElement('table');
    t.className = 'data';
    t.innerHTML = '<thead><tr><th>Group</th><th>Category</th><th style="text-align:right">Hours</th>' +
      '<th style="text-align:right">Share</th></tr></thead>';
    const tb = document.createElement('tbody');
    const total = vm.byGroupCategory.reduce((s, r) => s + r.hours, 0);
    vm.byGroupCategory.slice().sort((a, b) =>
      a.group.localeCompare(b.group) || b.hours - a.hours
    ).forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(r.group)}</td><td>${esc(r.category)}</td>` +
        `<td class="num">${r.hours.toFixed(1)}</td>` +
        `<td class="num">${total ? Math.round((r.hours / total) * 100) : 0}%</td>`;
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    return t;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ── CSV ───────────────────────────────────────────────────────────────── */
  $('downloadCsv').addEventListener('click', () => {
    const rows = [['scope', 'date', 'kind', 'group_or_bucket', 'category_or_mode', 'value']];
    const from = daysAgo(state.rangeDays);
    state.mine.hours.filter(r => r.date >= from).forEach(r =>
      rows.push(['mine', r.date, 'hours', r.group, r.category, r.hours]));
    state.mine.appointments.filter(r => r.date >= from).forEach(r =>
      rows.push(['mine', r.date, 'appointments', r.bucket, r.mode, r.count]));
    /* Team rows now carry a date, where they used to export with the column
       blank. They are the same pre-aggregated rows the charts draw — already
       summed across technicians and already filtered to days that cleared the
       contributor floor — so exporting them discloses nothing the page did not
       already receive. */
    if (state.team && !state.team.suppressed) {
      (state.team.hours || []).filter(r => r.date >= from).forEach(r =>
        rows.push(['team_total', r.date, 'hours', r.group, r.category, r.hours]));
      (state.team.appointments || []).filter(r => r.date >= from).forEach(r =>
        rows.push(['team_total', r.date, 'appointments', r.bucket, r.mode, r.count]));
    }
    const csv = rows.map(r => r.map(v => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tss-time-tracking-${localDate()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  /* ── toolbar ───────────────────────────────────────────────────────────── */
  $('scopeMine').addEventListener('click', () => setScope('mine'));
  $('scopeTeam').addEventListener('click', () => setScope('team'));
  function setScope(s) {
    state.scope = s;
    $('scopeMine').setAttribute('aria-pressed', String(s === 'mine'));
    $('scopeTeam').setAttribute('aria-pressed', String(s === 'team'));
    renderData();
  }
  document.querySelectorAll('.range').forEach(b =>
    b.addEventListener('click', async () => {
      document.querySelectorAll('.range').forEach(o =>
        o.setAttribute('aria-pressed', String(o === b)));
      state.rangeDays = Number(b.dataset.days);
      await refreshData();
    }));

  $('themeToggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : cur === 'light' ? 'dark'
      : (matchMedia('(prefers-color-scheme: dark)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', next);
  });

  $('hoursDate').addEventListener('change', () => loadHoursFor($('hoursDate').value));
  $('apptDate').addEventListener('change', () => loadApptsFor($('apptDate').value));

  /* ── steps ─────────────────────────────────────────────────────────────── */
  /* One section on screen at a time. Saving moves you forward; the nav and the
     Back buttons let you move freely, so a correction never means starting over. */
  const STEP_IDS = { 1: 'sec1', 2: 'sec2', 3: 'sec3' };
  const stepsDone = new Set();

  function goStep(n) {
    Object.entries(STEP_IDS).forEach(([k, id]) => { $(id).hidden = Number(k) !== n; });
    document.querySelectorAll('#steps button').forEach(b => {
      const s = Number(b.dataset.step);
      if (s === n) b.setAttribute('aria-current', 'step');
      else b.removeAttribute('aria-current');
      b.classList.toggle('done', stepsDone.has(s) && s !== n);
    });
    window.scrollTo(0, 0);
  }

  document.querySelectorAll('#steps button').forEach(b =>
    b.addEventListener('click', () => goStep(Number(b.dataset.step))));
  document.querySelectorAll('[data-goto]').forEach(b =>
    b.addEventListener('click', () => goStep(Number(b.dataset.goto))));

  /* ── boot ──────────────────────────────────────────────────────────────── */
  async function refreshData() {
    try {
      const d = await api('getData', { days: state.rangeDays });
      state.mine = d.mine || { hours: [], appointments: [] };
      state.team = d.team || null;
      renderData();
    } catch (err) {
      $('dataBody').hidden = true;
      $('dataEmpty').hidden = false;
      $('dataEmpty').textContent = 'Could not load the data. Try reloading the page.';
    }
  }

  async function boot() {
    state.config = normalizeConfig(await api('getConfig'));
    const today = localDate();
    $('hoursDate').value = today;
    $('apptDate').value = today;
    $('hoursDate').max = today;
    $('apptDate').max = today;

    renderHoursForm();
    renderApptGrid();
    await refreshData();
    loadHoursFor(today);
    loadApptsFor(today);
    goStep(1);
  }

  /* Read-only handle on the pure functions, so the calculation logic can be
     asserted against known-good numbers from a browser console. Everything in
     this file is inside an IIFE and there is no build step or Node runtime in
     the project, so without this hook the only way to test a roll-up is to read
     figures off the rendered page. Exposes no state and no setters; deleting it
     changes nothing about how the page runs. */
  window.__HTT_TEST__ = { rollUp, mondayOf, localDate, daysAgo, proseDate, normalizeConfig, demoTeam, hKey, aKey, SEP };

  (async function start() {
    const s = sessionRestore();
    if (s && s.pin) {
      try { await signIn(s.pin); return; }
      catch { localStorage.removeItem(KEY); }
    }
    showGate();
  })();
})();
