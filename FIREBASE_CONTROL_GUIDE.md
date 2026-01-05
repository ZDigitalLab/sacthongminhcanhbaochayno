# Hệ Thống Điều Khiển KHKT 2026 - Hướng Dẫn Kiểm Tra & Debug

## 🔍 Cấu Trúc Hệ Thống Hiện Tại

```
┌─────────────────────────────────────────────┐
│         ESP32 Microcontroller                │
│  • Cảm biến: DHT11, DS18B20, MLX90614       │
│  • Điều khiển: Relay, Quạt, Còi             │
└──────────────┬──────────────────────────────┘
               │
        ┌──────▼──────────────────────────┐
        │     WiFi (Z Lab VN)              │
        │  Kết nối Internet qua WiFi      │
        └──────┬─────────────────────────┬─┘
               │                         │
        ┌──────▼──────┐          ┌───────▼────┐
        │  Firebase   │◄────────►│  Web App   │
        │ Realtime DB │ (HTTP)   │(index.html)│
        │ REST API    │          │(app.js)    │
        └─────────────┘          └────────────┘
               │
        ┌──────▼──────────┐
        │ controls/      │
        │ - relay        │
        │ - quat1, quat2 │
        │ - coi1, coi2   │
        │ - auto_mode    │
        │ - timers       │
        └────────────────┘

┌──────────────────────────────────────────────┐
│      SIM800L Module (SMS/Call Only)          │
│  • Fire Alert (T > 60°C / Smoke)             │
│  • Charge Timer Complete Notification       │
└──────────────────────────────────────────────┘
```

---

## 📡 Dòng Dữ Liệu Điều Khiển (Ưu Tiên Firebase)

### **Flow 1: Lệnh từ Web → Firebase → ESP32 → Thực Thi**
```
1. User nhấn toggle "Relay" trên Web App
   ↓
2. Web App ghi vào Firebase: controls/relay = true
   ↓
3. ESP32 đọc từ Firebase mỗi 3 giây
   ↓
4. Kiểm tra: Nếu MANUAL MODE + Không cảnh báo → BẬT relay
   ↓
5. Serial Debug: "[RELAY] BẬT - Sạc pin"
   ↓
6. Pin ghi 18 (GPIO 18) = HIGH → Sạc 60V 2A
```

### **Flow 2: Tự Động (Auto Mode)**
```
Nhiệt độ tăng > 45°C → Fan BẬT tự động
   ↓ (không cần Firebase)
Nhiệt độ tăng > 60°C → Còi + Fan + Call + SMS
   ↓
Phát hiện khói → Ngay lập tức: Call + SMS
```

### **Flow 3: Hẹn Giờ Sạc**
```
1. Web App: Chọn "Sạc trong 2 giờ" (7200000 ms)
   ↓
2. Ghi Firebase: charge_timer_active = true, charge_timer_end = 7200000
   ↓
3. ESP32 nhận: Bắt đầu tính thời gian từ millis() hiện tại
   ↓
4. Mỗi 10 giây log: "[CHARGE_TIMER] Thời gian còn: 1800 giây"
   ↓
5. Khi hết → Relay TẮT + SMS "đã sạc xong"
```

---

## 🖥️ Serial Debug Output - Kiểm Tra Khi Khởi Động

### **Startup Sequence (Mong Muốn):**

```
Ket noi WiFi...........
WiFi ket noi thanh cong!
IP: 192.168.1.100

Khoi tao cam bien:
- MLX90614 khoi tao thanh cong!
- Nhiet do moi truong: 28.5

Cam bien da khoi tao!

Khoi tao SIM800L...
SIM800L khoi tao - Chi su dung SMS va goi dien!
========================================
KHKT 2026 - He thong Phong Chong Chay No
Giao tiep Firebase qua WiFi tu Web App
========================================

Dang khoi dong he thong... 1/5
Dang khoi dong he thong... 2/5
Dang khoi dong he thong... 3/5
Dang khoi dong he thong... 4/5
Dang khoi dong he thong... 5/5

[STATUS] T_in:28.5 T_out:28.1 Relay:OFF AutoMode:ON Alert:An toan
[FIREBASE] Nhan dieu khien: {"auto":true,"relay":false,"quat1":false,...}
[STATUS] T_in:28.6 T_out:28.2 Relay:OFF AutoMode:ON Alert:An toan
```

### **Khi Bấm Relay ON (Manual Mode):**

```
[MODE] MANUAL - Điều khiển từ Web App
[FIREBASE] Nhan dieu khien: {"auto":false,"relay":true,"quat1":false,...}
[RELAY] BẬT - Sạc pin
[STATUS] T_in:28.5 T_out:28.1 Relay:ON AutoMode:OFF Alert:An toan
[SENSOR] Đã gửi dữ liệu lên Firebase
```

### **Khi Nhiệt Độ Tăng > 45°C:**

```
[STATUS] T_in:46.2 T_out:45.8 Relay:OFF AutoMode:ON Alert:Canh bao: Nhiet do > 45C
[FAN] Bật quạt để tản nhiệt
Gui SMS: Canh bao: Nhiet do > 45C. Da ngat sac, bat quat tan nhiet.
```

### **Khi Phát Hiện Khói:**

```
[STATUS] T_in:28.5 T_out:28.1 Relay:OFF AutoMode:ON Alert:NGUY HIEM: PHAT HIEN KHOI!
[BUZZER] Bật cảnh báo
[RELAY] Ngắt sạc ngay lập tức
Goi dien...
Gui SMS: CANH BAO: PHAT HIEN KHOI! Da ngat toan bo he thong.
```

---

## 🔧 Các Chế Độ Hoạt Động

### **Chế Độ 1: AUTO MODE (Mặc Định)**
- System tự quyết định dựa vào nhiệt độ/độ ẩm
- Lệnh từ Web App được **IGNORE** (không áp dụng)
- Fire alert vẫn hoạt động bình thường
- **Ưu điểm:** An toàn, tự động phát hiện nguy hiểm

### **Chế Độ 2: MANUAL MODE**
- Web App có quyền điều khiển mọi thứ (Relay, Quạt, Còi)
- **NHƯNG:** Nếu có cảnh báo → Auto mode kích hoạt ngay
- Fire alert vẫn luôn ưu tiên cao nhất
- **Ưu điểm:** Linh hoạt cho thử nghiệm

---

## 📋 Kiểm Tra Danh Sách (Checklist)

### **Khởi Động Hệ Thống**
- [ ] Plug in ESP32 + SIM800L + Cảm biến
- [ ] Mở Serial Monitor (Baud: 115200)
- [ ] Xem có "WiFi ket noi thanh cong!" không

### **WiFi Kết Nối**
- [ ] SSID: "Z Lab VN"
- [ ] Password: "88888888@"
- [ ] Có IP address (ví dụ: 192.168.1.100)

### **Firebase Đọc Lệnh**
- [ ] Mỗi 3 giây: "[FIREBASE] Nhan dieu khien: {...}"
- [ ] Nếu không thấy → Check URL Firebase, WiFi

### **Relay Điều Khiển**
- [ ] Bấm "Relay ON" trên Web → "[RELAY] BẬT - Sạc pin"
- [ ] Bấm "Relay OFF" trên Web → Relay tắt
- [ ] Đo GPIO 18: Khi ON = 3.3V, khi OFF = 0V

### **Cảm Biến Đọc**
- [ ] Mỗi 1 giây: updateSensors() chạy
- [ ] Mỗi 5 giây: "[STATUS] T_in:XX T_out:XX ..."
- [ ] Giá trị thay đổi theo nhiệt độ thực

### **Fire Alert**
- [ ] Tăng nhiệt lên 45°C → Fan bật + SMS gửi
- [ ] Tăng lên 60°C → Còi + Call + SMS
- [ ] Phát hiện khói → Ngay lập tức Call + SMS

### **Hẹn Giờ Sạc**
- [ ] Chọn "Sạc 2 tiếng" → "[CHARGE_TIMER] Bắt đầu"
- [ ] Mỗi 10 giây log thời gian còn lại
- [ ] Khi hết → Relay OFF + SMS "đã sạc xong"

---

## 🐛 Troubleshooting

### **Vấn Đề 1: "Khong the ket noi WiFi"**
```
Giải pháp:
1. Kiểm tra SSID: "Z Lab VN" (case-sensitive)
2. Kiểm tra password: "88888888@" (có ký tự @)
3. Kiểm tra WiFi có hoạt động không
4. Restart ESP32 + Router
```

### **Vấn Đề 2: Không thấy "[FIREBASE] Nhan dieu khien"**
```
Giải pháp:
1. Check WiFi kết nối (có IP chưa?)
2. Kiểm tra Firebase URL có đúng không
3. Firebase có dữ liệu controls/ chưa?
4. Check firebaseio.com rules (phải allow read)
```

### **Vấn Đề 3: Relay bật nhưng không phát hiện**
```
Giải pháp:
1. Kiểm tra GPIO 18 cấp 3.3V khi ON
2. Relay có dây kết nối không?
3. Relay có nguồn 5V riêng không?
4. Kiểm tra relay optocoupler (cách ly)
```

### **Vấn Đề 4: SMS không gửi**
```
Giải pháp:
1. SIM card có tiền không? (Viettel 80k/tháng)
2. SIM có kích hoạt SMS chưa?
3. Số điện thoại đúng? (0979864822)
4. Check "[FIREBASE] ...not sent" trong log
```

### **Vấn Đề 5: Cảm biến báo sai nhiệt độ**
```
Giải pháp:
1. MLX90614 có kết nối I2C không?
2. DHT11 có dạm ẩm không (cần tiếp cận)?
3. DS18B20 có dây 1-Wire không?
4. Calibrate các cảm biến bằng nhiệt kế chuẩn
```

---

## 🚀 Lệnh HTTP API (Để Test Trực Tiếp)

### **Gửi lệnh BẬT Relay qua Postman/cURL:**

```bash
curl -X PUT \
  'https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app/controls.json' \
  -H 'Content-Type: application/json' \
  -d '{
    "auto": false,
    "relay": true,
    "quat1": false,
    "quat2": false,
    "coi1": false,
    "coi2": false
  }'
```

### **Đọc trạng thái:**

```bash
curl -X GET \
  'https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app/controls.json'
```

---

## 📊 Ưu Tiên Điều Khiển (Priority)

| Mức | Nguồn | Hành Động | Ưu Tiên |
|-----|-------|----------|--------|
| 1️⃣ | **Fire Alert** | Relay OFF, Fan ON, Buzzer ON, Call + SMS | **HIGHEST** |
| 2️⃣ | **Charge Timer** | Relay ON/OFF theo thời gian | **HIGH** |
| 3️⃣ | **Battery Full** | Relay OFF khi V > 54V | **HIGH** |
| 4️⃣ | **Auto Mode** | Quyết định dựa nhiệt độ | **MEDIUM** |
| 5️⃣ | **Manual Mode** | Web App lệnh (chỉ khi an toàn) | **LOW** |

---

## ✅ Trạng Thái Hệ Thống (Expected)

Khi khởi động:
- **alertStatus:** "An toan"
- **autoMode:** true (mặc định)
- **relayOn:** false (chế độ bảo tồn pin)
- **fan1, fan2:** false
- **buz1, buz2:** false

---

## 📝 Ghi Chú Quan Trọng

1. **Firebase Priority:** Lệnh từ Firebase được **ưu tiên nhất** nếu an toàn
2. **Fire Alert Override:** Cảnh báo cháy **luôn override** mọi lệnh khác
3. **WiFi Requirement:** ESP32 **PHẢI** kết nối WiFi để nhận lệnh Firebase
4. **SIM for Alerts:** SIM800L **CHỈ** gửi SMS/Call khi có cảnh báo
5. **Manual Mode Safety:** Manual mode **CÓ THỂ BỊ HỦY** nếu phát hiện cảnh báo

---

## 🔄 Chu Kỳ Cập Nhật

| Chức Năng | Chu Kỳ |
|-----------|---------|
| Cập nhật cảm biến | 1 giây |
| Kiểm tra cảnh báo | 1 giây |
| Đọc Firebase | 3 giây |
| Gửi dữ liệu lên | 10 giây |
| Log Status | 5 giây |

---

**Status:** ✅ Hệ thống sẵn sàng để test với WiFi debug qua Serial
**Last Update:** Hôm nay
**Next Step:** Kết nối WiFi + Mở Serial Monitor + Bấm toggle trên Web App
