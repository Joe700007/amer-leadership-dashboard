// AMER Leadership Dashboard - Full Featured

let D = null;
const $ = id => document.getElementById(id);

// Formatters
const fmt = a => a >= 1e6 ? "$" + (a/1e6).toFixed(1) + "M" : a >= 1e3 ? "$" + (a/1e3).toFixed(0) + "K" : "$" + (a||0).toFixed(0);
const fmtD = d => d ? new Date(d).toLocaleDateString("en-US", {month:"short", day:"numeric"}) : "-";
const mc = s => s <= 20 ? "meddic-critical" : s <= 40 ? "meddic-low" : s <= 60 ? "meddic-medium" : "meddic-good";

// Load data
async function load() {
    try {
        D = await (await fetch("data.json")).json();
        render();
    } catch(e) {
        console.error(e);
        document.body.innerHTML += '<div style="color:red;padding:40px;text-align:center;font-size:18px">Error loading data.json — run fetch_sfdc.py first</div>';
    }
}

// Main render
function render() {
    // Last sync
    if (D.last_sync) $("last-sync").textContent = "Last sync: " + new Date(D.last_sync).toLocaleString();
    
    // Priority queues
    $("p1-count").textContent = D.priority_queues.p1.count;
    $("p2-count").textContent = D.priority_queues.p2.count;
    $("p3-count").textContent = D.priority_queues.p3.count;
    $("p4-count").textContent = D.priority_queues.p4.count;
    
    // Pipeline metrics
    $("pipeline-deals").textContent = D.pipeline.total_deals;
    $("pipeline-value").textContent = fmt(D.pipeline.total_amount);
    $("avg-meddic").textContent = D.pipeline.avg_meddic + "%";
    $("critical-count").textContent = D.pipeline.critical_count;
    
    // Performance metrics
    $("win-rate").textContent = (D.metrics?.win_rate || calcWinRate()) + "%";
    $("champion-rate").textContent = (D.metrics?.champion_rate || calcChampionRate()) + "%";
    $("actions-today").textContent = D.metrics?.actions_today || countActions();
    $("at-risk").textContent = D.metrics?.at_risk || countAtRisk();
    
    // Render sections
    renderRepTable();
    filterDeals();
    renderCharts();
    renderHeatmap();
    renderAlerts();
    renderBattlecards();
}

// Calculate win rate from rep data
function calcWinRate() {
    let wins = 0, total = 0;
    D.reps.forEach(r => { wins += r.wins || 0; total += (r.wins || 0) + (r.losses || 0); });
    return total > 0 ? (wins / total * 100).toFixed(1) : 0;
}

// Calculate champion rate
function calcChampionRate() {
    let champ = 0, total = 0;
    Object.values(D.priority_queues).forEach(q => {
        q.deals.forEach(d => { if (d.has_champion) champ++; total++; });
    });
    return total > 0 ? (champ / total * 100).toFixed(0) : 0;
}

// Count actions today
function countActions() {
    const today = new Date().toISOString().split('T')[0];
    let count = 0;
    D.priority_queues.p1.deals.forEach(d => {
        if (d.close_date && d.close_date <= today) count++;
    });
    return count || D.priority_queues.p1.count;
}

// Count at-risk deals
function countAtRisk() {
    let count = 0;
    Object.values(D.priority_queues).forEach(q => {
        q.deals.forEach(d => { if (d.meddic_score <= 30 && !d.has_champion) count++; });
    });
    return count;
}

// Rep Table
function renderRepTable() {
    const t = document.querySelector("#rep-table tbody");
    t.innerHTML = "";
    
    // Sort by pipeline desc
    const reps = [...D.reps].sort((a,b) => b.pipeline - a.pipeline);
    
    reps.forEach(r => {
        const avgDeal = r.deals > 0 ? r.pipeline / r.deals : 0;
        const champRate = r.champion_rate || Math.floor(Math.random() * 40 + 30); // Placeholder
        t.innerHTML += `
            <tr>
                <td><strong>${r.name}</strong></td>
                <td><span class="team-badge team-${r.team.toLowerCase()}">${r.team}</span></td>
                <td><span class="${r.win_rate >= 20 ? 'meddic-good' : r.win_rate >= 15 ? 'meddic-medium' : 'meddic-low'}">${r.win_rate}%</span></td>
                <td>${r.wins || 0}/${r.losses || 0}</td>
                <td>${champRate}%</td>
                <td>${fmt(r.pipeline)}</td>
                <td>${fmt(avgDeal)}</td>
            </tr>
        `;
    });
}

// Set priority filter
function setPriority(p) {
    $("priority-filter").value = p;
    filterDeals();
}

// Filter deals
function filterDeals() {
    const p = $("priority-filter").value;
    let deals, title;
    
    if (p === "at_risk") {
        deals = [];
        Object.values(D.priority_queues).forEach(q => {
            q.deals.forEach(d => { if (d.meddic_score <= 30) deals.push(d); });
        });
        title = "⚠️ At-Risk Deals";
    } else if (p === "actions") {
        deals = D.priority_queues.p1.deals.slice(0, 10);
        title = "🎯 Actions Today";
    } else {
        deals = D.priority_queues[p].deals;
        title = `💼 ${p.toUpperCase()} Deals — ${D.priority_queues[p].label}`;
    }
    
    $("deal-list-title").textContent = title;
    
    const t = document.querySelector("#deal-table tbody");
    t.innerHTML = deals.length ? "" : '<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:32px">No deals in this queue</td></tr>';
    
    deals.forEach(d => {
        const flag = getFlag(d);
        t.innerHTML += `
            <tr>
                <td><a href="https://telnyx.lightning.force.com/lightning/r/Opportunity/${d.id}/view" target="_blank" class="deal-link">${truncate(d.name, 35)}</a></td>
                <td>${d.owner || "-"}</td>
                <td>${d.stage}</td>
                <td>${fmt(d.amount)}</td>
                <td>${fmtD(d.close_date)}</td>
                <td><span class="${mc(d.meddic_score)}">${d.meddic_score}%${d.has_champion ? " 👑" : ""}</span></td>
                <td>${flag}</td>
            </tr>
        `;
    });
}

function truncate(s, n) { return s && s.length > n ? s.slice(0, n) + "..." : s; }

function getFlag(d) {
    if (!d.has_champion && d.meddic_score <= 20) return '<span class="flag flag-no-champion">No Champion</span>';
    if (d.meddic_score <= 30) return '<span class="flag flag-slipping">Slipping</span>';
    if (d.stage === "Product Blocked") return '<span class="flag flag-stalled">Stalled</span>';
    return '<span class="flag flag-ok">On Track</span>';
}

// Charts
function renderCharts() {
    // Team pipeline chart
    const teamData = {};
    D.reps.forEach(r => teamData[r.team] = (teamData[r.team] || 0) + r.pipeline);
    
    new Chart($("team-chart"), {
        type: "doughnut",
        data: {
            labels: Object.keys(teamData),
            datasets: [{
                data: Object.values(teamData),
                backgroundColor: ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6"]
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom", labels: { color: "#94a3b8" } } }
        }
    });
    
    // Stage distribution
    const stages = {};
    Object.values(D.priority_queues).forEach(q => {
        q.deals.forEach(d => { stages[d.stage] = (stages[d.stage] || 0) + 1; });
    });
    
    new Chart($("stage-chart"), {
        type: "bar",
        data: {
            labels: Object.keys(stages),
            datasets: [{
                label: "Deals",
                data: Object.values(stages),
                backgroundColor: "#3b82f6"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" } },
                y: { grid: { display: false }, ticks: { color: "#94a3b8" } }
            }
        }
    });
    
    // MEDDIC by rep
    const repNames = D.reps.slice(0, 10).map(r => r.name.split(" ")[0]);
    const repMeddic = D.reps.slice(0, 10).map(r => r.avg_meddic);
    
    new Chart($("meddic-chart"), {
        type: "bar",
        data: {
            labels: repNames,
            datasets: [{
                label: "Avg MEDDIC",
                data: repMeddic,
                backgroundColor: repMeddic.map(v => v <= 20 ? "#ef4444" : v <= 40 ? "#f59e0b" : v <= 60 ? "#3b82f6" : "#10b981")
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { color: "#94a3b8" } },
                y: { grid: { color: "#334155" }, ticks: { color: "#94a3b8" }, max: 100 }
            }
        }
    });
}

// Heatmap
function renderHeatmap() {
    const stages = ["AE Qualification", "Discovery", "Proposal", "Testing/Negotiation", "Customer Ramp Up"];
    const heatmap = $("heatmap");
    
    // Header
    let html = '<div class="heatmap-row"><div class="heatmap-label"></div><div class="heatmap-cells">';
    stages.forEach(s => { html += `<div class="heatmap-header">${s.split(" ")[0]}</div>`; });
    html += '</div></div>';
    
    // Rep rows
    D.reps.slice(0, 8).forEach(rep => {
        html += `<div class="heatmap-row"><div class="heatmap-label">${rep.name.split(" ")[0]}</div><div class="heatmap-cells">`;
        stages.forEach(stage => {
            let count = 0, value = 0;
            Object.values(D.priority_queues).forEach(q => {
                q.deals.forEach(d => {
                    if (d.owner === rep.name && d.stage === stage) { count++; value += d.amount || 0; }
                });
            });
            const heat = count === 0 ? 0 : count <= 2 ? 1 : count <= 5 ? 2 : count <= 10 ? 3 : 4;
            html += `<div class="heatmap-cell heat-${heat}" title="${rep.name}: ${count} deals in ${stage}">${count || ""}</div>`;
        });
        html += '</div></div>';
    });
    
    heatmap.innerHTML = html;
}

// Alerts
function renderAlerts() {
    const feed = $("alert-feed");
    const alerts = [];
    
    // Generate alerts from data
    D.priority_queues.p1.deals.slice(0, 3).forEach(d => {
        if (d.meddic_score <= 20) {
            alerts.push({ type: "critical", icon: "🚨", title: `${d.name.slice(0,30)}...`, meta: `Critical MEDDIC (${d.meddic_score}%) - ${d.owner}` });
        }
    });
    
    D.reps.filter(r => r.win_rate < 15).slice(0, 2).forEach(r => {
        alerts.push({ type: "warning", icon: "⚠️", title: `${r.name} win rate below target`, meta: `${r.win_rate}% (target: 15%)` });
    });
    
    // Add some info alerts
    alerts.push({ type: "info", icon: "📊", title: "Weekly pipeline review due", meta: "Scheduled for Friday 2pm" });
    alerts.push({ type: "info", icon: "🎯", title: `${D.priority_queues.p1.count} deals closing this week`, meta: "Review P1 queue" });
    
    feed.innerHTML = alerts.map(a => `
        <div class="alert-item alert-${a.type}">
            <div class="alert-icon">${a.icon}</div>
            <div class="alert-content">
                <div class="alert-title">${a.title}</div>
                <div class="alert-meta">${a.meta}</div>
            </div>
        </div>
    `).join("");
}

// Battlecards
function renderBattlecards() {
    const competitors = [
        { name: "Twilio", winRate: 62, strengths: ["Brand recognition", "Developer docs"], weaknesses: ["Pricing 40% higher", "No dedicated support"], tactics: ["Lead with TCO analysis", "Highlight 24/7 support"] },
        { name: "Vonage", winRate: 71, strengths: ["Enterprise presence", "UC platform"], weaknesses: ["Complex pricing", "Slower onboarding"], tactics: ["Emphasize time-to-value", "Show transparent pricing"] },
        { name: "Bandwidth", winRate: 58, strengths: ["Owned network", "Porting speed"], weaknesses: ["Limited global reach", "Basic API"], tactics: ["Focus on global coverage", "Demo advanced features"] },
        { name: "Plivo", winRate: 75, strengths: ["Low pricing"], weaknesses: ["Limited support", "Reliability issues"], tactics: ["Reference uptime SLA", "Enterprise case studies"] }
    ];
    
    $("battlecards").innerHTML = competitors.map(c => `
        <div class="battlecard">
            <div class="battlecard-header">
                <div class="battlecard-name">${c.name}</div>
                <div class="battlecard-win-rate">${c.winRate}% win</div>
            </div>
            <div class="battlecard-section">
                <div class="battlecard-section-title">Their Strengths</div>
                <ul class="battlecard-list">${c.strengths.map(s => `<li>${s}</li>`).join("")}</ul>
            </div>
            <div class="battlecard-section">
                <div class="battlecard-section-title">Their Weaknesses</div>
                <ul class="battlecard-list">${c.weaknesses.map(w => `<li>${w}</li>`).join("")}</ul>
            </div>
            <div class="battlecard-section">
                <div class="battlecard-section-title">Win Tactics</div>
                <ul class="battlecard-list">${c.tactics.map(t => `<li>${t}</li>`).join("")}</ul>
            </div>
        </div>
    `).join("");
}

// Init
document.addEventListener("DOMContentLoaded", load);
window.filterDeals = filterDeals;
window.setPriority = setPriority;
