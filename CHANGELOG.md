# Changelog

## v3 — Stability, RTL/layout hardening, medicine photo controls
- Investigated: reported layout bug (content compressed to one side, large
  blank area) and "language switch not responding" on Android Chrome.
  Verified via automated DOM/state inspection that the language-switch
  logic itself is functionally correct (no JS errors, correct `dir`
  attribute, correct Urdu text, normal element geometry after switching).
  Could not get a 100%-confirmed root cause without live access to the
  reporter's device — see `MEDISAATHI_PROGRESS.md` for the exact next
  diagnostic step if this recurs.
- Changed: replaced all CSS logical properties (`inset-inline-*`,
  `border-inline-*`, `padding-inline-*`) with explicit physical `[dir]`-
  scoped rules, to remove a plausible class of Chromium/WebView bugs where
  logical-property offsets don't recompute correctly after a live `dir`
  toggle.
- Added: a forced repaint after every language switch, as a defensive
  measure against stale compositor layers (particularly `backdrop-filter`
  glass surfaces).
- Added: defensive `width: 100%`, `overflow-x: hidden`, and `box-sizing`
  hardening on `html`, `body`, `.app`, `.topbar`, `.bottom-nav` so the
  layout cannot silently collapse into a narrow column regardless of cause.
- Added: explicit "Take photo" / "Choose from gallery" / "Remove" controls
  for medicine photos, replacing the single combined file input.
- Added: developer name ("Muhammad Usman Channa") shown once, elegantly,
  on the first-launch welcome screen — not repeated as a footer throughout
  the app. Confirmed (via automated layout measurement) that the About
  page's developer section never overlaps the fixed bottom navigation.
- Confirmed: the "More" section already showed all secondary features
  directly beneath a "More" heading in a single tap (no hidden submenu) —
  verified this matches the requirement as-is, no change needed there.
- Analyzed and explicitly declined, per the user's free-only requirement:
  AI Health Assistant (cloud AI, WebLLM, voice input) — see the feasibility
  report delivered in this session for full reasoning. Not implemented.
- App name kept as MediSaathi, per explicit instruction. Icon kept
  unchanged pending the user's choice from proposed concepts.

## v2 — Major feature expansion
- Added: Activity (walking) tracker with live start/pause/resume/stop timer
  and manual-entry fallback
- Added: Water tracker with quick-add amounts, custom amount, daily target,
  progress bar
- Added: Sleep tracker with bedtime/wake entries and a duration trend chart
- Added: Custom trackers for any doctor-recommended measurement
- Added: Doctor questions list (add / mark answered / delete)
- Added: Doctor visit summary report (7 / 30 / 90-day ranges, printable)
- Added: Emergency health card (private, per-person, local-only)
- Added: Food & natural guidelines section with daily rotating tip
- Added: Today's Health Tip on the dashboard (curated, offline, rotates daily)
- Added: "How I feel today" quick mood check-in on the dashboard
- Added: Informational clinical-range feedback pills for BP, blood sugar,
  heart rate, SpO₂ and temperature readings (never a diagnosis)
- Added: First-launch welcome screen, replayable from About
- Added: "More" menu so the dashboard stays focused on daily essentials
- Changed: Developer attribution updated to "Muhammad Usman Channa" /
  محمد عثمان چنّا
- Changed: Health timeline now includes activity, sleep and doctor-question
  events
- Changed: Global search now also covers doctor questions and custom trackers
- Fixed: **Critical** — "Clear all data" caused an infinite-recursion crash
  in the single-file build, because the data-layer's internal
  `clearAllData` function and the Settings screen's button-handler function
  shared the same name. When bundled into one file, the second definition
  silently overwrote the first, so the delete button called itself forever
  instead of clearing data. Renamed the Settings handler to
  `handleClearAllDataClick` to remove the collision. Verified with an
  automated test that adds real data, clears it, and confirms it's gone.

## v1 — Initial single-file deployment
- Root cause of earlier GitHub Pages deployment failures identified:
  uploading `css/` and `js/` as subfolders was unreliable with the user's
  upload method, resulting in a page that loaded `index.html` but no
  styling or app logic.
- Fix: restructured the whole app as one self-contained `index.html`
  (inline CSS + inline JS), plus flat, root-level `manifest.json`,
  `service-worker.js` and icon files — no subfolders at all.

## v1 — Initial build
- First full build: dashboard, medicine manager, family/caregiver mode,
  blood pressure/sugar/weight/other vitals tracking with charts, health
  timeline, calendar, notes, health vault, monthly report with doctor/print
  view, insights, global search, English + Urdu (RTL), light/dark/medical
  themes, installable PWA with offline caching, export/import/clear data,
  accessibility basics, About page.
