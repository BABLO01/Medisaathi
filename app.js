// app.js — MediSaathi application shell, router and view renderers.
import { DB } from './db.js';
import { t, setLang, getLang, STRINGS } from './i18n.js';
import * as U from './utils.js';
import { renderLineChart, renderBarChart, renderProgressRing } from './charts.js';

// ---------------------------------------------------------------------------
// Global state
// ---------------------------------------------------------------------------
const state = {
  personId: null,
  persons: [],
  theme: 'light',
  lang: 'en',
  trackers: { heartrate: true, spo2: true, temperature: false, sleep: false, steps: false },
  dashboardSections: {
    todayMeds: true, upcoming: true, readings: true, notes: true, monthly: true, activity: true
  },
  deferredInstallPrompt: null,
  notificationsEnabled: false
};

const app = document.getElementById('app');
const navEl = document.getElementById('bottom-nav');
const personBar = document.getElementById('person-bar');
const topbarTitle = document.getElementById('topbar-title');

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------
async function boot() {
  registerServiceWorker();
  await loadSettings();
  await ensurePersonExists();
  wireGlobalUI();
  window.addEventListener('hashchange', route);
  route();
  setInterval(checkDueReminders, 60 * 1000);
}

async function loadSettings() {
  const lang = await DB.getSetting('lang', 'en');
  const theme = await DB.getSetting('theme', 'light');
  const trackers = await DB.getSetting('trackers', state.trackers);
  const dashboardSections = await DB.getSetting('dashboardSections', state.dashboardSections);
  const notificationsEnabled = await DB.getSetting('notificationsEnabled', false);
  state.lang = lang;
  state.theme = theme;
  state.trackers = trackers;
  state.dashboardSections = dashboardSections;
  state.notificationsEnabled = notificationsEnabled;
  setLang(lang);
  applyTheme(theme);
}

async function ensurePersonExists() {
  state.persons = await DB.getAll('persons');
  if (!state.persons.length) {
    const me = { id: DB.uid(), name: t('person_me'), relation: 'self', colorTag: '#0EA5A0', createdAt: Date.now() };
    await DB.put('persons', me);
    state.persons = [me];
  }
  const savedPersonId = await DB.getSetting('activePersonId', null);
  state.personId = (savedPersonId && state.persons.find((p) => p.id === savedPersonId)) ? savedPersonId : state.persons[0].id;
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function currentPerson() {
  return state.persons.find((p) => p.id === state.personId) || state.persons[0];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const ROUTES = {
  '': renderDashboard,
  '#/dashboard': renderDashboard,
  '#/medicines': renderMedicines,
  '#/vitals': renderVitalsHub,
  '#/vitals/bp': (q) => renderVitalDetail('bp', q),
  '#/vitals/sugar': (q) => renderVitalDetail('sugar', q),
  '#/vitals/weight': (q) => renderVitalDetail('weight', q),
  '#/vitals/other': (q) => renderVitalDetail('other', q),
  '#/timeline': renderTimeline,
  '#/calendar': renderCalendar,
  '#/notes': renderNotes,
  '#/vault': renderVault,
  '#/reports': renderReports,
  '#/insights': renderInsights,
  '#/search': renderSearch,
  '#/settings': renderSettings,
  '#/about': renderAbout
};

function route() {
  const [path] = window.location.hash.split('?');
  const handler = ROUTES[path] || ROUTES[window.location.hash] || renderDashboard;
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('nav-btn--active', b.dataset.route === (path || '#/dashboard'));
    b.setAttribute('aria-current', b.dataset.route === (path || '#/dashboard') ? 'page' : 'false');
  });
  app.setAttribute('aria-busy', 'true');
  try {
    handler(window.location.hash);
  } catch (err) {
    console.error(err);
    app.innerHTML = errorState();
  }
  app.setAttribute('aria-busy', 'false');
  app.scrollTop = 0;
  window.scrollTo(0, 0);
}

function go(hash) {
  window.location.hash = hash;
}

function errorState() {
  return `<div class="empty-state">
    <div class="empty-state__icon">⚠️</div>
    <h2>${t('common_error_generic')}</h2>
    <button class="btn btn--primary" onclick="location.hash='#/dashboard'">${t('nav_dashboard')}</button>
  </div>`;
}

// ---------------------------------------------------------------------------
// Chrome: top bar, person switcher, bottom nav
// ---------------------------------------------------------------------------
function wireGlobalUI() {
  renderPersonBar();
  renderBottomNav();
  document.getElementById('search-trigger').addEventListener('click', () => go('#/search'));

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredInstallPrompt = e;
    const btn = document.getElementById('install-btn');
    if (btn) btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    state.deferredInstallPrompt = null;
    U.showToast(t('common_saved'));
  });
}

function renderBottomNav() {
  const items = [
    ['#/dashboard', 'nav_dashboard', '🏠'],
    ['#/medicines', 'nav_medicines', '💊'],
    ['#/vitals', 'nav_vitals', '❤️'],
    ['#/timeline', 'nav_timeline', '🕒'],
    ['#/settings', 'nav_settings', '⚙️']
  ];
  navEl.innerHTML = items.map(([hash, key, icon]) => `
    <button class="nav-btn" data-route="${hash}" onclick="location.hash='${hash}'" aria-label="${t(key)}">
      <span class="nav-btn__icon" aria-hidden="true">${icon}</span>
      <span class="nav-btn__label">${t(key)}</span>
    </button>
  `).join('');
}

function renderPersonBar() {
  const p = currentPerson();
  personBar.innerHTML = `
    <button class="person-chip" id="person-switch-btn" aria-haspopup="true">
      <span class="person-chip__avatar" style="background:${p.colorTag || '#0EA5A0'}">${(p.name || '?').charAt(0).toUpperCase()}</span>
      <span class="person-chip__meta">
        <span class="person-chip__label">${t('person_viewing')}</span>
        <span class="person-chip__name">${U.escapeHTML(p.name)}</span>
      </span>
      <span class="person-chip__chevron" aria-hidden="true">▾</span>
    </button>
  `;
  document.getElementById('person-switch-btn').addEventListener('click', openPersonSwitcher);
}

function openPersonSwitcher() {
  const options = state.persons.map((p) => `
    <button class="person-option ${p.id === state.personId ? 'person-option--active' : ''}" data-id="${p.id}">
      <span class="person-chip__avatar" style="background:${p.colorTag || '#0EA5A0'}">${(p.name || '?').charAt(0).toUpperCase()}</span>
      <span>
        <strong>${U.escapeHTML(p.name)}</strong>
        <small>${U.escapeHTML(p.relation || '')}</small>
      </span>
    </button>
  `).join('');
  openModal({
    title: t('person_switch'),
    bodyHTML: `<div class="person-list">${options}</div>
      <button class="btn btn--ghost btn--full" id="add-person-btn">+ ${t('person_add')}</button>`,
    onOpen: (modal) => {
      modal.querySelectorAll('.person-option').forEach((btn) => {
        btn.addEventListener('click', async () => {
          state.personId = btn.dataset.id;
          await DB.setSetting('activePersonId', state.personId);
          closeModal();
          renderPersonBar();
          route();
        });
      });
      modal.querySelector('#add-person-btn').addEventListener('click', () => {
        closeModal();
        openAddPersonForm();
      });
    }
  });
}

function openAddPersonForm() {
  openModal({
    title: t('person_add'),
    bodyHTML: `
      <form id="person-form" class="form">
        <label>${t('person_name')}<input required name="name" type="text" autocomplete="off"></label>
        <label>${t('person_relation')}<input name="relation" type="text" placeholder="${t('person_relation_placeholder')}"></label>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" id="cancel-person">${t('common_cancel')}</button>
          <button type="submit" class="btn btn--primary">${t('common_save')}</button>
        </div>
      </form>`,
    onOpen: (modal) => {
      modal.querySelector('#cancel-person').addEventListener('click', closeModal);
      modal.querySelector('#person-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const colors = ['#0EA5A0', '#6C63FF', '#FF8A5B', '#3D8BFD', '#E9578C', '#2FB380'];
        const person = {
          id: DB.uid(),
          name: fd.get('name').trim() || t('person_me'),
          relation: fd.get('relation').trim(),
          colorTag: colors[state.persons.length % colors.length],
          createdAt: Date.now()
        };
        await DB.put('persons', person);
        state.persons.push(person);
        state.personId = person.id;
        await DB.setSetting('activePersonId', person.id);
        closeModal();
        renderPersonBar();
        U.showToast(t('common_saved'));
        route();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Modal system
// ---------------------------------------------------------------------------
const modalRoot = document.getElementById('modal-root');

function openModal({ title, bodyHTML, onOpen, wide }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" id="modal-backdrop">
      <div class="modal ${wide ? 'modal--wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__header">
          <h2 id="modal-title">${title}</h2>
          <button class="icon-btn" id="modal-close" aria-label="${t('common_close')}">✕</button>
        </div>
        <div class="modal__body">${bodyHTML}</div>
      </div>
    </div>`;
  const backdrop = document.getElementById('modal-backdrop');
  const modal = backdrop.querySelector('.modal');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
  document.addEventListener('keydown', escCloseOnce);
  if (onOpen) onOpen(modal);
  const firstInput = modal.querySelector('input, textarea, select, button');
  if (firstInput) firstInput.focus();
}

function escCloseOnce(e) {
  if (e.key === 'Escape') closeModal();
}

function closeModal() {
  modalRoot.innerHTML = '';
  document.removeEventListener('keydown', escCloseOnce);
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
async function renderDashboard() {
  topbarTitle.textContent = t('appName');
  const person = currentPerson();
  const [medicines, doseLogs, bp, sugar, weight, other, notes] = await Promise.all([
    DB.getAll('medicines'), DB.getAll('doseLogs'), DB.getAll('vitalsBP'),
    DB.getAll('vitalsSugar'), DB.getAll('vitalsWeight'), DB.getAll('vitalsOther'), DB.getAll('notes')
  ]);
  const myMeds = medicines.filter((m) => m.personId === person.id && m.status !== 'completed');
  const today = U.todayISO();
  const todaysDoses = buildTodaysDoseList(myMeds, doseLogs, today);
  const takenCount = todaysDoses.filter((d) => d.status === 'taken').length;
  const adherence = todaysDoses.length ? Math.round((takenCount / todaysDoses.length) * 100) : 0;

  const greeting = getGreetingKey();
  const s = state.dashboardSections;

  app.innerHTML = `
    <section class="hero-card glass">
      <div class="hero-card__text">
        <p class="hero-card__eyebrow">${t(greeting)}</p>
        <h1>${U.escapeHTML(person.name)}</h1>
        <p class="hero-card__sub">${t('dash_adherence_today')}</p>
      </div>
      <div class="hero-card__ring" id="adherence-ring"></div>
    </section>

    <div class="quick-add-row" aria-label="${t('dash_quick_add')}">
      <button class="quick-add-chip" data-action="add-med">💊 ${t('med_add')}</button>
      <button class="quick-add-chip" data-action="add-bp">🩺 ${t('vitals_bp')}</button>
      <button class="quick-add-chip" data-action="add-sugar">🩸 ${t('vitals_sugar')}</button>
      <button class="quick-add-chip" data-action="add-weight">⚖️ ${t('vitals_weight')}</button>
      <button class="quick-add-chip" data-action="add-note">📝 ${t('note')}</button>
    </div>

    <div class="explore-grid">
      <a class="explore-tile glass" href="#/calendar"><span>📅</span>${t('nav_calendar')}</a>
      <a class="explore-tile glass" href="#/notes"><span>📝</span>${t('nav_notes')}</a>
      <a class="explore-tile glass" href="#/vault"><span>🗂️</span>${t('nav_vault')}</a>
      <a class="explore-tile glass" href="#/reports"><span>📄</span>${t('nav_reports')}</a>
      <a class="explore-tile glass" href="#/insights"><span>📊</span>${t('nav_insights')}</a>
      <a class="explore-tile glass" href="#/about"><span>ℹ️</span>${t('nav_about')}</a>
    </div>

    ${s.todayMeds ? `<section class="card-section">
      <h2>${t('dash_todays_medicines')}</h2>
      ${todaysDoses.length ? `<ul class="dose-list">${todaysDoses.map(doseRowHTML).join('')}</ul>` : emptyInline(t('dash_no_medicines'), t('dash_add_medicine'), 'add-med')}
    </section>` : ''}

    ${s.readings ? `<section class="card-section">
      <h2>${t('dash_latest_readings')}</h2>
      <div class="reading-grid">
        ${latestReadingCard('vitals_bp', bp.filter(v=>v.personId===person.id), (v)=>`${v.systolic}/${v.diastolic}`, 'mmHg', '#/vitals/bp')}
        ${latestReadingCard('vitals_sugar', sugar.filter(v=>v.personId===person.id), (v)=>`${v.value}`, 'mg/dL', '#/vitals/sugar')}
        ${latestReadingCard('vitals_weight', weight.filter(v=>v.personId===person.id), (v)=>`${v.value}`, 'kg', '#/vitals/weight')}
        ${latestReadingCard('other_heartrate', other.filter(v=>v.personId===person.id && v.type==='heartrate'), (v)=>`${v.value}`, 'bpm', '#/vitals/other')}
      </div>
    </section>` : ''}

    ${s.notes ? `<section class="card-section">
      <h2>${t('nav_notes')}</h2>
      ${renderRecentNotes(notes.filter((n) => n.personId === person.id))}
    </section>` : ''}

    ${s.activity ? `<section class="card-section">
      <h2>${t('dash_recent_activity')}</h2>
      ${renderMiniTimeline(await buildTimelineEvents(person.id, 6))}
    </section>` : ''}

    <div class="install-banner glass" id="install-banner" hidden>
      <div>
        <strong>${t('install_title')}</strong>
        <p>${t('install_body')}</p>
      </div>
      <button class="btn btn--primary" id="install-btn-dash">${t('install_button')}</button>
    </div>
  `;

  renderProgressRing(document.getElementById('adherence-ring'), {
    percent: adherence, label: t('dash_adherence_today'),
    sublabel: `${takenCount}/${todaysDoses.length || 0}`
  });

  app.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => dashboardQuickAction(btn.dataset.action));
  });
  app.querySelectorAll('[data-mark]').forEach((btn) => {
    btn.addEventListener('click', () => markDose(btn.dataset.medId, btn.dataset.time, btn.dataset.mark, today));
  });

  if (state.deferredInstallPrompt) {
    const banner = document.getElementById('install-banner');
    banner.hidden = false;
    document.getElementById('install-btn-dash').addEventListener('click', triggerInstall);
  }
}

function getGreetingKey() {
  const h = new Date().getHours();
  if (h < 12) return 'greeting_morning';
  if (h < 17) return 'greeting_afternoon';
  if (h < 21) return 'greeting_evening';
  return 'greeting_night';
}

function emptyInline(message, actionLabel, action) {
  return `<div class="empty-inline">
    <p>${message}</p>
    ${actionLabel ? `<button class="btn btn--soft" data-action="${action}">+ ${actionLabel}</button>` : ''}
  </div>`;
}

function latestReadingCard(labelKey, items, formatter, unit, link) {
  const sorted = [...items].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
  const latest = sorted[0];
  return `<a class="reading-card" href="${link}">
    <span class="reading-card__label">${t(labelKey)}</span>
    <span class="reading-card__value">${latest ? formatter(latest) : '—'}</span>
    <span class="reading-card__unit">${latest ? unit : t('common_none')}</span>
  </a>`;
}

function renderRecentNotes(notes) {
  const today = U.todayISO();
  const todays = notes.filter((n) => n.date === today).sort((a, b) => b.createdAt - a.createdAt);
  if (!todays.length) return emptyInline(t('notes_empty'), t('notes_add'), 'add-note');
  return `<ul class="note-list">${todays.slice(0, 4).map((n) => `
    <li class="note-item">
      <strong>${U.escapeHTML(n.title || t('note'))}</strong>
      <p>${U.escapeHTML((n.content || '').slice(0, 90))}${n.content && n.content.length > 90 ? '…' : ''}</p>
    </li>`).join('')}</ul>`;
}

function renderMiniTimeline(events) {
  if (!events.length) return `<p class="muted">${t('timeline_empty')}</p>`;
  return `<ul class="timeline-list timeline-list--mini">${events.map(timelineItemHTML).join('')}</ul>`;
}

async function dashboardQuickAction(action) {
  switch (action) {
    case 'add-med': openMedicineForm(); break;
    case 'add-bp': openVitalForm('bp'); break;
    case 'add-sugar': openVitalForm('sugar'); break;
    case 'add-weight': openVitalForm('weight'); break;
    case 'add-note': openNoteForm(); break;
    default: break;
  }
}

function triggerInstall() {
  if (!state.deferredInstallPrompt) return;
  state.deferredInstallPrompt.prompt();
  state.deferredInstallPrompt.userChoice.finally(() => {
    state.deferredInstallPrompt = null;
    const btn = document.getElementById('install-btn');
    if (btn) btn.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Dose helpers (medicines <-> today's timeline)
// ---------------------------------------------------------------------------
function scheduleTimesForMedicine(med) {
  const slotTimes = { morning: '08:00', afternoon: '13:00', evening: '18:00', night: '21:30' };
  const times = [];
  (med.schedule || []).forEach((slot) => {
    if (slotTimes[slot]) times.push(slotTimes[slot]);
  });
  (med.customTimes || []).forEach((ct) => { if (ct) times.push(ct); });
  return [...new Set(times)].sort();
}

function isMedicineActiveOn(med, iso) {
  if (med.status === 'paused') return false;
  if (med.startDate && iso < med.startDate) return false;
  if (med.endDate && iso > med.endDate) return false;
  return true;
}

function buildTodaysDoseList(meds, doseLogs, iso) {
  const rows = [];
  meds.forEach((med) => {
    if (!isMedicineActiveOn(med, iso)) return;
    scheduleTimesForMedicine(med).forEach((time) => {
      const log = doseLogs.find((l) => l.medicineId === med.id && l.date === iso && l.time === time);
      let status = log ? log.status : 'upcoming';
      if (!log && U.timeToMinutes(time) < U.timeToMinutes(U.nowTimeHM()) - 30) status = 'upcoming';
      rows.push({ medId: med.id, medName: med.name, medPhoto: med.photo, time, status, dosage: med.dosage, unit: med.unit });
    });
  });
  return rows.sort((a, b) => a.time.localeCompare(b.time));
}

function doseRowHTML(row) {
  const statusIcon = { taken: '✅', missed: '⚠️', skipped: '⏭️', upcoming: '🕒' };
  return `<li class="dose-row dose-row--${row.status}">
    <span class="dose-row__time">${row.time}</span>
    <span class="dose-row__avatar">${row.medPhoto ? `<img src="${row.medPhoto}" alt="">` : '💊'}</span>
    <span class="dose-row__info">
      <strong>${U.escapeHTML(row.medName)}</strong>
      <small>${U.escapeHTML(row.dosage || '')} ${U.escapeHTML(row.unit || '')}</small>
    </span>
    <span class="dose-row__status" title="${t('dose_' + row.status)}">${statusIcon[row.status]}</span>
    <span class="dose-row__actions">
      ${row.status !== 'taken' ? `<button class="chip-btn chip-btn--taken" data-mark="taken" data-med-id="${row.medId}" data-time="${row.time}" aria-label="${t('mark_taken')}">✓</button>` : ''}
      ${row.status !== 'missed' && row.status !== 'taken' ? `<button class="chip-btn chip-btn--missed" data-mark="missed" data-med-id="${row.medId}" data-time="${row.time}" aria-label="${t('mark_missed')}">✕</button>` : ''}
    </span>
  </li>`;
}

async function markDose(medId, time, status, iso) {
  const logs = await DB.getAll('doseLogs');
  const existing = logs.find((l) => l.medicineId === medId && l.date === iso && l.time === time);
  const entry = existing || { id: DB.uid(), medicineId: medId, personId: state.personId, date: iso, time };
  entry.status = status;
  entry.loggedAt = Date.now();
  await DB.put('doseLogs', entry);
  U.showToast(t('common_saved'));
  route();
}

// ---------------------------------------------------------------------------
// Medicines
// ---------------------------------------------------------------------------
async function renderMedicines() {
  topbarTitle.textContent = t('nav_medicines');
  const person = currentPerson();
  const meds = (await DB.getAll('medicines')).filter((m) => m.personId === person.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  app.innerHTML = `
    <div class="view-header">
      <h1>${t('med_title')}</h1>
      <button class="btn btn--primary" id="add-med-btn">+ ${t('med_add')}</button>
    </div>
    ${meds.length ? `<ul class="med-card-list">${meds.map(medCardHTML).join('')}</ul>` : `
      <div class="empty-state">
        <div class="empty-state__icon">💊</div>
        <h2>${t('med_empty')}</h2>
        <p>${t('med_empty_hint')}</p>
        <button class="btn btn--primary" id="add-med-btn-2">+ ${t('med_add')}</button>
      </div>`}
  `;
  const addBtn = document.getElementById('add-med-btn');
  if (addBtn) addBtn.addEventListener('click', () => openMedicineForm());
  const addBtn2 = document.getElementById('add-med-btn-2');
  if (addBtn2) addBtn2.addEventListener('click', () => openMedicineForm());

  app.querySelectorAll('[data-edit-med]').forEach((btn) => btn.addEventListener('click', () => openMedicineForm(btn.dataset.editMed)));
  app.querySelectorAll('[data-delete-med]').forEach((btn) => btn.addEventListener('click', () => deleteMedicine(btn.dataset.deleteMed)));
  app.querySelectorAll('[data-toggle-med]').forEach((btn) => btn.addEventListener('click', () => toggleMedicineStatus(btn.dataset.toggleMed)));
}

function medCardHTML(med) {
  const low = med.quantityRemaining !== '' && med.quantityRemaining !== undefined && med.refillAt !== '' && med.refillAt !== undefined
    && Number(med.quantityRemaining) <= Number(med.refillAt);
  const times = scheduleTimesForMedicine(med).join(' · ');
  return `<li class="med-card glass">
    <div class="med-card__photo">${med.photo ? `<img src="${med.photo}" alt="">` : '💊'}</div>
    <div class="med-card__body">
      <div class="med-card__top">
        <strong>${U.escapeHTML(med.name)}</strong>
        <span class="status-pill status-pill--${med.status}">${t('med_status_' + med.status)}</span>
      </div>
      <p class="muted">${U.escapeHTML(med.dosage || '')} ${U.escapeHTML(med.unit || '')} · ${times || '—'}</p>
      ${med.purpose ? `<p class="muted">${U.escapeHTML(med.purpose)}</p>` : ''}
      ${low ? `<p class="warning-text">⚠️ ${t('med_low_stock')}</p>` : ''}
      <div class="med-card__actions">
        <button class="btn btn--soft btn--sm" data-edit-med="${med.id}">${t('common_edit')}</button>
        <button class="btn btn--soft btn--sm" data-toggle-med="${med.id}">${med.status === 'paused' ? t('med_status_active') : t('med_status_paused')}</button>
        <button class="btn btn--danger btn--sm" data-delete-med="${med.id}">${t('common_delete')}</button>
      </div>
    </div>
  </li>`;
}

async function toggleMedicineStatus(id) {
  const med = await DB.get('medicines', id);
  if (!med) return;
  med.status = med.status === 'paused' ? 'active' : 'paused';
  await DB.put('medicines', med);
  route();
}

async function deleteMedicine(id) {
  if (!U.confirmDialog(t('med_delete_confirm'))) return;
  await DB.remove('medicines', id);
  const logs = await DB.getAll('doseLogs');
  for (const l of logs.filter((l) => l.medicineId === id)) await DB.remove('doseLogs', l.id);
  U.showToast(t('common_deleted'));
  route();
}

function openMedicineForm(editId) {
  buildMedicineFormModal(editId);
}

async function buildMedicineFormModal(editId) {
  const med = editId ? await DB.get('medicines', editId) : null;
  const schedule = med?.schedule || [];
  openModal({
    title: med ? t('med_edit') : t('med_add'),
    wide: true,
    bodyHTML: `
      <form id="med-form" class="form">
        <label>${t('med_name')}<input required name="name" type="text" value="${U.escapeHTML(med?.name || '')}"></label>
        <label>${t('med_photo')} <span class="muted">(${t('common_optional')})</span><input name="photo" type="file" accept="image/*" capture="environment"></label>
        ${med?.photo ? `<img class="form-photo-preview" src="${med.photo}" alt="">` : ''}
        <div class="form-row">
          <label>${t('med_dosage')}<input name="dosage" type="text" value="${U.escapeHTML(med?.dosage || '')}" placeholder="e.g. 500"></label>
          <label>${t('med_unit')}<input name="unit" type="text" value="${U.escapeHTML(med?.unit || '')}" placeholder="mg / tablet / ml"></label>
        </div>
        <fieldset class="checkbox-group">
          <legend>${t('med_schedule')}</legend>
          ${['morning', 'afternoon', 'evening', 'night'].map((slot) => `
            <label class="checkbox-pill"><input type="checkbox" name="schedule" value="${slot}" ${schedule.includes(slot) ? 'checked' : ''}> ${t('med_' + slot)}</label>
          `).join('')}
        </fieldset>
        <label>${t('med_custom_time')} <span class="muted">(${t('common_optional')})</span><input name="customTime" type="time" value="${med?.customTimes?.[0] || ''}"></label>
        <div class="form-row">
          <label>${t('med_start_date')}<input name="startDate" type="date" value="${med?.startDate || U.todayISO()}"></label>
          <label>${t('med_end_date')}<input name="endDate" type="date" value="${med?.endDate || ''}"></label>
        </div>
        <label>${t('med_instruction')}
          <select name="instruction">
            <option value="before_food" ${med?.instruction === 'before_food' ? 'selected' : ''}>${t('med_before_food')}</option>
            <option value="after_food" ${med?.instruction === 'after_food' ? 'selected' : ''}>${t('med_after_food')}</option>
            <option value="with_food" ${med?.instruction === 'with_food' ? 'selected' : ''}>${t('med_with_food')}</option>
            <option value="other" ${med?.instruction === 'other' ? 'selected' : ''}>${t('med_other')}</option>
          </select>
        </label>
        <label>${t('med_purpose')}<input name="purpose" type="text" value="${U.escapeHTML(med?.purpose || '')}"></label>
        <div class="form-row">
          <label>${t('med_quantity')}<input name="quantityRemaining" type="number" min="0" value="${med?.quantityRemaining ?? ''}"></label>
          <label>${t('med_refill_at')}<input name="refillAt" type="number" min="0" value="${med?.refillAt ?? ''}"></label>
        </div>
        <label>${t('med_notes')}<textarea name="notes" rows="2">${U.escapeHTML(med?.notes || '')}</textarea></label>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" id="cancel-med">${t('common_cancel')}</button>
          <button type="submit" class="btn btn--primary">${t('common_save')}</button>
        </div>
      </form>`,
    onOpen: (modal) => {
      modal.querySelector('#cancel-med').addEventListener('click', closeModal);
      modal.querySelector('#med-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!fd.get('name').trim()) { U.showToast(t('common_required_field')); return; }
        let photo = med?.photo || null;
        const file = fd.get('photo');
        if (file && file.size) {
          const result = await U.fileToDataURL(file);
          if (result) photo = result.dataURL;
        }
        const record = {
          id: med?.id || DB.uid(),
          personId: state.personId,
          name: fd.get('name').trim(),
          photo,
          dosage: fd.get('dosage').trim(),
          unit: fd.get('unit').trim(),
          schedule: fd.getAll('schedule'),
          customTimes: fd.get('customTime') ? [fd.get('customTime')] : [],
          frequency: 'daily',
          startDate: fd.get('startDate') || U.todayISO(),
          endDate: fd.get('endDate') || '',
          instruction: fd.get('instruction'),
          purpose: fd.get('purpose').trim(),
          quantityRemaining: fd.get('quantityRemaining'),
          refillAt: fd.get('refillAt'),
          notes: fd.get('notes').trim(),
          status: med?.status || 'active',
          createdAt: med?.createdAt || Date.now()
        };
        await DB.put('medicines', record);
        closeModal();
        U.showToast(t('common_saved'));
        route();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Vitals hub + shared vital form
// ---------------------------------------------------------------------------
async function renderVitalsHub() {
  topbarTitle.textContent = t('vitals_title');
  const cards = [
    ['vitals_bp', '#/vitals/bp', '🩺'],
    ['vitals_sugar', '#/vitals/sugar', '🩸'],
    ['vitals_weight', '#/vitals/weight', '⚖️'],
    ['vitals_other', '#/vitals/other', '📈']
  ];
  app.innerHTML = `
    <div class="view-header"><h1>${t('vitals_title')}</h1></div>
    <div class="vitals-grid">
      ${cards.map(([key, href, icon]) => `
        <a class="vitals-tile glass" href="${href}">
          <span class="vitals-tile__icon">${icon}</span>
          <strong>${t(key)}</strong>
        </a>
      `).join('')}
    </div>
  `;
}

const VITAL_CONFIG = {
  bp: { store: 'vitalsBP', titleKey: 'vitals_bp', emptyKey: 'bp_empty' },
  sugar: { store: 'vitalsSugar', titleKey: 'vitals_sugar', emptyKey: 'sugar_empty' },
  weight: { store: 'vitalsWeight', titleKey: 'vitals_weight', emptyKey: 'weight_empty' },
  other: { store: 'vitalsOther', titleKey: 'vitals_other', emptyKey: 'weight_empty' }
};

async function renderVitalDetail(kind) {
  const cfg = VITAL_CONFIG[kind];
  topbarTitle.textContent = t(cfg.titleKey);
  const person = currentPerson();
  const all = (await DB.getAll(cfg.store)).filter((v) => v.personId === person.id)
    .sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));

  app.innerHTML = `
    <div class="view-header">
      <h1>${t(cfg.titleKey)}</h1>
      <button class="btn btn--primary" id="add-vital-btn">+ ${t('common_add')}</button>
    </div>
    ${kind === 'bp' ? `<p class="info-banner">${t('bp_info_msg')}</p>` : ''}
    <div id="vital-chart" class="chart-card glass"></div>
    ${all.length ? statsRowHTML(kind, all) : ''}
    ${all.length ? `<ul class="reading-list">${all.map((v) => vitalRowHTML(kind, v)).join('')}</ul>` : `
      <div class="empty-state">
        <div class="empty-state__icon">📋</div>
        <h2>${t(cfg.emptyKey)}</h2>
        <button class="btn btn--primary" id="add-vital-btn-2">+ ${t('common_add')}</button>
      </div>`}
  `;

  renderVitalChart(kind, all);

  document.getElementById('add-vital-btn')?.addEventListener('click', () => openVitalForm(kind));
  document.getElementById('add-vital-btn-2')?.addEventListener('click', () => openVitalForm(kind));
  app.querySelectorAll('[data-delete-vital]').forEach((btn) => btn.addEventListener('click', () => deleteVital(cfg.store, btn.dataset.deleteVital)));
}

function statsRowHTML(kind, all) {
  if (kind === 'bp') {
    const sys = all.map((v) => Number(v.systolic));
    const dia = all.map((v) => Number(v.diastolic));
    return `<div class="stats-row">
      <div class="stat-pill"><span>${t('bp_average')}</span><strong>${Math.round(U.average(sys))}/${Math.round(U.average(dia))}</strong></div>
      <div class="stat-pill"><span>${t('bp_highest')}</span><strong>${Math.max(...sys)}/${Math.max(...dia)}</strong></div>
      <div class="stat-pill"><span>${t('bp_lowest')}</span><strong>${Math.min(...sys)}/${Math.min(...dia)}</strong></div>
    </div>`;
  }
  if (kind === 'weight' && all.length) {
    const sorted = [...all].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const current = Number(sorted[sorted.length - 1].value);
    const prev = sorted.length > 1 ? Number(sorted[sorted.length - 2].value) : current;
    const change = U.round1(current - prev);
    return `<div class="stats-row">
      <div class="stat-pill"><span>${t('weight_current')}</span><strong>${current} kg</strong></div>
      <div class="stat-pill"><span>${t('weight_previous')}</span><strong>${prev} kg</strong></div>
      <div class="stat-pill"><span>${t('weight_change')}</span><strong class="${change > 0 ? 'up' : change < 0 ? 'down' : ''}">${change > 0 ? '+' : ''}${change} kg</strong></div>
    </div>`;
  }
  if (kind === 'sugar') {
    const vals = all.map((v) => Number(v.value));
    return `<div class="stats-row">
      <div class="stat-pill"><span>${t('bp_average')}</span><strong>${Math.round(U.average(vals))} mg/dL</strong></div>
      <div class="stat-pill"><span>${t('bp_highest')}</span><strong>${Math.max(...vals)}</strong></div>
      <div class="stat-pill"><span>${t('bp_lowest')}</span><strong>${Math.min(...vals)}</strong></div>
    </div>`;
  }
  return '';
}

function renderVitalChart(kind, all) {
  const container = document.getElementById('vital-chart');
  const sorted = [...all].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).slice(-20);
  if (kind === 'bp') {
    renderLineChart(container, {
      emptyText: t(VITAL_CONFIG.bp.emptyKey),
      series: [
        { label: t('bp_systolic'), color: '#0EA5A0', values: sorted.map((v, i) => ({ x: i, y: Number(v.systolic), dateLabel: v.date.slice(5) })) },
        { label: t('bp_diastolic'), color: '#FF8A5B', values: sorted.map((v, i) => ({ x: i, y: Number(v.diastolic), dateLabel: v.date.slice(5) })) }
      ]
    });
  } else if (kind === 'sugar') {
    renderLineChart(container, {
      emptyText: t(VITAL_CONFIG.sugar.emptyKey),
      series: [{ label: t('vitals_sugar'), color: '#6C63FF', values: sorted.map((v, i) => ({ x: i, y: Number(v.value), dateLabel: v.date.slice(5) })) }]
    });
  } else if (kind === 'weight') {
    renderLineChart(container, {
      emptyText: t(VITAL_CONFIG.weight.emptyKey),
      series: [{ label: t('vitals_weight'), color: '#2FB380', values: sorted.map((v, i) => ({ x: i, y: Number(v.value), dateLabel: v.date.slice(5) })) }]
    });
  } else {
    const grouped = {};
    sorted.forEach((v) => { (grouped[v.type] = grouped[v.type] || []).push(v); });
    const first = Object.keys(grouped)[0];
    if (!first) { container.innerHTML = `<p class="chart-empty">${t('weight_empty')}</p>`; return; }
    renderLineChart(container, {
      emptyText: t('weight_empty'),
      series: [{ label: t('other_' + first) || first, color: '#3D8BFD', values: grouped[first].map((v, i) => ({ x: i, y: Number(v.value), dateLabel: v.date.slice(5) })) }]
    });
  }
}

function vitalRowHTML(kind, v) {
  let valueText = '';
  if (kind === 'bp') valueText = `${v.systolic}/${v.diastolic} mmHg${v.pulse ? ` · ${v.pulse} bpm` : ''}`;
  else if (kind === 'sugar') valueText = `${v.value} mg/dL — ${t('sugar_' + (v.context || 'other').replace('before', 'before_meal').replace('after', 'after_meal'))}`;
  else if (kind === 'weight') valueText = `${v.value} kg`;
  else valueText = `${v.value} ${v.unit || ''} — ${t('other_' + v.type) || v.type}`;

  return `<li class="reading-row glass">
    <div>
      <strong>${valueText}</strong>
      <p class="muted">${v.date} ${v.time || ''} ${v.period ? '· ' + t('med_' + v.period) : ''}</p>
      ${v.note ? `<p class="muted">${U.escapeHTML(v.note)}</p>` : ''}
    </div>
    ${v.image ? `<img class="reading-row__img" src="${v.image}" alt="">` : ''}
    <button class="icon-btn" data-delete-vital="${v.id}" aria-label="${t('common_delete')}">🗑️</button>
  </li>`;
}

async function deleteVital(store, id) {
  if (!U.confirmDialog(t('med_delete_confirm'))) return;
  await DB.remove(store, id);
  U.showToast(t('common_deleted'));
  route();
}

function openVitalForm(kind) {
  const cfg = VITAL_CONFIG[kind];
  let fields = '';
  if (kind === 'bp') {
    fields = `
      <div class="form-row">
        <label>${t('bp_systolic')}<input required name="systolic" type="number" min="1"></label>
        <label>${t('bp_diastolic')}<input required name="diastolic" type="number" min="1"></label>
      </div>
      <label>${t('bp_pulse')} <span class="muted">(${t('common_optional')})</span><input name="pulse" type="number" min="1"></label>
      <label>${t('med_schedule')}
        <select name="period">
          <option value="morning">${t('med_morning')}</option>
          <option value="afternoon">${t('med_afternoon')}</option>
          <option value="evening">${t('med_evening')}</option>
          <option value="night">${t('med_night')}</option>
        </select>
      </label>`;
  } else if (kind === 'sugar') {
    fields = `
      <label>${t('sugar_value')}<input required name="value" type="number" min="1"></label>
      <label>${t('med_schedule')}
        <select name="context">
          <option value="before">${t('sugar_before_meal')}</option>
          <option value="after">${t('sugar_after_meal')}</option>
          <option value="other">${t('sugar_context_other')}</option>
        </select>
      </label>`;
  } else if (kind === 'weight') {
    fields = `<label>${t('weight_value')}<input required name="value" type="number" step="0.1" min="1"></label>`;
  } else {
    fields = `
      <label>${t('common_category')}
        <select name="type">
          ${['heartrate', 'spo2', 'temperature', 'sleep', 'steps', 'custom'].filter((k) => state.trackers[k] !== false).map((k) => `<option value="${k}">${t('other_' + k)}</option>`).join('')}
        </select>
      </label>
      <div class="form-row">
        <label>${t('common_add')}<input required name="value" type="number" step="0.1"></label>
        <label>${t('med_unit')}<input name="unit" type="text" placeholder="bpm / % / °C"></label>
      </div>`;
  }

  openModal({
    title: t(kind === 'bp' ? 'bp_add' : kind === 'sugar' ? 'sugar_add' : kind === 'weight' ? 'weight_add' : 'other_add'),
    bodyHTML: `
      <form id="vital-form" class="form">
        ${fields}
        <div class="form-row">
          <label>${t('common_date')}<input name="date" type="date" value="${U.todayISO()}"></label>
          <label>${t('common_time')}<input name="time" type="time" value="${U.nowTimeHM()}"></label>
        </div>
        <label>${t('note')} <span class="muted">(${t('common_optional')})</span><textarea name="note" rows="2"></textarea></label>
        <label>${t('vault_category_reading')} <span class="muted">(${t('common_optional')})</span><input name="image" type="file" accept="image/*" capture="environment"></label>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" id="cancel-vital">${t('common_cancel')}</button>
          <button type="submit" class="btn btn--primary">${t('common_save')}</button>
        </div>
      </form>`,
    onOpen: (modal) => {
      modal.querySelector('#cancel-vital').addEventListener('click', closeModal);
      modal.querySelector('#vital-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        let image = null;
        const file = fd.get('image');
        if (file && file.size) {
          const result = await U.fileToDataURL(file);
          if (result) image = result.dataURL;
        }
        const base = {
          id: DB.uid(), personId: state.personId,
          date: fd.get('date') || U.todayISO(), time: fd.get('time') || U.nowTimeHM(),
          note: (fd.get('note') || '').trim(), image, createdAt: Date.now()
        };
        let record;
        if (kind === 'bp') record = { ...base, systolic: fd.get('systolic'), diastolic: fd.get('diastolic'), pulse: fd.get('pulse'), period: fd.get('period') };
        else if (kind === 'sugar') record = { ...base, value: fd.get('value'), context: fd.get('context') };
        else if (kind === 'weight') record = { ...base, value: fd.get('value') };
        else record = { ...base, value: fd.get('value'), unit: fd.get('unit'), type: fd.get('type') };
        await DB.put(cfg.store, record);
        closeModal();
        U.showToast(t('common_saved'));
        route();
      });
    }
  });
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
async function renderNotes() {
  topbarTitle.textContent = t('notes_title');
  const person = currentPerson();
  const notes = (await DB.getAll('notes')).filter((n) => n.personId === person.id).sort((a, b) => b.createdAt - a.createdAt);
  app.innerHTML = `
    <div class="view-header"><h1>${t('notes_title')}</h1><button class="btn btn--primary" id="add-note-btn">+ ${t('notes_add')}</button></div>
    ${notes.length ? `<ul class="note-card-list">${notes.map(noteCardHTML).join('')}</ul>` : `
      <div class="empty-state"><div class="empty-state__icon">📝</div><h2>${t('notes_empty')}</h2><p>${t('notes_empty_hint')}</p>
      <button class="btn btn--primary" id="add-note-btn-2">+ ${t('notes_add')}</button></div>`}
  `;
  document.getElementById('add-note-btn')?.addEventListener('click', () => openNoteForm());
  document.getElementById('add-note-btn-2')?.addEventListener('click', () => openNoteForm());
  app.querySelectorAll('[data-edit-note]').forEach((btn) => btn.addEventListener('click', () => openNoteForm(btn.dataset.editNote)));
  app.querySelectorAll('[data-delete-note]').forEach((btn) => btn.addEventListener('click', () => deleteNote(btn.dataset.deleteNote)));
}

function noteCardHTML(n) {
  return `<li class="note-card glass">
    <div class="note-card__top">
      <span class="category-pill">${t('note_category_' + (n.category || 'general'))}</span>
      <span class="muted">${n.date}</span>
    </div>
    <strong>${U.escapeHTML(n.title || t('note'))}</strong>
    <p>${U.escapeHTML(n.content || '')}</p>
    <div class="med-card__actions">
      <button class="btn btn--soft btn--sm" data-edit-note="${n.id}">${t('common_edit')}</button>
      <button class="btn btn--danger btn--sm" data-delete-note="${n.id}">${t('common_delete')}</button>
    </div>
  </li>`;
}

function openNoteForm(editId) {
  buildNoteForm(editId);
}

async function buildNoteForm(editId) {
  const note = editId ? await DB.get('notes', editId) : null;
  openModal({
    title: note ? t('common_edit') : t('notes_add'),
    bodyHTML: `
      <form id="note-form" class="form">
        <label>${t('note_title_field')}<input name="title" type="text" value="${U.escapeHTML(note?.title || '')}"></label>
        <label>${t('note_content_field')}<textarea required name="content" rows="4">${U.escapeHTML(note?.content || '')}</textarea></label>
        <label>${t('note_category')}
          <select name="category">
            ${['general', 'symptom', 'appointment', 'medicine', 'question'].map((c) => `<option value="${c}" ${note?.category === c ? 'selected' : ''}>${t('note_category_' + c)}</option>`).join('')}
          </select>
        </label>
        <label>${t('common_date')}<input name="date" type="date" value="${note?.date || U.todayISO()}"></label>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" id="cancel-note">${t('common_cancel')}</button>
          <button type="submit" class="btn btn--primary">${t('common_save')}</button>
        </div>
      </form>`,
    onOpen: (modal) => {
      modal.querySelector('#cancel-note').addEventListener('click', closeModal);
      modal.querySelector('#note-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        if (!fd.get('content').trim()) { U.showToast(t('common_required_field')); return; }
        const record = {
          id: note?.id || DB.uid(), personId: state.personId,
          title: fd.get('title').trim(), content: fd.get('content').trim(),
          category: fd.get('category'), date: fd.get('date') || U.todayISO(),
          createdAt: note?.createdAt || Date.now()
        };
        await DB.put('notes', record);
        closeModal();
        U.showToast(t('common_saved'));
        route();
      });
    }
  });
}

async function deleteNote(id) {
  if (!U.confirmDialog(t('med_delete_confirm'))) return;
  await DB.remove('notes', id);
  U.showToast(t('common_deleted'));
  route();
}

// ---------------------------------------------------------------------------
// Vault
// ---------------------------------------------------------------------------
async function renderVault() {
  topbarTitle.textContent = t('vault_title');
  const person = currentPerson();
  const items = (await DB.getAll('vault')).filter((v) => v.personId === person.id).sort((a, b) => b.createdAt - a.createdAt);
  app.innerHTML = `
    <div class="view-header"><h1>${t('vault_title')}</h1><button class="btn btn--primary" id="add-vault-btn">+ ${t('vault_add')}</button></div>
    ${items.length ? `<div class="vault-grid">${items.map(vaultCardHTML).join('')}</div>` : `
      <div class="empty-state"><div class="empty-state__icon">🗂️</div><h2>${t('vault_empty')}</h2><p>${t('vault_empty_hint')}</p>
      <button class="btn btn--primary" id="add-vault-btn-2">+ ${t('vault_add')}</button></div>`}
  `;
  document.getElementById('add-vault-btn')?.addEventListener('click', () => openVaultForm());
  document.getElementById('add-vault-btn-2')?.addEventListener('click', () => openVaultForm());
  app.querySelectorAll('[data-delete-vault]').forEach((btn) => btn.addEventListener('click', () => deleteVaultItem(btn.dataset.deleteVault)));
}

function vaultCardHTML(v) {
  const isImage = v.fileType && v.fileType.startsWith('image/');
  return `<div class="vault-card glass">
    <div class="vault-card__preview">${isImage ? `<img src="${v.fileDataURL}" alt="">` : '📄'}</div>
    <div class="vault-card__body">
      <strong>${U.escapeHTML(v.title)}</strong>
      <span class="category-pill">${t('vault_category_' + v.category)}</span>
      <p class="muted">${v.date}</p>
      ${v.note ? `<p class="muted">${U.escapeHTML(v.note)}</p>` : ''}
    </div>
    <button class="icon-btn" data-delete-vault="${v.id}" aria-label="${t('common_delete')}">🗑️</button>
  </div>`;
}

function openVaultForm() {
  openModal({
    title: t('vault_add'),
    bodyHTML: `
      <form id="vault-form" class="form">
        <label>${t('note_title_field')}<input required name="title" type="text"></label>
        <label>${t('common_category')}
          <select name="category">
            ${['prescription', 'lab', 'medicine_photo', 'reading', 'other'].map((c) => `<option value="${c}">${t('vault_category_' + c)}</option>`).join('')}
          </select>
        </label>
        <label>${t('common_date')}<input name="date" type="date" value="${U.todayISO()}"></label>
        <label>${t('vault_upload')} / ${t('vault_capture')}<input required name="file" type="file" accept="image/*,application/pdf" capture="environment"></label>
        <label>${t('note')} <span class="muted">(${t('common_optional')})</span><textarea name="note" rows="2"></textarea></label>
        <div class="form-actions">
          <button type="button" class="btn btn--ghost" id="cancel-vault">${t('common_cancel')}</button>
          <button type="submit" class="btn btn--primary">${t('common_save')}</button>
        </div>
      </form>`,
    onOpen: (modal) => {
      modal.querySelector('#cancel-vault').addEventListener('click', closeModal);
      modal.querySelector('#vault-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const file = fd.get('file');
        if (!file || !file.size) { U.showToast(t('common_required_field')); return; }
        const result = await U.fileToDataURL(file);
        const record = {
          id: DB.uid(), personId: state.personId, title: fd.get('title').trim(),
          category: fd.get('category'), date: fd.get('date') || U.todayISO(),
          note: (fd.get('note') || '').trim(), fileDataURL: result?.dataURL, fileType: result?.type || file.type,
          createdAt: Date.now()
        };
        await DB.put('vault', record);
        closeModal();
        U.showToast(t('common_saved'));
        route();
      });
    }
  });
}

async function deleteVaultItem(id) {
  if (!U.confirmDialog(t('med_delete_confirm'))) return;
  await DB.remove('vault', id);
  U.showToast(t('common_deleted'));
  route();
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------
async function buildTimelineEvents(personId, limit) {
  const [meds, doseLogs, bp, sugar, weight, other, notes, vault] = await Promise.all([
    DB.getAll('medicines'), DB.getAll('doseLogs'), DB.getAll('vitalsBP'), DB.getAll('vitalsSugar'),
    DB.getAll('vitalsWeight'), DB.getAll('vitalsOther'), DB.getAll('notes'), DB.getAll('vault')
  ]);
  const medMap = Object.fromEntries(meds.map((m) => [m.id, m]));
  const events = [];

  doseLogs.filter((l) => l.personId === personId && (l.status === 'taken' || l.status === 'missed')).forEach((l) => {
    events.push({ ts: `${l.date}T${l.time}`, date: l.date, category: 'medicine', icon: l.status === 'taken' ? '✅' : '⚠️',
      text: `${medMap[l.medicineId]?.name || t('nav_medicines')} — ${t('dose_' + l.status)}` });
  });
  bp.filter((v) => v.personId === personId).forEach((v) => events.push({ ts: `${v.date}T${v.time || '00:00'}`, date: v.date, category: 'bp', icon: '🩺', text: `${t('vitals_bp')}: ${v.systolic}/${v.diastolic}` }));
  sugar.filter((v) => v.personId === personId).forEach((v) => events.push({ ts: `${v.date}T${v.time || '00:00'}`, date: v.date, category: 'sugar', icon: '🩸', text: `${t('vitals_sugar')}: ${v.value}` }));
  weight.filter((v) => v.personId === personId).forEach((v) => events.push({ ts: `${v.date}T${v.time || '00:00'}`, date: v.date, category: 'weight', icon: '⚖️', text: `${t('vitals_weight')}: ${v.value} kg` }));
  other.filter((v) => v.personId === personId).forEach((v) => events.push({ ts: `${v.date}T${v.time || '00:00'}`, date: v.date, category: 'other', icon: '📈', text: `${t('other_' + v.type) || v.type}: ${v.value} ${v.unit || ''}` }));
  notes.filter((n) => n.personId === personId).forEach((n) => events.push({ ts: `${n.date}T00:00`, date: n.date, category: 'note', icon: '📝', text: `${t('note')}: ${n.title || n.content.slice(0, 40)}` }));
  vault.filter((v) => v.personId === personId).forEach((v) => events.push({ ts: `${v.date}T00:00`, date: v.date, category: 'vault', icon: '🗂️', text: `${t('vault_category_' + v.category)}: ${v.title}` }));

  events.sort((a, b) => b.ts.localeCompare(a.ts));
  return limit ? events.slice(0, limit) : events;
}

function timelineItemHTML(ev) {
  return `<li class="timeline-item">
    <span class="timeline-item__icon">${ev.icon}</span>
    <span class="timeline-item__body"><strong>${U.escapeHTML(ev.text)}</strong><small>${ev.date}</small></span>
  </li>`;
}

async function renderTimeline() {
  topbarTitle.textContent = t('timeline_title');
  const person = currentPerson();
  const events = await buildTimelineEvents(person.id);
  const categories = ['all', 'medicine', 'bp', 'sugar', 'weight', 'other', 'note', 'vault'];

  app.innerHTML = `
    <div class="view-header"><h1>${t('timeline_title')}</h1></div>
    <div class="filter-row" id="timeline-filters">
      ${categories.map((c) => `<button class="filter-chip ${c === 'all' ? 'filter-chip--active' : ''}" data-cat="${c}">${c === 'all' ? t('timeline_filter_all') : t(c === 'medicine' ? 'nav_medicines' : c === 'bp' ? 'vitals_bp' : c === 'sugar' ? 'vitals_sugar' : c === 'weight' ? 'vitals_weight' : c === 'other' ? 'vitals_other' : c === 'note' ? 'nav_notes' : 'nav_vault')}</button>`).join('')}
    </div>
    <div id="timeline-content">
      ${events.length ? `<ul class="timeline-list">${events.map(timelineItemHTML).join('')}</ul>` : `<p class="muted">${t('timeline_empty')}</p>`}
    </div>
  `;

  document.getElementById('timeline-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    document.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('filter-chip--active'));
    btn.classList.add('filter-chip--active');
    const cat = btn.dataset.cat;
    const filtered = cat === 'all' ? events : events.filter((ev) => ev.category === cat);
    document.getElementById('timeline-content').innerHTML = filtered.length
      ? `<ul class="timeline-list">${filtered.map(timelineItemHTML).join('')}</ul>`
      : `<p class="muted">${t('timeline_empty')}</p>`;
  });
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
async function renderCalendar(hash) {
  topbarTitle.textContent = t('calendar_title');
  const person = currentPerson();
  const params = new URLSearchParams((hash.split('?')[1] || ''));
  const now = new Date();
  const viewYear = Number(params.get('y')) || now.getFullYear();
  const viewMonth = Number(params.get('m')) || (now.getMonth() + 1);

  const events = await buildTimelineEvents(person.id);
  const eventsByDate = {};
  events.forEach((ev) => { (eventsByDate[ev.date] = eventsByDate[ev.date] || []).push(ev); });

  const firstOfMonth = new Date(viewYear, viewMonth - 1, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const monthNames = STRINGS[getLang()].month_names;
  const weekdayShort = STRINGS[getLang()].weekday_short;

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-cell cal-cell--empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${viewYear}-${U.pad2(viewMonth)}-${U.pad2(d)}`;
    const hasEvents = eventsByDate[iso];
    const isToday = iso === U.todayISO();
    cells += `<button class="cal-cell ${isToday ? 'cal-cell--today' : ''}" data-date="${iso}">
      <span>${d}</span>${hasEvents ? `<span class="cal-dot"></span>` : ''}
    </button>`;
  }

  const prevParams = viewMonth === 1 ? `y=${viewYear - 1}&m=12` : `y=${viewYear}&m=${viewMonth - 1}`;
  const nextParams = viewMonth === 12 ? `y=${viewYear + 1}&m=1` : `y=${viewYear}&m=${viewMonth + 1}`;

  app.innerHTML = `
    <div class="view-header"><h1>${t('calendar_title')}</h1></div>
    <div class="cal-nav">
      <button class="icon-btn" id="cal-prev" aria-label="prev">‹</button>
      <strong>${monthNames[viewMonth - 1]} ${viewYear}</strong>
      <button class="icon-btn" id="cal-next" aria-label="next">›</button>
    </div>
    <div class="cal-grid cal-grid--head">${weekdayShort.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
    <div id="cal-day-detail" class="card-section"></div>
  `;

  document.getElementById('cal-prev').addEventListener('click', () => go(`#/calendar?${prevParams}`));
  document.getElementById('cal-next').addEventListener('click', () => go(`#/calendar?${nextParams}`));
  app.querySelectorAll('.cal-cell[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iso = btn.dataset.date;
      const dayEvents = eventsByDate[iso] || [];
      document.getElementById('cal-day-detail').innerHTML = `
        <h2>${t('calendar_events_on')} ${iso}</h2>
        ${dayEvents.length ? `<ul class="timeline-list">${dayEvents.map(timelineItemHTML).join('')}</ul>` : `<p class="muted">${t('calendar_no_events')}</p>`}
      `;
    });
  });
}

// ---------------------------------------------------------------------------
// Monthly reports
// ---------------------------------------------------------------------------
async function renderReports() {
  topbarTitle.textContent = t('reports_title');
  const now = new Date();
  app.innerHTML = `
    <div class="view-header"><h1>${t('reports_title')}</h1></div>
    <div class="report-controls glass">
      <label>${t('reports_select_person')}
        <select id="rp-person">${state.persons.map((p) => `<option value="${p.id}" ${p.id === state.personId ? 'selected' : ''}>${U.escapeHTML(p.name)}</option>`).join('')}</select>
      </label>
      <label>${t('reports_select_month')}
        <select id="rp-month">${STRINGS[getLang()].month_names.map((m, i) => `<option value="${i + 1}" ${i + 1 === now.getMonth() + 1 ? 'selected' : ''}>${m}</option>`).join('')}</select>
      </label>
      <label>${t('reports_select_year')}
        <select id="rp-year">${[now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => `<option value="${y}">${y}</option>`).join('')}</select>
      </label>
      <button class="btn btn--primary" id="rp-generate">${t('reports_generate')}</button>
    </div>
    <div id="report-output"></div>
  `;
  document.getElementById('rp-generate').addEventListener('click', generateReport);
  generateReport();
}

async function generateReport() {
  const personId = document.getElementById('rp-person').value;
  const month = Number(document.getElementById('rp-month').value);
  const year = Number(document.getElementById('rp-year').value);
  const person = state.persons.find((p) => p.id === personId);
  const startISO = `${year}-${U.pad2(month)}-01`;
  const endISO = `${year}-${U.pad2(month)}-${U.pad2(new Date(year, month, 0).getDate())}`;
  const inRange = (d) => d >= startISO && d <= endISO;

  const [meds, doseLogs, bp, sugar, weight, other, notes, vault] = await Promise.all([
    DB.getAll('medicines'), DB.getAll('doseLogs'), DB.getAll('vitalsBP'), DB.getAll('vitalsSugar'),
    DB.getAll('vitalsWeight'), DB.getAll('vitalsOther'), DB.getAll('notes'), DB.getAll('vault')
  ]);
  const medMap = Object.fromEntries(meds.map((m) => [m.id, m]));
  const myLogs = doseLogs.filter((l) => l.personId === personId && inRange(l.date));
  const taken = myLogs.filter((l) => l.status === 'taken').length;
  const missed = myLogs.filter((l) => l.status === 'missed').length;
  const myBP = bp.filter((v) => v.personId === personId && inRange(v.date));
  const mySugar = sugar.filter((v) => v.personId === personId && inRange(v.date));
  const myWeight = weight.filter((v) => v.personId === personId && inRange(v.date)).sort((a, b) => a.date.localeCompare(b.date));
  const myOther = other.filter((v) => v.personId === personId && inRange(v.date));
  const myNotes = notes.filter((n) => n.personId === personId && inRange(n.date));
  const myVault = vault.filter((v) => v.personId === personId && inRange(v.date));
  const myMeds = meds.filter((m) => m.personId === personId);

  const monthLabel = `${STRINGS[getLang()].month_names[month - 1]} ${year}`;

  const section = (titleKey, bodyHTML) => `<div class="report-block"><h3>${t(titleKey)}</h3>${bodyHTML}</div>`;
  const noData = `<p class="muted">${t('reports_no_data')}</p>`;

  const html = `
    <div class="report-sheet glass" id="report-sheet">
      <div class="report-sheet__header">
        <div>
          <strong class="report-sheet__brand">${t('appName')}</strong>
          <span>${t('tagline')}</span>
        </div>
        <div class="report-sheet__meta">
          <span>${U.escapeHTML(person?.name || '')}</span>
          <span>${monthLabel}</span>
        </div>
      </div>

      ${section('med_title', myMeds.length ? `
        <p>${taken} ${t('dose_taken').toLowerCase()} · ${missed} ${t('dose_missed').toLowerCase()} (${myLogs.length} ${t('common_all').toLowerCase()})</p>
        <ul class="report-list">${myMeds.map((m) => `<li>${U.escapeHTML(m.name)} — ${U.escapeHTML(m.dosage || '')} ${U.escapeHTML(m.unit || '')}</li>`).join('')}</ul>` : noData)}

      ${section('vitals_bp', myBP.length ? `<p>${t('bp_average')}: ${Math.round(U.average(myBP.map((v) => Number(v.systolic))))}/${Math.round(U.average(myBP.map((v) => Number(v.diastolic))))} mmHg (${myBP.length} ${t('common_all').toLowerCase()})</p>` : noData)}

      ${section('vitals_sugar', mySugar.length ? `<p>${t('bp_average')}: ${Math.round(U.average(mySugar.map((v) => Number(v.value))))} mg/dL (${mySugar.length} ${t('common_all').toLowerCase()})</p>` : noData)}

      ${section('vitals_weight', myWeight.length ? `<p>${t('weight_current')}: ${myWeight[myWeight.length - 1].value} kg — ${t('weight_change')}: ${U.round1(Number(myWeight[myWeight.length - 1].value) - Number(myWeight[0].value))} kg</p>` : noData)}

      ${section('vitals_other', myOther.length ? `<ul class="report-list">${myOther.slice(0, 10).map((v) => `<li>${v.date}: ${t('other_' + v.type) || v.type} — ${v.value} ${v.unit || ''}</li>`).join('')}</ul>` : noData)}

      ${section('notes_title', myNotes.length ? `<ul class="report-list">${myNotes.map((n) => `<li>${n.date}: ${U.escapeHTML(n.title || n.content.slice(0, 60))}</li>`).join('')}</ul>` : noData)}

      ${section('vault_title', myVault.length ? `<ul class="report-list">${myVault.map((v) => `<li>${v.date}: ${U.escapeHTML(v.title)} (${t('vault_category_' + v.category)})</li>`).join('')}</ul>` : noData)}

      <p class="report-sheet__disclaimer">${t('insights_disclaimer')}</p>
    </div>
    <div class="report-actions">
      <button class="btn btn--soft" id="toggle-doctor-mode">${t('reports_doctor_mode')}</button>
      <button class="btn btn--primary" id="print-report">🖨️ ${t('reports_print')}</button>
    </div>
  `;
  document.getElementById('report-output').innerHTML = html;
  document.getElementById('print-report').addEventListener('click', () => window.print());
  document.getElementById('toggle-doctor-mode').addEventListener('click', () => {
    document.getElementById('report-sheet').classList.toggle('report-sheet--doctor');
  });
}

// ---------------------------------------------------------------------------
// Insights (rule-based, informational only — never diagnostic)
// ---------------------------------------------------------------------------
async function renderInsights() {
  topbarTitle.textContent = t('insights_title');
  const person = currentPerson();
  const [doseLogs, bp, sugar, weight] = await Promise.all([
    DB.getAll('doseLogs'), DB.getAll('vitalsBP'), DB.getAll('vitalsSugar'), DB.getAll('vitalsWeight')
  ]);
  const cutoff = U.daysAgo(30);
  const myLogs = doseLogs.filter((l) => l.personId === person.id && l.date >= cutoff);
  const myBP = bp.filter((v) => v.personId === person.id && v.date >= cutoff);
  const mySugar = sugar.filter((v) => v.personId === person.id && v.date >= cutoff);
  const myWeight = weight.filter((v) => v.personId === person.id && v.date >= cutoff).sort((a, b) => a.date.localeCompare(b.date));

  const insights = [];

  if (myLogs.length >= 5) {
    const taken = myLogs.filter((l) => l.status === 'taken').length;
    const pct = Math.round((taken / myLogs.length) * 100);
    insights.push(`💊 ${person.name}: ${pct}% ${getLang() === 'ur' ? 'خوراکیں گزشتہ 30 دنوں میں وقت پر لی گئیں۔' : 'of doses were taken on schedule over the last 30 days.'}`);
  }

  if (myBP.length >= 3) {
    const morning = myBP.filter((v) => v.period === 'morning');
    const evening = myBP.filter((v) => v.period === 'evening');
    if (morning.length && evening.length) {
      const moreLabel = morning.length > evening.length ? t('med_morning') : t('med_evening');
      insights.push(`🩺 ${getLang() === 'ur' ? `بلڈ پریشر زیادہ تر ${moreLabel} میں ریکارڈ کیا گیا۔` : `Blood pressure was recorded more often in the ${moreLabel.toLowerCase()}.`}`);
    }
    const avgSys = Math.round(U.average(myBP.map((v) => Number(v.systolic))));
    insights.push(`🩺 ${getLang() === 'ur' ? `اوسط سسٹولک ریڈنگ ${avgSys} تھی۔` : `Average systolic reading over the last 30 days was ${avgSys} mmHg.`}`);
  }

  if (mySugar.length >= 3) {
    const avg = Math.round(U.average(mySugar.map((v) => Number(v.value))));
    insights.push(`🩸 ${getLang() === 'ur' ? `اوسط بلڈ شوگر ${avg} mg/dL رہی۔` : `Average blood sugar over the last 30 days was ${avg} mg/dL.`}`);
  }

  if (myWeight.length >= 2) {
    const change = U.round1(Number(myWeight[myWeight.length - 1].value) - Number(myWeight[0].value));
    insights.push(`⚖️ ${getLang() === 'ur' ? `وزن میں ${change > 0 ? '+' : ''}${change} کلوگرام تبدیلی ہوئی۔` : `Weight changed by ${change > 0 ? '+' : ''}${change} kg over this period.`}`);
  }

  const byDayCount = {};
  [...myBP, ...mySugar, ...myWeight].forEach((v) => { byDayCount[v.date] = (byDayCount[v.date] || 0) + 1; });
  const busiestDay = Object.entries(byDayCount).sort((a, b) => b[1] - a[1])[0];
  if (busiestDay && busiestDay[1] >= 3) {
    insights.push(`📅 ${getLang() === 'ur' ? `${busiestDay[0]} کو سب سے زیادہ ریڈنگز درج کی گئیں۔` : `The most readings were recorded on ${busiestDay[0]}.`}`);
  }

  app.innerHTML = `
    <div class="view-header"><h1>${t('insights_title')}</h1></div>
    ${insights.length ? `<ul class="insight-list">${insights.map((i) => `<li class="insight-card glass">${i}</li>`).join('')}</ul>` : `
      <div class="empty-state"><div class="empty-state__icon">📊</div><h2>${t('insights_empty')}</h2></div>`}
    <p class="report-sheet__disclaimer">${t('insights_disclaimer')}</p>
  `;
}

// ---------------------------------------------------------------------------
// Global search
// ---------------------------------------------------------------------------
async function renderSearch() {
  topbarTitle.textContent = t('nav_search');
  app.innerHTML = `
    <div class="search-box">
      <input type="search" id="global-search" placeholder="${t('search_placeholder')}" autofocus>
    </div>
    <div id="search-results"></div>
  `;
  const input = document.getElementById('global-search');
  input.addEventListener('input', U.debounce(() => runSearch(input.value.trim()), 200));
}

async function runSearch(query) {
  const resultsEl = document.getElementById('search-results');
  if (!query) { resultsEl.innerHTML = ''; return; }
  const q = query.toLowerCase();
  const person = currentPerson();
  const [meds, notes, vault, bp, sugar, weight] = await Promise.all([
    DB.getAll('medicines'), DB.getAll('notes'), DB.getAll('vault'), DB.getAll('vitalsBP'), DB.getAll('vitalsSugar'), DB.getAll('vitalsWeight')
  ]);
  const results = [];
  meds.filter((m) => m.personId === person.id && (m.name.toLowerCase().includes(q) || (m.purpose || '').toLowerCase().includes(q)))
    .forEach((m) => results.push({ icon: '💊', text: m.name, sub: m.dosage, href: '#/medicines' }));
  notes.filter((n) => n.personId === person.id && ((n.title || '').toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)))
    .forEach((n) => results.push({ icon: '📝', text: n.title || n.content.slice(0, 40), sub: n.date, href: '#/notes' }));
  vault.filter((v) => v.personId === person.id && v.title.toLowerCase().includes(q))
    .forEach((v) => results.push({ icon: '🗂️', text: v.title, sub: v.date, href: '#/vault' }));
  if ('blood pressure'.includes(q) || 'بلڈ پریشر'.includes(q)) bp.filter((v) => v.personId === person.id).forEach((v) => results.push({ icon: '🩺', text: `${v.systolic}/${v.diastolic}`, sub: v.date, href: '#/vitals/bp' }));
  if ('sugar'.includes(q) || 'شوگر'.includes(q)) sugar.filter((v) => v.personId === person.id).forEach((v) => results.push({ icon: '🩸', text: `${v.value}`, sub: v.date, href: '#/vitals/sugar' }));
  if ('weight'.includes(q) || 'وزن'.includes(q)) weight.filter((v) => v.personId === person.id).forEach((v) => results.push({ icon: '⚖️', text: `${v.value} kg`, sub: v.date, href: '#/vitals/weight' }));

  resultsEl.innerHTML = results.length
    ? `<ul class="search-result-list">${results.slice(0, 40).map((r) => `<li><a href="${r.href}"><span>${r.icon}</span><span><strong>${U.escapeHTML(r.text)}</strong><small>${U.escapeHTML(r.sub || '')}</small></span></a></li>`).join('')}</ul>`
    : `<p class="muted">${t('search_no_results')}</p>`;
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
async function renderSettings() {
  topbarTitle.textContent = t('settings_title');
  const notifSupported = 'Notification' in window;
  app.innerHTML = `
    <div class="view-header"><h1>${t('settings_title')}</h1></div>

    <section class="settings-block glass">
      <h2>${t('settings_language')}</h2>
      <div class="segmented">
        <button class="segmented__btn ${state.lang === 'en' ? 'segmented__btn--active' : ''}" data-lang="en">English</button>
        <button class="segmented__btn ${state.lang === 'ur' ? 'segmented__btn--active' : ''}" data-lang="ur">اردو</button>
      </div>
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_theme')}</h2>
      <div class="segmented">
        <button class="segmented__btn ${state.theme === 'light' ? 'segmented__btn--active' : ''}" data-theme="light">${t('theme_light')}</button>
        <button class="segmented__btn ${state.theme === 'dark' ? 'segmented__btn--active' : ''}" data-theme="dark">${t('theme_dark')}</button>
        <button class="segmented__btn ${state.theme === 'medical' ? 'segmented__btn--active' : ''}" data-theme="medical">${t('theme_medical')}</button>
      </div>
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_dashboard_sections')}</h2>
      <div class="toggle-list">
        ${Object.entries({ todayMeds: 'dash_todays_medicines', readings: 'dash_latest_readings', notes: 'nav_notes', activity: 'dash_recent_activity' }).map(([key, labelKey]) => `
          <label class="toggle-row"><span>${t(labelKey)}</span><input type="checkbox" data-section="${key}" ${state.dashboardSections[key] ? 'checked' : ''}></label>
        `).join('')}
      </div>
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_trackers')}</h2>
      <div class="toggle-list">
        ${['heartrate', 'spo2', 'temperature', 'sleep', 'steps'].map((k) => `
          <label class="toggle-row"><span>${t('other_' + k)}</span><input type="checkbox" data-tracker="${k}" ${state.trackers[k] !== false ? 'checked' : ''}></label>
        `).join('')}
      </div>
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_notifications')}</h2>
      ${notifSupported ? `
        <label class="toggle-row"><span>${t('settings_notifications_enable')}</span><input type="checkbox" id="notif-toggle" ${state.notificationsEnabled ? 'checked' : ''}></label>
      ` : `<p class="muted">${t('settings_notifications_unsupported')}</p>`}
    </section>

    <section class="settings-block glass">
      <h2>${t('install_title')}</h2>
      <p>${t('install_body')}</p>
      <button class="btn btn--primary" id="install-btn-settings" ${state.deferredInstallPrompt ? '' : 'disabled'}>${t('install_button')}</button>
      ${state.deferredInstallPrompt ? '' : `<p class="muted">${t('install_unsupported')}</p>`}
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_privacy_title')}</h2>
      <p>${t('settings_privacy_body')}</p>
    </section>

    <section class="settings-block glass">
      <h2>${t('settings_data')}</h2>
      <div class="form-actions form-actions--stack">
        <button class="btn btn--soft btn--full" id="export-data-btn">⬇️ ${t('settings_export')}</button>
        <label class="btn btn--soft btn--full file-btn">⬆️ ${t('settings_import')}<input type="file" id="import-data-input" accept="application/json" hidden></label>
        <button class="btn btn--danger btn--full" id="clear-data-btn">🗑️ ${t('settings_clear')}</button>
      </div>
    </section>

    <p class="muted app-version">${t('appName')} · v1.0</p>
  `;

  app.querySelectorAll('[data-lang]').forEach((btn) => btn.addEventListener('click', async () => {
    state.lang = btn.dataset.lang;
    setLang(state.lang);
    await DB.setSetting('lang', state.lang);
    renderPersonBar(); renderBottomNav(); route();
  }));
  app.querySelectorAll('[data-theme]').forEach((btn) => btn.addEventListener('click', async () => {
    state.theme = btn.dataset.theme;
    applyTheme(state.theme);
    await DB.setSetting('theme', state.theme);
    route();
  }));
  app.querySelectorAll('[data-section]').forEach((cb) => cb.addEventListener('change', async () => {
    state.dashboardSections[cb.dataset.section] = cb.checked;
    await DB.setSetting('dashboardSections', state.dashboardSections);
  }));
  app.querySelectorAll('[data-tracker]').forEach((cb) => cb.addEventListener('change', async () => {
    state.trackers[cb.dataset.tracker] = cb.checked;
    await DB.setSetting('trackers', state.trackers);
  }));
  document.getElementById('notif-toggle')?.addEventListener('change', async (e) => {
    if (e.target.checked) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        e.target.checked = false;
        U.showToast(t('settings_notifications_denied'));
        return;
      }
    }
    state.notificationsEnabled = e.target.checked;
    await DB.setSetting('notificationsEnabled', state.notificationsEnabled);
  });
  document.getElementById('install-btn-settings')?.addEventListener('click', triggerInstall);
  document.getElementById('export-data-btn').addEventListener('click', exportData);
  document.getElementById('import-data-input').addEventListener('change', importData);
  document.getElementById('clear-data-btn').addEventListener('click', clearAllData);
}

async function exportData() {
  const data = await DB.exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medisaathi-backup-${U.todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  U.showToast(t('common_saved'));
}

async function importData(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await DB.importAllData(data);
    U.showToast(t('common_saved'));
    await ensurePersonExists();
    renderPersonBar();
    route();
  } catch (err) {
    console.error(err);
    U.showToast(t('common_error_generic'));
  } finally {
    e.target.value = '';
  }
}

async function clearAllData() {
  if (!U.confirmDialog(t('settings_clear_confirm'))) return;
  await DB.clearAllData();
  await ensurePersonExists();
  renderPersonBar();
  U.showToast(t('common_deleted'));
  route();
}

// ---------------------------------------------------------------------------
// About
// ---------------------------------------------------------------------------
function renderAbout() {
  topbarTitle.textContent = t('nav_about');
  const features = [
    'nav_medicines', 'vitals_title', 'timeline_title', 'nav_calendar', 'notes_title', 'vault_title', 'reports_title', 'insights_title'
  ];
  app.innerHTML = `
    <div class="view-header"><h1>${t('about_title')}</h1></div>
    <section class="about-hero glass">
      <div class="about-hero__logo">🩺</div>
      <h2>${t('appName')}</h2>
      <p>${t('tagline')}</p>
    </section>
    <section class="card-section">
      <p>${t('about_body')}</p>
    </section>
    <section class="card-section">
      <h2>${t('about_features_title')}</h2>
      <ul class="feature-list">${features.map((f) => `<li>✓ ${t(f)}</li>`).join('')}</ul>
    </section>
    <section class="card-section warning-box">
      <p>${t('about_disclaimer')}</p>
    </section>
    <section class="card-section about-developer">
      <p class="muted">${t('about_developer')}</p>
      <strong>${t('about_developer_name')}</strong>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// PWA: service worker + reminders
// ---------------------------------------------------------------------------
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}

let lastReminderCheckMinute = null;
async function checkDueReminders() {
  if (!state.notificationsEnabled) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const nowHM = U.nowTimeHM();
  if (nowHM === lastReminderCheckMinute) return;
  lastReminderCheckMinute = nowHM;

  const [meds, doseLogs] = await Promise.all([DB.getAll('medicines'), DB.getAll('doseLogs')]);
  const today = U.todayISO();
  meds.filter((m) => isMedicineActiveOn(m, today)).forEach((med) => {
    scheduleTimesForMedicine(med).forEach((time) => {
      if (time !== nowHM) return;
      const already = doseLogs.find((l) => l.medicineId === med.id && l.date === today && l.time === time);
      if (already) return;
      try {
        new Notification(t('appName'), {
          body: `${med.name} — ${med.dosage || ''} ${med.unit || ''}`.trim(),
          icon: './icons/icon-192.png',
          tag: `${med.id}-${time}`
        });
      } catch (err) {
        console.warn('Notification failed:', err);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Module scripts execute after the DOM has been parsed (like `defer`), so it
// is safe to boot immediately rather than waiting for DOMContentLoaded.
boot();

window.__medisaathi_go = go;
export { state, app, go, currentPerson, openModal, closeModal, boot, applyTheme, triggerInstall, renderPersonBar, renderBottomNav };
