// utils.js — small shared helpers used across the app.

export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function nowTimeHM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function isoFromDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateHuman(iso, lang, monthNames) {
  if (!iso) return '';
  const d = parseISO(iso);
  const month = monthNames[d.getMonth()];
  return lang === 'ur' ? `${d.getDate()} ${month} ${d.getFullYear()}` : `${month} ${d.getDate()}, ${d.getFullYear()}`;
}

export function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoFromDate(d);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoFromDate(d);
}

export function diffDays(isoA, isoB) {
  const a = parseISO(isoA);
  const b = parseISO(isoB);
  return Math.round((a - b) / 86400000);
}

export function timeToMinutes(hm) {
  if (!hm) return 0;
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

export function fileToDataURL(file, maxDim = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file) { resolve(null); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      // Downscale images so IndexedDB doesn't balloon in size.
      if (!file.type.startsWith('image/')) {
        resolve({ dataURL: reader.result, type: file.type, isImage: false, name: file.name });
        return;
      }
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataURL = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataURL, type: 'image/jpeg', isImage: true, name: file.name });
      };
      img.onerror = () => resolve({ dataURL: reader.result, type: file.type, isImage: false, name: file.name });
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function escapeHTML(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function average(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

let toastTimer = null;
export function showToast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.classList.add('toast--visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('toast--visible'), 2600);
}

export function confirmDialog(message) {
  // Wraps window.confirm so behaviour is easy to swap out later if desired.
  return window.confirm(message);
}

export function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}
