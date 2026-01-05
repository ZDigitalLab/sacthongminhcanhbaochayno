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
let charts = {};
let chartData = {
    temperature: { labels: [], datasets: [] },
    power: { labels: [], datasets: [] },
    battery: { labels: [], data: [] }
};
const MAX_CHART_POINTS = 20;

// Default values with auto-adjustment timer
const DEFAULT_VOLTAGE = 55; // Default web voltage is 55V
const SENSOR_AUTO_ADJUST_DELAY = 2000; // Auto-adjust sensors after 2 seconds
let sensorAdjustmentTimer = null;
let lastSensorData = {};

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
        charts.temperature.data.datasets[0].data.push(data.nhiet_do_be_mat !== undefined && data.nhiet_do_be_mat !== null ? parseFloat(data.nhiet_do_be_mat) : null);
        charts.temperature.data.datasets[1].data.push(data.nhiet_do_trong !== undefined && data.nhiet_do_trong !== null ? parseFloat(data.nhiet_do_trong) : null);
        charts.temperature.data.datasets[2].data.push(data.nhiet_do_dht !== undefined && data.nhiet_do_dht !== null ? parseFloat(data.nhiet_do_dht) : null);
        charts.temperature.update('none');
    }

    // Power Chart
    if (charts.power) {
        if (charts.power.data.labels.length >= MAX_CHART_POINTS) {
            charts.power.data.labels.shift();
            charts.power.data.datasets.forEach(dataset => dataset.data.shift());
        }
        
        charts.power.data.labels.push(now);
        charts.power.data.datasets[0].data.push(data.dien_ap !== undefined && data.dien_ap !== null ? data.dien_ap : null);
        charts.power.data.datasets[1].data.push(data.dong_sac !== undefined && data.dong_sac !== null ? data.dong_sac : null);
        charts.power.update('none');
    }

    // Battery Chart
    if (charts.battery) {
        if (charts.battery.data.labels.length >= MAX_CHART_POINTS) {
            charts.battery.data.labels.shift();
            charts.battery.data.datasets[0].data.shift();
        }
        
        charts.battery.data.labels.push(now);
        charts.battery.data.datasets[0].data.push(data.pin_box !== undefined && data.pin_box !== null ? data.pin_box : null);
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
// Auto-Adjustment of Sensors after 2 seconds
// ======================
function setupSensorAutoAdjustment() {
    // Schedule automatic sensor adjustment every 2 seconds
    setInterval(() => {
        if (lastSensorData.timestamp) {
            const timeSinceLastUpdate = Date.now() - lastSensorData.timestamp;
            
            // If no data received within 2 seconds, display default values
            if (timeSinceLastUpdate > SENSOR_AUTO_ADJUST_DELAY) {
                // Auto-adjust to default values
                const voltageEl = document.getElementById('voltage');
                const currentEl = document.getElementById('current');
                
                if (voltageEl && voltageEl.textContent === '--') {
                    voltageEl.textContent = DEFAULT_VOLTAGE.toFixed(2);
                    updateProgressBar('voltage-bar', (DEFAULT_VOLTAGE / 100) * 100);
                }
                
                if (currentEl && currentEl.textContent === '--') {
                    currentEl.textContent = '0.00';
                    updateProgressBar('current-bar', 0);
                }
            }
        }
    }, SENSOR_AUTO_ADJUST_DELAY);
    
    console.log(`⚙️ Sensor auto-adjustment timer set: ${SENSOR_AUTO_ADJUST_DELAY}ms`);
}

// ======================
// Firebase Real-time Listener - Đọc sensor data từ sensor/
// ======================
const sensorRef = ref(database, 'sensor');
let currentSensorData = {};

onValue(sensorRef, (snapshot) => {
    if (snapshot.exists()) {
        updateConnectionStatus(true);
        currentSensorData = snapshot.val();
        const data = currentSensorData;
        
        // Log data sync từ ESP32
        console.log('📡 Nhận sensor data từ Firebase:', data);
        addLog(`📡 ESP32 → sensor/: Nhận dữ liệu cập nhật (T-bề mặt: ${(data.nhiet_do_be_mat || 0).toFixed(1)}°C, T-trong: ${(data.nhiet_do_trong || 0).toFixed(1)}°C, Pin: ${data.pin_percent || 0}%, Độ ẩm: ${data.do_am || 0}%)`, 'info');
        
        // Update mode from auto_mode field
        const modeText = document.getElementById('mode-stat');
        const autoModeToggle = document.getElementById('auto-mode-toggle');
        
        if (data.auto_mode !== undefined) {
            autoModeToggle.checked = data.auto_mode;
            if (modeText) {
                modeText.textContent = data.auto_mode ? 'Tự động' : 'Thủ công';
            }
        }
        
        // Update temperatures với kiểm tra giá trị
        const surfaceTemp = data.nhiet_do_be_mat !== undefined && data.nhiet_do_be_mat !== null ? parseFloat(data.nhiet_do_be_mat) : null;
        const insideTemp = data.nhiet_do_trong !== undefined && data.nhiet_do_trong !== null ? parseFloat(data.nhiet_do_trong) : null;
        const outsideTemp = data.nhiet_do_ngoai !== undefined && data.nhiet_do_ngoai !== null ? parseFloat(data.nhiet_do_ngoai) : null;
        const envTemp = data.nhiet_do_dht !== undefined && data.nhiet_do_dht !== null ? parseFloat(data.nhiet_do_dht) : null;
        
        console.log(`🌡️ Nhiệt độ bề mặt: ${surfaceTemp}°C`);
        
        updateTemperature('temp-surface', 'temp-surface-bar', surfaceTemp, 50);
        updateTemperature('temp-inside', 'temp-inside-bar', insideTemp, 50);
        updateTemperature('temp-outside', 'temp-outside-bar', outsideTemp, 50);
        updateTemperature('temp-environment', 'temp-environment-bar', envTemp, 50);
        
        // Calculate average temperature
        const validTemps = [surfaceTemp, insideTemp, envTemp].filter(t => t !== null && t !== undefined);
        const avgTemp = validTemps.length > 0 ? (validTemps.reduce((a, b) => a + b, 0) / validTemps.length).toFixed(1) : '--';
        const avgTempEl = document.getElementById('avg-temp');
        if (avgTempEl) avgTempEl.textContent = avgTemp !== '--' ? `${avgTemp}°C` : '--';
        
        // Update power info - dien_ap_pin là điện áp pin
        const voltagePin = data.dien_ap_pin !== undefined && data.dien_ap_pin !== null ? data.dien_ap_pin : null;
        if (voltagePin !== null && voltagePin !== 0) {
            document.getElementById('voltage').textContent = voltagePin.toFixed(2);
            updateProgressBar('voltage-bar', (voltagePin / 12) * 100);
        } else {
            document.getElementById('voltage').textContent = DEFAULT_VOLTAGE.toFixed(2);
            updateProgressBar('voltage-bar', (DEFAULT_VOLTAGE / 100) * 100);
        }
        
        if (data.dong_sac !== undefined && data.dong_sac !== null && data.dong_sac !== 0) {
            document.getElementById('current').textContent = data.dong_sac.toFixed(2);
            updateProgressBar('current-bar', Math.min((data.dong_sac / 50) * 100, 100));
        } else {
            document.getElementById('current').textContent = '0.00';
            updateProgressBar('current-bar', 0);
        }
        
        // Store data for auto-adjustment
        lastSensorData = {
            voltage: data.dien_ap_pin || DEFAULT_VOLTAGE,
            current: data.dong_sac || 0,
            timestamp: Date.now()
        };
        
        // Update battery
        if (data.pin_percent !== undefined) {
            updateBattery(data.pin_percent);
        }
        
        // Update humidity if available
        const humidityEl = document.getElementById('humidity');
        if (humidityEl && data.do_am !== undefined && data.do_am !== null) {
            humidityEl.textContent = data.do_am.toFixed(0);
        }
        
        // Update alert status
        const alertEl = document.getElementById('alert-status');
        if (alertEl && data.alert_status !== undefined) {
            alertEl.textContent = data.alert_status;
            alertEl.className = data.alert_status === 'An toan' ? 'badge bg-success' : 'badge bg-danger';
        }
        
        // Calculate power from dien_ap_sac (charging voltage) and dong_sac (charging current)
        const dien_ap_sac_val = data.dien_ap_sac !== undefined && data.dien_ap_sac !== null ? data.dien_ap_sac : 0;
        const dong_sac_val = data.dong_sac !== undefined && data.dong_sac !== null ? data.dong_sac : 0;
        const power = (dien_ap_sac_val * dong_sac_val).toFixed(1);
        const powerStatEl = document.getElementById('power-stat');
        if (powerStatEl) powerStatEl.textContent = power > 0 ? `${power}W` : '--';
        
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

// ======================
// Firebase Real-time Listener - Đọc relay status từ relay/
// ======================
const relayRef = ref(database, 'relay');
onValue(relayRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('🔌 Nhận trạng thái relay:', data);
        
        if (data.relay_on !== undefined) {
            const relayToggle = document.getElementById('relay-toggle');
            const relayStatus = document.getElementById('relay-status');
            
            if (relayToggle) relayToggle.checked = data.relay_on;
            if (relayStatus) {
                relayStatus.textContent = data.relay_on ? 'ON' : 'OFF';
                relayStatus.className = data.relay_on ? 'badge bg-success' : 'badge bg-secondary';
            }
        }
    }
});

// ======================
// Firebase Real-time Listener - Đọc device settings từ device/
// ======================
const deviceRef = ref(database, 'device');
onValue(deviceRef, (snapshot) => {
    if (snapshot.exists()) {
        const data = snapshot.val();
        console.log('⚙️ Nhận device settings:', data);
        
        // Update auto mode
        const modeText = document.getElementById('mode-stat');
        const autoModeToggle = document.getElementById('auto-mode-toggle');
        
        if (data.auto !== undefined) {
            autoModeToggle.checked = data.auto;
            if (modeText) {
                modeText.textContent = data.auto ? 'Tự động' : 'Thủ công';
            }
        }
        
        // Cập nhật che_do text nếu có
        if (data.che_do !== undefined && modeText) {
            // Nếu có cả auto và che_do, che_do sẽ override
            modeText.textContent = data.che_do;
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
    const temp = value !== undefined && value !== null ? parseFloat(value) : null;
    
    if (textEl) {
        textEl.textContent = temp !== null ? temp.toFixed(1) : '--';
    }
    
    if (barEl) {
        if (temp !== null) {
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
        } else {
            barEl.style.width = '0%';
            barEl.className = 'progress-bar bg-secondary';
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
    
    // Kiểm tra giá trị hợp lệ
    const batteryValue = value !== undefined && value !== null ? value : 0;
    if (batteryEl) batteryEl.textContent = value !== undefined && value !== null ? value : '--';
    if (batteryStatEl) batteryStatEl.textContent = value !== undefined && value !== null ? `${value}%` : '--';
    
    if (batteryFillEl) {
        batteryFillEl.style.width = `${batteryValue}%`;
        
        if (batteryValue < 20) {
            batteryFillEl.className = 'progress-bar progress-bar-striped progress-bar-animated bg-danger';
            if (batteryIconEl) batteryIconEl.className = 'fas fa-battery-empty fa-3x text-danger';
        } else if (batteryValue < 50) {
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
        toggle.checked = value;
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
        // Write to device path with auto and che_do fields
        await update(ref(database, 'device'), { 
            auto: isAuto,
            che_do: isAuto ? 'Tự động' : 'Thủ công'
        });
        
        // Also update sensor/auto_mode if needed
        await update(ref(database, 'sensor'), {
            auto_mode: isAuto
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
        // Fan and buzzer controls are not in the current Firebase structure
        // They would need to be added to sensor/ or a new control path
        console.warn(`⚠️ ${deviceName} control not supported in current Firebase structure`);
        addLog(`⚠️ ${deviceName} chưa được hỗ trợ trong cấu trúc hiện tại`, 'warning');
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
    try {
        // Write to relay/relay_on path
        await update(ref(database, 'relay'), { relay_on: e.target.checked });
        const status = e.target.checked ? 'BẬT' : 'TẮT';
        console.log(`📤 Web → Firebase/relay:`, { relay_on: e.target.checked });
        addLog(`📤 Web → relay/ → ESP32: Relay đã được ${status}`, 'success');
    } catch (error) {
        console.error('Error:', error);
        addLog(`❌ Lỗi khi điều khiển Relay`, 'danger');
        e.target.checked = !e.target.checked;
    }
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
// Charge Timer System - handles relay scheduling
// ======================
function stopChargeTimer() {
    if (chargeTimer) {
        // Clear timeout if set
        if (chargeTimer.timeoutId) {
            clearTimeout(chargeTimer.timeoutId);
        }
        chargeTimer.active = false;
        chargeTimer = null;
    }
    
    if (chargeTimerInterval) {
        clearInterval(chargeTimerInterval);
        chargeTimerInterval = null;
    }
    
    document.getElementById('charge-timer-status').style.display = 'none';
}

function updateChargeTimerDisplay() {
    if (!chargeTimer || !chargeTimer.active) {
        if (chargeTimerInterval) {
            clearInterval(chargeTimerInterval);
            chargeTimerInterval = null;
        }
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
    
    // Hiển thị thời gian còn lại
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    const timeString = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    document.getElementById('remaining-time').textContent = timeString;
}

// Charge timer buttons
document.getElementById('start-charge-timer')?.addEventListener('click', async () => {
    const hours = parseInt(document.getElementById('charge-hours').value) || 0;
    const minutes = parseInt(document.getElementById('charge-minutes').value) || 0;
    
    if (hours === 0 && minutes === 0) {
        alert('Vui lòng nhập thời gian hẹn giờ');
        return;
    }
    
    try {
        // Turn on relay
        await update(ref(database, 'relay'), { relay_on: true });
        
        // Calculate end time
        const now = Date.now();
        const durationMs = (hours * 3600 + minutes * 60) * 1000;
        const endTime = now + durationMs;
        
        // Save timer info
        chargeTimer = {
            endTime: endTime,
            active: true,
            startTime: now
        };
        
        // Show timer status
        document.getElementById('charge-timer-status').style.display = 'block';
        
        // Update UI
        if (chargeTimerInterval) clearInterval(chargeTimerInterval);
        chargeTimerInterval = setInterval(updateChargeTimerDisplay, 1000);
        updateChargeTimerDisplay();
        
        addLog(`⏱️ Hẹn giờ sạc relay: ${hours}h ${minutes}m`, 'success');
        
        // Set a timeout to turn off relay when timer ends
        const timeoutId = setTimeout(async () => {
            try {
                await update(ref(database, 'relay'), { relay_on: false });
                addLog(`⏱️ Hẹn giờ sạc kết thúc - Relay đã tắt`, 'success');
                stopChargeTimer();
                
                // Show notification
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('KHKT 2026', {
                        body: 'Hẹn giờ sạc kết thúc - Relay đã tắt'
                    });
                }
            } catch (error) {
                addLog(`❌ Lỗi khi tắt relay sau hẹn giờ`, 'danger');
            }
        }, durationMs);
        
        // Store timeout ID for cleanup
        chargeTimer.timeoutId = timeoutId;
        
    } catch (error) {
        console.error('Error:', error);
        addLog('❌ Lỗi khi bắt đầu hẹn giờ sạc', 'danger');
    }
});

document.getElementById('stop-charge-timer')?.addEventListener('click', async () => {
    if (confirm('Bạn có chắc muốn hủy hẹn giờ sạc?')) {
        try {
            // Turn off relay
            await update(ref(database, 'relay'), { relay_on: false });
            stopChargeTimer();
            addLog(`⏱️ Đã hủy hẹn giờ sạc - Relay tắt`, 'info');
        } catch (error) {
            addLog('❌ Lỗi khi hủy hẹn giờ', 'danger');
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
setupSensorAutoAdjustment(); // Start sensor auto-adjustment after 2 seconds
loadSchedules();

