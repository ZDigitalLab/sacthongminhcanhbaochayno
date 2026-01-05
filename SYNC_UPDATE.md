# 🔄 Cập nhật Đồng bộ Kiến trúc KHKT 2026

## 📋 Tóm tắt
Đồng bộ hóa hoàn toàn giữa **Web UI (index.html)**, **Backend (app.js)**, và **ESP32 (code_khkt.ino)** để đảm bảo:
- ✅ Relay chỉ bật khi có lệnh từ Web hoặc hẹn giờ sạc
- ✅ Hẹn giờ sạc được xử lý chính xác trên ESP32
- ✅ Thông báo cảnh báo từ ESP32 tự động hủy hẹn giờ
- ✅ Trạng thái được đồng bộ thực thời giữa các bên

---

## 🔧 Thay đổi chi tiết

### 1️⃣ **ESP32 (code_khkt.ino)**

#### A. Biến mới
```cpp
unsigned long chargeTimerStartTime = 0; // Thời gian bắt đầu sạc (boot time)
```

#### B. Xử lý Hẹn giờ sạc trong `readControlFromFirebase()`
- **Trước:** Chỉ lưu thời gian kết thúc từ Firebase
- **Sau:** Lưu cả boot time khi nhận hẹn giờ để tính toán chính xác

```cpp
if (oldTimerActive == false) {
    chargeTimerStartTime = millis();  // Lưu boot time
    Serial.print("[CHARGE TIMER] Thời gian kết thúc Unix: ");
    Serial.print(chargeTimerEnd);  // chargeTimerEnd là duration (ms)
}
```

#### C. Xử lý Relay trong `checkSystemStatus()`
**Logic mới:**
1. Nếu **chargeTimerActive = true** → **Relay = ON**
2. Tính toán thời gian còn lại: `elapsedTime = now - chargeTimerStartTime`
3. Nếu `elapsedTime >= duration` → **Hủy hẹn giờ, Relay = OFF**
4. Nếu có **cảnh báo (T > 45°C, Độ ẩm > 90%)** → **Hủy hẹn giờ, Relay = OFF**
5. Nếu pin đầy (**V_charge >= 54V**) → **Hủy hẹn giờ, Relay = OFF**

```cpp
if (chargeTimerActive && chargeTimerEnd > 0 && chargeTimerStartTime > 0) {
    unsigned long elapsedTime = now - chargeTimerStartTime;
    unsigned long initialDuration = chargeTimerEnd;
    
    if (elapsedTime >= initialDuration) {
        // HẾT THỜI GIAN SẠC
        chargeTimerActive = false;
        relayOn = false;
    } else {
        // ĐANG SẠC - RELAY ON
        relayOn = true;
    }
}
```

---

### 2️⃣ **Web App (app.js)**

#### A. Sửa `startChargeTimer()`
- **Thay đổi:** Gửi **duration (ms)** thay vì **timestamp absolute**
- **Lý do:** ESP32 không có NTP time sync, nên dùng thời gian tương đối

```javascript
const durationMs = totalMinutes * 60 * 1000;  // Gửi duration (ms)
await update(ref(database, 'controls'), {
    charge_timer_active: true,
    charge_timer_end: durationMs,  // ← Thay đổi từ endTimeMs
    relay: true
});
```

#### B. Relay Toggle - Xử lý Conflict
```javascript
document.getElementById('relay-toggle')?.addEventListener('change', async (e) => {
    if (e.target.checked && chargeTimer && chargeTimer.active) {
        alert('Relay đang được điều khiển bởi hẹn giờ sạc. Hãy hủy hẹn giờ trước.');
        e.target.checked = false;
        return;
    }
    await updateControl({ relay: e.target.checked }, 'Relay');
});
```

#### C. Monitor Controls từ Firebase
- **Trước:** Cập nhật relay state đơn giản
- **Sau:** Kiểm tra nếu có hẹn giờ sạc đang hoạt động
- **Xử lý:** Nếu ESP hủy hẹn giờ (do cảnh báo/pin đầy), Web UI cập nhật lại

```javascript
// Relay - Cập nhật nhưng không làm mất lệnh hẹn giờ
if (data.relay !== undefined) {
    const relayToggle = document.getElementById('relay-toggle');
    if (relayToggle && !chargeTimer?.active) {
        relayToggle.checked = data.relay;  // Chỉ cập nhật nếu không có hẹn giờ
    }
}
```

#### D. Đồng bộ Hẹn giờ từ ESP32
```javascript
if (data.charge_timer_active && data.charge_timer_end) {
    const durationMs = data.charge_timer_end;  // duration từ ESP
    chargeTimer = {
        endTime: Date.now() + durationMs,  // Tính lại endTime local
        duration: durationMs,
        active: true
    };
    // Hiển thị UI...
}
```

#### E. Hiển thị Thông báo Relay
```javascript
function updateChargeTimerDisplay() {
    // ... tính toán thời gian còn lại ...
    
    // Hiển thị cảnh báo relay đang được hẹn giờ
    const relayInfo = document.getElementById('relay-timer-info');
    if (relayInfo) relayInfo.style.display = 'block';
}
```

---

### 3️⃣ **Web UI (index.html)**

#### A. Cập nhật Relay Control Card
- **Thêm:** Label "Relay điều khiển sạc" (rõ ràng hơn)
- **Thêm:** Info text `relay-info` (chưa dùng, dành cho mở rộng)
- **Thêm:** Alert box `relay-timer-info` (hiển thị khi hẹn giờ đang hoạt động)

```html
<div class="alert alert-info mt-3 mb-0" style="display: none;" id="relay-timer-info">
    <i class="fas fa-info-circle"></i> 
    Relay đang được điều khiển bởi hẹn giờ sạc. Hãy hủy hẹn giờ để điều khiển thủ công.
</div>
```

---

## 📊 Firebase Structure

### Ghi vào controls/ từ Web
```json
{
  "controls": {
    "auto": true|false,
    "relay": true|false,
    "charge_timer_active": true|false,
    "charge_timer_end": 3600000  // ← Duration (ms), không phải timestamp
  }
}
```

### Ghi vào sensor/ từ ESP32
```json
{
  "sensor": {
    "nhiet_do_ben_trong": 28.5,
    "nhiet_do_ben_ngoai": 25.3,
    // ... các sensor khác ...
    "khoi": false
  }
}
```

---

## 🚀 Luồng Hoạt động

### Bật Relay bằng Hẹn giờ Sạc

```
1. Web UI: Người dùng nhập 2 giờ sạc
   ↓
2. app.js: Tính duration = 2 * 60 * 60 * 1000 = 7200000 ms
   ↓
3. Firebase controls/: 
   {
     "charge_timer_active": true,
     "charge_timer_end": 7200000,  ← Duration (ms)
     "relay": true
   }
   ↓
4. ESP32: readControlFromFirebase()
   - chargeTimerActive = true
   - chargeTimerEnd = 7200000
   - chargeTimerStartTime = millis()  ← Boot time khi nhận
   ↓
5. ESP32: checkSystemStatus()
   - elapsedTime = now - chargeTimerStartTime
   - if (elapsedTime < 7200000) → relayOn = true
   ↓
6. Sau 2 giờ: elapsedTime >= 7200000
   - chargeTimerActive = false
   - relayOn = false
   - Relay được ngắt tự động
```

### Cảnh báo Hủy Hẹn giờ

```
1. Nhiệt độ > 45°C hoặc Độ ẩm > 90%
   ↓
2. ESP32: checkSystemStatus()
   - Phát hiện cảnh báo
   - chargeTimerActive = false  ← Hủy
   - relayOn = false
   - fan1 = true, fan2 = true (chạy quạt)
   - sendSMS(...) (gửi cảnh báo)
   ↓
3. Firebase controls/: 
   - Ghi lại trạng thái cập nhật
   ↓
4. Web UI: 
   - Nhận thông báo cảnh báo
   - Thấy chargeTimer.active = false
   - Hiển thị log cảnh báo
```

---

## ✅ Kiểm tra Chức năng

### Test Case 1: Hẹn giờ Sạc Bình thường
- [ ] Bật hẹn giờ 30 phút từ Web
- [ ] Relay bật trong Firebase
- [ ] ESP32 nhận và relay ON
- [ ] Sau 30 phút, relay tự động OFF
- [ ] Web UI cập nhật trạng thái

### Test Case 2: Hủy Hẹn giờ
- [ ] Bật hẹn giờ 1 giờ
- [ ] Click "Hủy" trong Web
- [ ] Firebase updates `charge_timer_active = false`
- [ ] ESP32 relay OFF
- [ ] UI cập nhật

### Test Case 3: Cảnh báo > 45°C
- [ ] Bật hẹn giờ sạc
- [ ] Làm nóng cảm biến > 45°C
- [ ] ESP32 phát hiện cảnh báo
- [ ] Relay OFF, quạt ON
- [ ] SMS gửi cảnh báo
- [ ] Web UI hiển thị cảnh báo

### Test Case 4: Pin Đầy
- [ ] Bật hẹn giờ sạc
- [ ] Pin sạc lên 54V
- [ ] ESP32 phát hiện pin đầy
- [ ] Relay OFF
- [ ] SMS "Pin đã đầy"

### Test Case 5: Bật Relay Thủ công
- [ ] Không có hẹn giờ sạc
- [ ] Bật relay toggle
- [ ] Relay ON trong Firebase
- [ ] ESP32 relay ON
- [ ] Tắt toggle → Relay OFF

### Test Case 6: Conflict - Bật Relay khi Hẹn giờ Active
- [ ] Bật hẹn giờ sạc 30 phút
- [ ] Cố bật relay toggle
- [ ] Alert: "Relay đang được điều khiển bởi hẹn giờ"
- [ ] Toggle vẫn OFF

---

## 📝 Ghi chú

- **Duration vs Timestamp:** Dùng duration để tránh sync time issues
- **Boot Time:** ESP32 lưu boot time khi nhận hẹn giờ để tính chính xác
- **Auto Mode:** Chỉ ghi controls/ khi ở chế độ AUTO
- **Manual Mode:** Đọc toàn bộ lệnh từ Web và áp dụng

---

## 🔍 Debug

### Serial Monitor ESP32
```
[CHARGE TIMER] Bat dau sac, thoi gian ket thuc Unix: 7200000, boot time: 45230
[CHARGE TIMER] Thoi gian con: 3600 giay
[CHARGE TIMER] Het thoi gian sac - Ngat relay
```

### Browser Console (Web)
```javascript
console.log('📡 Nhận hẹn giờ sạc từ Firebase: 30 phút');
console.log('📤 Web → Firebase/controls:', { relay: true, charge_timer_active: true });
```

---

**Cập nhật: 05/01/2026**
