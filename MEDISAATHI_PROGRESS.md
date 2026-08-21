# MediSaathi — Progress

## Current version
v3 (single-file build)

## Features completed
- Dashboard: today's medicines, adherence ring, latest readings, quick-add,
  "How I feel today", Today's Health Tip, recent activity, install banner
- Medicine manager: photo, dosage, schedule, instructions, refill, pause/edit/delete
- Family / caregiver mode (multiple person profiles, per-person data)
- Blood pressure, blood sugar, weight, and other vitals (heart rate, SpO₂,
  temperature, sleep, steps, custom) — each with charts and history
- Informational clinical-range feedback pills (within range / above / below /
  needs attention) for BP, blood sugar, heart rate, SpO₂, temperature —
  general reference ranges only, never a diagnosis, always paired with a
  disclaimer
- Health timeline (unified, filterable by category)
- Calendar view
- Notes (title, content, category, date)
- Health vault (photos/documents, camera or file upload)
- Monthly report + printable "Doctor view"
- Health insights (rule-based, data-only, never diagnostic)
- Global search across medicines, notes, vault, vitals, doctor questions,
  custom trackers
- English + Urdu with full RTL layout
- Light / Dark / Medical themes
- Installable PWA with offline caching (service worker)
- Export / import / clear data, with confirmation before destructive actions
- Accessibility basics: skip link, focus states, aria labels, reduced-motion support
- First-launch welcome screen (shown once, replayable from About)
- Activity (walking): start/pause/resume/stop timer + manual entry fallback
- Water tracker: quick-add buttons, daily target, progress bar
- Sleep tracker: bedtime/wake entries with duration chart
- Custom trackers: log any doctor-recommended measurement (name + unit + value)
- Doctor questions: save, mark answered, delete
- Doctor visit summary: 7/30/90-day range report, printable
- Emergency health card: name, blood group, allergies, medicines, contact
  (private, local-only, shown/shared only if the user chooses to)
- Food & natural guidelines: static, evidence-based-style educational content
  (vegetables, fruits, whole foods, hydration, lower-sodium choices), with a
  daily rotating "Today's Healthy Choice" tip and a clear non-medical disclaimer
- Developer attribution updated to "Muhammad Usman Channa" / محمد عثمان چنّا
- "More" menu added so secondary features don't clutter the dashboard

## Known limitations (by design, not hidden from the user)
- **AI Health Assistant: intentionally not implemented.** Analyzed and
  explicitly declined per the free-only requirement — every hosted LLM API
  needs a secret key that can't be safely kept in a public static frontend,
  and free tiers are rate-limited/revocable. The only fully free, no-backend
  option (WebLLM, fully on-device) has real quality/device/download-size
  tradeoffs. Left out entirely rather than shipped as a fake or unreliable
  feature. See the analysis report in this session's conversation for full
  detail if revisiting this decision later.
- **No true background push notifications**, for the same reason as
  before — no backend server. Reminders fire while the app is open.
- **No OCR for BP/sugar photos** — not implemented (see v2 notes below).

## Files
Single-file build (recommended for GitHub Pages — see README):
- `index.html` — everything inlined (HTML + CSS + JS)
- `manifest.json`, `service-worker.js`
- `icon-192.png`, `icon-512.png`, `icon-maskable-192.png`, `icon-maskable-512.png`

Modular source (for future development — not what gets deployed):
- `index.html`, `css/style.css`
- `js/db.js`, `js/i18n.js`, `js/utils.js`, `js/charts.js`, `js/app.js`

The single-file build is generated from the modular source by inlining
`css/style.css` and concatenating `js/db.js` + `js/i18n.js` + `js/utils.js` +
`js/charts.js` + `js/app.js` (with `import`/`export` keywords stripped) into
one `<script>` tag. **Important:** this merge puts every module's top-level
functions into one shared scope, so function names must stay unique across
all five JS files — a name collision between `js/db.js` and `js/app.js`
(`clearAllData` defined in both) caused a real shipped bug (infinite
recursion) that was found and fixed in this pass. Always re-check for
duplicate top-level function names after editing the modular source and
before regenerating the single-file build.

## Next recommended step
If continuing this project in a future session:
1. Read this file and `CHANGELOG.md` first.
2. Inspect `js/app.js`, `js/db.js`, `js/i18n.js`, `css/style.css` (modular
   source) — treat these as the source of truth, not the generated
   `index.html`.
3. **Unresolved / needs the user's real-device confirmation:** a layout bug
   was reported (content compressed to one side of the screen with a large
   blank area, on Android Chrome) together with "language switch not
   responding." Investigation in v3:
   - All CSS logical properties (`inset-inline-*`, `border-inline-*`,
     `padding-inline-*`) were converted to explicit physical `[dir="rtl"]` /
     default rules, since these are more prone to live-recompute bugs in
     some Chromium/WebView builds when `dir` is toggled after initial paint.
   - Added a forced repaint (`forceRepaint()` in `js/app.js`) after every
     language switch, as a defensive measure against compositor staleness.
   - Added defensive `width:100%` / `overflow-x:hidden` / `box-sizing`
     hardening to `html`, `body`, `.app`, `.topbar`, `.bottom-nav`.
   - **Verified via automated testing that the language switch itself is
     functionally correct**: `dir` attribute updates correctly, Urdu text
     renders correctly, and every element's computed size/position/opacity/
     visibility is normal after the switch — this was checked directly via
     DOM/CSSOM inspection, not just visually. No JS error occurs.
   - Automated screenshot capture of this app rendered fully blank in one
     specific test scenario (RTL + specific viewport) throughout this whole
     project, in a way that didn't correlate with any DOM/state problem —
     this looks like an artifact of the headless testing tool used in this
     sandbox, not a real rendering bug, but this could **not** be confirmed
     against a real device from this environment.
   - **Bottom line: if the user still sees the compressed/blank layout on
     their real Android phone after this v3 update, the next step is to get
     a live diagnostic from their actual device** — specifically: (a)
     whether Chrome's "Desktop site" toggle is on for that tab, (b) whether
     this happens in a normal single Chrome window (not split-screen/
     resizable floating window), and (c) if possible, the output of
     `document.documentElement.getBoundingClientRect()` and
     `window.innerWidth` from that device via `chrome://inspect` on a
     connected desktop, or a Chrome remote-debugging session. Don't
     re-guess further blind — get that data point first.
4. Icon: the user approved re-proposing icon concepts (health + fitness
   direction, not just medicine) but has **not yet approved a specific
   design** — do not regenerate `icon-*.png` files until they pick one from
   the proposals given in conversation.
5. AI Assistant: explicitly declined by the user for the free-only reason
   given in the analysis report. Don't re-add without the user revisiting
   that decision.
6. Other likely next additions, roughly in priority order:
   - Vault form: same explicit Take Photo / Choose from Gallery / Remove
     pattern already applied to the medicine form (vault currently still
     uses a single combined file input)
   - Client-side OCR for BP/blood sugar photo readings (with a mandatory
     confirm/edit step — never auto-save an OCR guess) — still not started
   - Per-tracker custom units/icons and simple sparkline charts on the
     Trackers list
   - Export/share a single day's or week's data as an image (not just print)
7. Regenerate the single-file `index.html` bundle from modular source after
   any change, and re-run the duplicate-function-name check before shipping
   (see the "Files" section above for why this matters — it caused a real
   shipped bug once already).
