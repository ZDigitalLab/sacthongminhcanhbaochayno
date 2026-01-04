# Cấu trúc Firebase - Hệ thống Phòng Chống Cháy Nổ KHKT 2026

## 📊 Cấu trúc Database

### 1. `sensor/` - Dữ liệu cảm biến (ESP32 → Firebase)
ESP32 gửi data lên mỗi **10 giây**

```json
{
  "sensor": {
    "nhiet_do_ben_trong": 28.5,      // °C - DS18B20 bên trong
    "nhiet_do_ben_ngoai": 25.3,      // °C - DS18B20 bên ngoài
    "nhiet_do_be_mat": 30.2,         // °C - MLX90614 bề mặt
    "nhiet_do_moi_truong": 26.8,     // °C - DHT11
    "do_am": 65.5,                   // % - DHT11
    "dien_ap": 12.6,                 // V - Điện áp pin
    "dong_sac": 2.3,                 // A - Dòng sạc
    "pin_box": 85,                   // % - Phần trăm pin
    "khoi": false                    // Boolean - Cảm biến khói
  }
}
```

**Nguồn:** `sendDataToFirebase()` trong [code_khkt.ino](code_khkt.ino#L155)

---

### 2. `controls/` - Điều khiển thiết bị (Web ↔ ESP32)

#### 2.1. Web App ghi vào (Lệnh điều khiển)
```json
{
  "controls": {
    "auto": true,                    // Chế độ tự động/thủ công
    "quat1": false,                  // Quạt 1 (FAN1)
    "quat2": false,                  // Quạt 2 (FAN2)
    "coi1": false,                   // Còi 1 (BUZZER1)
    "coi2": false,                   // Còi 2 (BUZZER2)
    "relay": true,                   // Relay sạc
    "charge_timer_active": false,    // Hẹn giờ sạc đang hoạt động
    "charge_timer_end": 0            // Unix timestamp (ms) kết thúc sạc
  }
}
```

**Nguồn:** `updateControl()`, `startChargeTimer()` trong [app.js](app.js#L570)

#### 2.2. ESP32 đọc từ (Đồng bộ lệnh)
ESP32 đọc mỗi **5 giây** từ `controls/` và áp dụng:
- Nếu `auto: true` → Hệ thống tự động điều khiển
- Nếu `auto: false` → Áp dụng lệnh thủ công từ web

**Nguồn:** `readControlFromFirebase()` trong [code_khkt.ino](code_khkt.ino#L225)

#### 2.3. ESP32 ghi trạng thái hiện tại (Phản hồi)
ESP32 cập nhật trạng thái thiết bị thực tế lên `controls/` mỗi **10 giây**

**Nguồn:** `sendControlStatusToFirebase()` trong [code_khkt.ino](code_khkt.ino#L195)

---

## 🔄 Luồng dữ liệu

### Đọc dữ liệu cảm biến
```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   ESP32     │         │   Firebase   │         │   Web App   │
│  (Sensors)  │ ─────> │   sensor/    │ ─────> │  (Display)  │
└─────────────┘  10s    └──────────────┘  Real   └─────────────┘
                                          -time
```

### Điều khiển thiết bị
```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│   Web App   │         │   Firebase   │         │   ESP32     │
│  (Control)  │ ─────> │  controls/   │ ─────> │   (Apply)   │
└─────────────┘  Instant└──────────────┘   5s    └─────────────┘
                                                        │
                                                        │ 10s
                                                        v
                                               ┌──────────────┐
                                               │   Firebase   │
                                               │  controls/   │
                                               │   (Status)   │
                                               └──────────────┘
```

---

## 🛠️ Mapping dữ liệu

### Arduino → Firebase (sensor/)
| Arduino Variable | Firebase Key | Unit | Description |
|------------------|--------------|------|-------------|
| `t_in` | `nhiet_do_ben_trong` | °C | DS18B20 trong box |
| `t_out` | `nhiet_do_ben_ngoai` | °C | DS18B20 ngoài box |
| `t_surface` | `nhiet_do_be_mat` | °C | MLX90614 bề mặt |
| `t_dht` | `nhiet_do_moi_truong` | °C | DHT11 |
| `h_dht` | `do_am` | % | DHT11 |
| `v_bat` | `dien_ap` | V | ADC pin 34 |
| `i_charge` | `dong_sac` | A | ACS712 pin 33 |
| `percentBat` | `pin_box` | % | Calculated |
| `smokeDetected` | `khoi` | bool | Digital pin 4 |

### Firebase (controls/) → Arduino
| Firebase Key | Arduino Variable | Pin | Description |
|--------------|------------------|-----|-------------|
| `quat1` | `fan1` | GPIO 27 | PWM Channel 2 |
| `quat2` | `fan2` | GPIO 14 | PWM Channel 3 |
| `coi1` | `buz1` | GPIO 25 | PWM Channel 0 |
| `coi2` | `buz2` | GPIO 26 | PWM Channel 1 |
| `relay` | `relayOn` | GPIO 18 | Digital |
| `auto` | `autoMode` | - | Logic flag |
| `charge_timer_active` | `chargeTimerActive` | - | Logic flag |
| `charge_timer_end` | `chargeTimerEnd` | - | Unix timestamp |

---

## 📱 Web App Components

### Đọc dữ liệu (Real-time)
```javascript
// Đọc sensor data
const sensorRef = ref(database, 'sensor');
onValue(sensorRef, (snapshot) => {
  const data = snapshot.val();
  // Update UI với data.nhiet_do_be_mat, data.pin_box, etc.
});

// Đọc controls status
const controlsRef = ref(database, 'controls');
onValue(controlsRef, (snapshot) => {
  const data = snapshot.val();
  // Update toggles với data.quat1, data.relay, etc.
});
```

### Gửi lệnh điều khiển
```javascript
// Bật/tắt thiết bị
await update(ref(database, 'controls'), {
  quat1: true,
  relay: false
});

// Hẹn giờ sạc
await update(ref(database, 'controls'), {
  charge_timer_active: true,
  charge_timer_end: Date.now() + (hours * 3600000),
  relay: true
});
```

---

## ⚙️ Tần suất cập nhật

| Hoạt động | Tần suất | Nguồn |
|-----------|----------|-------|
| ESP32 gửi sensor data | 10s | `loop()` |
| ESP32 gửi controls status | 10s | `loop()` |
| ESP32 đọc controls | 5s | `loop()` |
| Web nhận sensor data | Real-time | `onValue()` |
| Web nhận controls status | Real-time | `onValue()` |
| Web gửi controls | Instant (on user action) | Event listeners |

---

## 🔐 Security Rules (Firebase)

```json
{
  "rules": {
    "sensor": {
      ".read": true,
      ".write": true
    },
    "controls": {
      ".read": true,
      ".write": true
    }
  }
}
```

**⚠️ Lưu ý:** Đây là cấu hình mở cho development. Production nên thêm authentication.

---

## 🧪 Testing

### Test gửi data từ ESP32
1. Mở Serial Monitor (115200 baud)
2. Quan sát log:
   ```
   ========================================
   GUI DU LIEU CAM BIEN LEN sensor/
   JSON: {"nhiet_do_ben_trong":28.5,...}
   -> Thanh cong!
   ========================================
   ```

### Test điều khiển từ Web
1. Mở Browser Console (F12)
2. Bật/tắt thiết bị trong giao diện
3. Quan sát log:
   ```
   📤 Web → Firebase/controls: {quat1: true}
   ```
4. Kiểm tra Serial Monitor ESP32:
   ```
   DOC DIEU KHIEN TU controls/
   Phan tich lenh Firebase...
   Da cap nhat dieu khien thu cong tu Firebase!
   ```

---

**Tạo bởi:** KHKT 2026 - Hệ thống Phòng Chống Cháy Nổ  
**Ngày:** 03/01/2026  
**Firebase Project:** khkt2026-66085
