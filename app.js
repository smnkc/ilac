// app.js

// State
let state = {
    medications: [],
    logs: [],
    currentView: 'dashboard'
};

// DOM Elements
const views = {
    dashboard: document.getElementById('view-dashboard'),
    medications: document.getElementById('view-medications'),
    history: document.getElementById('view-history')
};

const containers = {
    dashboard: document.getElementById('dashboard-items-container'),
    medications: document.getElementById('medications-container'),
    history: document.getElementById('history-container')
};

const navItems = document.querySelectorAll('.nav-item');
const addMedBtn = document.getElementById('addMedBtn');
const modal = document.getElementById('addMedModal');
const medForm = document.getElementById('medForm');
const colorOptions = document.querySelectorAll('.color-option');
const closeModalBtns = document.querySelectorAll('.close-modal');

// New Elements for Multiple Times
const addTimeBtn = document.getElementById('addTimeBtn');
const timesListContainer = document.getElementById('timesListContainer');

// Init
function init() {
    loadData();
    migrateData();
    seedInitialDataIfEmpty();
    render();
    setupEventListeners();
}

function loadData() {
    const savedMeds = localStorage.getItem('meditrack_meds');
    const savedLogs = localStorage.getItem('meditrack_logs');
    
    if (savedMeds) state.medications = JSON.parse(savedMeds);
    if (savedLogs) state.logs = JSON.parse(savedLogs);
}

function migrateData() {
    let changed = false;
    state.medications.forEach(med => {
        if (med.time && !med.times) {
            med.times = [med.time];
            delete med.time;
            changed = true;
        }
        if (med.initial_quantity === undefined) {
            med.initial_quantity = med.current_quantity || 20;
            changed = true;
        }
    });
    if (changed) saveData();
}

function saveData() {
    localStorage.setItem('meditrack_meds', JSON.stringify(state.medications));
    localStorage.setItem('meditrack_logs', JSON.stringify(state.logs));
}

function seedInitialDataIfEmpty() {
    if (!Array.isArray(state.medications)) state.medications = [];
    if (!Array.isArray(state.logs)) state.logs = [];
}

// Render Logic
function render() {
    updateViews();
    
    if (state.currentView === 'dashboard') {
        renderDashboard();
        addMedBtn.style.display = 'none';
    } else if (state.currentView === 'medications') {
        renderMedications();
        addMedBtn.style.display = 'flex';
    } else if (state.currentView === 'history') {
        renderHistory();
        addMedBtn.style.display = 'none';
    }
}

function updateViews() {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[state.currentView].classList.add('active');
    
    navItems.forEach(nav => {
        if (nav.dataset.target === state.currentView) {
            nav.classList.add('active');
        } else {
            nav.classList.remove('active');
        }
    });
}

function getTodayString() {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
}

function renderDashboard() {
    const todayStr = getTodayString();
    let dashboardItems = [];
    
    state.medications.forEach(med => {
        if (!med.deleted_at && med.current_quantity > 0) {
            (med.times || []).forEach(time => {
                dashboardItems.push({
                    medication: med,
                    scheduledTime: time,
                    status: 'pending'
                });
            });
        }
    });
    
    dashboardItems.sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
    const todaysLogs = state.logs.filter(l => l.scheduled_for_date === todayStr);
    
    let takenCount = 0;
    dashboardItems.forEach(item => {
        const hasTaken = todaysLogs.some(l => 
            l.medication_id === item.medication.id && 
            l.scheduled_time === item.scheduledTime
        );
        if (hasTaken) {
            item.status = 'taken';
            takenCount++;
        }
    });
    
    const totalItems = dashboardItems.length;
    const progressText = document.getElementById('progress-text');
    const progressBarFill = document.getElementById('progress-bar-fill');
    
    progressText.innerText = `${takenCount}/${totalItems}`;
    progressBarFill.style.width = totalItems > 0 ? `${(takenCount/totalItems)*100}%` : '0%';
    
    // --- Low Stock Alerts ---
    const lowStockMeds = state.medications.filter(m => !m.deleted_at && m.current_quantity <= 5);
    let alertsHtml = '';
    if (lowStockMeds.length > 0) {
        alertsHtml = `
        <div class="alert-section">
            <div class="alert-header">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                Kritik Stok Uyarıları
            </div>
            <div class="alert-items">`;
        
        lowStockMeds.forEach(med => {
            alertsHtml += `
            <div class="alert-item">
                <div>
                    <span style="font-weight:700;">${escapeHTML(med.name)}</span>
                    <span class="small text-gray" style="margin-left:0.5rem;">Kalan: ${med.current_quantity} adet</span>
                </div>
                <button class="btn-text-emerald" onclick="refillAndRender('${med.id}')" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">+ Paket Yenile</button>
            </div>`;
        });
        alertsHtml += '</div></div>';
    }
    // --- End Low Stock Alerts ---
    
    if (totalItems === 0) {
       containers.dashboard.innerHTML = alertsHtml + `<div class="empty-state"><p>Bugün için planlanmış ilaç yok veya stoklar tükendi.</p></div>`;
       return;
    }
    
    const grouped = { 'Sabah': [], 'Öğle': [], 'Akşam / Gece': [] };
    dashboardItems.forEach(item => {
        if (item.scheduledTime < '12:00') grouped['Sabah'].push(item);
        else if (item.scheduledTime < '18:00') grouped['Öğle'].push(item);
        else grouped['Akşam / Gece'].push(item);
    });
    
    let html = '';
    Object.keys(grouped).forEach(title => {
        const items = grouped[title];
        if (items.length === 0) return;
        html += `<div class="section-container"><h3 class="section-title">${title}</h3><div class="med-cards-container">`;
        items.forEach(item => {
            const med = item.medication;
            const isTaken = item.status === 'taken';
            html += `<div class="med-card ${isTaken ? 'is-taken' : ''}"><div class="med-info"><div class="med-icon bg-${med.color}">${med.name.charAt(0).toUpperCase()}</div><div class="med-details"><h4>${escapeHTML(med.name)}</h4><div class="med-meta"><span class="badge badge-subtle">${escapeHTML(med.dosage)}</span>${med.description ? `<span class="text-emerald">${escapeHTML(med.description)}</span>` : ''}<span>${item.scheduledTime}</span></div>${(!isTaken && med.current_quantity <= 5) ? `<div class="text-critical small mt-1">Sadece ${med.current_quantity} adet kaldı!</div>` : ''}</div></div><div class="med-action">${isTaken ? `<div class="status-taken"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span>ALINDI</span></div>` : `<button class="btn-check" onclick="takeMedication('${med.id}', '${item.scheduledTime}')" aria-label="İlacı Al"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></button>`}</div></div>`;
        });
        html += `</div></div>`;
    });
    containers.dashboard.innerHTML = alertsHtml + html;
}

function renderMedications() {
    const medsToRender = state.medications.filter(m => !m.deleted_at);
    if (medsToRender.length === 0) {
        containers.medications.innerHTML = `<div class="empty-state"><p>Kayıtlı ilaç bulunmuyor. Eklemek için + butonuna basın.</p></div>`;
        return;
    }
    let html = '';
    medsToRender.forEach(med => {
        const percent = Math.min(100, Math.max(0, (med.current_quantity / (med.initial_quantity || 20)) * 100));
        const isLow = med.current_quantity <= 5;
        const timesText = (med.times || []).join(', ');
        html += `<div class="med-list-item ${med.current_quantity === 0 ? 'finished' : ''}"><div class="med-info" style="margin-bottom: 1rem;"><div class="med-icon bg-${med.color}">${med.name.charAt(0).toUpperCase()}</div><div class="med-details"><h4>${escapeHTML(med.name)}</h4><div class="med-meta" style="flex-wrap: wrap;"><span class="badge">${escapeHTML(med.dosage)}</span><span>${timesText}</span>${med.description ? `<span style="color:var(--gray-500)">${escapeHTML(med.description)}</span>` : ''}</div></div></div><div class="med-inventory"><div class="d-flex-between small text-gray mb-1"><span>Stok: <strong class="${isLow ? 'text-critical' : ''}">${med.current_quantity} adet</strong></span><span class="small">(Kutu: ${med.initial_quantity})</span></div><div class="inventory-bar"><div class="inventory-fill ${isLow ? 'bg-red' : ''}" style="width: ${percent}%"></div></div></div><div class="med-actions-row"><button class="btn-icon" onclick="editMedication('${med.id}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button><button class="btn-icon text-emerald" onclick="refillMedication('${med.id}')" title="Kutu Yenile"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.85 1 6.64 2.64L21 8"></path><path d="M21 3v5h-5"></path></svg></button><button class="btn-icon text-critical" onclick="deleteMedication('${med.id}')"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button></div></div>`;
    });
    containers.medications.innerHTML = html;
}

// --- History Logic Starts ---

function renderHistory() {
    let html = `
    <div class="backup-controls">
        <button class="btn-secondary" onclick="exportData()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
            Dışa Aktar
        </button>
        <button class="btn-secondary" onclick="document.getElementById('importFile').click()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
            İçe Aktar
        </button>
    </div>
    
    <div class="search-container">
        <svg class="search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <input type="search" id="historySearch" class="search-input" placeholder="İlaç adı ile geçmişte ara..." value="${state.historySearchQuery || ''}" oninput="handleHistorySearch(this.value)">
    </div>

    <div class="history-accordion">`;

    if (state.logs.length === 0 && state.medications.length === 0) {
        html += `<div class="empty-state"><p>Henüz kayıt bulunmuyor.</p></div></div>`;
        containers.history.innerHTML = html;
        return;
    }

    if (state.logs.length === 0) {
        html += `<div class="empty-state"><p>Geçmiş kayıt bulunmuyor.</p></div></div>`;
        containers.history.innerHTML = html;
        return;
    }

    const logs = [...state.logs]
        .filter(log => {
            if (!state.historySearchQuery) return true;
            const med = state.medications.find(m => m.id === log.medication_id);
            return med && med.name.toLowerCase().includes(state.historySearchQuery.toLowerCase());
        })
        .sort((a,b) => new Date(b.taken_at) - new Date(a.taken_at));
    const hierarchy = {};

    logs.forEach(log => {
        const d = new Date(log.taken_at);
        const year = d.getFullYear();
        const month = d.toLocaleDateString('tr-TR', { month: 'long' });
        const day = d.toLocaleDateString('tr-TR', { day: 'numeric', weekday: 'long' });
        
        if (!hierarchy[year]) hierarchy[year] = {};
        if (!hierarchy[year][month]) hierarchy[year][month] = {};
        if (!hierarchy[year][month][day]) hierarchy[year][month][day] = [];
        
        hierarchy[year][month][day].push(log);
    });

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleDateString('tr-TR', { month: 'long' });
    const currentDay = now.toLocaleDateString('tr-TR', { day: 'numeric', weekday: 'long' });

    // let html = '<div class="history-accordion">'; // Removed as it's now openened above
    
    // Years
    Object.keys(hierarchy).sort((a,b) => b-a).forEach(year => {
        const idYear = `year-${year}`;
        const isActiveYear = parseInt(year) === currentYear ? 'active' : '';
        html += `<div class="accordion-item ${isActiveYear}" id="${idYear}">
            <div class="accordion-header" onclick="toggleAccordion('${idYear}')">
                <h4><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"></path></svg>${year} Yılı</h4>
                <div class="header-actions-inline">
                    <button class="btn-bulk-delete" onclick="deleteHistoryBulk(event, '${year}')" title="Tüm Yılı Sil">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                    <svg class="chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </div>
            <div class="accordion-content level-month">`;

        // Months
        const months = hierarchy[year];
        const monthOrder = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        Object.keys(months).sort((a,b) => monthOrder.indexOf(b) - monthOrder.indexOf(a)).forEach(month => {
            const idMonth = `month-${year}-${month}`;
            const isActiveMonth = (parseInt(year) === currentYear && month === currentMonth) ? 'active' : '';
            html += `<div class="accordion-item ${isActiveMonth}" id="${idMonth}">
                <div class="accordion-header" onclick="toggleAccordion('${idMonth}')">
                    <h4>${month}</h4>
                    <div class="header-actions-inline">
                        <button class="btn-bulk-delete" onclick="deleteHistoryBulk(event, '${year}', '${month}')" title="Tüm Ayı Sil">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                        </button>
                        <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </div>
                </div>
                <div class="accordion-content level-day">`;

            // Days
            const days = months[month];
            Object.keys(days).forEach(day => {
                const idDay = `day-${year}-${month}-${day.replace(/\s/g, '')}`;
                const isActiveDay = (isActiveMonth && day === currentDay) ? 'active' : '';
                html += `<div class="accordion-item ${isActiveDay}" id="${idDay}">
                    <div class="accordion-header" onclick="toggleAccordion('${idDay}')">
                        <h4>${day}</h4>
                        <div class="header-actions-inline">
                            <button class="btn-bulk-delete" onclick="deleteHistoryBulk(event, '${year}', '${month}', '${day}')" title="Bugünü Sil">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                            <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </div>
                    </div>
                    <div class="accordion-content">`;

                // Logs
                days[day].forEach(log => {
                    const med = state.medications.find(m => m.id === log.medication_id) || { name: 'Silinmiş İlaç', color: 'gray', dosage: '-' };
                    const dLocal = new Date(log.taken_at);
                    const timeLabel = dLocal.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                    
                    html += `<div class="history-item">
                        <div class="d-flex align-center gap-sm">
                            <div class="history-color-dot bg-${med.color}" style="width:8px; height:8px; border-radius:50%"></div>
                            <div>
                                <div style="font-weight:600; font-size:0.9rem;">${escapeHTML(med.name)}</div>
                                <div class="small text-gray">${log.scheduled_time || ''} Dozu • ${escapeHTML(med.dosage)}</div>
                            </div>
                        </div>
                        <div class="d-flex align-center gap-sm">
                            <div class="text-gray" style="font-size:0.8rem; font-weight:500; margin-right: 0.5rem;">${timeLabel}</div>
                            <div class="history-actions">
                                <button class="btn-icon edit" onclick="editHistoryLog('${log.id}')" title="Saati Düzenle">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button class="btn-icon delete" onclick="deleteHistoryLog('${log.id}')" title="Bu Kaydı Sil">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                            </div>
                        </div>
                    </div>`;
                });

                html += `</div></div>`; // Close Day
            });
            html += `</div></div>`; // Close Month
        });
        html += `</div></div>`; // Close Year
    });

    html += '</div>';
    containers.history.innerHTML = html;
}

window.toggleAccordion = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.toggle('active');
        if(navigator.vibrate) navigator.vibrate(5);
    }
};

window.deleteHistoryLog = function(id) {
    if (!confirm("Bu kaydı silmek istediğinize emin misiniz? (İlaç adedi kutuya geri eklenecektir)")) return;
    const idx = state.logs.findIndex(l => l.id === id);
    if (idx > -1) {
        const log = state.logs[idx];
        const med = state.medications.find(m => m.id === log.medication_id);
        if (med) {
            med.current_quantity = Number(med.current_quantity || 0) + 1;
        }
        
        state.logs.splice(idx, 1);
        saveData();
        render(); // Use global render to update both History and Medications/Dashboard
        if(navigator.vibrate) navigator.vibrate(20);
    }
};

window.editHistoryLog = function(id) {
    const log = state.logs.find(l => l.id === id);
    if (!log) return;
    
    const d = new Date(log.taken_at);
    const currentVal = d.toISOString().slice(0, 16);
    const newVal = prompt("Yeni içilme tarih ve saatini girin (YYYY-MM-DDTHH:mm):", currentVal);
    
    if (newVal && newVal !== currentVal) {
        log.taken_at = new Date(newVal).toISOString();
        saveData();
        render();
    }
};

window.deleteHistoryBulk = function(event, year, month = null, day = null) {
    event.stopPropagation();
    
    let msg = `${year} yılına ait TÜM kayıtları silmek istediğinize emin misiniz? (İlaçlar kutuya geri eklenecektir)`;
    if (day) msg = `${day} tarihine ait TÜM kayıtları silmek istediğinize emin misiniz? (İlaçlar kutuya geri eklenecektir)`;
    else if (month) msg = `${month} ${year} dönemine ait TÜM kayıtları silmek istediğinize emin misiniz? (İlaçlar kutuya geri eklenecektir)`;
    
    if (!confirm(msg)) return;
    
    const yearStr = String(year);
    
    state.logs.forEach(log => {
        const d = new Date(log.taken_at);
        const logYear = d.getFullYear().toString();
        const logMonth = d.toLocaleDateString('tr-TR', { month: 'long' });
        const logDay = d.toLocaleDateString('tr-TR', { day: 'numeric', weekday: 'long' });
        
        let shouldDelete = false;
        if (day) shouldDelete = (logYear === yearStr && logMonth === month && logDay === day);
        else if (month) shouldDelete = (logYear === yearStr && logMonth === month);
        else shouldDelete = (logYear === yearStr);

        if (shouldDelete) {
            const med = state.medications.find(m => m.id === log.medication_id);
            if (med) {
                med.current_quantity = Number(med.current_quantity || 0) + 1;
            }
        }
    });

    state.logs = state.logs.filter(log => {
        const d = new Date(log.taken_at);
        const logYear = d.getFullYear().toString();
        const logMonth = d.toLocaleDateString('tr-TR', { month: 'long' });
        const logDay = d.toLocaleDateString('tr-TR', { day: 'numeric', weekday: 'long' });
        
        if (day) return !(logYear === yearStr && logMonth === month && logDay === day);
        if (month) return !(logYear === yearStr && logMonth === month);
        return logYear !== yearStr;
    });
    
    saveData();
    render();
    if(navigator.vibrate) navigator.vibrate(40);
};

window.exportData = function() {
    const backup = {
        medications: state.medications,
        logs: state.logs,
        exportedAt: new Date().toISOString(),
        version: '2.0'
    };
    
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchorNode.setAttribute("download", `meditrack_yedek_${dateStr}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
};

window.handleImport = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm("Bu yedek dosyası yüklendiğinde mevcut tüm verileriniz SİLİNECEK ve yedeğinizdeki veriler yüklenecektir. Onaylıyor musunuz?")) {
        event.target.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            if (!importedData.medications || !Array.isArray(importedData.medications)) {
                throw new Error("Geçersiz yedek dosyası formatı.");
            }
            
            state.medications = importedData.medications;
            state.logs = importedData.logs || [];
            saveData();
            alert("Veriler başarıyla geri yüklendi!");
            window.location.reload();
        } catch (err) {
            alert("Hata: " + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

window.handleHistorySearch = function(query) {
    state.historySearchQuery = query;
    renderHistory();
};

window.refillAndRender = function(id) {
    const medIdx = state.medications.findIndex(m => m.id === id);
    if (medIdx > -1) {
        const refill = state.medications[medIdx].initial_quantity || 20;
        state.medications[medIdx].current_quantity += refill;
        saveData();
        render(); // Force refresh dashboard to update alert
    }
};

// --- History Logic Ends ---

// Actions
window.takeMedication = function(id, scheduledTime) {
    const medObjIndex = state.medications.findIndex(m => m.id === id);
    if (medObjIndex === -1) return;
    if (state.medications[medObjIndex].current_quantity > 0) {
        state.medications[medObjIndex].current_quantity -= 1;
    }
    state.logs.push({
        id: generateId(),
        medication_id: id,
        taken_at: new Date().toISOString(),
        status: 'taken',
        scheduled_time: scheduledTime,
        scheduled_for_date: getTodayString()
    });
    saveData();
    if(navigator.vibrate) navigator.vibrate(50);
    renderDashboard();
};

window.deleteMedication = function(id) {
    if(!confirm("İlacı silmek istediğinize emin misiniz?")) return;
    const medIdx = state.medications.findIndex(m => m.id === id);
    if (medIdx > -1) {
        state.medications[medIdx].deleted_at = new Date().toISOString();
        saveData();
        renderMedications();
    }
};

window.refillMedication = function(id) {
    const medIdx = state.medications.findIndex(m => m.id === id);
    if (medIdx > -1) {
        const refill = state.medications[medIdx].initial_quantity || 20;
        state.medications[medIdx].current_quantity += refill;
        saveData();
        renderMedications();
    }
};

window.editMedication = function(id) {
    const med = state.medications.find(m => m.id === id);
    if(!med) return;
    document.getElementById('medId').value = med.id;
    document.getElementById('medName').value = med.name;
    document.getElementById('medDosage').value = med.dosage;
    document.getElementById('medDesc').value = med.description || '';
    document.getElementById('medQuantity').value = med.initial_quantity || med.current_quantity;
    document.getElementById('medCurrentQuantity').value = med.current_quantity;
    timesListContainer.innerHTML = '';
    const st = [...(med.times || [])].sort();
    if (st.length === 0) addTimeInput();
    else st.forEach(t => addTimeInput(t));
    setColorSelection(med.color);
    modal.classList.add('active');
};

function addTimeInput(val = '') {
    const div = document.createElement('div');
    div.className = 'time-input-group';
    div.innerHTML = `<input type="time" class="form-input med-time-input" required value="${val}"><button type="button" class="btn-remove-time" onclick="this.parentElement.remove()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;
    timesListContainer.appendChild(div);
}

addTimeBtn.addEventListener('click', () => addTimeInput());

medForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('medId').value;
    const name = document.getElementById('medName').value;
    const dosage = document.getElementById('medDosage').value;
    const description = document.getElementById('medDesc').value;
    const quantity = parseInt(document.getElementById('medQuantity').value, 10);
    const currentQuantity = parseInt(document.getElementById('medCurrentQuantity').value, 10);
    const color = document.getElementById('medColor').value;
    const tIns = document.querySelectorAll('.med-time-input');
    const times = Array.from(tIns).map(i => i.value).filter(v => v);
    
    if (id) {
        const i = state.medications.findIndex(m => m.id === id);
        if(i > -1) state.medications[i] = { ...state.medications[i], name, dosage, description, times, initial_quantity: quantity, current_quantity: currentQuantity, color };
    } else {
        state.medications.push({ id: generateId(), name, dosage, description, times, initial_quantity: quantity, current_quantity: currentQuantity, color, deleted_at: null });
    }
    saveData();
    modal.classList.remove('active');
    medForm.reset();
    document.getElementById('medId').value = '';
    setColorSelection('green');
    render();
});

function setColorSelection(c) {
    document.getElementById('medColor').value = c;
    colorOptions.forEach(b => {
        if (b.dataset.color === c) b.classList.add('selected');
        else b.classList.remove('selected');
    });
}

function setupEventListeners() {
    navItems.forEach(n => {
        n.addEventListener('click', (e) => {
            const t = e.currentTarget.dataset.target;
            state.currentView = t;
            render();
            if(navigator.vibrate) navigator.vibrate(10);
        });
    });
    addMedBtn.addEventListener('click', () => {
        medForm.reset();
        document.getElementById('medId').value = '';
        document.getElementById('medQuantity').value = '20';
        document.getElementById('medCurrentQuantity').value = '20';
        timesListContainer.innerHTML = '';
        addTimeInput();
        setColorSelection('green');
        modal.classList.add('active');
    });
    closeModalBtns.forEach(b => b.addEventListener('click', () => modal.classList.remove('active')));
    colorOptions.forEach(b => b.addEventListener('click', (e) => setColorSelection(e.currentTarget.dataset.color)));
}

function generateId() { return 'med_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36); }
function escapeHTML(s) { if (!s) return ''; return s.replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t] || t)); }

init();
