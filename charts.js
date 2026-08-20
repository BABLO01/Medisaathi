// charts.js — minimal, dependency-free SVG chart renderer.
// Kept intentionally small: no CDN chart library is loaded, so charts
// keep working even fully offline on GitHub Pages.

function svgEl(tag, attrs) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

/**
 * Renders a simple line chart into `container`.
 * series: [{ label, values: [{x:number index, y:number, dateLabel:string}], color }]
 */
export function renderLineChart(container, { series, yLabelFormatter, emptyText, height = 180 }) {
  container.innerHTML = '';
  const allPoints = series.flatMap((s) => s.values);
  if (!allPoints.length) {
    container.innerHTML = `<p class="chart-empty">${emptyText}</p>`;
    return;
  }
  const width = Math.max(container.clientWidth || 320, 280);
  const padding = { top: 16, right: 16, bottom: 28, left: 40 };
  const ys = allPoints.map((p) => p.y);
  let min = Math.min(...ys);
  let max = Math.max(...ys);
  if (min === max) { min -= 1; max += 1; }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;

  const xCount = Math.max(...series.map((s) => s.values.length), 2);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': 'trend chart' });

  // Gridlines + y labels
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const yVal = min + ((max - min) * i) / gridCount;
    const yPos = padding.top + innerH - (innerH * i) / gridCount;
    const line = svgEl('line', {
      x1: padding.left, x2: width - padding.right, y1: yPos, y2: yPos,
      stroke: 'var(--chart-grid, rgba(120,140,150,0.18))', 'stroke-width': 1
    });
    svg.appendChild(line);
    const label = svgEl('text', {
      x: padding.left - 8, y: yPos + 4, 'text-anchor': 'end',
      class: 'chart-axis-label'
    });
    label.textContent = yLabelFormatter ? yLabelFormatter(yVal) : Math.round(yVal);
    svg.appendChild(label);
  }

  series.forEach((s) => {
    if (!s.values.length) return;
    const points = s.values.map((p, i) => {
      const x = padding.left + (s.values.length > 1 ? (innerW * i) / (s.values.length - 1) : innerW / 2);
      const y = padding.top + innerH - ((p.y - min) / (max - min)) * innerH;
      return { x, y, ...p };
    });
    const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const path = svgEl('path', { d: pathD, fill: 'none', stroke: s.color || 'var(--accent)', 'stroke-width': 2.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(path);

    points.forEach((p) => {
      const dot = svgEl('circle', { cx: p.x, cy: p.y, r: 3.5, fill: s.color || 'var(--accent)' });
      const title = svgEl('title', {});
      title.textContent = `${p.dateLabel || ''}: ${p.y}`;
      dot.appendChild(title);
      svg.appendChild(dot);
    });

    // x-axis labels (first, middle, last only, to avoid clutter)
    const labelIdxs = new Set([0, points.length - 1, Math.floor(points.length / 2)]);
    labelIdxs.forEach((idx) => {
      const p = points[idx];
      if (!p) return;
      const label = svgEl('text', { x: p.x, y: height - 6, 'text-anchor': 'middle', class: 'chart-axis-label' });
      label.textContent = p.dateLabel || '';
      svg.appendChild(label);
    });
  });

  container.appendChild(svg);

  if (series.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    series.forEach((s) => {
      const item = document.createElement('span');
      item.className = 'chart-legend-item';
      item.innerHTML = `<i style="background:${s.color || 'var(--accent)'}"></i>${s.label}`;
      legend.appendChild(item);
    });
    container.appendChild(legend);
  }
}

/**
 * Renders a simple vertical bar chart.
 * bars: [{ label, value, color }]
 */
export function renderBarChart(container, { bars, emptyText, height = 160, valueFormatter }) {
  container.innerHTML = '';
  if (!bars.length || bars.every((b) => !b.value)) {
    container.innerHTML = `<p class="chart-empty">${emptyText}</p>`;
    return;
  }
  const width = Math.max(container.clientWidth || 320, 280);
  const padding = { top: 16, right: 12, bottom: 28, left: 12 };
  const max = Math.max(...bars.map((b) => b.value), 1);
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const barGap = 10;
  const barW = Math.max((innerW - barGap * (bars.length - 1)) / bars.length, 8);

  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, width: '100%', height, role: 'img', 'aria-label': 'bar chart' });

  bars.forEach((b, i) => {
    const barH = (b.value / max) * innerH;
    const x = padding.left + i * (barW + barGap);
    const y = padding.top + innerH - barH;
    const rect = svgEl('rect', { x, y, width: barW, height: Math.max(barH, 2), rx: 6, fill: b.color || 'var(--accent)' });
    const title = svgEl('title', {});
    title.textContent = `${b.label}: ${valueFormatter ? valueFormatter(b.value) : b.value}`;
    rect.appendChild(title);
    svg.appendChild(rect);

    const label = svgEl('text', { x: x + barW / 2, y: height - 6, 'text-anchor': 'middle', class: 'chart-axis-label' });
    label.textContent = b.label;
    svg.appendChild(label);
  });

  container.appendChild(svg);
}

/**
 * Renders a compact circular progress ring (used for today's adherence).
 */
export function renderProgressRing(container, { percent, label, sublabel }) {
  container.innerHTML = '';
  const size = 108;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(Math.max(percent, 0), 100) / 100) * c;

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': label });
  const bg = svgEl('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--ring-track, rgba(120,140,150,0.18))', 'stroke-width': stroke });
  const fg = svgEl('circle', {
    cx: size / 2, cy: size / 2, r, fill: 'none', stroke: 'var(--accent)', 'stroke-width': stroke,
    'stroke-linecap': 'round', 'stroke-dasharray': c, 'stroke-dashoffset': offset,
    transform: `rotate(-90 ${size / 2} ${size / 2})`
  });
  fg.classList.add('ring-progress');
  svg.appendChild(bg);
  svg.appendChild(fg);
  container.appendChild(svg);

  const textWrap = document.createElement('div');
  textWrap.className = 'ring-text';
  textWrap.innerHTML = `<strong>${Math.round(percent)}%</strong><span>${sublabel || ''}</span>`;
  container.appendChild(textWrap);
}
