import { get, getAll, put, remove } from "./core/db.js";
import { seedDemoData } from "./core/seed.js";
import { summarize, validPh } from "./modules/stats.js";
import { loadAgronomy, interpretValue } from "./modules/agronomy.js";
import { enqueue, pendingOperations, discardPendingForRecord } from "./modules/sync.js";
import { requestPosition } from "./modules/geolocation.js";
import { YKS01Adapter } from "./modules/bluetooth.js";
import { lineChart, seriesColor, trendText, heatPlot } from "./modules/charts.js";
import { downloadCSV } from "./modules/csv.js";

const app = document.querySelector("#app");
const backButton = document.querySelector("#backButton");
const bottomNav = document.querySelector("#bottomNav");
const networkButton = document.querySelector("#networkButton");
const networkLabel = document.querySelector("#networkLabel");
const toastElement = document.querySelector("#toast");
const sensor = new YKS01Adapter();

const defaultState = { activated: false, technicianId: "tech-co-01", currentSessionId: null, compareLots: [], mapLots: [], mapCampaignId: "camp-2026-10" };
let state = loadState();
let demoData;
let agronomy;
let pendingLocation = null;

function loadState() {
  try { return { ...defaultState, ...JSON.parse(localStorage.getItem("ph-fase1-state") || "{}") }; }
  catch { localStorage.removeItem("ph-fase1-state"); return { ...defaultState }; }
}
function saveState() { localStorage.setItem("ph-fase1-state", JSON.stringify(state)); }
function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]); }
function toast(message) { toastElement.textContent = message; toastElement.classList.add("show"); setTimeout(() => toastElement.classList.remove("show"), 2400); }
function go(path) { location.hash = `#/${path}`; }
function route() { const raw = location.hash.replace(/^#\//, "") || (state.activated ? "home" : "activate"); const [name, id] = raw.split("/"); return { name, id }; }
function activeTechnician() { return demoData.technicians.find(item => item.id === state.technicianId) || demoData.technicians[0]; }
function farmsForTechnician() { return demoData.farms.filter(item => item.technician_id === activeTechnician().id); }
function lotsForFarm(farmId) { return demoData.lots.filter(item => item.farm_id === farmId); }
function currentFarm(farmId) { return demoData.farms.find(item => item.id === farmId); }
function currentLot(lotId) { return demoData.lots.find(item => item.id === lotId); }
function currentCampaign(campaignId) { return demoData.campaigns.find(item => item.id === campaignId); }
function formatDate(value) { return new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)); }
function formatNumber(value) { return Number.isFinite(value) ? value.toFixed(2) : "—"; }
function heading(eyebrow, title, lead = "") { return `<div class="eyebrow">${escapeHTML(eyebrow)}</div><h1>${escapeHTML(title)}</h1>${lead ? `<p class="lead">${escapeHTML(lead)}</p>` : ""}`; }
function statusBadge(text, tone = "") { return `<span class="status-badge ${tone}">${escapeHTML(text)}</span>`; }
function scale(value = null) { const position = Number.isFinite(value) ? Math.max(2, Math.min(98, value / 14 * 100)) : 0; return `<div class="scale"><span class="scale-marker" style="left:${position}%"></span></div><div class="scale-labels"><span>Bajo</span><span>Adecuado</span><span>Alto</span></div>`; }
function interpretation(value) { return interpretValue(value, "coffee", agronomy); }

function updateChrome() {
  const { name } = route();
  const hiddenBack = ["activate", "home"].includes(name);
  backButton.classList.toggle("is-hidden", hiddenBack);
  bottomNav.classList.toggle("is-hidden", name === "activate");
  bottomNav.querySelectorAll("a").forEach(link => link.classList.toggle("active", link.dataset.nav === name || (name === "farm" && link.dataset.nav === "farms")));
  networkLabel.textContent = navigator.onLine ? "En línea" : "Offline";
  networkButton.classList.toggle("offline", !navigator.onLine);
}

async function activationView() {
  return `<section class="activation"><div class="activation-mark">pH</div>${heading("Bienvenido", "Activa tu acceso", "Selecciona un perfil ficticio para explorar la Fase 1. No se utilizan cuentas ni contraseñas reales.")}<div class="notice">${statusBadge("Modo demostración", "good")}<p style="margin:10px 0 0">Los datos permanecen en este dispositivo. Supabase todavía no está conectado.</p></div><form id="activationForm"><label class="field"><span>Técnico</span><select id="technicianSelect" class="select">${demoData.technicians.map(item => `<option value="${item.id}" ${item.id === state.technicianId ? "selected" : ""}>${item.code} · ${item.name}</option>`).join("")}</select></label><button class="button primary" type="submit">Entrar en modo demostración</button></form></section>`;
}

async function homeView() {
  const farms = farmsForTechnician();
  const pending = await pendingOperations();
  const sessions = await getAll("sessions");
  const activeSession = sessions.find(item => item.technician_id === activeTechnician().id && item.status === "in_progress");
  return `${heading(`Hola, ${activeTechnician().code}`, "¿Qué vas a hacer?", "Elige una medición rápida o un muestreo organizado por finca y lote.")}${activeSession ? `<div class="resume-card"><div><strong>Muestreo sin finalizar</strong><span>${escapeHTML(currentLot(activeSession.lot_id)?.name)} · jornada recuperable</span></div><button class="text-link" type="button" data-go="capture/${activeSession.id}">Continuar</button></div>` : ""}<button class="card action-card" type="button" data-go="quick"><span class="icon-tile">pH</span><span><h2>Medición individual</h2><p>Lectura rápida de pH con geolocalización opcional.</p></span><span class="chevron">›</span></button><button class="card action-card" type="button" data-go="farms"><span class="icon-tile">⌑</span><span><h2>Fincas</h2><p>Muestreo por lotes, historial y geolocalización.</p></span><span class="chevron">›</span></button><div class="stats-grid"><div class="stat"><strong>${farms.length}</strong><span>fincas asignadas</span></div><div class="stat"><strong>${pending.length}</strong><span>registros pendientes</span></div></div><p class="meta" style="text-align:center;margin-top:18px">Los registros se conservan localmente aunque cierres la aplicación.</p>`;
}

function readingCard(value = null, mode = "Sin lectura") {
  const result = Number.isFinite(value) ? interpretation(value) : { label: "Esperando lectura" };
  return `<div class="reading-card"><div class="reading-head"><strong>Lectura actual</strong>${statusBadge(mode)}</div><div class="ph-value" id="phValue">${Number.isFinite(value) ? `pH ${value.toFixed(2)}` : "—"}</div><div class="interpretation" id="phInterpretation">${escapeHTML(result.label)}</div>${scale(value)}</div>`;
}

async function quickView() {
  return `${heading("Lectura rápida", "Medición individual", "Guarda un valor sin seleccionar finca ni lote.")}<div class="notice warning"><strong>Rangos de prueba</strong><br>La interpretación de café es provisional hasta aprobación agronómica.</div>${readingCard()}<button class="button secondary" id="connectButton" type="button">Usar lectura simulada YK-S01</button><p class="meta">La simulación está identificada. En iPhone, la conexión real se realizará dentro de Bluefy cuando estén validados los UUID.</p><label class="field"><span>Lectura manual</span><div class="manual-row"><input class="input" id="manualPh" inputmode="decimal" type="number" min="0" max="14" step="0.01" placeholder="Ej. 5,3"><button class="button secondary" id="useManual" type="button">Usar</button></div></label><label class="check-row"><input id="quickGps" type="checkbox">Solicitar ubicación al guardar</label><div class="gps-state" id="gpsState">La medición puede guardarse sin GPS.</div><button class="button primary" id="saveQuick" type="button" disabled>Guardar medición</button>`;
}

async function farmsView() {
  const farms = farmsForTechnician();
  const sessions = await getAll("sessions");
  const activeSession = sessions.find(item => item.technician_id === activeTechnician().id && item.status === "in_progress");
  return `${heading("Trabajo de campo", "Fincas", "Selecciona una de las fincas asignadas a tu perfil.")}${activeSession ? `<div class="resume-card"><div><strong>Muestreo sin finalizar</strong><span>${escapeHTML(currentLot(activeSession.lot_id)?.name)} · ${(await measurementsForSession(activeSession.id)).length}/${activeSession.target_samples} puntos</span></div><button class="text-link" data-go="capture/${activeSession.id}" type="button">Continuar</button></div>` : ""}<div class="list">${farms.map(farm => `<button class="list-item" type="button" data-go="farm/${farm.id}"><span><strong>${escapeHTML(farm.code)} · ${escapeHTML(farm.name)}</strong><span>${lotsForFarm(farm.id).length} lotes · Café · ${escapeHTML(farm.region)}</span></span><b>›</b></button>`).join("")}</div>`;
}

async function farmView(farmId) {
  const farm = currentFarm(farmId);
  if (!farm || farm.technician_id !== activeTechnician().id) return notFoundView();
  const lots = lotsForFarm(farmId);
  return `${heading("Finca asignada", farm.name, `${farm.code} · ${farm.region} · ${lots.length} lotes`)}<div class="notice"><strong>Monitoreo de la finca</strong><br>Compara la evolución de hasta 3 lotes o revisa una campaña específica.</div><div class="section-title"><h2>Lotes</h2><button class="text-link" type="button" data-go="compare/${farmId}">Comparar</button></div>${lots.map(lot => `<article class="card lot-card"><div class="row"><div><h3>${escapeHTML(lot.name)}</h3><p class="meta">${lot.area_ha} ha · siembra ${lot.planting_year}</p></div><button class="icon-action" type="button" data-go="history/${lot.id}">Historial</button></div></article>`).join("")}<button class="button secondary" type="button" data-go="maps/${farmId}">Comparar distribución espacial</button><button class="button primary" type="button" data-go="new/${farmId}">Nueva jornada de muestreo</button>`;
}

async function newSessionView(farmId) {
  const farm = currentFarm(farmId);
  if (!farm || farm.technician_id !== activeTechnician().id) return notFoundView();
  return `${heading("Preparación", "Nueva jornada", "Define el lote, la campaña y el número de puntos.")}<form id="newSessionForm"><label class="field"><span>Finca</span><select id="farmSelect" class="select">${farmsForTechnician().map(item => `<option value="${item.id}" ${item.id === farmId ? "selected" : ""}>${item.code} · ${escapeHTML(item.name)}</option>`).join("")}</select></label><label class="field"><span>Lote</span><select id="lotSelect" class="select">${lotsForFarm(farmId).map(item => `<option value="${item.id}">${escapeHTML(item.name)} · ${item.area_ha} ha</option>`).join("")}</select></label><label class="field"><span>Campaña de monitoreo</span><select id="campaignSelect" class="select">${demoData.campaigns.map(item => `<option value="${item.id}" ${item.id === state.mapCampaignId ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label><label class="field"><span>Protocolo</span><select id="targetSelect" class="select"><option value="10">10 puntos</option><option value="15">15 puntos</option></select></label><div class="protocol-card"><span class="icon-tile">⌁</span><span><strong>Recorrido en zigzag</strong><span>GPS y temperatura se guardan cuando estén disponibles.</span></span></div><button class="button primary" type="submit">Iniciar submuestreo</button></form>`;
}

async function measurementsForSession(sessionId) { return (await getAll("measurements")).filter(item => item.session_id === sessionId).sort((a, b) => a.sample_number - b.sample_number); }

async function captureView(sessionId) {
  const session = await get("sessions", sessionId);
  if (!session || session.technician_id !== activeTechnician().id) return notFoundView();
  const points = await measurementsForSession(session.id);
  const farm = currentFarm(session.farm_id), lot = currentLot(session.lot_id), next = points.length + 1;
  return `${heading("Captura", `Punto ${Math.min(next, session.target_samples)} de ${session.target_samples}`, `${farm.name} · ${lot.name}`)}<div class="progress-meta"><span>Recorrido</span><span>${points.length}/${session.target_samples}</span></div><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${session.target_samples}" aria-valuenow="${points.length}"><span style="width:${points.length / session.target_samples * 100}%"></span></div>${readingCard()}<button class="button secondary" id="connectButton" type="button">Usar lectura simulada YK-S01</button><p class="meta">La lectura se identificará como simulada. La entrada manual permanece disponible.</p><label class="field"><span>Lectura manual</span><div class="manual-row"><input class="input" id="manualPh" inputmode="decimal" type="number" min="0" max="14" step="0.01" placeholder="Ej. 5,3"><button class="button secondary" id="useManual" type="button">Usar</button></div></label><label class="field"><span>Temperatura opcional</span><input class="input" id="temperature" inputmode="decimal" type="number" min="-10" max="60" step="0.1" placeholder="Ej. 21,5"></label><label class="check-row"><input id="captureGps" type="checkbox" checked>Solicitar GPS al guardar</label><div class="gps-state" id="gpsState">La ubicación se solicitará al guardar este punto.</div><button class="button primary" id="savePoint" type="button" disabled>Guardar punto</button>${points.length ? `<button class="button secondary" id="undoPoint" type="button">Corregir último punto</button>` : ""}`;
}

async function resultView(sessionId) {
  const session = await get("sessions", sessionId);
  if (!session) return notFoundView();
  const points = await measurementsForSession(session.id);
  const stats = session.summary || summarize(points.map(item => item.ph));
  const result = interpretation(stats.median);
  const lot = currentLot(session.lot_id), farm = currentFarm(session.farm_id);
  return `${heading("Jornada completada", "Resultado del lote", `${farm.name} · ${lot.name} · ${stats.count} puntos`)}<div class="result-hero"><div class="meta">pH representativo · mediana</div><div class="ph-value">${formatNumber(stats.median)}</div>${statusBadge(result.label, "good")}</div><article class="card interpret-card"><h3>Interpretación</h3><p>El lote se encuentra en el nivel <strong>${escapeHTML(result.label.toLowerCase())}</strong> según los rangos provisionales de demostración para café.</p></article><div class="metric-grid" style="margin-top:15px"><div class="metric"><strong>${formatNumber(stats.median)}</strong><span>mediana</span></div><div class="metric"><strong>${formatNumber(stats.mean)}</strong><span>promedio</span></div><div class="metric"><strong>${formatNumber(stats.stddev)}</strong><span>desv. estándar</span></div></div>${stats.stddev > .5 ? `<div class="notice warning" style="margin-top:14px">Alta dispersión: revisa las mediciones antes de interpretar el lote.</div>` : ""}<div class="notice" style="margin-top:14px">Jornada guardada localmente · sincronización pendiente</div><button class="button secondary" type="button" data-go="history/${lot.id}">Ver historial del lote</button><button class="button secondary" type="button" data-go="maps/${farm.id}">Ver distribución espacial</button><button class="button primary" type="button" data-go="farm/${farm.id}">Volver a la finca</button>`;
}

async function completedSessionsForLot(lotId) { return (await getAll("sessions")).filter(item => item.lot_id === lotId && item.status === "completed").sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at)); }

async function historyView(lotId) {
  const lot = currentLot(lotId); if (!lot) return notFoundView();
  const farm = currentFarm(lot.farm_id); const sessions = await completedSessionsForLot(lot.id);
  return `${heading("Monitoreo", lot.name, `${farm.name} · historial del lote`)}${sessions.length ? `<div class="list">${sessions.map(session => { const stats = session.summary || {}; const campaign = currentCampaign(session.campaign_id); const result = interpretation(stats.median); return `<article class="card history-card"><div class="row"><strong>${escapeHTML(campaign?.name || formatDate(session.started_at))}</strong>${statusBadge(session.sync_status === "pending" ? "Pendiente" : "Sincronizado demo", session.sync_status === "pending" ? "warning" : "good")}</div><div class="metric-grid"><div class="metric"><span>Mediana</span><strong>${formatNumber(stats.median)}</strong></div><div class="metric"><span>Promedio</span><strong>${formatNumber(stats.mean)}</strong></div><div class="metric"><span>Desviación</span><strong>${formatNumber(stats.stddev)}</strong></div><div class="metric"><span>Puntos</span><strong>${stats.count ?? "—"}</strong></div></div><p class="meta" style="margin:12px 0 0">${escapeHTML(result.label)} · ${formatDate(session.completed_at || session.started_at)}</p><div class="history-actions"><a href="#/result/${session.id}">Ver detalle</a><a href="#/maps/${farm.id}">Distribución espacial</a></div></article>`; }).join("")}</div>` : `<div class="empty-state">Este lote todavía no tiene jornadas finalizadas.</div>`}<button class="button secondary" type="button" id="exportHistory" ${sessions.length ? "" : "disabled"}>Exportar historial CSV</button><button class="button primary" type="button" data-go="compare/${farm.id}">Comparar lotes</button>`;
}

async function compareView(farmId) {
  const farm = currentFarm(farmId); if (!farm) return notFoundView();
  const lots = lotsForFarm(farmId); let selected = state.compareLots.filter(id => lots.some(lot => lot.id === id)).slice(0, 3);
  if (!selected.length) selected = lots.slice(0, 3).map(lot => lot.id);
  state.compareLots = selected; saveState();
  const sessions = (await getAll("sessions")).filter(item => item.farm_id === farmId && item.status === "completed");
  const series = selected.map(lotId => { const lot = currentLot(lotId); return { id: lotId, name: lot.name, values: demoData.campaigns.map(campaign => { const session = sessions.filter(item => item.lot_id === lotId && item.campaign_id === campaign.id).sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at))[0]; return { campaignId: campaign.id, value: session?.summary?.median ?? null }; }) }; });
  return `${heading("Monitoreo de finca", "Comparar lotes", `${farm.name} · mediana de pH en el tiempo`)}<p class="meta">Selecciona máximo 3 lotes.</p><div class="lot-chips">${lots.map(lot => `<button class="lot-chip" type="button" data-compare-lot="${lot.id}" aria-pressed="${selected.includes(lot.id)}">${escapeHTML(lot.name)}</button>`).join("")}</div><p id="compareError" class="meta" role="alert"></p><article class="card chart-card"><div class="chart-legend">${series.map((item, index) => `<span class="legend-item"><i class="legend-dot" style="background:${seriesColor(index)}"></i>${escapeHTML(item.name)}</span>`).join("")}</div>${lineChart(series, demoData.campaigns)}</article>${series.map(item => `<div class="insight"><strong>${escapeHTML(item.name)}:</strong> ${escapeHTML(trendText(item.values))}</div>`).join("")}<p class="meta" style="margin-top:14px">Las conclusiones se derivan únicamente de las jornadas almacenadas. Los espacios indican ausencia de datos.</p><button class="button secondary" type="button" data-go="maps/${farm.id}">Comparar distribución espacial</button>`;
}

async function mapsView(farmId) {
  const farm = currentFarm(farmId); if (!farm) return notFoundView();
  const lots = lotsForFarm(farmId); let selected = state.mapLots.filter(id => lots.some(lot => lot.id === id)).slice(0, 2);
  if (selected.length !== 2) selected = lots.slice(0, 2).map(lot => lot.id);
  state.mapLots = selected; if (!demoData.campaigns.some(item => item.id === state.mapCampaignId)) state.mapCampaignId = demoData.campaigns.at(-1).id; saveState();
  const sessions = await getAll("sessions"); const allMeasurements = await getAll("measurements");
  const cards = selected.map(lotId => { const lot = currentLot(lotId); const session = sessions.filter(item => item.lot_id === lotId && item.campaign_id === state.mapCampaignId && item.status === "completed").sort((a, b) => new Date(b.completed_at || b.started_at) - new Date(a.completed_at || a.started_at))[0]; const points = session ? allMeasurements.filter(item => item.session_id === session.id) : []; const poorGps = points.some(point => Number(point.gps_accuracy_m) > 20); return `<article class="card map-card"><div class="row"><h2 style="margin:0">${escapeHTML(lot.name)}</h2><span class="meta">${session ? `Mediana ${formatNumber(session.summary?.median)}` : "Sin jornada"}</span></div><p class="meta">${escapeHTML(currentCampaign(state.mapCampaignId)?.name || "Campaña")}${points.length ? ` · ${points.length} puntos` : ""}</p>${heatPlot(points)}${poorGps ? `<div class="notice warning" style="margin-top:10px">Algunos puntos tienen precisión GPS superior a 20 m.</div>` : ""}</article>`; }).join("");
  return `${heading("Comparación espacial", "Distribución espacial de las mediciones", `${farm.name} · exactamente 2 lotes`)}<label class="field"><span>Campaña</span><select id="mapCampaign" class="select">${demoData.campaigns.map(item => `<option value="${item.id}" ${item.id === state.mapCampaignId ? "selected" : ""}>${escapeHTML(item.name)}</option>`).join("")}</select></label><div class="lot-chips">${lots.map(lot => `<button class="lot-chip" type="button" data-map-lot="${lot.id}" aria-pressed="${selected.includes(lot.id)}">${escapeHTML(lot.name)}</button>`).join("")}</div><p id="mapError" class="meta" role="alert"></p><div class="map-grid two">${cards}</div><div class="heat-legend"><span>Más ácido</span><i></i><span>Mayor pH</span></div><div class="notice" style="margin-top:15px"><strong>Alcance de la vista</strong><br>Los colores representan únicamente las zonas observadas y no la totalidad del lote. Es una representación espacial local; no se muestran perímetros.</div>`;
}

async function syncView() {
  const operations = await pendingOperations();
  const groups = operations.reduce((acc, item) => { acc[item.entity] = (acc[item.entity] || 0) + 1; return acc; }, {});
  return `${heading("Datos locales", "Sincronización", "El trabajo queda almacenado en este teléfono hasta conectar el backend.")}<div class="notice warning"><strong>Supabase no conectado</strong><br>Esta versión no finge una escritura remota. Todos los estados pendientes son reales y locales.</div><article class="card" style="margin-top:16px"><div class="row"><h2 style="margin:0">${operations.length} pendientes</h2>${statusBadge(navigator.onLine ? "En línea" : "Offline", navigator.onLine ? "good" : "warning")}</div>${Object.entries(groups).map(([entity, count]) => `<div class="sync-row"><span>${entity === "sessions" ? "Jornadas" : "Mediciones"}</span><strong>${count}</strong></div>`).join("") || `<p class="meta" style="margin:16px 0 0">No hay operaciones pendientes.</p>`}</article><button class="button primary" type="button" disabled>Conectar Supabase para sincronizar</button><p class="meta">La integración remota y las pruebas RLS corresponden a la siguiente versión.</p>`;
}

function notFoundView() { return `${heading("No disponible", "No encontramos este registro", "Vuelve al inicio e inténtalo nuevamente.")}<button class="button primary" type="button" data-go="home">Ir al inicio</button>`; }

async function render() {
  updateChrome();
  const { name, id } = route();
  if (!state.activated && name !== "activate") { go("activate"); return; }
  const views = { activate: activationView, home: homeView, quick: quickView, farms: farmsView, farm: () => farmView(id), new: () => newSessionView(id), capture: () => captureView(id), result: () => resultView(id), history: () => historyView(id), compare: () => compareView(id), maps: () => mapsView(id), sync: syncView };
  try { app.innerHTML = await (views[name] || notFoundView)(); bind(name, id); app.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: "instant" }); }
  catch (error) { console.error(error); app.innerHTML = `${heading("Error", "No pudimos abrir esta pantalla", error.message)}<button class="button primary" type="button" data-go="home">Volver al inicio</button>`; bind(name, id); }
}

function updateReading(value, source) {
  const phValue = document.querySelector("#phValue"), label = document.querySelector("#phInterpretation"), input = document.querySelector("#manualPh"), save = document.querySelector("#saveQuick") || document.querySelector("#savePoint"), badge = document.querySelector(".reading-card .status-badge"), marker = document.querySelector(".scale-marker");
  if (input) { input.value = value; input.dataset.source = source; }
  const valid = validPh(value); if (phValue) phValue.textContent = valid ? `pH ${Number(value).toFixed(2)}` : "—";
  if (label) label.textContent = valid ? interpretation(Number(value)).label : "Esperando lectura";
  if (badge) badge.textContent = source === "simulated" ? "Lectura simulada" : source === "manual" ? "Lectura manual" : "Sin lectura";
  if (marker) marker.style.left = `${valid ? Math.max(2, Math.min(98, Number(value) / 14 * 100)) : 0}%`;
  if (save) save.disabled = !valid;
}

async function captureLocation(enabled, targetId) {
  pendingLocation = null; const target = document.querySelector(targetId);
  if (!enabled) { if (target) target.textContent = "Se guardará sin GPS."; return null; }
  if (target) target.textContent = "Solicitando ubicación…";
  try { pendingLocation = await requestPosition(); if (target) target.textContent = `GPS disponible · precisión ±${Math.round(pendingLocation.accuracy)} m`; return pendingLocation; }
  catch (error) { if (target) target.textContent = `${error.message}. Se guardará sin GPS.`; return null; }
}

function bind(name, id) {
  app.querySelectorAll("[data-go]").forEach(element => element.addEventListener("click", () => go(element.dataset.go)));
  if (name === "activate") document.querySelector("#activationForm").addEventListener("submit", event => { event.preventDefault(); state.technicianId = document.querySelector("#technicianSelect").value; state.activated = true; saveState(); go("home"); });
  if (["quick", "capture"].includes(name)) {
    const input = document.querySelector("#manualPh"); input.addEventListener("input", () => updateReading(input.value, "manual"));
    document.querySelector("#useManual").addEventListener("click", () => updateReading(input.value, "manual"));
    document.querySelector("#connectButton").addEventListener("click", () => { updateReading(sensor.simulateReading(), "simulated"); toast("Lectura simulada recibida"); });
  }
  if (name === "quick") document.querySelector("#saveQuick").addEventListener("click", async () => {
    const input = document.querySelector("#manualPh"), location = await captureLocation(document.querySelector("#quickGps").checked, "#gpsState");
    const now = new Date().toISOString(); const technician = activeTechnician();
    const record = { id: crypto.randomUUID(), session_id: null, technician_id: technician.id, country_id: technician.country_id, sample_number: null, ph: Number(input.value), temperature_c: null, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, gps_accuracy_m: location?.accuracy ?? null, source: input.dataset.source || "manual", captured_at: now, updated_at: now, sync_status: "pending" };
    await put("measurements", record); await enqueue("measurements", record); toast("Medición guardada localmente"); go("home");
  });
  if (name === "new") {
    const farmSelect = document.querySelector("#farmSelect"); farmSelect.addEventListener("change", () => go(`new/${farmSelect.value}`));
    document.querySelector("#newSessionForm").addEventListener("submit", async event => { event.preventDefault(); const technician = activeTechnician(), now = new Date().toISOString(); const session = { id: crypto.randomUUID(), technician_id: technician.id, country_id: technician.country_id, farm_id: farmSelect.value, lot_id: document.querySelector("#lotSelect").value, campaign_id: document.querySelector("#campaignSelect").value, crop: "coffee", target_samples: Number(document.querySelector("#targetSelect").value), status: "in_progress", started_at: now, completed_at: null, updated_at: now, sync_status: "pending", summary: null }; await put("sessions", session); await enqueue("sessions", session); state.currentSessionId = session.id; saveState(); go(`capture/${session.id}`); });
  }
  if (name === "capture") {
    document.querySelector("#savePoint").addEventListener("click", async () => { const session = await get("sessions", id), existing = await measurementsForSession(id); if (existing.length >= session.target_samples) return go(`result/${id}`); const input = document.querySelector("#manualPh"), location = await captureLocation(document.querySelector("#captureGps").checked, "#gpsState"); const now = new Date().toISOString(); const record = { id: crypto.randomUUID(), session_id: session.id, technician_id: session.technician_id, country_id: session.country_id, farm_id: session.farm_id, lot_id: session.lot_id, campaign_id: session.campaign_id, sample_number: existing.length + 1, ph: Number(input.value), temperature_c: document.querySelector("#temperature").value === "" ? null : Number(document.querySelector("#temperature").value), latitude: location?.latitude ?? null, longitude: location?.longitude ?? null, gps_accuracy_m: location?.accuracy ?? null, source: input.dataset.source || "manual", captured_at: now, updated_at: now, sync_status: "pending" }; await put("measurements", record); await enqueue("measurements", record); const points = [...existing, record]; session.updated_at = now; if (points.length >= session.target_samples) { session.status = "completed"; session.completed_at = now; session.summary = summarize(points.map(item => item.ph)); state.currentSessionId = null; } await put("sessions", session); await enqueue("sessions", session); saveState(); if (session.status === "completed") go(`result/${session.id}`); else { toast(`Punto ${record.sample_number} guardado`); render(); } });
    document.querySelector("#undoPoint")?.addEventListener("click", async () => { const points = await measurementsForSession(id), last = points.at(-1); if (!last) return; await remove("measurements", last.id); await discardPendingForRecord("measurements", last.id); const session = await get("sessions", id); session.status = "in_progress"; session.completed_at = null; session.summary = null; session.updated_at = new Date().toISOString(); await put("sessions", session); await enqueue("sessions", session); toast("Último punto eliminado"); render(); });
  }
  if (name === "history") document.querySelector("#exportHistory")?.addEventListener("click", async () => { const sessions = await completedSessionsForLot(id); downloadCSV(`historial-${id}.csv`, sessions.map(session => ({ campana: currentCampaign(session.campaign_id)?.name, fecha: session.completed_at || session.started_at, mediana: session.summary?.median, promedio: session.summary?.mean, desviacion: session.summary?.stddev, puntos: session.summary?.count, sincronizacion: session.sync_status }))); });
  if (name === "compare") app.querySelectorAll("[data-compare-lot]").forEach(button => button.addEventListener("click", () => { const lotId = button.dataset.compareLot, selected = [...state.compareLots]; if (selected.includes(lotId)) state.compareLots = selected.filter(item => item !== lotId); else if (selected.length < 3) state.compareLots = [...selected, lotId]; else { document.querySelector("#compareError").textContent = "Máximo 3 lotes. Desactiva uno antes de seleccionar otro."; return; } saveState(); render(); }));
  if (name === "maps") {
    document.querySelector("#mapCampaign").addEventListener("change", event => { state.mapCampaignId = event.target.value; saveState(); render(); });
    app.querySelectorAll("[data-map-lot]").forEach(button => button.addEventListener("click", () => { const lotId = button.dataset.mapLot, selected = [...state.mapLots]; if (selected.includes(lotId)) { document.querySelector("#mapError").textContent = "La comparación requiere exactamente 2 lotes."; return; } state.mapLots = [selected.at(-1), lotId].filter(Boolean); saveState(); render(); }));
  }
}

backButton.addEventListener("click", () => history.back());
networkButton.addEventListener("click", () => go("sync"));
window.addEventListener("hashchange", render);
window.addEventListener("online", () => { updateChrome(); toast("Conexión recuperada"); });
window.addEventListener("offline", () => { updateChrome(); toast("Modo offline: los datos seguirán guardándose localmente"); });

try {
  [demoData, agronomy] = await Promise.all([seedDemoData(), loadAgronomy()]);
  if (!location.hash) go(state.activated ? "home" : "activate"); else render();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js");
} catch (error) {
  console.error(error); app.innerHTML = `<div class="notice error"><strong>No fue posible iniciar la aplicación.</strong><br>${escapeHTML(error.message)}</div>`;
}
