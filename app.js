// Import Firebase modules
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDcWQEzNnf4PuaxWqvWuGAWmRdmMBPIqfk",
  authDomain: "khkt2026-66085.firebaseapp.com",
  databaseURL: "https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "khkt2026-66085",
  storageBucket: "khkt2026-66085.firebasestorage.app",
  messagingSenderId: "173931175906",
  appId: "1:173931175906:web:1b668a14107231c18423bb",
  measurementId: "G-BTHP9SRLJE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);

// ======================
// Global Variables
// ======================
let activityLog = [];
const MAX_LOG_ITEMS = 50;
let schedules = [];
let chargeTimer = null; // Hẹn giờ ngắt sạc
let chargeTimerInterval = null;

// Biến theo dõi state từ Firebase để tránh toggle lặp
let deviceState = {
    quat1: false, quat2: false, coi1: false, coi2: false, relay: false, auto: true
};
let charts = {};
let chartData = {
    temperature: { labels: [], datasets: [] },
    power: { labels: [], datasets: [] },
    battery: { labels: [], data: [] }
};
const MAX_CHART_POINTS = 20;

// ======================
// Utility Functions
// ======================
function updateTime() {
    const now = new Date();
    const timeString = now.toLocaleString('vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('current-time').textContent = timeString;
}

setInterval(updateTime, 1000);
updateTime();

// ======================
// Geolocation API - Lấy vị trí từ Browser
// ======================
function getDeviceLocation() {
    if ('geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                
                console.log(`📍 Vị trí thiết bị: ${lat.toFixed(6)}, ${lon.toFixed(6)} (±${accuracy.toFixed(0)}m)`);
                updateLocationDisplay(lat, lon, accuracy);
                
                // Gửi vị trí lên Firebase (tùy chọn)
                update(ref(database, 'device'), {
                    latitude: lat,
                    longitude: lon,
                    accuracy: accuracy,
                    timestamp: Date.now()
                }).catch(err => console.log('Location update:', err));
            },
            (error) => {
                console.warn('Geolocation error:', error.message);
                // Sử dụng vị trí mặc định: THPT Chuyên Bắc Ninh
                updateLocationDisplay(21.1860, 106.0747, 0);
            }
        );
    } else {
        // Fallback: THPT Chuyên Bắc Ninh
        updateLocationDisplay(21.1860, 106.0747, 0);
    }
}

function updateLocationDisplay(lat, lon, accuracy) {
    const locationEl = document.getElementById('device-location');
    if (locationEl) {
        const locationText = accuracy > 0 
            ? `📍 ${lat.toFixed(4)}, ${lon.toFixed(4)} (±${accuracy.toFixed(0)}m)` 
            : `📍 THPT Chuyên Bắc Ninh`;
        locationEl.textContent = locationText;
        locationEl.title = `Latitude: ${lat}, Longitude: ${lon}`;
    }
}

// Lấy vị trí khi tải trang
getDeviceLocation();

// ======================
// Navigation
// ======================
const navLinks = document.querySelectorAll('.sidebar .nav-link');
const contentSections = document.querySelectorAll('.content-section');

navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetSection = link.dataset.section;
        
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        contentSections.forEach(section => {
            section.classList.remove('active');
            if (section.id === targetSection) {
                section.classList.add('active');
            }
        });
    });
});

// Sidebar Toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
    });
}

// ======================
// Logging System
// ======================
function addLog(message, type = 'info') {
    const now = new Date();
    const timeString = now.toLocaleTimeString('vi-VN');
    
    activityLog.unshift({
        message,
        type,
        time: timeString,
        timestamp: now.getTime()
    });
    
    if (activityLog.length > MAX_LOG_ITEMS) {
        activityLog.pop();
    }
    
    updateLogDisplay();
}

function updateLogDisplay() {
    const logContainer = document.getElementById('log-container');
    
    if (activityLog.length === 0) {
        logContainer.innerHTML = '<div class="alert alert-info"><i class="fas fa-info-circle"></i> Chưa có hoạt động nào được ghi nhận</div>';
        return;
    }
    
    logContainer.innerHTML = activityLog.map(log => `
        <div class="log-item ${log.type} d-flex justify-content-between align-items-center">
            <span class="log-message">${log.message}</span>
            <span class="log-time">${log.time}</span>
        </div>
    `).join('');
}

// Clear logs button
document.getElementById('clear-logs')?.addEventListener('click', () => {
    activityLog = [];
    updateLogDisplay();
    addLog('Đã xóa nhật ký', 'info');
});

// ======================
// Connection Status
// ======================
function updateConnectionStatus(isConnected) {
    const statusElement = document.getElementById('connection-status');
    const sidebarIcon = document.getElementById('sidebar-status-icon');
    const sidebarText = document.getElementById('sidebar-status-text');
    
    if (isConnected) {
        statusElement.className = 'badge bg-success me-2';
        statusElement.innerHTML = '<i class="fas fa-circle"></i> Đã kết nối';
        if (sidebarIcon) sidebarIcon.style.color = '#10b981';
        if (sidebarText) sidebarText.textContent = 'Trực tuyến';
        addLog('Kết nối Firebase thành công', 'success');
    } else {
        statusElement.className = 'badge bg-danger me-2';
        statusElement.innerHTML = '<i class="fas fa-circle"></i> Mất kết nối';
        if (sidebarIcon) sidebarIcon.style.color = '#ef4444';
        if (sidebarText) sidebarText.textContent = 'Ngoại tuyến';
        addLog('Mất kết nối với Firebase', 'danger');
    }
}

// ======================
// Charts Initialization
// ======================
function initCharts() {
    // Temperature Chart
    const tempCtx = document.getElementById('tempChart')?.getContext('2d');
    if (tempCtx) {
        charts.temperature = new Chart(tempCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Bề mặt',
                        data: [],
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Bên trong',
                        data: [],
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.4
                    },
                    {
                        label: 'Môi trường',
                        data: [],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: {
                            display: true,
                            text: 'Nhiệt độ (°C)'
                        }
                    }
                }
            }
        });
    }

    // Device Status Chart (Pie)
    const deviceCtx = document.getElementById('deviceStatusChart')?.getContext('2d');
    if (deviceCtx) {
        charts.deviceStatus = new Chart(deviceCtx, {
            type: 'doughnut',
            data: {
                labels: ['Hoạt động', 'Tắt'],
                datasets: [{
                    data: [0, 6],
                    backgroundColor: ['#10b981', '#e2e8f0'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    // Power Chart
    const powerCtx = document.getElementById('powerChart')?.getContext('2d');
    if (powerCtx) {
        charts.power = new Chart(powerCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'Điện áp (V)',
                        data: [],
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        yAxisID: 'y',
                        tension: 0.4
                    },
                    {
                        label: 'Dòng sạc (A)',
                        data: [],
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        yAxisID: 'y1',
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                interaction: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: {
                            display: true,
                            text: 'Điện áp (V)'
                        }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: {
                            display: true,
                            text: 'Dòng sạc (A)'
                        },
                        grid: {
                            drawOnChartArea: false
                        }
                    }
                }
            }
        });
    }

    // Battery Chart
    const batteryCtx = document.getElementById('batteryChart')?.getContext('2d');
    if (batteryCtx) {
        charts.battery = new Chart(batteryCtx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Pin (%)',
                    data: [],
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Pin (%)'
                        }
                    }
                }
            }
        });
    }
}

// Update charts with new data
function updateCharts(data) {
    const now = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    
    // Temperature Chart
    if (charts.temperature) {
        if (charts.temperature.data.labels.length >= MAX_CHART_POINTS) {
            charts.temperature.data.labels.shift();
            charts.temperature.data.datasets.forEach(dataset => dataset.data.shift());
        }
        
        charts.temperature.data.labels.push(now);
        charts.temperature.data.datasets[0].data.push(parseFloat(data.nhiet_do_be_mat) || 0);
        charts.temperature.data.datasets[1].data.push(parseFloat(data.nhiet_do_ben_trong) || 0);
        charts.temperature.data.datasets[2].data.push(parseFloat(data.nhiet_do_moi_truong) || 0);
        charts.temperature.update('none');
    }

    // Power Chart
    if (charts.power) {
        if (charts.power.data.labels.length >= MAX_CHART_POINTS) {
            charts.power.data.labels.shift();
            charts.power.data.datasets.forEach(dataset => dataset.data.shift());
        }
        
        charts.power.data.labels.push(now);
        charts.power.data.datasets[0].data.push(data.dien_ap || 0);
        charts.power.data.datasets[1].data.push(data.dong_sac || 0);
        charts.power.update('none');
    }

    // Battery Chart
    if (charts.battery) {
        if (charts.battery.data.labels.length >= MAX_CHART_POINTS) {
            charts.battery.data.labels.shift();
            charts.battery.data.datasets[0].data.shift();
        }
        
        charts.battery.data.labels.push(now);
        charts.battery.data.datasets[0].data.push(data.pin_box || 0);
        charts.battery.update('none');
    }

    // Device Status Chart
    if (charts.deviceStatus) {
        const activeDevices = [
            data.quat1, data.quat2, data.coi1, data.coi2, data.relay
        ].filter(Boolean).length;
        
        charts.deviceStatus.data.datasets[0].data = [activeDevices, 5 - activeDevices];
        charts.deviceStatus.update('none');
    }
}

// ======================
// Firebase Real-time Listener - Đọc sensor data từ sensor/
// ======================
const sensorRef = ref(database, 'sensor');
onValue(sensorRef, (snapshot) => {
    if (snapshot.exists()) {
        updateConnectionStatus(true);
        const data = snapshot.val();
        
        // Log data sync từ ESP32
        console.log('📡 Nhận sensor data từ Firebase:', data);
        addLog(`📡 ESP32 → sensor/: Nhận dữ liệu cập nhật (T-bề mặt: ${(data.nhiet_do_be_mat || 0).toFixed(1)}°C, T-trong: ${(data.nhiet_do_ben_trong || 0).toFixed(1)}°C, Pin: ${data.pin_box || 0}%)`, 'info');
        
        // Update mode
        const modeText = document.getElementById('mode-stat');
        const autoModeToggle = document.getElementById('auto-mode-toggle');
        
        if (data.auto !== undefined) {
            autoModeToggle.checked = data.auto;
            if (modeText) {
                modeText.textContent = data.auto ? 'Tự động' : 'Thủ công';
            }
        }
        
        // Update temperatures với kiểm tra giá trị
        const surfaceTemp = parseFloat(data.nhiet_do_be_mat) || 0;
        const insideTemp = parseFloat(data.nhiet_do_ben_trong) || 0;
        const outsideTemp = parseFloat(data.nhiet_do_ben_ngoai) || 0;
        const envTemp = parseFloat(data.nhiet_do_moi_truong) || 0;
        
        console.log(`🌡️ Nhiệt độ bề mặt: ${surfaceTemp}°C`);
        
        updateTemperature('temp-surface', 'temp-surface-bar', surfaceTemp, 50);
        updateTemperature('temp-inside', 'temp-inside-bar', insideTemp, 50);
        updateTemperature('temp-outside', 'temp-outside-bar', outsideTemp, 50);
        updateTemperature('temp-environment', 'temp-environment-bar', envTemp, 50);
        
        // Calculate average temperature
        const avgTemp = ((surfaceTemp + insideTemp + envTemp) / 3).toFixed(1);
        const avgTempEl = document.getElementById('avg-temp');
        if (avgTempEl) avgTempEl.textContent = `${avgTemp}°C`;
        
        // Update power info
        let voltage = parseFloat(data.dien_ap) || 0;
        let current = parseFloat(data.dong_sac) || 0;
        
        // MÔ PHỎNG CÔNG SUẤT SẠC: Khi relay bật, giả lập điện áp 60V và dòng sạc
        if (data.relay === true) {
            voltage = 60; // Điện áp sạc mặc định: 60V
            // Mô phỏng dòng sạc theo thời gian (giả lập từ 2A ban đầu)
            current = 2 + (Math.random() * 0.5); // 2A ± 0.25A
        }
        
        if (voltage !== undefined) {
            document.getElementById('voltage').textContent = voltage.toFixed(1);
            updateProgressBar('voltage-bar', (voltage / 70) * 100); // Max 70V
        }
        
        if (current !== undefined) {
            document.getElementById('current').textContent = current.toFixed(1);
            updateProgressBar('current-bar', (current / 5) * 100); // Max 5A
        }
        
        // Update battery
        if (data.pin_box !== undefined) {
            updateBattery(data.pin_box);
        }
        
        // Calculate power
        const power = (voltage * current).toFixed(1);
        const powerStatEl = document.getElementById('power-stat');
        if (powerStatEl) powerStatEl.textContent = `${power}W`;
        
        // Update device toggles
        updateToggleState('fan1-toggle', 'fan1-status', data.quat1);
        updateToggleState('fan2-toggle', 'fan2-status', data.quat2);
        updateToggleState('buzzer1-toggle', 'buzzer1-status', data.coi1);
        updateToggleState('buzzer2-toggle', 'buzzer2-status', data.coi2);
        updateToggleState('relay-toggle', 'relay-status', data.relay);
        
        // Update charts
        updateCharts(data);
        
        // Check alerts với giá trị đã parse
        checkTemperatureAlert(surfaceTemp, 'bề mặt');
        checkTemperatureAlert(envTemp, 'môi trường');
    }
}, (error) => {
    updateConnectionStatus(false);
    console.error('Firebase error:', error);
});

// Đọc trạng thái thiết bị từ controls/ (do ESP32 cập nhật)
const controlsRef = ref(database, 'controls');
onValue(controlsRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('🔧 Nhận trạng thái controls:', data);
        
        // CẬP NHẬT DEVICE STATE - Để tránh toggle lặp
        deviceState.quat1 = data.quat1 || false;
        deviceState.quat2 = data.quat2 || false;
        deviceState.coi1 = data.coi1 || false;
        deviceState.coi2 = data.coi2 || false;
        deviceState.relay = data.relay || false;
        deviceState.auto = data.auto !== undefined ? data.auto : true;
        
        // Cập nhật chế độ auto
        const modeText = document.getElementById('mode-stat');
        const autoModeToggle = document.getElementById('auto-mode-toggle');
        
        if (data.auto !== undefined) {
            autoModeToggle.checked = data.auto;
            if (modeText) {
                modeText.textContent = data.auto ? 'Tự động' : 'Thủ công';
            }
        }
        
        // Cập nhật trạng thái toggles - Không trigger change event
        updateToggleState('fan1-toggle', 'fan1-status', data.quat1);
        updateToggleState('fan2-toggle', 'fan2-status', data.quat2);
        updateToggleState('buzzer1-toggle', 'buzzer1-status', data.coi1);
        updateToggleState('buzzer2-toggle', 'buzzer2-status', data.coi2);
        
        // Relay - Cập nhật nhưng không làm mất lệnh hẹn giờ nếu có
        if (data.relay !== undefined) {
            const relayToggle = document.getElementById('relay-toggle');
            if (relayToggle && !chargeTimer?.active) {
                // Chỉ cập nhật nếu không có hẹn giờ sạc đang hoạt động
                updateToggleState('relay-toggle', 'relay-status', data.relay);
            } else {
                updateToggleState(null, 'relay-status', data.relay);
            }
        }
        
        // Đồng bộ hẹn giờ sạc từ Firebase
        if (data.charge_timer_active && data.charge_timer_end) {
            if (!chargeTimer || chargeTimer.endTime !== data.charge_timer_end) {
                const durationMs = data.charge_timer_end;
                chargeTimer = {
                    endTime: Date.now() + durationMs,
                    duration: durationMs,
                    active: true
                };
                
                document.getElementById('charge-timer-status').style.display = 'block';
                
                if (chargeTimerInterval) clearInterval(chargeTimerInterval);
                chargeTimerInterval = setInterval(updateChargeTimerDisplay, 1000);
                
                console.log(`📡 Đồng bộ hẹn giờ sạc từ ESP32: ${(durationMs / 1000 / 60).toFixed(0)} phút`);
                addLog(`📡 Đồng bộ hẹn giờ sạc từ ESP32`, 'info');
            }
        } else {
            if (chargeTimer && chargeTimer.active) {
                // ESP đã hủy hẹn giờ (do cảnh báo hoặc pin đầy)
                chargeTimer.active = false;
                chargeTimer = null;
                
                if (chargeTimerInterval) {
                    clearInterval(chargeTimerInterval);
                    chargeTimerInterval = null;
                }
                document.getElementById('charge-timer-status').style.display = 'none';
                
                console.log('📡 ESP32 đã hủy hẹn giờ sạc');
                addLog('📡 ESP32 đã hủy hẹn giờ sạc (cảnh báo/pin đầy)', 'warning');
            }
        }
    }
});

// ======================
// Helper Functions
// ======================
function updateTemperature(textId, barId, value, max = 50) {
    const textEl = document.getElementById(textId);
    const barEl = document.getElementById(barId);
    
    // Parse và kiểm tra giá trị
    const temp = parseFloat(value) || 0;
    
    if (textEl) {
        textEl.textContent = temp.toFixed(1);
    }
    
    if (barEl) {
        const percentage = Math.min((temp / max) * 100, 100);
        barEl.style.width = `${percentage}%`;
        
        // Màu sắc theo nhiệt độ
        if (temp > 45) {
            barEl.className = 'progress-bar bg-danger';
        } else if (temp > 35) {
            barEl.className = 'progress-bar bg-warning';
        } else {
            barEl.className = 'progress-bar bg-success';
        }
    }
}

function updateProgressBar(id, percentage) {
    const el = document.getElementById(id);
    if (el) {
        el.style.width = `${Math.min(percentage, 100)}%`;
    }
}

function updateBattery(value) {
    const batteryEl = document.getElementById('battery');
    const batteryFillEl = document.getElementById('battery-fill');
    const batteryStatEl = document.getElementById('battery-stat');
    const batteryIconEl = document.getElementById('battery-icon');
    
    if (batteryEl) batteryEl.textContent = value;
    if (batteryStatEl) batteryStatEl.textContent = `${value}%`;
    
    if (batteryFillEl) {
        batteryFillEl.style.width = `${value}%`;
        
        if (value < 20) {
            batteryFillEl.className = 'progress-bar progress-bar-striped progress-bar-animated bg-danger';
            if (batteryIconEl) batteryIconEl.className = 'fas fa-battery-empty fa-3x text-danger';
        } else if (value < 50) {
            batteryFillEl.className = 'progress-bar progress-bar-striped progress-bar-animated bg-warning';
            if (batteryIconEl) batteryIconEl.className = 'fas fa-battery-half fa-3x text-warning';
        } else {
            batteryFillEl.className = 'progress-bar progress-bar-striped progress-bar-animated bg-success';
            if (batteryIconEl) batteryIconEl.className = 'fas fa-battery-three-quarters fa-3x text-success';
        }
    }
}

function updateToggleState(toggleId, statusId, value) {
    const toggle = document.getElementById(toggleId);
    const status = document.getElementById(statusId);
    
    if (toggle && status) {
        // Chỉ cập nhật nếu state thực sự thay đổi (để tránh trigger change event)
        if (toggle.checked !== value) {
            toggle.checked = value;
        }
        status.textContent = value ? 'ON' : 'OFF';
        status.className = value ? 'badge bg-success' : 'badge bg-secondary';
    }
}

let lastAlertTime = {};
function checkTemperatureAlert(temp, location) {
    const now = Date.now();
    const ALERT_THRESHOLD = 35;
    const CRITICAL_THRESHOLD = 45;
    const ALERT_COOLDOWN = 60000;
    
    if (temp >= CRITICAL_THRESHOLD) {
        if (!lastAlertTime[location] || now - lastAlertTime[location] > ALERT_COOLDOWN) {
            addLog(`⚠️ NGUY HIỂM: Nhiệt độ ${location} quá cao (${temp.toFixed(1)}°C)!`, 'danger');
            lastAlertTime[location] = now;
        }
    } else if (temp >= ALERT_THRESHOLD) {
        if (!lastAlertTime[location] || now - lastAlertTime[location] > ALERT_COOLDOWN) {
            addLog(`⚠️ Cảnh báo: Nhiệt độ ${location} cao (${temp.toFixed(1)}°C)`, 'warning');
            lastAlertTime[location] = now;
        }
    }
}

// ======================
// Device Controls
// ======================
document.getElementById('auto-mode-toggle')?.addEventListener('change', async (e) => {
    const isAuto = e.target.checked;
    
    try {
        await update(ref(database, 'control'), { auto: isAuto });
        await update(ref(database, 'device'), { 
            auto: isAuto,
            che_do: isAuto ? 'Tự động' : 'Thủ công'
        });
        
        addLog(`Đã chuyển sang chế độ ${isAuto ? 'tự động' : 'thủ công'}`, 'success');
        
        const manualControls = ['fan1-toggle', 'fan2-toggle', 'buzzer1-toggle', 'buzzer2-toggle', 'relay-toggle'];
        manualControls.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) toggle.disabled = isAuto;
        });
    } catch (error) {
        console.error('Error:', error);
        addLog('Lỗi khi thay đổi chế độ', 'danger');
        e.target.checked = !isAuto;
    }
});

async function updateControl(value, deviceName) {
    try {
        // Chỉ ghi vào controls/ - ESP32 sẽ đọc và áp dụng
        await update(ref(database, 'controls'), value);
        const status = Object.values(value)[0] ? 'BẬT' : 'TẮT';
        console.log(`📤 Web → Firebase/controls:`, value);
        addLog(`📤 Web → controls/ → ESP32: ${deviceName} đã được ${status}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        addLog(`❌ Lỗi khi điều khiển ${deviceName}`, 'danger');
    }
}

document.getElementById('fan1-toggle')?.addEventListener('change', async (e) => {
    await updateControl({ quat1: e.target.checked }, 'Quạt 1');
});

document.getElementById('fan2-toggle')?.addEventListener('change', async (e) => {
    await updateControl({ quat2: e.target.checked }, 'Quạt 2');
});

document.getElementById('buzzer1-toggle')?.addEventListener('change', async (e) => {
    await updateControl({ coi1: e.target.checked }, 'Còi 1');
});

document.getElementById('buzzer2-toggle')?.addEventListener('change', async (e) => {
    await updateControl({ coi2: e.target.checked }, 'Còi 2');
});

document.getElementById('relay-toggle')?.addEventListener('change', async (e) => {
    const newValue = e.target.checked;
    const oldValue = deviceState.relay;
    
    // Chỉ gửi lệnh nếu thực sự thay đổi
    if (newValue === oldValue) return;
    
    // Chỉ cho phép bật relay nếu không có hẹn giờ sạc đang hoạt động
    if (newValue && chargeTimer && chargeTimer.active) {
        alert('Relay đang được điều khiển bởi hẹn giờ sạc. Hãy hủy hẹn giờ trước nếu muốn điều khiển thủ công.');
        // Revert lại state cũ
        document.getElementById('relay-toggle').checked = oldValue;
        return;
    }
    
    await updateControl({ relay: newValue }, 'Relay');
});

// ======================
// Schedule System
// ======================
function loadSchedules() {
    const saved = localStorage.getItem('schedules');
    if (saved) {
        schedules = JSON.parse(saved);
        updateScheduleDisplay();
    }
}

function saveSchedules() {
    localStorage.setItem('schedules', JSON.stringify(schedules));
}

function updateScheduleDisplay() {
    const tbody = document.getElementById('schedule-list');
    if (!tbody) return;
    
    if (schedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Chưa có lịch hẹn nào</td></tr>';
        return;
    }
    
    tbody.innerHTML = schedules.map((schedule, index) => `
        <tr>
            <td>${getDeviceName(schedule.device)}</td>
            <td><span class="badge ${schedule.action === 'on' ? 'bg-success' : 'bg-secondary'}">${schedule.action === 'on' ? 'Bật' : 'Tắt'}</span></td>
            <td>${new Date(schedule.time).toLocaleString('vi-VN')}</td>
            <td>${schedule.repeat ? '<i class="fas fa-redo text-primary"></i> Có' : 'Không'}</td>
            <td><span class="badge ${schedule.enabled ? 'bg-success' : 'bg-secondary'}">${schedule.enabled ? 'Hoạt động' : 'Tắt'}</span></td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteSchedule(${index})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function getDeviceName(device) {
    const names = {
        fan1: 'Quạt 1',
        fan2: 'Quạt 2',
        buzzer1: 'Còi 1',
        buzzer2: 'Còi 2',
        relay: 'Relay'
    };
    return names[device] || device;
}

window.deleteSchedule = (index) => {
    if (confirm('Bạn có chắc muốn xóa lịch này?')) {
        schedules.splice(index, 1);
        saveSchedules();
        updateScheduleDisplay();
        addLog('Đã xóa lịch hẹn', 'info');
    }
};

document.getElementById('schedule-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const device = document.getElementById('schedule-device').value;
    const action = document.getElementById('schedule-action').value;
    const time = document.getElementById('schedule-time').value;
    const repeat = document.getElementById('schedule-repeat').checked;
    
    if (!time) {
        alert('Vui lòng chọn thời gian');
        return;
    }
    
    schedules.push({
        device,
        action,
        time: new Date(time).getTime(),
        repeat,
        enabled: true
    });
    
    saveSchedules();
    updateScheduleDisplay();
    addLog(`Đã tạo lịch cho ${getDeviceName(device)}`, 'success');
    e.target.reset();
});

// Check and execute schedules
function checkSchedules() {
    const now = Date.now();
    
    schedules.forEach((schedule, index) => {
        if (!schedule.enabled) return;
        
        const scheduleTime = new Date(schedule.time).getTime();
        
        if (now >= scheduleTime && now < scheduleTime + 60000) {
            executeSchedule(schedule);
            
            if (schedule.repeat) {
                schedule.time = scheduleTime + 86400000; // Add 1 day
            } else {
                schedule.enabled = false;
            }
            
            saveSchedules();
            updateScheduleDisplay();
        }
    });
}

async function executeSchedule(schedule) {
    const deviceMap = {
        fan1: { device: 'quat1', control: 'fan1', name: 'Quạt 1' },
        fan2: { device: 'quat2', control: 'fan2', name: 'Quạt 2' },
        buzzer1: { device: 'coi1', control: 'buz1', name: 'Còi 1' },
        buzzer2: { device: 'coi2', control: 'buz2', name: 'Còi 2' },
        relay: { device: 'relay', control: 'relay', name: 'Relay' }
    };
    
    const device = deviceMap[schedule.device];
    if (!device) return;
    
    const value = schedule.action === 'on';
    
    await updateControl('device', { [device.device]: value }, device.name);
    await updateControl('control', { [device.control]: value }, device.name);
    
    addLog(`⏰ Lịch hẹn: ${device.name} đã ${value ? 'BẬT' : 'TẮT'}`, 'warning');
}

setInterval(checkSchedules, 30000); // Check every 30 seconds

// ======================
// Charge Timer System
// ======================
async function startChargeTimer(hours, minutes) {
    const totalMinutes = hours * 60 + minutes;
    if (totalMinutes <= 0) {
        alert('Vui lòng nhập thời gian hợp lệ');
        return;
    }
    
    // Tính thời gian sạc (milliseconds) - Sử dụng duration thay vì endTime
    const durationMs = totalMinutes * 60 * 1000;
    const startTimeMs = Date.now();
    const endTimeMs = startTimeMs + durationMs;
    
    chargeTimer = {
        endTime: endTimeMs,
        duration: durationMs,
        active: true
    };
    
    // Lưu vào Firebase controls/ - Gửi duration (không phụ thuộc vào thời gian hệ thống)
    // Firebase sẽ lưu durationMs để ESP32 có thể tính toán chính xác
    await update(ref(database, 'controls'), {
        charge_timer_active: true,
        charge_timer_end: durationMs,  // Gửi duration (ms) thay vì timestamp
        relay: true
    });
    
    console.log(`⏰ Bắt đầu sạc - Duration: ${totalMinutes} phút (${durationMs}ms)`);
    
    // Hiển thị status
    document.getElementById('charge-timer-status').style.display = 'block';
    
    // Bắt đầu đếm ngược
    if (chargeTimerInterval) clearInterval(chargeTimerInterval);
    chargeTimerInterval = setInterval(updateChargeTimerDisplay, 1000);
    
    addLog(`⏰ Bắt đầu sạc - Hẹn giờ ${hours} giờ ${minutes} phút`, 'success');
}

function stopChargeTimer() {
    if (chargeTimer) {
        chargeTimer.active = false;
        chargeTimer = null;
    }
    
    if (chargeTimerInterval) {
        clearInterval(chargeTimerInterval);
        chargeTimerInterval = null;
    }
    
    // Cập nhật Firebase controls/ - Tắt relay
    update(ref(database, 'controls'), {
        charge_timer_active: false,
        charge_timer_end: 0,
        relay: false
    });
    
    document.getElementById('charge-timer-status').style.display = 'none';
    addLog('Đã hủy hẹn giờ sạc', 'info');
}

function updateChargeTimerDisplay() {
    if (!chargeTimer || !chargeTimer.active) {
        if (chargeTimerInterval) {
            clearInterval(chargeTimerInterval);
            chargeTimerInterval = null;
        }
        
        // Ẩn thông báo relay được điều khiển bởi hẹn giờ
        const relayInfo = document.getElementById('relay-timer-info');
        if (relayInfo) relayInfo.style.display = 'none';
        
        return;
    }
    
    const now = Date.now();
    const remaining = chargeTimer.endTime - now;
    
    if (remaining <= 0) {
        // Hết thời gian - tự động ngắt
        stopChargeTimer();
        addLog('⏰ Đã hết thời gian sạc - Tự động ngắt', 'warning');
        
        // Hiển thị thông báo
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Hệ thống phòng cháy nổ', {
                body: 'Đã hết thời gian sạc - Relay đã ngắt',
                icon: '/favicon.ico'
            });
        }
        return;
    }
    
    // Hiển thị thông báo relay được điều khiển
    const relayInfo = document.getElementById('relay-timer-info');
    if (relayInfo) relayInfo.style.display = 'block';
    
    // Hiển thị thời gian còn lại
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('remaining-time').textContent = timeString;
}

// Charge timer buttons
document.getElementById('start-charge-timer')?.addEventListener('click', () => {
    const hours = parseInt(document.getElementById('charge-hours').value) || 0;
    const minutes = parseInt(document.getElementById('charge-minutes').value) || 0;
    startChargeTimer(hours, minutes);
});

document.getElementById('stop-charge-timer')?.addEventListener('click', () => {
    if (confirm('Bạn có chắc muốn hủy hẹn giờ sạc?')) {
        stopChargeTimer();
    }
});

// Monitor charge timer from Firebase controls/
const chargeTimerRef = ref(database, 'controls');
onValue(chargeTimerRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.val();
        
        // Đồng bộ trạng thái hẹn giờ
        if (data.charge_timer_active && data.charge_timer_end) {
            if (!chargeTimer || chargeTimer.duration !== data.charge_timer_end) {
                // Nhận hẹn giờ mới từ Firebase
                const durationMs = data.charge_timer_end;
                chargeTimer = {
                    endTime: Date.now() + durationMs,
                    duration: durationMs,
                    active: true
                };
                
                document.getElementById('charge-timer-status').style.display = 'block';
                
                if (chargeTimerInterval) clearInterval(chargeTimerInterval);
                chargeTimerInterval = setInterval(updateChargeTimerDisplay, 1000);
                updateChargeTimerDisplay(); // Update ngay lập tức
                
                console.log(`📡 Đồng bộ hẹn giờ sạc: ${(durationMs / 1000 / 60).toFixed(0)} phút`);
            }
        } else {
            if (chargeTimer && chargeTimer.active) {
                // Hủy hẹn giờ - có thể do ESP hủy vì cảnh báo
                console.log('📡 Hẹn giờ sạc đã bị hủy');
                stopChargeTimer();
            }
        }
    }
});

// Request notification permission
if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

// ======================
// Initialize
// ======================
console.log('Firebase App initialized');
addLog('Hệ thống khởi động', 'info');
initCharts();
loadSchedules();
