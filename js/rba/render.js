const STATUS_STYLES = {
  critical: {
    banner: 'border-rose-500 bg-rose-50',
    icon: 'fa-triangle-exclamation text-rose-600',
    title: 'text-rose-900',
    badge: 'bg-rose-100 text-rose-800',
    muted: 'text-rose-800/80',
  },
  warning: {
    banner: 'border-amber-500 bg-amber-50',
    icon: 'fa-circle-exclamation text-amber-600',
    title: 'text-amber-900',
    badge: 'bg-amber-100 text-amber-800',
    muted: 'text-amber-800/80',
  },
  info: {
    banner: 'border-sky-400 bg-sky-50',
    icon: 'fa-circle-info text-sky-600',
    title: 'text-sky-900',
    badge: 'bg-sky-100 text-sky-800',
    muted: 'text-sky-800/80',
  },
  positive: {
    banner: 'border-emerald-500 bg-emerald-50',
    icon: 'fa-circle-check text-emerald-600',
    title: 'text-emerald-900',
    badge: 'bg-emerald-100 text-emerald-800',
    muted: 'text-emerald-800/80',
  },
  neutral: {
    banner: 'border-stone-300 bg-stone-50',
    icon: 'fa-hourglass-half text-stone-500',
    title: 'text-stone-800',
    badge: 'bg-stone-200 text-stone-700',
    muted: 'text-stone-600',
  },
};

function styleFor(status) {
  return STATUS_STYLES[status] ?? STATUS_STYLES.neutral;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function appendFinding(list, finding) {
  const style = styleFor(finding.severity);
  const item = element('div', 'rounded-xl border border-white/70 bg-white/70 p-3');

  const header = element('div', 'flex items-start gap-2');
  const icon = element('i', `fa-solid ${style.icon} mt-0.5 text-xs`);
  icon.setAttribute('aria-hidden', 'true');
  header.appendChild(icon);

  const heading = element('div', 'min-w-0 flex-1');
  const titleRow = element('div', 'flex flex-wrap items-center gap-2');
  titleRow.appendChild(element('p', `text-xs font-extrabold ${style.title}`, finding.title));
  if (finding.courseCode) {
    titleRow.appendChild(
      element('span', 'rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600', finding.courseCode),
    );
  }
  heading.appendChild(titleRow);

  heading.appendChild(element('p', `mt-1 text-[11px] leading-relaxed ${style.muted}`, finding.message));

  if (finding.recommendation) {
    const recommendation = element('p', 'mt-1.5 flex items-start gap-1.5 text-[11px] font-semibold text-stone-700');
    const bulb = element('i', 'fa-solid fa-lightbulb mt-0.5 text-[10px] text-amber-500');
    bulb.setAttribute('aria-hidden', 'true');
    recommendation.appendChild(bulb);
    recommendation.appendChild(element('span', '', finding.recommendation));
    heading.appendChild(recommendation);
  }

  if (typeof finding.href === 'string' && finding.href.startsWith('course_scores.html?')) {
    const link = element('a', 'mt-2 inline-flex text-[11px] font-bold text-maroon-800 hover:underline', 'Open course scores');
    link.href = finding.href;
    heading.appendChild(link);
  }

  header.appendChild(heading);
  item.appendChild(header);
  list.appendChild(item);
}

/**
 * Renders a diagnostic report into a container. All user-controlled text is
 * inserted with textContent, never innerHTML.
 */
export function renderReport(container, report) {
  if (!container) return;
  container.replaceChildren();

  const status = report?.status ?? 'neutral';
  const style = styleFor(status);
  const banner = element('section', `rounded-2xl border-l-4 p-3.5 sm:p-4 ${style.banner}`);
  banner.dataset.rbaStatus = status;

  const header = element('div', 'flex flex-wrap items-start justify-between gap-2');
  const titleWrap = element('div', 'flex min-w-0 items-start gap-2');
  const icon = element('i', `fa-solid ${style.icon} mt-0.5 text-sm`);
  icon.setAttribute('aria-hidden', 'true');
  titleWrap.appendChild(icon);
  titleWrap.appendChild(
    element('p', `text-xs font-extrabold uppercase tracking-wide ${style.title}`, report?.statusLabel || 'Diagnostics'),
  );
  header.appendChild(titleWrap);

  const badge = element(
    'span',
    `rounded-full px-2 py-0.5 text-[10px] font-bold ${style.badge}`,
    status === 'neutral' ? 'Insufficient data' : `${report?.findings?.length ?? 0} insight${(report?.findings?.length ?? 0) === 1 ? '' : 's'}`,
  );
  header.appendChild(badge);
  banner.appendChild(header);

  banner.appendChild(element('p', `mt-1.5 text-[11px] ${style.muted}`, report?.summary || ''));

  const list = element('div', 'mt-2.5 space-y-2');
  for (const finding of report?.findings ?? []) {
    appendFinding(list, finding);
  }
  banner.appendChild(list);

  container.appendChild(banner);
}

/**
 * Compact one-line report used by the professor template builder.
 */
export function renderDraftPreview(container, report) {
  if (!container) return;
  container.replaceChildren();
  const status = report?.status ?? 'neutral';
  const style = styleFor(status);
  const line = element('p', `flex items-start gap-2 rounded-lg border-l-2 px-2.5 py-2 text-[10px] ${style.banner} ${style.title}`);
  line.dataset.rbaStatus = status;
  const icon = element('i', `fa-solid ${style.icon} mt-0.5 text-[10px]`);
  icon.setAttribute('aria-hidden', 'true');
  line.appendChild(icon);
  line.appendChild(element('span', 'font-semibold', report?.summary || 'Draft weight preview unavailable.'));
  container.appendChild(line);
}

export function renderError(container, message = 'Diagnostics unavailable. Your scores are unchanged.') {
  if (!container) return;
  container.replaceChildren();
  const line = element(
    'p',
    'rounded-2xl border border-stone-200 bg-stone-50 p-3 text-[11px] font-semibold text-stone-600',
    message,
  );
  line.setAttribute('role', 'status');
  container.appendChild(line);
}
