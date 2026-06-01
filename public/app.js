const $ = (s) => document.querySelector(s);

const STATE = {
  index: [],
  selected: null,
  sections: {},
  report: null,
  activeItem: null,
  sectionFilter: 'all',
};

const DAILY_SECS = [
  { id: 'vulns',   label: 'Vulnérabilités', icon: '🔴' },
  { id: 'attacks', label: 'Attaques & leaks', icon: '🌍' },
  { id: 'culture', label: 'Veille & signaux', icon: '📌' },
];
const SYNTH = { id: 'synthese', label: 'Synthèse', icon: '🧭' };

const FALLBACK_SECTIONS = {
  daily:   DAILY_SECS,
  weekly:  [SYNTH, ...DAILY_SECS],
  monthly: [SYNTH, ...DAILY_SECS],
};

// Métadonnées par type de rapport : libellé sidebar, tag court, badge, fenêtre temporelle.
const TYPE_META = {
  daily:   { group: 'Quotidiens',     tag: '24H',   badge: 'QUOTIDIEN · 24H', win: (d) => 'Dernières 24h · ' + d },
  weekly:  { group: 'Hebdomadaires',  tag: 'HEBDO', badge: 'HEBDOMADAIRE',    win: (d) => 'Semaine au ' + d },
  monthly: { group: 'Mensuels',       tag: 'MOIS',  badge: 'MENSUEL',         win: (d) => 'Mois au ' + d },
};
const typeMeta = (t) => TYPE_META[t] || TYPE_META.daily;

const SEV_LABELS = { critical: 'Critique', high: 'Élevé', news: 'Incident', culture: 'Signal' };

function relativeTime(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor(diff / 60_000);
  if (m < 2)  return 'à l\'instant';
  if (m < 60) return `il y a ${m} min`;
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

// ── helpers ───────────────────────────────────────────────────────────────────
const esc = (s) =>
  (s == null ? '' : String(s)).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

const shortHost = (u) => {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'lien'; }
};

const frDate = (iso) => {
  try {
    return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
};

// Date absolue compacte d'un item (ex. « 1 juin 2026 »).
const frDateFull = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
};

// Palette du score d'importance (0-100).
const scoreClass = (n) => (n >= 80 ? 'sc-crit' : n >= 60 ? 'sc-high' : n >= 40 ? 'sc-mid' : 'sc-low');

const sectionMeta = (type, id) =>
  (STATE.sections[type] || []).find((s) => s.id === id) ?? { label: id, icon: '•' };

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'HTTP ' + res.status);
  return res.json();
}

// ── sidebar ───────────────────────────────────────────────────────────────────
function renderSidebar() {
  const side = $('#side');
  if (!STATE.index.length) {
    side.innerHTML = `<div class="side-empty">Aucun rapport archivé.<br><br>Clique sur <b>Rapport du jour</b> pour lancer la collecte.</div>`;
    return;
  }
  const itemHTML = (x) => `
    <div class="item ${STATE.selected === x.id ? 'active' : ''}" data-id="${x.id}">
      <div class="item-row">
        <span class="it-date">${frDate(x.date)}</span>
        <span class="tag ${x.type}">${typeMeta(x.type).tag}</span>
      </div>
      <div class="it-meta">${x.date}</div>
    </div>`;
  let html = '';
  for (const t of ['daily', 'weekly', 'monthly']) {
    const group = STATE.index.filter((x) => x.type === t);
    if (group.length) html += `<div class="group"><h3>${typeMeta(t).group}</h3>${group.map(itemHTML).join('')}</div>`;
  }
  side.innerHTML = html;
  side.querySelectorAll('.item').forEach((el) => (el.onclick = () => selectReport(el.dataset.id)));
}

// ── tabs ──────────────────────────────────────────────────────────────────────
function renderTabs(rep) {
  const secs = (rep.sections || []).filter((s) => s.items?.length);
  const total = secs.reduce((n, s) => n + s.items.length, 0);
  const tabs = [{ id: 'all', label: 'Tous', count: total }, ...secs.map((s) => {
    const m = sectionMeta(rep.type, s.id);
    return { id: s.id, label: `${m.icon} ${m.label}`, count: s.items.length };
  })];
  return `<div class="tabs" id="tabs">
    ${tabs.map((t) => `
      <button class="tab ${STATE.sectionFilter === t.id ? 'active' : ''}" data-sec="${t.id}">
        ${esc(t.label)}<span class="tab-count">${t.count}</span>
      </button>`).join('')}
  </div>`;
}

// ── feed (replaces grid) ──────────────────────────────────────────────────────
function getFilteredItems(rep) {
  const items = [];
  for (const sec of rep?.sections || []) {
    if (STATE.sectionFilter !== 'all' && sec.id !== STATE.sectionFilter) continue;
    for (const it of sec.items || []) items.push({ ...it, _section: sec.id });
  }
  // Vue « Tous » : la synthèse reste en tête, le reste est classé par score décroissant.
  if (STATE.sectionFilter === 'all') {
    const synth = items.filter((i) => i._section === 'synthese');
    const rest = items.filter((i) => i._section !== 'synthese')
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    return [...synth, ...rest];
  }
  return items.sort((a, b) => (b.score || 0) - (a.score || 0));
}

// Rendu d'un corps multi-paragraphes (sépare sur les sauts de ligne).
function paragraphs(text, cls) {
  return (text || '').split(/\n{1,}/).filter(Boolean)
    .map((p) => `<p class="${cls}">${esc(p)}</p>`).join('');
}

// Liste des médias (byline), façon publication d'article.
function bylineHTML(item) {
  const labels = (item.sources || []).map((s) => s.label).filter(Boolean);
  const chips = labels.slice(0, 3).map((l) => `<span class="fi-src">${esc(l)}</span>`).join('');
  const more = labels.length > 3 ? `<span class="fi-src-more">+${labels.length - 3}</span>` : '';
  return chips + more;
}

function feedItemHTML(item) {
  const sev = (item.severity || 'news').toLowerCase();
  const score = item.score ?? 0;
  const corro = item.corroboration || 1;
  const date = frDateFull(item.pubDate);
  const rel = relativeTime(item.pubDate);
  const dateTxt = [date, rel].filter(Boolean).join(' · ');

  return `<article class="feed-item ${sev}" tabindex="0" role="button">
    <div class="fi-score ${scoreClass(score)}" title="Score d'importance sur 100">
      <span class="fi-score-n">${score}</span><span class="fi-score-u">/100</span>
    </div>
    <div class="fi-body">
      <div class="fi-top">
        <span class="pill ${sev}">${SEV_LABELS[sev] || 'Info'}</span>
        ${item.cve ? `<span class="cve">${esc(item.cve)}</span>` : ''}
        ${corro >= 2 ? `<span class="fi-corro" title="Information recoupée par plusieurs médias">✓ recoupé ×${corro}</span>` : ''}
      </div>
      <h3 class="fi-title">${esc(item.title)}</h3>
      ${item.body ? `<div class="fi-excerpt">${paragraphs(item.body, 'fi-p')}</div>` : ''}
      <div class="fi-foot">
        ${bylineHTML(item)}
        ${dateTxt ? `<span class="fi-date">${esc(dateTxt)}</span>` : ''}
        <span class="fi-arr">Lire ›</span>
      </div>
    </div>
  </article>`;
}

function renderFeed(rep) {
  const items = getFilteredItems(rep);
  if (!items.length) return '<div class="feed-empty">Aucun article dans cette section.</div>';
  return `<div class="feed">${items.map(feedItemHTML).join('')}</div>`;
}

function bindCards(rep) {
  const items = getFilteredItems(rep);
  $('#main').querySelectorAll('.feed-item').forEach((el, i) => {
    const open = () => showDetail(items[i], rep);
    el.onclick = open;
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
  });
}

function bindTabs(rep) {
  $('#main').querySelectorAll('.tab').forEach((el) => {
    el.onclick = () => {
      STATE.sectionFilter = el.dataset.sec;
      const gc = $('#feedContainer');
      gc.innerHTML = renderFeed(rep);
      gc.classList.add('fade-in');
      setTimeout(() => gc.classList.remove('fade-in'), 300);
      $('#main').querySelectorAll('.tab').forEach((t) =>
        t.classList.toggle('active', t.dataset.sec === STATE.sectionFilter)
      );
      bindCards(rep);
    };
  });
}

// ── detail view ───────────────────────────────────────────────────────────────
function factsHTML(item) {
  const score = item.score ?? 0;
  const facts = [
    { label: 'Importance', value: `${score}/100`, cls: `fact-score ${scoreClass(score)}` },
    { label: 'Gravité', value: SEV_LABELS[(item.severity || 'news').toLowerCase()] || 'Info' },
  ];
  if (item.cve) facts.push({ label: 'CVE', value: item.cve });
  const corro = item.corroboration || 1;
  if (corro >= 2) facts.push({ label: 'Recoupement', value: `${corro} médias` });
  const d = frDateFull(item.pubDate);
  if (d) facts.push({ label: 'Date', value: d });
  return `<div class="detail-facts">
    ${facts.map((f) => `<div class="fact ${f.cls || ''}">
      <span class="fact-label">${esc(f.label)}</span>
      <span class="fact-value">${esc(f.value)}</span>
    </div>`).join('')}
  </div>`;
}

function renderDetail(item) {
  const sev = (item.severity || 'news').toLowerCase();
  const sources = item.sources?.length
    ? item.sources
    : item.url ? [{ url: item.url, label: shortHost(item.url) }] : [];
  const linksHTML = sources
    .map((s) => `<a class="src-link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">
      <span class="src-link-icon">↗</span>${esc(s.label || shortHost(s.url))}
    </a>`)
    .join('');

  const bodyHTML = paragraphs(item.detail || item.body || '', '');

  return `<div class="detail-view fade-in">
    <div class="detail-header">
      <div class="detail-badges">
        <span class="pill ${sev}">${SEV_LABELS[sev] || 'Info'}</span>
        ${item.cve ? `<span class="cve">${esc(item.cve)}</span>` : ''}
      </div>
      <h1 class="detail-title">${esc(item.title)}</h1>
    </div>
    ${factsHTML(item)}
    ${bodyHTML ? `<div class="detail-section">
      <div class="detail-label">Analyse</div>
      <div class="detail-body">${bodyHTML}</div>
    </div>` : ''}
    ${item.action ? `<div class="detail-section detail-action-block">
      <div class="detail-label">Action recommandée</div>
      <div class="detail-action"><span class="action-icon">▸</span>${esc(item.action)}</div>
    </div>` : ''}
    ${linksHTML ? `<div class="detail-section">
      <div class="detail-label">Sources & références</div>
      <div class="detail-sources">${linksHTML}</div>
    </div>` : ''}
  </div>`;
}

function showDetail(item, rep) {
  if (!item) return;
  STATE.activeItem = item;
  const main = $('#main');
  const wrap = main.querySelector('.wrap');
  const badge = `<span class="badge ${rep.type}-badge">${typeMeta(rep.type).badge}</span>`;
  wrap.innerHTML = `
    <button class="back-btn" id="btnBack">← Retour au rapport</button>
    <div class="rep-head compact">
      <div class="rep-kicker">${badge}<span class="win">${frDate(rep.date)}</span></div>
    </div>
    ${renderDetail(item)}`;
  main.scrollTop = 0;
  $('#btnBack').onclick = () => renderReport(rep);
}

// ── report ────────────────────────────────────────────────────────────────────
function renderReport(rep) {
  const main = $('#main');
  if (!rep) { renderEmpty(); return; }
  STATE.report = rep;
  STATE.activeItem = null;

  const meta = typeMeta(rep.type);
  const badge = `<span class="badge ${rep.type}-badge">${meta.badge}</span>`;
  const win = meta.win(frDate(rep.date));

  main.innerHTML = `<div class="wrap">
    <div class="rep-head">
      <div class="rep-kicker">${badge}<span class="win">${win}</span></div>
      <h2 class="rep-title">${esc(rep.title)}</h2>
      ${rep.summary ? `<p class="rep-summary">${esc(rep.summary)}</p>` : ''}
    </div>
    ${renderTabs(rep)}
    <div id="feedContainer">${renderFeed(rep)}</div>
  </div>`;

  main.scrollTop = 0;
  bindCards(rep);
  bindTabs(rep);
}

function renderEmpty() {
  $('#main').innerHTML = `<div class="empty">
    <div class="empty-inner">
      <div class="empty-icon">◇</div>
      <div class="empty-title">Console prête</div>
      <div class="empty-sub">Sélectionne un rapport dans l'archive, ou génère un briefing (jour / semaine / mois) agrégé depuis les flux RSS, l'API NVD et le catalogue CISA KEV — gratuit, sans clé API.</div>
    </div>
  </div>`;
}

// ── generation ────────────────────────────────────────────────────────────────
function setBusy(on, msg) {
  $('#btnDaily').disabled = on;
  $('#btnWeekly').disabled = on;
  $('#btnMonthly').disabled = on;
  $('#statusDot').classList.toggle('busy', on);
  $('#statusTxt').textContent = on ? 'COLLECTE' : 'OPÉRATIONNEL';
  $('#genStatus').classList.toggle('show', on);
  if (msg) $('#genTxt').textContent = msg;
}

function toast(msg, err) {
  const t = $('#toast');
  $('#toastTxt').textContent = msg;
  t.classList.toggle('err', !!err);
  t.querySelector('.ic').textContent = err ? '⚠' : '✓';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 4200);
}

const BUSY_MSG = {
  daily: 'Collecte RSS · NVD · KEV…',
  weekly: 'Agrégation de la semaine…',
  monthly: 'Agrégation du mois…',
};

async function generate(type) {
  setBusy(true, BUSY_MSG[type] || BUSY_MSG.daily);
  try {
    const rep = await api('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    STATE.index = await api('/api/reports');
    STATE.sectionFilter = 'all';
    renderSidebar();
    await selectReport(rep.id);
    toast('Rapport collecté et archivé');
  } catch (e) {
    toast('Échec : ' + e.message, true);
  } finally {
    setBusy(false);
  }
}

async function selectReport(id) {
  STATE.selected = id;
  STATE.sectionFilter = 'all';
  renderSidebar();
  try {
    const rep = await api('/api/reports/' + id);
    renderReport(rep);
  } catch {
    renderEmpty();
  }
}

// ── init ──────────────────────────────────────────────────────────────────────
async function init() {
  renderEmpty();
  try { STATE.sections = (await api('/api/config')).sections; } catch { STATE.sections = FALLBACK_SECTIONS; }
  try { STATE.index = await api('/api/reports'); } catch { STATE.index = []; }
  renderSidebar();
  if (STATE.index.length) selectReport(STATE.index[0].id);
  $('#btnDaily').onclick = () => generate('daily');
  $('#btnWeekly').onclick = () => generate('weekly');
  $('#btnMonthly').onclick = () => generate('monthly');
}
init();
