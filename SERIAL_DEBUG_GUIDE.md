# Serial Monitor Debug - Quick Reference

## 🔌 Cấu Hình Serial Monitor

- **Baud Rate:** 115200
- **Port:** COM3 (hoặc COM của ESP32)
- **Data Bits:** 8
- **Stop Bits:** 1
- **Parity:** None

---

## 📊 Debug Messages Chính

### **Startup (0-5 giây)**

| Message | Ý Nghĩa | Hành Động |
|---------|---------|----------|
| `Ket noi WiFi...` | Đang kết nối WiFi | Chờ 15 giây |
| `WiFi ket noi thanh cong! IP: 192.168.x.x` | ✅ WiFi OK | Tiếp tục |
| `Khong the ket noi WiFi` | ❌ WiFi lỗi | Check SSID/Pass |
| `MLX90614 khoi tao thanh cong!` | ✅ Cảm biến IR OK | Tiếp tục |
| `LOI: Khong tim thay MLX90614!` | ❌ Cảm biến IR lỗi | Check I2C (21,22) |

---

### **Operational (Sau 5 giây)**

| Message | Ý Nghĩa | Xử Lý |
|---------|---------|-------|
| `[STATUS] T_in:28.5 T_out:28.1 Relay:OFF` | Status bình thường | Bình thường |
| `[FIREBASE] Nhan dieu khien: {...}` | ✅ Nhận lệnh Firebase | Đang xử lý |
| `[FIREBASE] WiFi khong ket noi` | ❌ WiFi mất | Reconnect |
| `[FIREBASE] Loi HTTP: 404` | ⚠️ controls/ chưa có | Tạo mới trên Web |
| `[MODE] MANUAL - Dieu khien tu Web App` | Chuyển Manual | Lệnh từ Web có hiệu lực |
| `[MODE] AUTO - He thong tu quyet dinh` | Chuyển Auto | Hệ thống tự quyết định |

---

### **Relay Control**

| Message | Ý Nghĩa | Kết Quả |
|---------|---------|--------|
| `[RELAY] BẬT - Sạc pin` | Relay bật | GPIO 18 = 3.3V |
| `[RELAY] TẮT` | Relay tắt | GPIO 18 = 0V |
| `[RELAY] Ngắt sạc ngay lap tuc` | Cảnh báo → OFF | Ưu tiên fire alert |

---

### **Charge Timer**

| Message | Ý Nghĩa |
|---------|---------|
| `[CHARGE_TIMER] Bat dau` | Bắt đầu hẹn giờ sạc |
| `[CHARGE_TIMER] Duration: 3600 giay` | Sạc trong 1 giờ |
| `[CHARGE_TIMER] Thoi gian con: 1800 giay` | Còn 30 phút (log mỗi 10s) |
| `[CHARGE_TIMER] Het thoi gian sac - Ngat relay` | Hết giờ → Relay OFF |

---

### **Fire Alert (Cảnh Báo)**

| Message | Mức | Hành Động |
|---------|-----|----------|
| `Alert: Canh bao: Nhiet do > 45C` | ⚠️ Level 1 | Fan ON, SMS gửi |
| `Gui SMS: Canh bao: Nhiet do > 45C...` | ⚠️ Level 1 | SMS đã gửi |
| `Alert: NGUY HIEM > 60C` | 🚨 Level 2 | Fan + Buzzer + Call |
| `Goi dien...` | 🚨 Level 2 | Gọi điện gửi |
| `Alert: NGUY HIEM: PHAT HIEN KHOI!` | 🚨 CRITICAL | Tất cả hành động |

---

### **Sensor Data**

| Message | Ý Nghĩa |
|---------|---------|
| `[SENSOR] Đã gửi dữ liệu lên Firebase` | ✅ Sensor data uploaded |
| `[SENSOR] Loi: 401` | ❌ Unauthorized (check auth key) |
| `[SENSOR] Loi: 503` | ❌ Firebase service unavailable |

---

## 🧪 Test Commands (Terminal)

### **Test 1: Kiểm tra WiFi**
```
- Mở Serial Monitor
- Nhìn thấy "WiFi ket noi thanh cong!" trong 15 giây?
- ✅ YES → Tiếp tục
- ❌ NO → Check SSID/Password
```

### **Test 2: Kiểm tra Firebase Đọc Lệnh**
```
- Mở Web App → Bấm "Relay ON"
- Serial sẽ in: [FIREBASE] Nhan dieu khien: ...
- ✅ YES → Firebase OK
- ❌ NO → Check Firebase URL/Rules
```

### **Test 3: Kiểm tra Relay Bật**
```
- Bấm "Relay ON" trên Web (Manual Mode)
- Serial in: [RELAY] BẬT - Sạc pin
- Đo GPIO 18: Phải là 3.3V
- ✅ YES → Relay OK
- ❌ NO → Check GPIO 18 wiring
```

### **Test 4: Kiểm tra SMS Fire Alert**
```
- Tăng nhiệt độ > 60°C (hoặc kích hoạt smoke sensor)
- Serial sẽ in: Goi dien...
- Serial sẽ in: Gui SMS: NGUY HIEM...
- ✅ Điện thoại nhận cuộc gọi + SMS
- ❌ NO → Check SIM card balance/kích hoạt
```

### **Test 5: Kiểm tra Hẹn Giờ Sạc**
```
- Chọn "Sạc 1 phút" (60000ms) trên Web
- Serial in: [CHARGE_TIMER] Bat dau
- Chờ ~10 giây, sẽ in: [CHARGE_TIMER] Thoi gian con: 50 giay
- Chờ ~60 giây, sẽ in: [CHARGE_TIMER] Het thoi gian sac
- Serial in: Gui SMS: ...da sac xong
```

---

## 🔍 Serial Output Analysis

### **Normal Sequence (5 giây đầu)**
```
✅ Ket noi WiFi.........
✅ WiFi ket noi thanh cong!
✅ Khoi tao cam bien
✅ MLX90614 khoi tao thanh cong!
✅ Cam bien da khoi tao!
✅ Khoi tao SIM800L
✅ KHKT 2026 - He thong Phong Chong Chay No
```

### **Normal Operational (Sau 5 giây)**
```
[STATUS] T_in:28.5 T_out:28.1 Relay:OFF AutoMode:ON Alert:An toan
[FIREBASE] Nhan dieu khien: {"auto":true,"relay":false,...}
[STATUS] T_in:28.6 T_out:28.2 Relay:OFF AutoMode:ON Alert:An toan
[FIREBASE] Nhan dieu khien: {"auto":true,"relay":false,...}
[SENSOR] Đã gửi dữ liệu lên Firebase
[STATUS] T_in:28.7 T_out:28.3 Relay:OFF AutoMode:ON Alert:An toan
```

### **Manual Mode Activated**
```
[MODE] MANUAL - Dieu khien tu Web App
[FIREBASE] Nhan dieu khien: {"auto":false,"relay":true,...}
[RELAY] BẬT - Sạc pin
[STATUS] T_in:28.5 T_out:28.1 Relay:ON AutoMode:OFF Alert:An toan
```

### **Fire Alert (T > 45°C)**
```
[STATUS] T_in:46.2 T_out:45.5 Relay:OFF AutoMode:ON Alert:Canh bao: Nhiet do > 45C
Gui SMS: Canh bao: Nhiet do > 45C. Da ngat sac, bat quat tan nhiet.
[STATUS] T_in:46.3 T_out:45.6 Relay:OFF AutoMode:ON Alert:Canh bao: Nhiet do > 45C
```

### **Critical Alert (T > 60°C)**
```
[STATUS] T_in:61.5 T_out:60.2 Relay:OFF AutoMode:ON Alert:NGUY HIEM > 60C
[RELAY] Ngắt sạc ngay lap tuc
Goi dien...
Gui SMS: NGUY HIEM: Nhiet do > 60C. Da ngat sac, bat coi/quat.
[STATUS] T_in:61.6 T_out:60.3 Relay:OFF AutoMode:ON Alert:NGUY HIEM > 60C
```

---

## 💡 Tips Debugging

1. **Lưu log:** Copy serial output vào file để phân tích
2. **Bộ lộc:** Filter by "[RELAY]" để chỉ xem relay messages
3. **Giả lập cảnh báo:** Mang lửa gần MLX90614 để test
4. **Test Firebase:** Dùng postman để gửi lệnh trực tiếp
5. **Đo điện áp:** Multimeter kiểm tra GPIO 18 khi relay ON

---

## 🚨 Critical Messages (Cần Xử Lý Ngay)

```
❌ Khong the ket noi WiFi
   → Check Router + SSID/Password

❌ [FIREBASE] Loi HTTP: 404
   → Firebase chưa có dữ liệu, tạo mới trên Web

❌ [FIREBASE] Loi HTTP: 401
   → Check auth token/security rules

❌ LOI: Khong tim thay MLX90614
   → Check I2C (GPIO 21/22) wiring

❌ Goi dien... nhưng không nhận cuộc gọi
   → Check SIM card + balance + number
```

---

## ✅ Success Indicators

✅ Thấy "[STATUS]" mỗi 5 giây
✅ Thấy "[FIREBASE] Nhan dieu khien" mỗi 3 giây
✅ Khi bấm "Relay ON" → Thấy "[RELAY] BẬT" trong 3 giây
✅ Khi đạt 45°C → Tự động Fan ON + SMS
✅ Khi đạt 60°C → Tự động Buzzer + Call
✅ Khi hết hẹn giờ → Relay OFF + SMS "đã sạc xong"

---

**Mục Đích:** Debug dễ dàng thông qua Serial Monitor khi kết nối WiFi
**Bắt Đầu:** COM3 @ 115200 baud
**Next:** Mở Web App + Bấm toggle để test Firebase control
