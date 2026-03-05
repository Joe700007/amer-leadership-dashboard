// Sales Leadership Dashboard - Full Tabbed Interface

let data = null;
let tasks = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    setupTabs();
    setupDragDrop();
    updateTime();
    setInterval(updateTime, 60000);
});

// Setup drag-drop zones
function setupDragDrop() {
    document.querySelectorAll('.task-list').forEach(col => {
        col.addEventListener('dragover', allowDrop);
        col.addEventListener('dragleave', dragLeave);
        col.addEventListener('drop', drop);
    });
}

// Load data
async function loadData() {
    // Load tasks first (small file, critical)
    try {
        const tasksRes = await fetch('tasks.json');
        const tasksData = await tasksRes.json();
        tasks = tasksData.tasks || [];
        console.log('Loaded tasks:', tasks.length);
    } catch(e) {
        console.error('Error loading tasks:', e);
        tasks = [];
    }
    
    // Load pipeline data (larger, can fail gracefully)
    try {
        const dataRes = await fetch('data.json');
        data = await dataRes.json();
    } catch(e) {
        console.error('Error loading data.json:', e);
        data = null;
    }
    
    renderAll();
}

// Setup tabs
function setupTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab + '-tab').classList.add('active');
            renderTabContent(tab.dataset.tab);
        });
    });
}

// Update time
function updateTime() {
    const now = new Date();
    document.getElementById('last-update').textContent = 'Updated: ' + now.toLocaleTimeString();
}

// Render all
function renderAll() {
    renderTasks();
    renderTabContent('tasks');
}

// Render tasks
function renderTasks() {
    const openTasks = tasks.filter(t => t.status === 'open');
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const p1 = openTasks.filter(t => t.priority === 'p1');
    const p2 = openTasks.filter(t => t.priority === 'p2');
    const p3 = openTasks.filter(t => t.priority === 'p3');

    document.getElementById('p1-count').textContent = p1.length;
    document.getElementById('p2-count').textContent = p2.length;
    document.getElementById('p3-count').textContent = p3.length;
    document.getElementById('p4-count').textContent = completedTasks.length;

    document.getElementById('p1-tasks').innerHTML = p1.map(renderTaskCard).join('');
    document.getElementById('p2-tasks').innerHTML = p2.map(renderTaskCard).join('');
    document.getElementById('p3-tasks').innerHTML = p3.map(renderTaskCard).join('');
    document.getElementById('completed-tasks').innerHTML = completedTasks.map(renderTaskCard).join('');
}

// Render task card
function renderTaskCard(task) {
    const age = getAge(task.created);
    const initials = task.assignee ? task.assignee.split(' ').map(n => n[0]).join('').slice(0,2) : '?';
    const tags = (task.tags || []).map(t => `<span class="task-tag tag-${t.toLowerCase()}">${t}</span>`).join('');
    
    return `
        <div class="task-card" data-id="${task.id}" draggable="true" ondragstart="dragStart(event)" ondragend="dragEnd(event)">
            <div class="task-title" contenteditable="true" onblur="updateTaskTitle('${task.id}', this.innerText)" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${task.title}</div>
            <div class="task-meta">
                <span class="task-tag impact-${task.impact}">${task.impact} Impact</span>
                ${tags}
                <span class="task-age">${age}</span>
            </div>
            ${task.desc ? `<div class="task-desc" style="font-size:12px;color:var(--text-secondary);margin-bottom:8px">${truncate(task.desc, 100)}</div>` : ''}
            <div class="task-footer">
                <div class="task-assignee">
                    <span class="avatar">${initials}</span>
                    ${task.assignee || 'Unassigned'}
                </div>
                <div class="task-actions">
                    <button class="task-btn complete" onclick="completeTask(${task.id})">✓</button>
                    <button class="task-btn dismiss" onclick="dismissTask(${task.id})">✗</button>
                </div>
            </div>
        </div>
    `;
}

// Get age string
function getAge(timestamp) {
    const days = Math.floor((Date.now() - timestamp) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return '1d old';
    return days + 'd old';
}

// Truncate string
function truncate(str, len) {
    return str.length > len ? str.slice(0, len) + '...' : str;
}

// Complete task
function completeTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.status = 'completed';
        renderTasks();
        saveData();
    }
}

// Dismiss task
function dismissTask(id) {
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.status = 'dismissed';
        renderTasks();
        saveData();
    }
}

// Update task title (inline edit)
function updateTaskTitle(id, newTitle) {
    const task = tasks.find(t => t.id === id);
    if (task && newTitle.trim()) {
        task.title = newTitle.trim();
        saveData();
    }
}

// Drag and Drop
let draggedTask = null;

function dragStart(e) {
    draggedTask = e.target.closest('.task-card');
    draggedTask.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedTask.dataset.id);
}

function dragEnd(e) {
    if (draggedTask) {
        draggedTask.classList.remove('dragging');
        draggedTask = null;
    }
    document.querySelectorAll('.task-list').forEach(col => col.classList.remove('drag-over'));
}

function allowDrop(e) {
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
}

function dragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function drop(e) {
    e.preventDefault();
    const column = e.currentTarget;
    column.classList.remove('drag-over');
    
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find(t => t.id === taskId || t.id == taskId);
    
    if (task) {
        // Get new priority from column id
        const columnId = column.id;
        if (columnId === 'p1-tasks') task.priority = 'p1';
        else if (columnId === 'p2-tasks') task.priority = 'p2';
        else if (columnId === 'p3-tasks') task.priority = 'p3';
        else if (columnId === 'completed-tasks') task.status = 'completed';
        
        renderTasks();
        saveData();
    }
}

// Show add task modal
function showAddTask(priority = 'p2') {
    document.getElementById('task-priority').value = priority;
    document.getElementById('task-modal').classList.add('active');
}

// Close modal
function closeModal() {
    document.getElementById('task-modal').classList.remove('active');
    document.getElementById('task-form').reset();
}

// Save task
function saveTask(e) {
    e.preventDefault();
    const task = {
        id: Date.now(),
        title: document.getElementById('task-title').value,
        desc: document.getElementById('task-desc').value,
        priority: document.getElementById('task-priority').value,
        impact: document.getElementById('task-impact').value,
        assignee: document.getElementById('task-assignee').value.replace('@', ''),
        tags: document.getElementById('task-tags').value.split(',').map(t => t.trim()).filter(t => t),
        created: Date.now(),
        status: 'open'
    };
    tasks.unshift(task);
    closeModal();
    renderTasks();
    saveData();
}

// Save data to server
function saveData() {
    // Save to server (persists to tasks.json)
    fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tasks: tasks })
    }).catch(err => {
        console.error('Failed to save tasks:', err);
        // Fallback to localStorage
        localStorage.setItem('dashboard-tasks', JSON.stringify(tasks));
    });
}

// Render tab content
function renderTabContent(tabId) {
    switch(tabId) {
        case 'agents': renderAgents(); break;
        case 'cron': renderCron(); break;
        case 'activity': renderActivity(); break;
        case 'meddpicc': renderMeddpicc(); break;
        case 'coaching': renderCoaching(); break;
        case 'battlecards': renderBattlecards(); break;
        case 'scorecards': renderScorecards(); break;
        case 'weekly': renderWeekly(); break;
        case 'pipeline': renderPipeline(); break;
    }
}

// Render Agents
function renderAgents() {
    document.getElementById('agents-list').innerHTML = `
        <div class="agent-card">
            <h3>🤖 Regi</h3>
            <p style="color:var(--text-secondary);margin:8px 0">Revenue Intelligence Agent</p>
            <p><span class="status-indicator idle"></span> Idle</p>
            <p style="margin-top:12px;font-size:13px">Last active: Just now</p>
        </div>
        <div class="agent-card">
            <h3>🔮 Xander</h3>
            <p style="color:var(--text-secondary);margin:8px 0">Predictive Analytics Agent</p>
            <p><span class="status-indicator idle"></span> Idle</p>
            <p style="margin-top:12px;font-size:13px">Last active: 2 hours ago</p>
        </div>
    `;
}

// Render Cron
function renderCron() {
    document.getElementById('cron-list').innerHTML = `
        <div class="cron-item">
            <strong>SFDC Data Sync</strong>
            <p style="color:var(--text-secondary);margin-top:4px">Daily at 6:00 AM</p>
            <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Last run: Today 6:00 AM ✓</p>
        </div>
        <div class="cron-item">
            <strong>Pipeline Forecast Update</strong>
            <p style="color:var(--text-secondary);margin-top:4px">Every 4 hours</p>
            <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Last run: 2 hours ago ✓</p>
        </div>
        <div class="cron-item">
            <strong>Weekly Report Generation</strong>
            <p style="color:var(--text-secondary);margin-top:4px">Monday at 8:00 AM</p>
            <p style="font-size:12px;color:var(--text-muted);margin-top:8px">Next run: Monday</p>
        </div>
    `;
}

// Render Activity
function renderActivity() {
    document.getElementById('activity-list').innerHTML = `
        <div class="activity-item">
            <strong>Task completed</strong> — "Update MEDDIC scoring" by Sean
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px">2 hours ago</p>
        </div>
        <div class="activity-item">
            <strong>New task created</strong> — "Apollo.io evaluation" by Joe
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px">Yesterday</p>
        </div>
        <div class="activity-item">
            <strong>Pipeline updated</strong> — $420K added to Q1 forecast
            <p style="font-size:12px;color:var(--text-muted);margin-top:4px">Yesterday</p>
        </div>
    `;
}

// Render MEDDPICC
function renderMeddpicc() {
    document.getElementById('meddpicc-content').innerHTML = `
        <div class="agent-card">
            <h3>📊 MEDDPICC Coverage</h3>
            <div style="margin-top:16px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Metrics</span><span>45%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-yellow);width:45%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Economic Buyer</span><span>62%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-blue);width:62%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Decision Criteria</span><span>58%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-blue);width:58%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Decision Process</span><span>41%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-yellow);width:41%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Paper Process</span><span>35%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-red);width:35%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Identify Pain</span><span>72%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-green);width:72%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Champion</span><span>34%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-red);width:34%;height:100%;border-radius:4px"></div></div>
            </div>
            <div style="margin-top:12px">
                <div style="display:flex;justify-content:space-between;margin-bottom:8px"><span>Competition</span><span>55%</span></div>
                <div style="background:var(--bg-dark);border-radius:4px;height:8px"><div style="background:var(--accent-blue);width:55%;height:100%;border-radius:4px"></div></div>
            </div>
        </div>
    `;
}

// Render Coaching
function renderCoaching() {
    document.getElementById('coaching-content').innerHTML = `
        <div class="agent-card">
            <h3>🎓 Coaching Queue</h3>
            <p style="color:var(--text-secondary);margin:12px 0">Recent calls flagged for review</p>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                <strong>Discovery Call - TechCorp</strong>
                <p style="font-size:13px;color:var(--text-secondary)">Erik Ingle • 45 min • Yesterday</p>
                <p style="font-size:12px;margin-top:8px">⚠️ Missed economic buyer identification</p>
            </div>
            <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
                <strong>Demo - GlobalHealth</strong>
                <p style="font-size:13px;color:var(--text-secondary)">Mike Jakubisin • 32 min • 2 days ago</p>
                <p style="font-size:12px;margin-top:8px">✓ Strong pain identification</p>
            </div>
        </div>
    `;
}

// Render Battlecards
function renderBattlecards() {
    const competitors = [
        { name: "Twilio", winRate: 62, strengths: ["Brand recognition", "Developer docs"], weaknesses: ["Pricing 40% higher", "No dedicated support"], tactics: ["Lead with TCO analysis", "Highlight 24/7 support"] },
        { name: "Vonage", winRate: 71, strengths: ["Enterprise presence", "UC platform"], weaknesses: ["Complex pricing", "Slower onboarding"], tactics: ["Emphasize time-to-value", "Show transparent pricing"] },
        { name: "Bandwidth", winRate: 58, strengths: ["Owned network", "Porting speed"], weaknesses: ["Limited global reach", "Basic API"], tactics: ["Focus on global coverage", "Demo advanced features"] },
        { name: "Plivo", winRate: 75, strengths: ["Low pricing"], weaknesses: ["Limited support", "Reliability issues"], tactics: ["Reference uptime SLA", "Enterprise case studies"] }
    ];
    
    document.getElementById('battlecards-content').innerHTML = competitors.map(c => `
        <div class="battlecard">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
                <h3>${c.name}</h3>
                <span style="color:var(--accent-green)">${c.winRate}% win rate</span>
            </div>
            <div style="margin-bottom:12px">
                <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Their Strengths</div>
                <ul style="font-size:13px;padding-left:16px">${c.strengths.map(s => `<li>${s}</li>`).join('')}</ul>
            </div>
            <div style="margin-bottom:12px">
                <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Their Weaknesses</div>
                <ul style="font-size:13px;padding-left:16px">${c.weaknesses.map(w => `<li>${w}</li>`).join('')}</ul>
            </div>
            <div>
                <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:6px">Win Tactics</div>
                <ul style="font-size:13px;padding-left:16px">${c.tactics.map(t => `<li>${t}</li>`).join('')}</ul>
            </div>
        </div>
    `).join('');
}

// Render Scorecards
function renderScorecards() {
    const reps = data?.reps || [
        { name: "Erik Ingle", team: "Foxtrot", winRate: 26.8, wins: 11, losses: 30, pipeline: 820000, avgDeal: 20000 },
        { name: "Mike Jakubisin", team: "Alpha", winRate: 22.5, wins: 9, losses: 31, pipeline: 720000, avgDeal: 16000 },
        { name: "Arielle Gelman", team: "Zulu", winRate: 28.1, wins: 9, losses: 23, pipeline: 510000, avgDeal: 16000 },
        { name: "Lisa Park", team: "Alpha", winRate: 31.0, wins: 9, losses: 20, pipeline: 540000, avgDeal: 21000 },
        { name: "Joseph Parker", team: "Zulu", winRate: 21.5, wins: 8, losses: 29, pipeline: 580000, avgDeal: 15000 },
    ];
    
    document.getElementById('scorecards-content').innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Rep</th>
                    <th>Team</th>
                    <th>Win Rate</th>
                    <th>W/L</th>
                    <th>Pipeline</th>
                    <th>Avg Deal</th>
                </tr>
            </thead>
            <tbody>
                ${reps.map(r => `
                    <tr>
                        <td><strong>${r.name}</strong></td>
                        <td>${r.team}</td>
                        <td style="color:${r.winRate >= 25 ? 'var(--accent-green)' : r.winRate >= 20 ? 'var(--accent-yellow)' : 'var(--accent-red)'}">${r.winRate}%</td>
                        <td>${r.wins}/${r.losses}</td>
                        <td>$${(r.pipeline/1000).toFixed(0)}K</td>
                        <td>$${(r.avgDeal/1000).toFixed(0)}K</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Render Weekly
function renderWeekly() {
    document.getElementById('weekly-content').innerHTML = `
        <div class="agent-card">
            <h3>📅 Weekly Summary</h3>
            <p style="color:var(--text-secondary);margin:12px 0">Week of March 3, 2026</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:20px">
                <div style="text-align:center;padding:16px;background:var(--bg-dark);border-radius:8px">
                    <div style="font-size:28px;font-weight:700;color:var(--accent-green)">$420K</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Closed Won</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--bg-dark);border-radius:8px">
                    <div style="font-size:28px;font-weight:700;color:var(--accent-blue)">12</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Meetings Held</div>
                </div>
                <div style="text-align:center;padding:16px;background:var(--bg-dark);border-radius:8px">
                    <div style="font-size:28px;font-weight:700;color:var(--accent-yellow)">5</div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">Proposals Sent</div>
                </div>
            </div>
        </div>
    `;
}

// Render Pipeline
function renderPipeline() {
    document.getElementById('pipeline-content').innerHTML = `
        <div class="chart-container">
            <h3>📊 Pipeline by Stage</h3>
            <canvas id="stage-chart"></canvas>
        </div>
        <div class="chart-container">
            <h3>💰 Pipeline by Team</h3>
            <canvas id="team-chart"></canvas>
        </div>
    `;
    
    setTimeout(() => {
        new Chart(document.getElementById('stage-chart'), {
            type: 'bar',
            data: {
                labels: ['AE Qual', 'Discovery', 'Proposal', 'Testing', 'Ramp Up'],
                datasets: [{
                    label: 'Deals',
                    data: [45, 62, 38, 28, 12],
                    backgroundColor: '#3b82f6'
                }]
            },
            options: {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { color: '#1e1f2a' }, ticks: { color: '#64748b' } },
                    y: { grid: { display: false }, ticks: { color: '#64748b' } }
                }
            }
        });
        
        new Chart(document.getElementById('team-chart'), {
            type: 'doughnut',
            data: {
                labels: ['Zulu', 'Foxtrot', 'Alpha'],
                datasets: [{
                    data: [1800000, 1400000, 1000000],
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b']
                }]
            },
            options: {
                plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8' } } }
            }
        });
    }, 100);
}

// Expose functions globally
window.showAddTask = showAddTask;
window.closeModal = closeModal;
window.saveTask = saveTask;
window.completeTask = completeTask;
window.dismissTask = dismissTask;
