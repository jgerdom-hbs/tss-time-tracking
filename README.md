# TSS Time Tracking

A single-page site technicians open once a day to record two things: how their working day split
between work that required being on campus and work that didn't, and how long users waited
between a ticket being assigned and the resulting appointment.

Data lives in SharePoint lists you own. The page never touches SharePoint directly — every
request goes through one Power Automate flow, which is also what enforces who can see what.

**New here?** Start with [SETUP.md](SETUP.md). Run `smoke-test.html` first.

---

## Files

| File | What it is |
|---|---|
| `index.html` | The page |
| `styles.css` | HBS branding, light and dark |
| `charts.js` | The charts — hand-written SVG, no libraries |
| `app.js` | Sign-in, forms, and the data view |
| `config.js` | **The only file you'll normally edit.** Holds the flow URL |
| `smoke-test.html` | Step 0. Proves the flow connection works before anything is built on it |
| `SETUP.md` | Click-level build guide for the SharePoint lists and the flow |
| `HANDOFF.md` | Current state and settled decisions. Hand this to a new Claude session |
| `_palette/` | The chart colour validation. See below |

## Demo mode

While `FLOW_URL` in `config.js` is empty, the page runs on invented data and saves only to the
browser. Any six digits get you in. A yellow banner makes it obvious. This is for showing people
what it looks like before the back end exists — fill in the flow URL and it goes live.

---

## Day-to-day

Everything here is a SharePoint edit. None of it needs code changes or my involvement.

**Add a technician.** New row in `Technicians`: their name, a six-digit PIN you generate, Active =
Yes. Give them the PIN and the page's web address.

⚠ **PINs must be unique.** The flow works out who is submitting by looking the PIN up. Two
technicians sharing one would file one person's hours under the other's name, and nothing in the
data would show it happened. Check the list before adding.

**Change someone's PIN.** Edit the row, tell them the new one, have them use "Not you?" and sign
in again. Safe at any time — past entries store their *name*, not their PIN, so history is
unaffected.

**Retire a technician.** Set Active to No. Their history stays intact and keeps counting toward
team totals; they just can't sign in.

**Add or rename a category.** New row in `Categories` with Type = `Hours`, the group heading it
belongs under, and a sort order. It appears on the form on next load. A brand-new group heading
works too — just type a new value in CategoryGroup.

**Retire a category.** Set Active to No. It disappears from the form; entries already recorded
against it stay in the data and still appear in analysis.

**Pull the data.** The lists are the analysis surface, and the only place row-level data across
all technicians is available. `DailyHours` → **Export to Excel** gives a refreshable query; Power
BI connects straight to the lists. Both lists are long-format — one row per category rather than
one column per category — so put `CategoryGroup` / `Category` or `LagBucket` on columns in a
PivotTable or matrix visual. That shape is deliberate: it's why adding a category is a SharePoint
row instead of a schema change plus a flow edit.

---

## What the numbers mean

Worth keeping straight, because these definitions are what make the data defensible.

**The hero percentage** is the *Remote or could have been remote* group divided by total hours —
the share of **all working hours** that didn't require being on campus.

Because technicians are currently on campus full time, every recorded hour is an on-campus hour,
so today this is also the share of on-campus time that could be remote. **That equivalence breaks
the moment remote days start.** If some work begins happening off campus during the collection
period, that group starts mixing genuinely-remote work with unnecessary on-campus work, and the
number quietly stops meaning what the caption says. If that happens, the group needs splitting in
two — and note that retrofitting won't recover the earlier data.

**"Did not require same-day assistance"** is the share of appointments in *Next day* or later.
*Immediately* and *Same day* both count as prompt service and are excluded. That's the
conservative reading on purpose: it produces a smaller number than counting only *Immediately*
would, but it can't be answered with "you counted same-day service as evidence people could
wait." The headline reports the **in-person** figure, with remote underneath.

**Appointments vs. meetings.** An appointment is with a user, working their support ticket. A
meeting is internal. Only appointments are counted in Step 2. The wording is repeated at every
entry point on purpose — if technicians tally internal meetings into Step 2 the numbers still
look plausible while answering a different question, and nothing in the data would reveal it.

**The lag is measured from assignment to the technician**, not from when the user submitted the
ticket. Same reasoning: it's invisible when it goes wrong.

---

## Chart colours

`_palette/PALETTE.md` records the colours and the evidence behind them. They were produced by
running the data-visualization validator against the page's actual surfaces — checking colourblind
separation and contrast — rather than picked by eye. Light mode uses the exact HBS brand hexes;
dark mode needs a lightened crimson because Harvard Crimson is too dark to tell apart from a dark
background.

Two things not to change casually:

- **The bar labels on the lag chart aren't decoration.** The lightest step of that colour ramp sits
  below the contrast minimum, which is allowed only because every bar carries a visible count and
  percentage. Remove the labels and the chart stops being accessible.
- **The dark-mode ramp is deliberately reversed** (`styles.css`). On a light background the longest
  wait is the darkest bar; on a dark background it has to be the lightest, or the bar the headline
  is about fades into the background.

If you change a colour, re-run `_palette/harness.html` through a local server and confirm it still
passes.

## Fonts

The HBS guidance is to embed Inter and JetBrains Mono as base64. I haven't — that needs the font
files, and this page deliberately loads nothing from the internet, so a web-font CDN was out. The
CSS asks for Inter and JetBrains Mono by name and falls back to the system UI font. On HBS-managed
machines with those fonts installed it looks exactly right; elsewhere it falls back gracefully.
Send me the `.woff2` files and it's a ten-minute change.

---

## Security, honestly

- **The flow URL sits in the page source**, and a public repo means anyone can read it. Its
  signature is the only thing protecting it. The PIN check is what actually stops junk data — the
  URL alone gets you a 401. Worst realistic case is nuisance entries, not a data breach: nothing is
  readable without a valid PIN.
- **PINs are plain text** in a list only you can see. They're convenience identifiers, not
  credentials. Worst case someone logs hours as another technician.
- **Flow run history keeps request bodies — including PINs — for 28 days.** Anyone with co-owner
  rights on the flow can read them. Keep that list short.
- **Team totals include your own data**, so "Team" means the whole team — every row, with no
  minimum number of contributors. **This means subtraction works**: on a day only you and one
  colleague logged a given category, subtracting your own hours from the team figure gives you
  theirs. And where only one person logged a category, the "team total" for that cell is that
  person's entry. No names are ever sent to the page, but the arithmetic is available to anyone
  who looks. This was a deliberate choice on 12 Aug 2026 — the union needs the complete data set,
  and no privacy commitment was made to technicians. **If anyone is ever told their individual
  figures are protected, that promise and this design are in conflict.**
- **Team totals do add up** to a row-by-row count of `HTT_DailyHours` for the same date range.
  That's the check to run if a figure looks wrong.
- **What is still never sent to the page:** another technician's individual rows. Team figures are
  summed across people before they leave the flow, so the page receives one row per date per
  category, not one per person. That boundary is unchanged.
- **Team totals are computed overnight, not live.** The team view is headed *"Team totals through
  <date>"* so you can see how current they are; your own figures are always live. Nothing needs
  doing to keep this running — it's a scheduled flow — but if that date ever falls more than a day
  or two behind, check the run history of `HTT_TeamTotals Writer`.
- **This is self-reported estimate data**, and "could have been remote" is each technician's own
  judgment. Directionally useful; not an audit trail. Expect that judgment call to be where
  someone pushes back.
