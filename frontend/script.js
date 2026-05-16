/**
 * EcoGrid — Smart Waste Management System
 * =========================================
 * Fully connects frontend to Flask backend at localhost:5000.
 * Features:
 *   - Section-based SPA navigation
 *   - Dashboard KPI cards loaded from API
 *   - Bin monitoring grid with live filter
 *   - Fleet / truck status cards
 *   - Complaint submission form with validation
 *   - Complaint history with status colour-coding & filter
 *   - Analytics section with 3 Chart.js charts
 *   - Live clock in topbar
 *   - Toast notifications
 *   - Auto-refresh every 60 seconds
 */

const API = "http://127.0.0.1:8000/api";

// ─── Stored chart instances (so we can destroy before re-drawing) ───
const charts = {};

// ─────────────────────────────────────────────────────────────
//  NAVIGATION
// ─────────────────────────────────────────────────────────────

const SECTIONS = {
  dashboard:  { id: "sec-dashboard", title: "Dashboard" },
  bins:       { id: "sec-bins",      title: "Bin Monitor" },
  trucks:     { id: "sec-trucks",    title: "Fleet Status" },
  complaints: { id: "sec-complaints",title: "Raise a Complaint" },
  history:    { id: "sec-history",   title: "Complaint History" },
  analytics:  { id: "sec-analytics", title: "Analytics" },
};

/** Activate a section and update nav highlight */
function navigate(key) {
  // Hide all sections
  Object.values(SECTIONS).forEach(s => {
    document.getElementById(s.id)?.classList.remove("active");
  });

  // Show chosen section
  const sec = SECTIONS[key];
  if (!sec) return;
  document.getElementById(sec.id)?.classList.add("active");
  document.getElementById("pageTitle").textContent = sec.title;

  // Highlight nav item
  document.querySelectorAll(".nav-item").forEach(el => {
    el.classList.toggle("active", el.dataset.section === key);
  });

  // Lazy-load section data
  if (key === "bins")       loadBins();
  if (key === "trucks")     loadTrucks();
  if (key === "history")    loadComplaints();
  if (key === "analytics")  loadAnalytics();
}

// Wire nav items
document.querySelectorAll(".nav-item").forEach(el => {
  el.addEventListener("click", e => {
    e.preventDefault();
    navigate(el.dataset.section);
    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("open");
  });
});

// Mobile hamburger
document.getElementById("menuToggle")?.addEventListener("click", () => {
  document.getElementById("sidebar").classList.toggle("open");
});

// ─────────────────────────────────────────────────────────────
//  LIVE CLOCK
// ─────────────────────────────────────────────────────────────

function updateClock() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  document.getElementById("timeDisplay").textContent = `${hh}:${mm}:${ss}`;
}
setInterval(updateClock, 1000);
updateClock();

// ─────────────────────────────────────────────────────────────
//  TOAST NOTIFICATION
// ─────────────────────────────────────────────────────────────

function showToast(msg, duration = 3000) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), duration);
}

// ─────────────────────────────────────────────────────────────
//  FETCH HELPERS
// ─────────────────────────────────────────────────────────────

/** GET wrapper — returns parsed JSON or null on error */
async function apiFetch(endpoint) {
  try {
    const res = await fetch(`${API}${endpoint}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[apiFetch] ${endpoint}`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD
// ─────────────────────────────────────────────────────────────

async function loadDashboard() {
  const data = await apiFetch("/dashboard");
  if (!data) {
    showToast("⚠ Cannot reach backend — is app.py running?");
    return;
  }
  animateCounter("kTotalBins",  data.total_bins);
  animateCounter("kCritical",   data.critical_bins);
  animateCounter("kPending",    data.pending_complaints);
  animateCounter("kTrucks",     data.active_trucks);
  animateCounter("kAvgFill",    data.avg_fill_level, "%");
  animateCounter("kTotalComp",  data.total_complaints);
}

/** Smooth number animation for KPI cards */
function animateCounter(id, target, suffix = "") {
  const el = document.getElementById(id);
  if (!el) return;
  const start = 0;
  const duration = 700;
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(start + (target - start) * eased) + suffix;
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─────────────────────────────────────────────────────────────
//  BINS
// ─────────────────────────────────────────────────────────────

let allBins = [];

async function loadBins() {
  const bins = await apiFetch("/bins");
  if (!bins) return;
  allBins = bins;
  renderBins(bins);
}

function renderBins(bins) {
  const grid = document.getElementById("binGrid");
  if (!grid) return;
  grid.innerHTML = "";

  if (bins.length === 0) {
    grid.innerHTML = `<p style="color:var(--text-sub);grid-column:1/-1">No bins match this filter.</p>`;
    return;
  }

  bins.forEach(bin => {
    const color = fillColor(bin.fill_level);
    grid.insertAdjacentHTML("beforeend", `
      <div class="bin-card">
        <div class="bin-card-top">
          <div>
            <div class="bin-code">${bin.bin_code || "BIN-" + bin.id}</div>
            <div class="bin-location">${bin.location}</div>
          </div>
          <span class="bin-badge badge-${bin.status}">${bin.status}</span>
        </div>
        <div class="fill-row">
          <span class="fill-label">Fill Level</span>
          <span class="fill-pct" style="color:${color}">${bin.fill_level}%</span>
        </div>
        <div class="fill-bar-bg">
          <div class="fill-bar-fg" style="width:${bin.fill_level}%;background:${color}"></div>
        </div>
        <div class="bin-meta">
          📍 ${bin.area || "—"} &nbsp;·&nbsp; Last emptied: ${bin.last_emptied || "—"}
        </div>
      </div>
    `);
  });
}

/** Return CSS colour string for a fill percentage */
function fillColor(level) {
  if (level >= 90) return "var(--red)";
  if (level >= 80) return "#f47e58";
  if (level >= 50) return "var(--amber)";
  return "var(--green)";
}

// Bin filter buttons
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const f = btn.dataset.filter;
    renderBins(f === "all" ? allBins : allBins.filter(b => b.status === f));
  });
});

// ─────────────────────────────────────────────────────────────
//  TRUCKS
// ─────────────────────────────────────────────────────────────

async function loadTrucks() {
  const trucks = await apiFetch("/trucks");
  if (!trucks) return;

  document.getElementById("truckCount").textContent = `${trucks.length} vehicles`;
  const grid = document.getElementById("truckGrid");
  grid.innerHTML = "";

  trucks.forEach(t => {
    const cls = "status-" + (t.status || "Idle").replace(" ", "");
    grid.insertAdjacentHTML("beforeend", `
      <div class="truck-card">
        <div class="truck-header">
          <span class="truck-code">${t.truck_code}</span>
          <span class="truck-status-badge ${cls}">${t.status}</span>
        </div>
        <div class="truck-driver">👤 ${t.driver}</div>
        <div class="truck-area">📍 Area: ${t.area}</div>
        <div class="truck-time">Last updated: ${t.last_updated}</div>
      </div>
    `);
  });
}

// ─────────────────────────────────────────────────────────────
//  COMPLAINT SUBMISSION
// ─────────────────────────────────────────────────────────────

async function submitComplaint() {
  const name     = document.getElementById("cName").value.trim();
  const location = document.getElementById("cLocation").value.trim();
  const category = document.getElementById("cCategory").value;
  const desc     = document.getElementById("cDesc").value.trim();
  const msgEl    = document.getElementById("formMsg");
  const btn      = document.getElementById("submitBtn");

  // Basic validation
  msgEl.className = "form-msg";
  if (!name || !location || !desc) {
    msgEl.textContent = "Please fill in all fields before submitting.";
    msgEl.className = "form-msg msg-err";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const res = await fetch(`${API}/complaints`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, location, description: desc, category })
    });
    const data = await res.json();

    if (res.ok) {
      msgEl.textContent = "✅ " + data.message;
      msgEl.className = "form-msg msg-ok";
      // Clear form
      document.getElementById("cName").value = "";
      document.getElementById("cLocation").value = "";
      document.getElementById("cDesc").value = "";
      showToast("Complaint #" + data.id + " submitted!");
      loadDashboard(); // refresh KPI cards
    } else {
      throw new Error(data.message || "Unknown error");
    }
  } catch (err) {
    msgEl.textContent = "❌ Failed to submit: " + err.message;
    msgEl.className = "form-msg msg-err";
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Complaint";
  }
}

// ─────────────────────────────────────────────────────────────
//  COMPLAINT HISTORY
// ─────────────────────────────────────────────────────────────

let allComplaints = [];

async function loadComplaints() {
  const data = await apiFetch("/complaints");
  if (!data) return;
  allComplaints = data;
  renderComplaints(data);
}

function renderComplaints(items) {
  const list = document.getElementById("complaintList");
  if (!list) return;
  list.innerHTML = "";

  if (items.length === 0) {
    list.innerHTML = `<p style="color:var(--text-sub)">No complaints found for this filter.</p>`;
    return;
  }

  items.forEach(c => {
    // Format created_at to a readable string
    const date = c.created_at ? c.created_at.split(" ")[0] : "—";
    const time = c.created_at ? c.created_at.split(" ")[1]?.substring(0, 5) : "";

    // CSS class for status (replace space with dash for class)
    const statusCls = (c.status || "Pending").replace(/\s+/g, "\\ ");

    list.insertAdjacentHTML("beforeend", `
      <div class="complaint-item status-${(c.status || "Pending").replace(/\s+/g, "-")}">
        <div>
          <div class="comp-top">
            <span class="comp-name">${escHtml(c.name)}</span>
            <span class="comp-cat">${escHtml(c.category || "General")}</span>
          </div>
          <div class="comp-location">📍 ${escHtml(c.location)}</div>
          <div class="comp-desc">${escHtml(c.description)}</div>
          <div class="comp-footer">
            Submitted: ${date} ${time}
            ${c.resolved_at ? ` &nbsp;·&nbsp; Resolved: ${c.resolved_at}` : ""}
          </div>
        </div>
        <div class="comp-right">
          <span class="comp-status ${c.status || "Pending"}">${c.status || "Pending"}</span>
          <span class="comp-id">#${c.id}</span>
        </div>
      </div>
    `);
  });
}

/** Prevent XSS by escaping HTML special chars */
function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// History filter buttons
document.querySelectorAll(".hist-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".hist-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const f = btn.dataset.hfilter;
    renderComplaints(f === "all" ? allComplaints : allComplaints.filter(c => c.status === f));
  });
});

// ─────────────────────────────────────────────────────────────
//  ANALYTICS CHARTS (using Chart.js 4)
// ─────────────────────────────────────────────────────────────

const CHART_DEFAULTS = {
  color: "#6b7d93",
  grid:  "#1f2c3d",
};

async function loadAnalytics() {
  const data = await apiFetch("/analytics");
  if (!data) return;

  drawLineChart(data.weekly_collection);
  drawBarChart(data.fill_distribution);

  // For complaints category / resolution, also load complaints
  const complaints = await apiFetch("/complaints");
  if (complaints) {
    drawCategoryChart(complaints);
    drawResolutionChart(complaints);
  }
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

/** Line chart: weekly collection totals */
function drawLineChart(weekly) {
  destroyChart("analyticsLine");
  const ctx = document.getElementById("analyticsLine");
  if (!ctx) return;
  charts.analyticsLine = new Chart(ctx, {
    type: "line",
    data: {
      labels: weekly.labels,
      datasets: [{
        label: "Tons Collected",
        data:  weekly.values,
        fill: true,
        borderColor: "rgba(0,196,179,1)",
        backgroundColor: "rgba(0,196,179,0.08)",
        pointBackgroundColor: "rgba(0,196,179,1)",
        tension: 0.4,
        borderWidth: 2,
      }]
    },
    options: chartOptions("Tons")
  });
}

/** Doughnut chart: bin status distribution (used on dashboard too) */
function drawDonutChart(distribution) {
  destroyChart("donut");
  const ctx = document.getElementById("donutChart");
  if (!ctx) return;
  charts.donut = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(distribution),
      datasets: [{
        data:  Object.values(distribution),
        backgroundColor: [
          "rgba(68,212,144,0.85)",
          "rgba(245,166,35,0.85)",
          "rgba(244,88,88,0.85)",
          "rgba(244,88,88,0.5)",
        ],
        borderColor: "rgba(0,0,0,0)",
        hoverOffset: 6,
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#6b7d93", font: { family: "'DM Sans'" } } }
      },
      cutout: "65%",
    }
  });
}

/** Horizontal bar chart for analytics fill distribution */
function drawBarChart(distribution) {
  destroyChart("analyticsBar");
  const ctx = document.getElementById("barChart");
  if (!ctx) return;
  charts.analyticsBar = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(distribution),
      datasets: [{
        label: "Number of Bins",
        data: Object.values(distribution),
        backgroundColor: [
          "rgba(68,212,144,0.8)",
          "rgba(245,166,35,0.8)",
          "rgba(244,88,88,0.8)",
          "rgba(244,88,88,0.4)",
        ],
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: chartOptions("bins")
  });
}

/** Bar chart: complaints by category */
function drawCategoryChart(complaints) {
  destroyChart("category");
  const ctx = document.getElementById("categoryChart");
  if (!ctx) return;

  // Count by category
  const cats = {};
  complaints.forEach(c => {
    const k = c.category || "General";
    cats[k] = (cats[k] || 0) + 1;
  });

  charts.category = new Chart(ctx, {
    type: "bar",
    data: {
      labels: Object.keys(cats),
      datasets: [{
        label: "Complaints",
        data:  Object.values(cats),
        backgroundColor: "rgba(77,159,245,0.7)",
        borderRadius: 5,
        borderSkipped: false,
      }]
    },
    options: {
      ...chartOptions("count"),
      indexAxis: "y",  // horizontal bars
    }
  });
}

/** Doughnut: resolution status breakdown */
function drawResolutionChart(complaints) {
  destroyChart("resolution");
  const ctx = document.getElementById("resolutionChart");
  if (!ctx) return;

  const counts = { Pending: 0, "In Progress": 0, Resolved: 0 };
  complaints.forEach(c => {
    const s = c.status || "Pending";
    if (counts[s] !== undefined) counts[s]++;
  });

  charts.resolution = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: Object.keys(counts),
      datasets: [{
        data: Object.values(counts),
        backgroundColor: [
          "rgba(245,166,35,0.85)",
          "rgba(77,159,245,0.85)",
          "rgba(68,212,144,0.85)",
        ],
        borderColor: "rgba(0,0,0,0)",
        hoverOffset: 6,
      }]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#6b7d93", font: { family: "'DM Sans'" } } }
      },
      cutout: "60%",
    }
  });
}

/** Shared Chart.js options for line/bar charts */
function chartOptions(unit) {
  return {
    plugins: {
      legend: { labels: { color: "#6b7d93", font: { family: "'DM Sans'" } } }
    },
    scales: {
      x: {
        ticks: { color: "#6b7d93", font: { family: "'DM Sans'", size: 11 } },
        grid:  { color: "#1f2c3d" },
      },
      y: {
        ticks: {
          color: "#6b7d93",
          font: { family: "'DM Sans'", size: 11 },
          callback: v => v + (unit === "%" ? "%" : "")
        },
        grid: { color: "#1f2c3d" },
      }
    },
    responsive: true,
    maintainAspectRatio: true,
  };
}

// ─────────────────────────────────────────────────────────────
//  DASHBOARD CHARTS (smaller versions in the dashboard section)
// ─────────────────────────────────────────────────────────────

async function loadDashboardCharts() {
  const data = await apiFetch("/analytics");
  if (!data) return;

  // Mini line chart in dashboard
  destroyChart("line");
  const lineCtx = document.getElementById("lineChart");
  if (lineCtx) {
    charts.line = new Chart(lineCtx, {
      type: "line",
      data: {
        labels: data.weekly_collection.labels,
        datasets: [{
          label: "Tons Collected",
          data:  data.weekly_collection.values,
          fill: true,
          borderColor: "rgba(0,196,179,1)",
          backgroundColor: "rgba(0,196,179,0.06)",
          pointBackgroundColor: "rgba(0,196,179,1)",
          tension: 0.4,
          borderWidth: 2,
        }]
      },
      options: chartOptions("tons")
    });
  }

  // Donut in dashboard
  drawDonutChart(data.fill_distribution);

  // Bar chart (area stats)
  destroyChart("areaBars");
  const barCtx = document.getElementById("barChart");
  if (barCtx) {
    charts.areaBars = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: data.area_stats.labels,
        datasets: [{
          label: "Avg Fill %",
          data:  data.area_stats.values,
          backgroundColor: data.area_stats.values.map(v =>
            v >= 80 ? "rgba(244,88,88,0.75)"
            : v >= 50 ? "rgba(245,166,35,0.75)"
            : "rgba(68,212,144,0.75)"
          ),
          borderRadius: 5,
          borderSkipped: false,
        }]
      },
      options: chartOptions("%")
    });
  }
}

// ─────────────────────────────────────────────────────────────
//  GLOBAL REFRESH
// ─────────────────────────────────────────────────────────────

async function refreshAll() {
  showToast("↻ Refreshing data…");
  await loadDashboard();
  await loadDashboardCharts();
  showToast("✅ Data refreshed!");
}

// ─────────────────────────────────────────────────────────────
//  AUTO-REFRESH every 60 seconds
// ─────────────────────────────────────────────────────────────
setInterval(async () => {
  await loadDashboard();
  // Only redraw dashboard charts if dashboard is visible
  if (document.getElementById("sec-dashboard").classList.contains("active")) {
    await loadDashboardCharts();
  }
}, 60000);

// ─────────────────────────────────────────────────────────────
//  INITIALISE ON PAGE LOAD
// ─────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  // Start on dashboard
  navigate("dashboard");
  await loadDashboard();
  await loadDashboardCharts();
});
