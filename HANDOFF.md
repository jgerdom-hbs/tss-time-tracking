# Handoff — TSS Time Tracking

*Last updated 18 Aug 2026. Give this file to a new Claude session to pick up where we left off.*

**v1 is in production and the lists hold real technician entries.** Both flows are on, the site is
live at <https://jgerdom-hbs.github.io/tss-time-tracking/>, every test that can run before collection
has passed, the test data was deleted the evening of 13 Aug 2026, and real collection has since
begun.

⚠ **Treat all four data lists as live production data from here on.** The seeded-then-cleared phase
is over: `HTT_DailyHours` and `HTT_AppointmentLag` hold entries real technicians typed, and the two
`HTT_Team…Daily` lists are derived from them. **Nothing may be bulk-deleted to set up a test**, the
way test rows were on 13 Aug. `RecalcDays` = `400` remains safe — the writer clears and rewrites only
its own derived rows and never touches the source lists — but a manual delete against a source list
now destroys somebody's day and cannot be recovered from the flow.

**The remaining work is mostly not technical** — distribute the PINs and brief the technicians on the
two definitions. **Two verifications stay open because only real data can close them:** the writer
flow's 1 a.m. Recurrence trigger has never fired against real entries (every real run so far was
started by hand), and the truncation check waits on a list passing 100 rows. Two mobile issues were
seen and deliberately deferred. See *⏸ Resume here*.

**One decision reversed on 12 Aug that changes how you should read the older parts of this file: the
three-contributor floor is gone.** Team totals now include every row regardless of how many people
are inside it, and they reconcile against `HTT_DailyHours`. Anything below that still describes a
floor is history, not current design.

**How Jason wants flow-building sessions run** — this worked well across 39 steps on 8 Aug and is
worth keeping:

- **One step at a time.** Give a single step, then wait. Don't queue several.
- **Say explicitly when Power Automate work starts**, and make the first step the flow's name.
- **Label each step `ACTION` or `TRIGGER`**, say *where* it goes (which case, inside or outside
  which box), and give the literal name to type.
- **Name every action on creation, no spaces.** Later expressions refer to them by name.
- **Explain the why and the traps**, briefly, alongside the mechanics.
- He replies "Ready" / "Done" between steps and sends screenshots when something looks wrong.

---

## What this is

A single-page site TSS technicians open once a day. It records how their day split between work
that required being on campus and work that didn't, plus how long users waited between a ticket
being assigned and the resulting appointment. The point is to establish how much of a 40-hour
on-campus week could be worked remotely.

Front end on GitHub Pages → one Power Automate flow → SharePoint lists. The page never touches
SharePoint directly; the flow decides what data comes back, which is what enforces privacy.

Full plan: `~/.claude/plans/refactored-painting-widget.md`. Build guide: `SETUP.md`.
Operating manual: `README.md`.

---

## State

**Done and verified in a browser:**
- The whole front end — PIN gate, three-step wizard, all charts, light/dark, mobile at 375px
- Chart palette validated with the data-viz validator (evidence in `_palette/PALETTE.md`)
- **Data tab recoloured 18 Aug 2026 — code done, ⚠ NOT YET UPLOADED.** Four changes, all
  in `app.js` / `charts.js` / `styles.css`; see *Decisions* for the reasoning on each.
  Crimson and teal swapped roles in the hours chart and the mode split; the lag ramp
  reversed so the shortest wait is the heaviest step; the In person lag panel got its own
  teal ramp; and both hero figures are now tinted by their own value. The teal ramp was
  generated and re-validated — a hand-picked first attempt failed two checks and was
  thrown away, which is recorded in `PALETTE.md` so nobody re-picks those hexes.
  **The live site still shows the old colours until the three files go up.**
- **First-ever version snapshot taken 18 Aug 2026 as `-v10`** — `index-v10.html`,
  `app-v10.js`, `charts-v10.js`, `styles-v10.css`, `config-v10.js`. Numbered v10 by
  Jason's choice even though it is the first, because roughly nine rounds of work
  preceded it unsnapshotted. All five files were taken, not just the three that changed,
  so the set restores on its own; they are archive copies and `index-v10.html` still
  points at `app.js`, so the snapshot does not run as a standalone page. Never edit a
  suffixed file.
- `smoke-test.html` — the step-0 page that proves the flow connection works
- `SETUP.md`, `README.md`
- Step 3 layout revised 3 Aug 2026 — the Data tab is now two labelled buckets instead of six
  alternating blocks. See *Decisions* below. Re-checked at 1280px and 375px, light and dark, and
  across every combination of hours/appointments present or absent.
- **Step 0 smoke test passed 6 Aug 2026**, both checks. The TSS automation service account's
  licence covers the premium HTTP trigger, and the browser is allowed to talk to the flow
  endpoint (496 ms round trip). It failed on the first attempt for a trigger-setting reason that
  will recur on the real flow — see *Gotchas*.
- **`normalizeConfig()` added to `app.js` 7 Aug 2026** so `getConfig` can return a flat
  `hoursCategories` array instead of the nested `hoursGroups` shape. 13 assertions pass
  (group order, dedupe, degenerate input, pass-through of an already-grouped response), and
  `DEMO_CONFIG` was switched to the flat shape so demo mode exercises the same path the live
  flow will. Re-verified in the browser: two group headings, three categories each, `In person`
  first on Step 2, no console errors.
- **The four SharePoint lists exist as of 6 Aug 2026**, named `HTT_Technicians`,
  `HTT_Categories`, `HTT_DailyHours`, `HTT_AppointmentLag`. The `HTT_` prefix keeps them grouped
  in the site's page list and is otherwise cosmetic. In `HTT_Categories` the column specified as
  `Type` is called **`HoursMode`** — SharePoint reserves `Type` and rejects it. Both facts are
  flow-internal; `app.js` refers to no list or column name anywhere.
- **✅ MILESTONE 1 PASSED — 8 Aug 2026.** Signed in against the live flow with a real PIN: own
  name in the header, six real categories under two headings, correct group order, `In person`
  first on Step 2. That single request proved the body parse, the PIN lookup, both Switch cases,
  and CORS on a hand-built Response. **The ⚠ body-parsing expression is settled** —
  `json(triggerBody())` works on this tenant; the base64 fallback was not needed.
- **`auth` and `getConfig` are built and verified running.** `FLOW_URL` is populated in
  `config.js`, so the page is live, not demo.
- **✅ `submitHours` built and verified 8 Aug 2026.** Writes to `HTT_DailyHours` correctly, and
  **checklist test 4 passes** — re-saving a day with different categories replaces the day
  cleanly rather than duplicating it, with zeroed-out categories removed. Took one fix along the
  way; see the Date-only column gotcha below.
- **✅ `submitAppointments` built and verified 8 Aug 2026**, both the first save and the replace
  test. Built with the corrected date-range filter from the start.
- **✅ Team totals redesigned to precompute — 9 Aug 2026, page side done and verified.** Jason's
  idea, taken further than proposed. The team aggregation moves out of `getData` into a nightly
  writer flow that stores **daily** team rows; the page rolls them up. See *Decisions* for the full
  reasoning. Page-side work is complete:
  - `viewModel()` collapsed from two code paths to one. Team rows now arrive in the same shape as
    `mine` rows, so a single `rollUp()` serves both scopes.
  - **The ⚠ Monday-of-week expression is gone from the project** — not verified, *deleted*. The flow
    no longer computes weeks, so `mondayOf()` in `app.js` is the only week-bucketing implementation
    and there is nothing left to drift against.
  - `demoTeam()` emits daily rows, so demo mode exercises the same roll-up the live flow will.
  - New `proseDate()` for the "Totals through Aug. 7" note (AP style: `Aug. 7`, `Sept. 1`,
    `June 30`, no abbreviation March–July).
  - CSV export updated — team rows now carry a date where the column used to be blank.
  - **29 assertions pass** against the real functions in a browser: `mondayOf` week boundaries
    including a year crossing, `rollUp` sums / week bucketing / zero-seeding, composite keys,
    `proseDate` for all six AP forms, and `demoTeam`'s shape and one-row-per-day-group-category
    property. Verified in the browser end to end afterwards: Team view renders both heroes and every
    chart, both heroes match an independently computed sum exactly (62%, 477.5 of 768.5 hours;
    81%, 130 of 161 appointments), Mine still matches its seed exactly (60%, 42.0 of 70.0), all
    three ranges scale correctly, `?contributors=2` still suppresses, and dark mode at 375px wraps
    the longer note cleanly with no horizontal overflow. *(The `?contributors=2` check is historical —
    `MIN_CONTRIBUTORS` is `0` as of 12 Aug 2026, so that hook no longer triggers anything.)*
  - **`window.__HTT_TEST__` added at the end of `app.js`** — a read-only handle on the pure
    functions. There is no Node runtime available in the sandbox and no build step, so without it
    the only way to check a roll-up is to read figures off the rendered page. It exposes no state
    and no setters.
- **✅ `charts.js` SVG console errors fixed — 9 Aug 2026**, in a parallel session. `height: 'auto'`
  was being set as an SVG *presentation attribute*, which only accepts a length, so every chart
  logged `Expected length, "auto"` — 40+ errors on one page view. It now sets `style.height` in CSS,
  where `auto` is valid. **Verified 10 Aug 2026 in a fresh tab:** no console errors, no `height`
  attribute on any SVG, all four charts at correct sizes with aspect ratios preserved (998×333 for a
  720×240 viewBox), no horizontal overflow. *Check console errors in a **fresh tab** — the message
  buffer survives navigation, so reloading the fixed code in a tab that previously ran the old code
  still shows the old errors and looks like the fix failed.*
- **✅ "Week of" caption added under the weekly chart's x axis — 14 Aug 2026.** The tick labels are
  week-start Mondays, so a bare `Aug 3` reads as a date somebody logged hours on. It isn't: in the
  first real data, entries fell on Aug 4 and Aug 14 and *no* entry fell on either Monday shown. Jason
  read his own chart as business dates and opened it as a data bug, which is the clearest possible
  evidence the label needed saying. **One caption centred under the plot, not a prefix on every
  tick** — repeating "Week of Aug 3 / Week of Aug 10" costs axis width and says it twice. Same
  `font-size:10px; fill:var(--ink-muted)` as the tick labels it sits under. `stackedWeeks` is now a
  **720×254 viewBox** (was 720×240, the figure quoted in the bullet above): `padB` grew by the same
  14px as `H`, so `plotH` is unchanged at 190 and every bar, gridline and axis line is where it was.
  Verified by rendering `charts.js` in headless Chrome against the two weeks from the live screenshot,
  then **pushed and confirmed working on the live Pages URL by Jason, 14 Aug 2026** — so the repo copy
  of `charts.js` and this folder's copy match as of that date.
- **✅ All SharePoint work complete — 10 Aug 2026** (reported done by Jason; not independently
  verifiable from a Claude session):
  - `EntryDate` indexed on `HTT_DailyHours` and on `HTT_AppointmentLag`.
  - `HTT_TeamHoursDaily` and `HTT_TeamApptsDaily` created with the columns in `SETUP.md` Part 1,
    lists 5 and 6, and `TeamDate` indexed on both.
  - **The indexing deadline is therefore closed** — it was the one item in this project with a real
    expiry date on it (mid-October 2026).
  - **The column names have not been exercised yet.** The first `Create item` in the writer flow is
    what actually proves them. If it fails on a missing field, suspect a typo or a stray space in a
    column name before suspecting the expression — SharePoint turns a space into `_x0020_` in the
    internal name.

- **✅ `HTT_TeamTotals Writer` built 12 Aug and VERIFIED 13 Aug 2026 — 32 actions.** Recurrence
  trigger, Eastern Time, 1 a.m. Four loops, no stray `For each`.
  - **Verified against seeded multi-technician data**, which is the only way this flow can be
    verified: sums (**9.00** from 2 + 3 + 4, not 2 and not 3), per-key `Contributors`, both
    `Create item` column mappings, the Choice reads, midday-UTC `TeamDate`, and the delete loops
    (run twice, row counts held at 6 and 6 rather than doubling).
  - **Top Count 5000 + Pagination confirmed by eye** on all four `Get items`.
  - Two spec changes during the build: **appointment `Contributors` counts from the appointments
    list only** (12 Aug), and **`Contributors` counts per key rather than per date** (13 Aug) —
    `NamesForDate` and `ApptNamesForDate` deleted, the two `…NamesOnly` Selects repointed at
    `RowsForKey` / `ApptRowsForKey`. That second one was a live bug: a one-person row was reporting
    `Contributors: 4`.
  - Action names as built: `RecalcDays`, `WindowStart`, `GetWindowHours`, `GetWindowAppts`,
    `GetOldTeamHours` → `DeleteOldTeamHours` [ `DeleteTeamHoursRow` ], `GetOldTeamAppts` →
    `DeleteOldTeamAppts` [ `DeleteTeamApptsRow` ], `SelectHourKeys`, `DistinctHourKeys`,
    `ForEachHourKey` [ `HourKeyParts`, `RowsForKey`, `HourValues`, `HourSum`, `HoursNamesOnly`,
    `DayContributors`, `CreateTeamHoursRow` ], `SelectApptKeys`, `DistinctApptKeys`,
    `ForEachApptKey` [ `ApptKeyParts`, `ApptRowsForKey`, `ApptValues`, `ApptSum`, `ApptNamesOnly`,
    `ApptDayContributors`, `CreateTeamApptsRow` ].

- **✅ `getData` built and verified 13 Aug 2026 — 10 actions.** `FromDate`, `GetMyHours` →
  `SelectMyHours`, `GetMyAppts` → `SelectMyAppts`, `GetTeamHours` → `SelectTeamHours`,
  `GetTeamAppts` → `SelectTeamAppts`, `RespondData`. No loops, no Condition, one Response.
  Verified end to end in a browser: Mine **33% / 67%**, Team **39% / 88%**, and the team figures
  hand-counted against `HTT_TeamHoursDaily`.

- **✅ `RespondBadAction` added to the Switch's `Default` case 13 Aug 2026** — 400, CORS header,
  `{ "error": "Unknown action" }`. Every path through the flow now answers exactly once.

- **✅ Published 13 Aug 2026** to <https://jgerdom-hbs.github.io/tss-time-tracking/> from a repo on
  the work github.com account. Verified on the live URL: all five files served over HTTPS, no console
  errors, `config.js` carrying the flow URL and `MIN_CONTRIBUTORS: 0`, demo banner off, and 14
  assertions passing against the **deployed** `app.js` — `mondayOf` including a 2026→2027 crossing,
  `proseDate` across the AP forms, and `rollUp` reproducing the 39% hero from the raw team rows.

- **✅ MILESTONE 2 — the checklist closed out, evening of 13 Aug 2026.** Everything that can be
  tested before real collection now has been.
  - **Step 15 — signed in on the live GitHub Pages URL** and got the same four figures seen on
    localhost: **Mine 33% / 67%, Team 39% / 88%**. Different origin, so the browser's permission
    check was a genuinely separate test from every earlier one.
  - **✅ Checklist 3 — the after-8-p.m. date trap, PASSED at last.** Hours saved at about 10 p.m.
    Eastern landed on `8/13/2026` in `HTT_DailyHours`, not 8/14. Outstanding since 8 Aug purely
    because every previous attempt happened at the wrong hour. `HTT_DailyHours` reconciled exactly
    at 12 rows — 4 from 8 Aug, 4 from 11 Aug, 4 from that evening.
  - **✅ Checklist 11 — CSV.** Opened in Excel: dates parsed as real dates, `1.5` and `0.5` survived
    as decimals, and **team rows carry a date** — the thing the 9 Aug redesign changed and this was
    the first export to prove. Note the export **ignores the Mine/Team toggle** and always writes
    both scopes with a `scope` column; the two downloads are byte-identical. That's the design, not
    a bug.
  - **✅ Checklist 12 — phone.** Walked all three steps in Edge on current iOS. Data entry, saving
    and the Data tab all work. Two cosmetic problems found and **deliberately deferred** — see
    *Open / deferred*.
  - **✅ Checklist 2 — add and retire a category.** Added `Travel between buildings` under
    `Required on Campus` with `SortOrder` 7; it appeared last in the right group with the other six
    unchanged. Set `Active` to No; it vanished from the form and existing entries survived.
  - **✅ Test-data cleanup done.** All rows deleted from `HTT_DailyHours` and `HTT_AppointmentLag`
    (1, 8, 11 and 13 Aug, including the phone entries), then `HTT_TeamTotals Writer` run once with
    `RecalcDays` at `30` — the delete loops cleared the old team rows and both `ForEach` loops
    iterated zero times, leaving `HTT_TeamHoursDaily` and `HTT_TeamApptsDaily` at 0 items.
    `RecalcDays` put back to `3`. Both flows confirmed **On**, and the live site confirmed empty.

**Not done:**
- **Checklist 8 — truncation.** Needs the lists to pass 100 rows, so roughly one working day of real
  collection. Top Count is confirmed set on all eight reads, but confirmed-set and confirmed-working
  aren't the same thing. **This is the only test left, and it cannot run until collection starts.**
- **PIN distribution and the technician briefing** — see *⏸ Resume here*. Not technical, and the
  only things standing between the current state and real data.
- **Two mobile issues, seen and deferred by decision** — see *Open / deferred*.

**Live at <https://jgerdom-hbs.github.io/tss-time-tracking/> as of 13 Aug 2026**, and running against
the real flow since 8 Aug. `FLOW_URL` in `config.js` points at it. Editing locally still means
serving the folder yourself; the GitHub copy only updates when you upload the changed files. To get
demo mode back, blank that string out — the page uses invented data and saves to the browser only, and
any six digits sign you in. Serve it with:

```bash
python3 -m http.server 8799
```

Note: the sandboxed preview server can't read the OneDrive path — copy files to a temp dir to
preview, or use a normal terminal, where it works fine.

If that command fails with `OSError: [Errno 48] Address already in use`, **a server is already
running on 8799** — very likely one left over from an earlier session. Usually it's serving the
live project folder and you can just open <http://localhost:8799/>.

**But if every URL 404s — including the root — that leftover server is dead weight and must be
killed.** A long-running `http.server` holds the directory it started in by inode, and OneDrive
replaces the directory underneath it on sync. The process then serves a folder that no longer
exists. The trap: `lsof` still reports the *old path name*, so the server looks like it's
serving exactly the right folder while 404ing on files you can see on disk. Happened 8 Aug 2026;
diagnosed only by `curl`ing the root and getting 404 rather than a listing.

Diagnose and fix:

```bash
lsof -ti tcp:8799 | while read p; do ps -o command= -p "$p"; lsof -a -p "$p" -d cwd | tail -1; done
```

```bash
kill $(lsof -ti tcp:8799)
```

Then start a fresh server from the project folder. **`lsof` agreeing with you is not proof the
server works — `curl -s -o /dev/null -w "%{http_code}" http://localhost:8799/` is.**

*This recurred on 13 Aug 2026 — the same process, started 8 Aug at 01:13 and still listening five days
later, `lsof` still reporting the correct path, every URL 404ing. Diagnosed in one command and killed.
Expect it again after any gap of a few days.*

Demo mode invents **team** data only; **Mine** starts empty, so a fresh sign-in shows "Nothing
recorded in this range yet" on Step 3 until you save something. To exercise the Step 3 layout
without typing, switch the toggle to *Team*, or seed `localStorage` key `huctw.demo` with
`{"hours":[…],"appointments":[…]}` — rows shaped as `{date,group,category,hours}` and
`{date,bucket,mode,count}` — then reload.

---

## Decisions already made — don't re-litigate these

Each of these took discussion. They're settled.

| Decision | Why |
|---|---|
| SharePoint + Power Automate, **not** Dataverse | Privacy is enforced at the flow, not the datastore, so a different store changes cost without changing security |
| Hours stored **one row per category**, not one column each | Adding a category becomes a SharePoint row instead of a schema change plus a flow edit |
| Six hours categories in two groups | `Required on campus` / `Remote or could have been remote` × Appointments / Meetings / Other. Mutually exclusive, sum to the working day |
| Lag as **buckets**, not numbers | It's an eyeball estimate; false precision would slow entry and hurt compliance |
| Six buckets: Immediately, Same day, Next day, Two days, Three to four days, Five or more days | Jason's wording |
| Appointment counts, **no ticket identifiers** | Only a count and a lag are needed |
| Modes are **In person** / **Remote**, In person first | In person is the column the headline finding is about |
| PIN is the **identity key** — page never sends a name | Stops someone submitting hours as a colleague. Means PINs must be unique |
| Technicians see own data + **team aggregates only** | Filtering in the page would be no protection — devtools shows everything sent |
| ~~Team totals hidden below **3 contributors**~~ — **REVERSED 12 Aug 2026** | See the row at the bottom of this table. The floor is gone |
| Headline metric: **in-person appointments in Next day or later** | Counting Same day as prompt is conservative on purpose — removes the obvious counter-argument |
| Step 3 in **two buckets** — Hours, then Appointments — each led by its own hero | The two used to alternate down the page (hero, hero, hours, appts, appts, hours). It read as one stream and you couldn't tell which number answered which question |
| Bucket labels match the **step nav wording exactly**, with a `from Step 1` / `from Step 2` tag | The tag is what connects a figure back to the screen the technician typed it into |
| Both heroes use the **same `.hero` block** | The appointments headline was a bordered left-aligned sentence; two different treatments made one page look like two. Restyled 3 Aug 2026 |
| `getConfig` returns categories **flat**; the page groups them | Grouping is the fiddliest thing Power Automate does and the hardest to test. `normalizeConfig()` in `app.js` does it instead, unit-tested, and still accepts a pre-grouped `hoursGroups` if the flow ever sends one. Decided 7 Aug 2026 |
| Team totals are **precomputed nightly** into their own lists, not aggregated per request | Team figures are identical for everybody, so per-request aggregation charged every technician for the same 35 actions. Jason's idea, 9 Aug 2026 |
| Precomputed at **daily** grain, and the page rolls them up | Daily is the only grain that supports the existing 7/30/90 toggle exactly — range totals would need three payloads and three copies of the aggregation; weekly doesn't divide into 7 or 30. It also makes team rows the *same shape* as mine rows, so one `rollUp()` serves both scopes, and it retires the ⚠ Monday-of-week expression by leaving `app.js` as the only place weeks are computed |
| ~~**`Contributors ge 3` per day**~~ — **REVERSED 12 Aug 2026** | Superseded; see the bottom row |
| ~~Team totals **don't reconcile** against a raw row count~~ — **NO LONGER TRUE** | With no floor, they do reconcile, and that hand-check is now the recommended way to verify a figure |
| The team note **states no technician count** | The count available without a second pass over the raw rows is the most who logged on any one day, which understates a team that rotates. A wrong number is worse than none, and the exact figure isn't worth another query. Cheap version chosen by Jason 9 Aug 2026 |
| Appointment `Contributors` counts names from the **appointments list only**, not unioned across both source lists | `Contributors` answers *how many people are inside this sum*. A technician who logged only hours is not inside an appointments sum, so counting them inflates it. Simpler and two actions shorter. Decided 12 Aug 2026, while the floor still existed and the count was load-bearing; it survives the floor's removal because the column should still mean what it says |
| The writer is a **separate flow**, and that's not a violation of the one-flow rule | The one-flow rule is about the page-facing API — one `FLOW_URL`, one Switch. The writer has no page-facing URL, the page never calls it, and it needs its own Recurrence trigger. A flow can only have one trigger |
| Team stays a **toggle** on the Data tab, not its own tab | Jason approved a separate tab; it isn't needed. The toggle is what makes both scopes share one render path, and this change strengthens that rather than straining it. A tab would mean duplicating all of Step 3 |
| Freshness is a **Recurrence interval**, not a call from the page | The proposed v2 was the page calling a recalculate flow after each save. Because the writer recomputes a rolling window rather than a named day, running it every 30 minutes instead is a one-dropdown change with no new actions, no shared secret in the browser and no edit to the API flow. Decided 9 Aug 2026 |
| **No contributor floor at all.** Every team row is returned, whatever its `Contributors` value | **Jason, 12 Aug 2026, after the tradeoff was laid out and reaffirmed.** The union needs the complete data set — a team figure that silently omits low-participation days isn't the thing being asked for — and no privacy commitment was ever made to technicians. Implemented as: no `$filter` clause in `getData`, `MIN_CONTRIBUTORS: 0` in `config.js`, and the non-reconciliation disclosure removed from the team view because it stopped being true |
| **What that costs, stated so nobody rediscovers it as a "bug"** | Subtraction works. Two people on a category → either can subtract their own figure and read the other's. **One person on a category → the team figure for that cell *is* that person's entry.** No names are sent, but the arithmetic is available to anyone with a PIN. `README.md` says so in the security section, and that paragraph should not be softened |
| **Crimson means Remote, teal means Required on campus** — swapped 18 Aug 2026 | It was the other way round. The hero figure states the *remote* share, so the emphasis colour has to sit on the bars that figure is about; a crimson number above a teal stack made the reader do a translation step. Applied to the hours chart and the *How appointments were conducted* bar together, so one hue means one thing across the whole tab. The hexes are unchanged — `--series-1` / `--series-2` kept their names and only the call sites in `app.js` moved, which means **the variable names no longer tell you the role.** Check `app.js`, not the CSS |
| **The lag ramp reversed** — heaviest step on `Immediately`, not on `Five or more days` | The short waits are the urgent ones and should carry the weight. The old direction darkened the tail, which read as "long waits are the severe ones" — true of the wait, backwards for the finding. Both light and dark ramps flipped; dark stays mirrored for the reason already recorded in `PALETTE.md` (prominence on a dark surface comes from lightness, not darkness) |
| **Two lag ramps, one per mode column** — teal for In person, crimson for Remote | The two panels sit side by side and used to be identical crimson, so the heading was the only thing telling them apart. Giving each panel its mode's hue makes the pairing with the charts above it automatic. Cost: a second six-step ramp to maintain, and `lagPanel()` gained a `ramp` prefix argument |
| The teal ramp is **generated, not picked by eye** | The first attempt was hand-chosen around `#00979d` and **failed the validator twice** — adjacent ΔL 0.052 between two steps (below the 0.06 floor) and a light end at 1.59:1 (below the 2:1 floor). The shipped values are OKLCH steps at a fixed hue, L spaced 0.075. The dark ramp is generated at *the same L values as the crimson dark ramp* so neither panel reads louder. Rejected hexes are recorded in `PALETTE.md` so nobody re-picks them |
| **Hero figures are tinted by their own value**, teal → white → crimson, with a teal → black → crimson outline | Jason's design, 18 Aug 2026. A flat crimson figure said nothing the digits didn't already say. The diverging scale means the colour reads before the number does. **The outline is what makes it work** — at 50% the fill is pure white and would vanish into the surface, so the outline goes pure black at exactly the same point. 1px at the 3.75rem figure size, tried at 2px first and judged too heavy. Ends stay as `var(--series-N)` inside `color-mix()`, so the figure re-tints on a light/dark switch with no re-render — the same contract the SVG charts hold |
| `color-mix()` gets a **plain-colour fallback declaration ahead of it** | An unsupported `color-mix()` is dropped as an invalid declaration and the earlier one stands, so the figure lands on its nearer end rather than inheriting nothing. Costs one duplicated declaration per property. Baseline is Chrome 111 / Safari 16.2 / Firefox 113, so this will almost never fire — but a hero figure with no colour at all is a bad enough failure to be worth the line |
| ⚠ **No value near 50% has ever been seen on screen** | The sample data has none, so the white-fill-plus-black-outline midpoint is validated by arithmetic only, not by eye. **Look at it the first time a real figure lands between about 40% and 60%.** If it reads badly, the fix is in `heroTint()` in `app.js` — narrow the white band or drop the midpoint to a light gray |
| `Contributors` is kept but is **diagnostic only**, counted **per key** | Nothing filters on it. It stays because it's the column an analyst uses to judge how much a team figure rests on. It counted per *date* until 13 Aug 2026, which made it meaningless beside a per-category sum — a one-person row reported `4` |

**Two definitions that fail silently if changed:**
- **Appointment** = with a user, working their support ticket. **Meeting** = internal. Only
  appointments are counted in Step 2. If technicians tally meetings there, the numbers look
  plausible and answer a different question.
- **Lag runs from ticket assignment to the technician**, not from user submission.

---

## Next steps, in order

### ⏸ Resume here — 14 Aug 2026

**The build is done and the app is in production.** Both flows are on, all six SharePoint lists exist
and are indexed, the site is live, every pre-collection test has passed, and the data lists now hold
real technician entries rather than seeded rows. Nothing in this project needs code or flow work.

**What's left is yours, not a Claude session's:**

1. **Decide how the PINs get distributed and to whom.** `PIN Codes.txt` holds thirty;
   `HTT_Technicians` is what actually grants access. **That file must never leave OneDrive** — in
   particular it must never be uploaded to the GitHub repo, where it would sit next to the flow URL.
2. **Brief the technicians on the two definitions** — appointment vs. meeting, and lag measured from
   ticket *assignment*, not user submission. Both fail silently if misunderstood: the numbers stay
   plausible and answer a different question, and nothing in the data reveals it. The wording is on
   screen at every entry point, but say it out loud once anyway.
3. **Watch the 1 a.m. writer run — the Recurrence trigger has still never fired against real data.**
   As of 14 Aug 2026 every run of `HTT_TeamTotals Writer` that has touched real entries was started
   **manually**, so what's proven is the arithmetic, not the schedule. Those are different failures:
   a manual run proves the loops and sums work, while a trigger that never fires produces team totals
   that are simply stale, with correct-looking figures and no error anywhere. The page would not
   reveal it either — the "Team totals through …" note names the last date *present in the data*, so a
   dead trigger reads as "nobody logged since Tuesday," which is indistinguishable from a quiet week.
   Confirm in the flow's **run history** that a run started on its own, then that `HTT_TeamHoursDaily`
   gained one row per date per group per category for the day before.

**Then, once collection has produced more than 100 rows in a list — checklist 8, the last open
test.** Request the 90-day range and confirm nothing comes back as exactly 100. **This is the trap
that accounts for most of the residual risk in the project:** `Get items` returns 100 rows by default
and truncates the rest silently. Top Count 5000 and Pagination are confirmed set on all eight reads
across both flows, but the lists have never held more than a dozen rows, and below 100 a wrong
setting and a right one behave identically — this has been *inspected*, never *exercised*. The
symptom is a row count of exactly 100.

**Keep `RecalcDays` = `400` in mind as a repair tool** — the one-off backfill it was designed for is
no longer needed, because collection starts after the writer exists and the nightly 3-day window
covers every day from day one. But if the writer ever stops for more than three days, a single run
at `400` rebuilds everything.

**Do not fold the aggregation back into `getData`, and do not move it into `app.js` either.** Both
were considered. Request-time aggregation is what the 9 Aug redesign removed — see *Decisions*.
Moving it to the page was rejected on 8 Aug: the page can only add up what it's been sent, and
sending per-technician rows for it to total would put one technician's rows in another's browser.
That is still the one privacy rule that holds, and scrapping the contributor floor did not touch it —
what the page rolls up is rows **already summed across people**.

**The flow is `HTT_Time Tracking API`.** Built and verified working end to end:

```
manual (trigger)
└ Body                    Compose — json(triggerBody())
└ Get items               HTT_Technicians, PIN eq '…' and Active eq 1
└ Condition               length(body('Get_items')?['value']) > 0
  ├ False → Response      401
  └ True
    └ TechName            Compose — first(body('Get_items')?['value'])?['Title']
    └ Switch              on outputs('Body')?['action']
      ├ auth              → RespondAuth
      ├ getConfig         → GetCategories → HoursRows → SelectHours
      │                     → ModeRows → SelectModes → RespondConfig
      ├ submitHours       → EntryDate → GetExistingHours
      │                     → DeleteOldRows [ DeleteHoursRow ]
      │                     → WriteNewRows  [ CreateHoursRow ]
      │                     → RespondHours
      ├ submitAppointments → ApptDate → GetExistingAppts
      │                     → DeleteOldAppts [ DeleteApptRow ]
      │                     → WriteNewAppts  [ CreateApptRow ]
      │                     → RespondAppts
      ├ getData            → FromDate
      │                     → GetMyHours   → SelectMyHours
      │                     → GetMyAppts   → SelectMyAppts
      │                     → GetTeamHours → SelectTeamHours
      │                     → GetTeamAppts → SelectTeamAppts
      │                     → RespondData
      └ Default            → RespondBadAction        400
```

**And a second flow, `HTT_TeamTotals Writer` — built 12 Aug, verified 13 Aug 2026.** `SETUP.md`
Part 2b. Background job, no page-facing URL, its own trigger:

```
Recurrence (trigger)     Eastern Time, 1 a.m.
└ RecalcDays             Compose — 3          (30 to verify, 400 for a one-off backfill)
└ WindowStart            Compose — addDays(utcNow(), mul(-1, int(RecalcDays)), 'yyyy-MM-dd')
└ GetWindowHours         HTT_DailyHours,      EntryDate ge WindowStart   ← Top Count 5000
└ GetWindowAppts         HTT_AppointmentLag,  EntryDate ge WindowStart   ← Top Count 5000
└ GetOldTeamHours        HTT_TeamHoursDaily,  TeamDate ge WindowStart    ← Top Count 5000
└ DeleteOldTeamHours [ DeleteTeamHoursRow ]   clear the window first, so re-runs don't double
└ GetOldTeamAppts        HTT_TeamApptsDaily,  TeamDate ge WindowStart    ← Top Count 5000
└ DeleteOldTeamAppts [ DeleteTeamApptsRow ]
└ SelectHourKeys → DistinctHourKeys           date|group|category
└ ForEachHourKey [ HourKeyParts → RowsForKey → HourValues → HourSum
                   → HoursNamesOnly → DayContributors
                   → CreateTeamHoursRow  in HTT_TeamHoursDaily ]
└ SelectApptKeys → DistinctApptKeys           date|bucket|mode
└ ForEachApptKey [ ApptKeyParts → ApptRowsForKey → ApptValues → ApptSum
                   → ApptNamesOnly → ApptDayContributors
                   → CreateTeamApptsRow  in HTT_TeamApptsDaily ]
```

32 actions. No Response action anywhere — nothing waits on it, and a Response outside an
HTTP-triggered flow is an error.

`HoursNamesOnly` reads from `RowsForKey` and `ApptNamesOnly` from `ApptRowsForKey`, so `Contributors`
counts the people inside *that row's* sum. The `NamesForDate` / `ApptNamesForDate` Filter arrays that
used to sit in front of them were deleted 13 Aug 2026.

**Action names are unique across the whole flow, not per case** — Power Automate requires it, and
it rejects a duplicate only after the card is filled in, without reliably keeping what you typed.

**Everything after the Condition lives inside the True branch**, including the Switch. A Response
in the False branch plus actions at top level would mean a bad PIN answers 401 and *then* falls
through to send a second Response, which errors.

`submitHours` and `submitAppointments` are repetition against these known-good foundations —
`SETUP.md` Part 2 has both. **`getData` is no longer the hard one**; after the 9 Aug redesign it's
reads and one Condition. The aggregation, and with it the xpath-sum and `union`-dedupe idioms, now
lives in the writer flow where it can be verified against SharePoint by hand.

**Two conventions established 8 Aug 2026, worth keeping:**
- **Rename every action as you add it, with no spaces** — `GetCategories`, `SelectHours`,
  `RespondAuth`, `RespondConfig`. Otherwise five cases produce `Response 1`…`Response 5` and a
  second `Get items 1`. Expressions also convert spaces to underscores, so a space-free name is
  one less mismatch.
- **Insert expressions via the Expression tab, typed** — never by clicking a token in the Dynamic
  content list. See the `For each` gotcha below; this is not stylistic.

### Housekeeping, whenever

- **The throwaway `CORS smoke test` flow can be deleted.** Step 0 passed 6 Aug 2026 and its trigger
  settings are recorded in `SETUP.md` Part 2 and in *Gotchas* below.
- **The fonts item** under *Open / deferred*, if the `.woff2` files ever turn up. Ten minutes.
- **The two mobile issues** under *Open / deferred*, if technicians turn out to use phones after all.

---

## Gotchas worth carrying forward

- **The browser console's message buffer survives page navigation, so a fixed bug can still look
  broken.** Reloading corrected code in a tab that previously ran the broken code replays the old
  errors, and there is nothing to distinguish them from fresh ones. This wasted a diagnosis on 10 Aug
  2026 on the `charts.js` SVG fix, which was actually working. **Check console errors in a brand-new
  tab.** The same caution applies to reading a rendered element's size immediately after a click —
  measure after layout settles, or an element mid-render reports `0x0` and looks like a regression.
- **A green run of the writer flow over an empty window proves almost nothing.** With `RecalcDays` at
  `3`, a window holding no entries makes every loop iterate zero times, so the xpath sum, the `union`
  dedupe, the `?['Value']` Choice reads, the midday-UTC `TeamDate` and both `Create item` column
  mappings are all completely unexercised — and the run is marked succeeded. This is what happened on
  the first run, 12 Aug 2026. **Raise `RecalcDays` until `GetWindowHours` returns rows before reading
  anything into a pass**, and treat the hand-count in `SETUP.md` Part 2b step 3 as the actual
  milestone. Same family as the console-buffer trap above: the signal looks like success and isn't.
- **A sum over one row proves nothing.** The whole verification of the writer flow turned on this. If
  every group-by key contains exactly one source row — which is what happens when one person has been
  testing — then an expression that correctly sums, one that returns the first value, and one that
  returns a count all produce the same answer, and the hand-check passes. **Seed a key with several
  technicians and distinct values before believing a sum.** On 13 Aug 2026 that meant three rows of
  2, 3 and 4 hours against one date and category: **9** is a pass, **2** and **3** are two different
  bugs. Same family as the empty-window and console-buffer traps — the signal looks like success.
- **Changing a `Select`'s `From` silently wipes its `Map` and can drop it out of text mode.** Flow
  checker reports it as `'Map' is required`, which is clear enough, but only if you run the checker —
  the canvas looks fine. And **repoint a reference before deleting what it points at**: Power
  Automate refuses to delete an action another action still uses, without naming the culprit.
- **Inside a `Filter array`, `item()` is the row being filtered — not the enclosing loop's item.**
  This is why `HourKeyParts` and `ApptKeyParts` exist as separate Compose actions instead of
  `split(item(), '|')` being written straight into the filter condition. Inlined, the split runs
  against a SharePoint row, matches nothing, and the flow writes a full set of team rows with sums of
  zero — no error, no warning, correct-looking row count.
- **`Get items` returns 100 rows by default and truncates the rest silently — no warning, no error,
  a successful run.** Set **Top Count 5000** and turn **Pagination** on, on every `Get items` that
  can match more than 100 rows. None of the cases built before 9 Aug 2026 hit this because they all
  filter to a single day; it arrives with `getData` and the writer flow, both of which read ranges.
  The consequences are the worst kind: the writer would sum a third of a day's rows and store a
  plausible-looking total, and the page would draw charts and a hero percentage from it. **The
  symptom to look for is a row count of exactly 100** in a run's outputs. This is the reason
  checklist item 8 in `SETUP.md` exists.
- **SharePoint refuses filtered queries against lists over 5,000 items unless the filtered column is
  indexed, and it can refuse to build the index once the list is already over the limit.** So the
  window to fix this closes on its own. At 17 technicians × 6 categories, `HTT_DailyHours` grows by
  about 100 rows per working day and **crosses 5,000 around mid-October 2026**, ending near 24,000 by
  30 June 2027. Index `EntryDate` on `HTT_DailyHours` and `HTT_AppointmentLag`, and `TeamDate` on the
  two team lists. This is not only about the new work — `submitHours` and `submitAppointments`
  already filter `EntryDate`, so they break too. The failure is loud (*"exceeds the list view
  threshold"*), which is the one mercy here.
- **A SharePoint Date-only column does not store the instant you send it, so never filter it with
  `eq`.** Write `2026-08-08T12:00:00Z` and SharePoint converts to the site's local time,
  truncates to local midnight, and stores `2026-08-08T04:00:00Z`. Query for `12:00:00Z` and you
  get nothing back. **The failure is completely silent** — `Get items` returns `"value": []`, the
  delete loop runs zero times, the write succeeds, the flow reports success and the page says
  *Saved.* The only visible symptom is **two sets of rows in SharePoint after re-saving a day**,
  and the run history's `$filter` looks perfectly well-formed because it is. Match a half-open day
  range instead — `EntryDate ge datetime'<date>T00:00:00Z' and EntryDate lt
  datetime'<date+1>T00:00:00Z'`. Use `lt`, not `le`, or one day's delete reaches into the next.
  **Midday UTC is correct for writing and wrong for reading** — the bug was reusing one instant
  for both. Cost a debugging round on 8 Aug 2026. Applies to `HTT_AppointmentLag` too.
- **Power Automate silently wraps actions in a `For each` if you insert a token by clicking it.**
  This is the most disruptive gotcha found so far. **Dynamic content tab** = you click a named
  token, and Power Automate traces its lineage; if anything upstream was a list, it wraps your
  action in `For each` without asking. **Expression tab** = you type the formula, and it's treated
  as opaque, so no loop is added. Both routes produce an identical-looking purple token, so you
  cannot tell afterward which you used. It bit `RespondAuth` on 8 Aug: clicking `TechName`'s
  Outputs token wrapped the Response in a loop, because `TechName` reads from `Get items`. **A
  Response inside a loop either fires twice — and the second fails, a flow can only answer once —
  or never fires at all and the page hangs.** There's no unwrap; delete the `For each` (children
  go with it) and rebuild. **Always type expressions in the Expression tab.**
- **Verify a `For each` hasn't appeared after adding any action that references a token.** It's
  easy to miss on a busy canvas, and it looks deliberate.
- **One flow, not one per action.** The whole API is a single flow, `HTT_Time Tracking API`, with
  `auth` / `getConfig` / `submitHours` / `submitAppointments` / `getData` as cases inside one
  Switch. `config.js` has one `FLOW_URL` and `app.js` posts everything to it with an `action`
  field, so five flows would produce five URLs the page can't use. A flow named after an action is
  the tell that a case has been promoted to a flow by mistake. Cost a rename on 7 Aug 2026.
  **`HTT_TeamTotals Writer` is the one legitimate exception** and is not a violation of this: the
  rule is about the page-facing API, and the writer has no page-facing URL, is never called by the
  page, isn't named after an action, and needs its own Recurrence trigger — which a flow can only
  have one of. Don't "fix" it by folding it into the Switch.
- **`window.__HTT_TEST__` at the end of `app.js` is the only way to unit-test this project.** There
  is no build step, no test runner, and no Node runtime in the Claude sandbox — everything in
  `app.js` is inside an IIFE. The hook exposes the pure functions read-only so assertions can be run
  from a browser console against the real code. Serve the page, sign in, then paste assertions using
  `window.__HTT_TEST__.rollUp` and friends. Without it the only way to check a calculation is to read
  figures off the rendered page, which is how a wrong roll-up survives.
- **Two different key separators, deliberately.** `app.js` joins composite keys with `SEP`
  (`\u0000`); the writer flow joins its group-by keys with `|`. They solve different problems — `SEP`
  has to survive being a JavaScript object key, the flow's has to survive `split()` in a Power
  Automate expression — and **neither ever travels between the page and the flow**, so they don't
  need to match. Making them match on the assumption that they should would be a wasted change.
- **Everything in this project is prefixed `HTT_`** — all six SharePoint lists and both flows. It's
  cosmetic grouping when sorting by name, but apply it to anything new. Spaces are fine in a
  **flow** name; avoid them in a **list** name, where the name becomes part of the site URL.
- **Send requests as `text/plain`.** Marking them JSON triggers a browser preflight the flow
  endpoint doesn't reliably answer. Already handled in `app.js`; don't "fix" it.
- **Every flow Response action needs `Access-Control-Allow-Origin: *`.** Miss one and only that
  action fails in the browser.
- **The HTTP trigger's "Who Can Trigger The Flow?" must be `Anyone`** — it hides behind *Advanced
  parameters*. Microsoft's newer default, *Any user in my tenant*, strips the SAS signature from
  the URL and demands an Azure AD bearer token, which this deliberately anonymous page can't
  supply. The tell is `DirectApiAuthorizationRequired` **plus an empty run history** — Azure's
  gateway rejects the call before the flow runs, so there's nothing to debug inside the flow. A
  correct URL contains `&sig=`. Re-copy the URL after changing the setting; it changes. Cost us
  the first smoke-test attempt on 6 Aug 2026, and the real flow's trigger has the same default.
- **Response bodies must be valid JSON and nothing else** — the page `JSON.parse()`s every
  response. The smoke test's flow returned `body { "ok": true }` on the first go, and Power
  Automate flagged nothing. On the real flow that's a broken page with no useful error.
- **`CategoryGroup` in `HTT_Categories` is matched as an exact string, capital letters included.**
  `normalizeConfig()` groups categories by first appearance of the literal value, so
  `Required on campus` and `Required on Campus` produce **two separate headings** on Step 1, with the
  odd one out sitting alone under a heading that looks almost right. The rows as built use
  `Required on Campus`. When adding a category, copy the value from an existing row rather than
  typing it. *(`SETUP.md` Part 1 list 2 shows a lower-case `c` in its table; the live data has the
  capital. The live data wins.)*
- **`SortOrder` in `HTT_Categories` is load-bearing twice over,** so `getConfig` must use
  `Order By SortOrder asc`. It sets `modes[0]` = in person, which the headline figure depends on
  (reversed, the hero reports remote appointments as in-person — backwards, plausible-looking and
  invisible on screen), and because `normalizeConfig()` groups by first appearance it also sets
  the order of the two group headings on Step 1.
- **SharePoint Choice columns arrive as objects, not strings.** `HoursMode` must be read as
  `item()?['HoursMode']?['Value']`; comparing the bare field matches nothing, and the failure
  looks like a form with no categories rather than an error. Same for `LagBucket` in `getData`.
- **Three things about entering expressions in a Response body**, all of which look correct and
  aren't: `@{body('SelectHours')}` takes **no surrounding quotes** — it's already an array, and
  quoting it makes the whole thing one string that `JSON.parse()` rejects. Action names lose
  their spaces inside expressions, so an action labelled `Select hours` is `body('Select_hours')`
  — the mismatch is correct. And insert expressions with **Add dynamic content → Expression**
  rather than typing `@{...}` by hand, which sometimes registers as literal text. Verify by
  opening the run history and reading the Response action's Inputs: it should be clean JSON, not
  quoted arrays and not the literal text `body('SelectHours')`.
- **A `Select` builds objects unless you switch it to text mode.** `SelectModes` must return
  `["In person","Remote"]`, not `[{"Title":"In person"},…]` — use the small `T` toggle at the
  right of the Map area ("Switch map to text mode") and enter `item()?['Title']` alone.
  `SelectHours` stays in normal key/value mode; that one does need objects.
- **Dates:** the page builds `YYYY-MM-DD` from local calendar parts, never `toISOString()` (which
  would push an 8 p.m. entry to tomorrow). The flow writes `T12:00:00Z` so no timezone offset can
  cross a day boundary. **Test this after 8 p.m. Eastern specifically** — it passes at any other
  hour whether or not it's correct.
- **The dark-mode lag ramp is deliberately reversed** in `styles.css`. On dark, the longest wait
  must be the *lightest* bar or the headline bar recedes. There are two dark blocks — a media
  query and a `data-theme` selector — and they're indented differently. Change both.
- **Lag bar labels are load-bearing for accessibility**, not decoration. The lightest ramp step is
  below the contrast minimum, which is only permitted because every bar carries a visible count
  and percentage.
- **Composite keys in `app.js` join with the `SEP` constant (`\u0000`)**, not a space — category, group and bucket names all contain spaces, so a space separator would split them apart.
- **`Same day` is a bucket name; "same-day" is prose.** Hyphenate only where it modifies a noun —
  "same-day assistance". The bucket itself must stay `Same day`: it's a SharePoint choice value and
  part of the `SEP`-joined composite keys, so renaming it silently orphans every stored row. The
  three hyphenated spots are the hero caption in `app.js`, the dashed cut label in `charts.js`, and
  the definition in `README.md`. The bar labels in the lag panels are the bucket name — leave them.
- **A Step 3 bucket renders only if it has data**, tested with `children.length > 1` because child 0
  is always the label. Without it, a technician who logged appointments but no hours got a `0%` hero
  over an empty table beneath a *Hours* heading — which reads as a broken page rather than an empty
  one. Both buckets empty is a separate, earlier guard that shows the `dataEmpty` notice instead.
- **Editing `.hero` changes both headline figures.** That's the intent — they're meant to be
  identical — but a tweak aimed at one silently restyles the other.
- `.claude/launch.json` points at a session temp path — safe to delete. The sandboxed preview server
  can't read the OneDrive path, so it serves a *copy* from that temp dir. Edits to the project don't
  appear until you re-copy them, and a plain browser reload will happily run the stale copy.

---

## Open / deferred

- **Two mobile issues, found 13 Aug 2026 in Edge on current iOS and deliberately deferred.** Jason's
  call, stated plainly: *"I need to get the app to production more than we need to fix every nuance.
  It's unlikely techs will be using a mobile device to enter data."* Don't reopen these unless that
  assumption changes.
  1. **Tapping a number box zooms the page in and the keyboard doesn't appear.** The zoom is iOS's
     standard behaviour when an input's `font-size` is under 16px — a one-line CSS change. The
     missing keyboard is the part that would need actual diagnosis.
  2. **The appointments table scrolls horizontally** at phone width. The hours step is fine; it's the
     six-bucket × two-mode grid that doesn't fit.
- **Fonts** fall back to system UI. HBS guidance says embed Inter and JetBrains Mono as base64;
  that needs the `.woff2` files, and the page deliberately loads nothing from the internet.
  Ten-minute change once the files exist.
- **If remote days start** during collection, the hero metric quietly stops meaning what its
  caption says, because the *Remote or could have been remote* group would begin mixing
  genuinely-remote work with unnecessary on-campus work. It would need splitting in two, and
  retrofitting won't recover earlier data.
- **Nothing on screen now states which buckets count as prompt service.** The sentence "Counted as
  everything from *Next day* onward — *Immediately* and *Same day* both count as prompt service"
  was removed from the appointments hero on 3 Aug 2026 at Jason's request. The metric itself is
  unchanged, and the dashed cut line in the lag panels still shows the split visually, but a reader
  has to look at the chart to work out the rule. The full explanation survives in `README.md`.
  Worth re-checking once the numbers are being presented to anyone outside TSS — the conservative
  Same-day choice is what defuses the "you counted same-day service as evidence people could wait"
  objection, and it only defuses it if the audience knows about it.
