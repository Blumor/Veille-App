/* Front de la console : consomme l'API REST du backend. */

const $ = (s) => document.querySelector(s);
const STATE = { index: [], selected: null, sections: {} };

const FALLBACK_SECTIONS = {
  daily: [
    { id: 'vulns', label: 'Vulnérabilités ultra-critiques', icon: '🔴' },
    { id: 'attacks', label: 'Attaques & leaks', icon: '🌍' },
    { id: 'culture', label: 'À retenir / culture veille', icon: '📌' },
  ],
  weekly: [
    { id: 'synthese', label: 'Synthèse de la semaine', icon: '🧭' },
    { id: 'vulns', label: 'Vulnérabilités ultra-critiques', icon: '🔴' },
    { id: 'attacks', label: 'Attaques & leaks', icon: '🌍' },
    { id: 'culture', label: 'À retenir / culture veille', icon: '📌' },
  ],
};

/* ---------- helpers ---------- */
const esc = (s) =>
  (s == null ? '' : String(s)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const shortUrl = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'lien'; } };
const frDate = (iso) => {
  try { return new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }
  catch { return iso; }
};
const sectionMeta = (type, id) =>
  (STATE.sections[type] || []).find((s) => s.id === id) || { label: id, icon: '•' };

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || ('HTTP ' + res.status));
  return res.json();
}

/* ---------- rendu ---------- */
function renderSidebar() {
  const side = $('#side');
  if (!STATE.index.length) {
    side.innerHTML = `<div class="side-empty">Aucun rapport archivé.<br><br>Clique sur <b style="color:var(--accent)">Rapport du jour</b> pour générer le premier briefing.</div>`;
    return;
  }
  const daily = STATE.index.filter((x) => x.type === 'daily');
  const weekly = STATE.index.filter((x) => x.type === 'weekly');
  const itemHTML = (x) => `
    <div class="item ${STATE.selected === x.id ? 'active' : ''}" data-id="${x.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <span class="it-date">${frDate(x.date)}</span>
        <span class="tag ${x.type}">${x.type === 'daily' ? '24H' : 'HEBDO'}</span>
      </div>
      <div class="it-meta">${x.date}</div>
    </div>`;
  let html = '';
  if (daily.length) html += `<div class="group"><h3>Rapports quotidiens</h3>${daily.map(itemHTML).join('')}</div>`;
  if (weekly.length) html += `<div class="group"><h3>Rapports hebdomadaires</h3>${weekly.map(itemHTML).join('')}</div>`;
  side.innerHTML = html;
  side.querySelectorAll('.item').forEach((el) => (el.onclick = () => selectReport(el.dataset.id)));
}

function cardHTML(it) {
  const sev = (it.severity || 'news').toLowerCase();
  const sevLabel = { critical: 'Critique', high: 'Élevé', news: 'Incident', culture: 'Signal' }[sev] || 'Info';
  return `
    <div class="card ${sev}">
      <div class="card-top">
        <span class="pill ${sev}">${sevLabel}</span>
        ${it.cve ? `<span class="cve">${esc(it.cve)}</span>` : ''}
      </div>
      <div class="card-title">${esc(it.title)}</div>
      <div class="card-body">${esc(it.body)}</div>
      ${it.action ? `<div class="card-action"><b>▸ Action —</b> ${esc(it.action)}</div>` : ''}
      ${it.url ? `<a class="src" href="${esc(it.url)}" target="_blank" rel="noopener">↳ source · ${shortUrl(it.url)}</a>` : ''}
    </div>`;
}

function renderReport(rep) {
  const main = $('#main');
  if (!rep) return renderEmpty();
  const badge = rep.type === 'daily'
    ? `<span class="badge" style="background:var(--news-bg);color:var(--news)">RAPPORT QUOTIDIEN · 24H</span>`
    : `<span class="badge" style="background:var(--cult-bg);color:var(--cult)">RAPPORT HEBDOMADAIRE</span>`;
  const win = rep.type === 'daily' ? 'Dernières 24h · ' + frDate(rep.date) : 'Semaine au ' + frDate(rep.date);
  const secs = (rep.sections || [])
    .filter((s) => s.items && s.items.length)
    .map((s) => {
      const meta = sectionMeta(rep.type, s.id);
      return `<div class="sec">
        <div class="sec-label"><span class="ic">${meta.icon}</span>${meta.label}<span class="ln"></span></div>
        ${s.items.map(cardHTML).join('')}
      </div>`;
    }).join('');
  main.innerHTML = `<div class="wrap">
    <div class="rep-head">
      <div class="rep-kicker">${badge}<span class="win">${win}</span></div>
      <div class="rep-title">${esc(rep.title)}</div>
      ${rep.summary ? `<div class="rep-summary">${esc(rep.summary)}</div>` : ''}
    </div>
    ${secs || '<div class="card news"><div class="card-body">Rapport vide.</div></div>'}
  </div>`;
  main.scrollTop = 0;
}

function renderEmpty() {
  $('#main').innerHTML = `<div class="empty"><div>
    <div class="big">◇ Console prête</div>
    <div class="sm">Sélectionne un rapport dans l'archive, ou génère le briefing du jour. La recherche web et la rédaction se font côté serveur.</div>
  </div></div>`;
}

async function selectReport(id) {
  STATE.selected = id;
  renderSidebar();
  try { renderReport(await api('/api/reports/' + id)); }
  catch { renderEmpty(); }
}

/* ---------- génération ---------- */
function setBusy(on, msg) {
  $('#btnDaily').disabled = on;
  $('#btnWeekly').disabled = on;
  $('#statusDot').classList.toggle('busy', on);
  $('#statusTxt').textContent = on ? 'GÉNÉRATION' : 'OPÉRATIONNEL';
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

async function generate(type) {
  setBusy(true, type === 'daily' ? 'Recherche des dernières 24h…' : 'Synthèse de la semaine…');
  try {
    const rep = await api('/api/reports/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    });
    STATE.index = await api('/api/reports');
    await selectReport(rep.id);
    toast('Rapport généré et archivé');
  } catch (e) {
    toast('Échec de génération : ' + e.message, true);
  } finally {
    setBusy(false);
  }
}

/* ---------- init ---------- */
async function init() {
  renderEmpty();
  try { STATE.sections = (await api('/api/config')).sections; }
  catch { STATE.sections = FALLBACK_SECTIONS; }
  try { STATE.index = await api('/api/reports'); }
  catch { STATE.index = []; }
  renderSidebar();
  if (STATE.index.length) selectReport(STATE.index[0].id);
  $('#btnDaily').onclick = () => generate('daily');
  $('#btnWeekly').onclick = () => generate('weekly');
}
init();
