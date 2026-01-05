# 📱 Hướng Dẫn Sử Dụng - Hẹn giờ Sạc & Relay

## 🎯 Mục Đích
Hệ thống KHKT 2026 cho phép điều khiển relay (sạc pin) thông qua:
1. **Hẹn giờ sạc** - Relay tự động bật/tắt theo thời gian
2. **Điều khiển thủ công** - Bật/tắt relay trực tiếp từ Web UI
3. **Bảo vệ tự động** - ESP32 tự động tắt relay khi có cảnh báo

---

## 🚀 Hướng Dẫn Sử Dụng

### 1️⃣ Sử Dụng Hẹn giờ Sạc

#### A. Bước 1: Nhập thời gian sạc
- Vào tab **"Hẹn giờ"** (Schedule)
- Tìm phần **"Hẹn giờ ngắt sạc"**
- Nhập **Giờ** (0-24) và **Phút** (0-59)
  - Ví dụ: 2 giờ 30 phút = Giờ: 2, Phút: 30

#### B. Bước 2: Bắt đầu sạc
- Click nút **"Bắt đầu sạc"** (Button xanh)
- Hệ thống sẽ:
  - 📤 Gửi lệnh lên Firebase
  - 🔌 ESP32 nhận và bật Relay
  - 📊 Hiển thị **"Đang sạc - Hẹn giờ"** với đếm ngược
  - ⚠️ Bật cảnh báo "Relay đang được điều khiển bởi hẹn giờ"

#### C. Bước 3: Chờ sạc xong
- Hệ thống tự động đếm ngược thời gian
- Format: **HH:MM:SS**
- Khi hết thời gian:
  - ⏸️ Relay tự động **OFF**
  - 📢 Thông báo "Đã hết thời gian sạc"
  - 🔔 Pop-up notification (nếu cho phép)

#### D. Hủy hẹn giờ (Tùy chọn)
- Click nút **"Hủy"** (Button đỏ) trong phần "Đang sạc"
- Relay sẽ **OFF** ngay lập tức
- Quay lại chế độ bình thường

---

### 2️⃣ Điều Khiển Relay Thủ Công

#### Điều Kiện
- ❌ **KHÔNG** có hẹn giờ sạc đang hoạt động
- ✅ Ở bất kỳ chế độ (Auto/Manual)

#### Cách Bật/Tắt
1. Vào tab **"Điều khiển"** (Controls)
2. Tìm **"Relay điều khiển sạc"**
3. **Bật** (ON):
   - Click Toggle → Relay **BẬT**
   - Trạng thái: ✅ ON (Xanh)
4. **Tắt** (OFF):
   - Click Toggle → Relay **TẮT**
   - Trạng thái: ❌ OFF (Xám)

#### Nếu Hẹn giờ Đang Hoạt động
- Toggle sẽ **BỊ KHÓA** 🔒
- Alert: **"Relay đang được điều khiển bởi hẹn giờ sạc"**
- Cách giải quyết: Hủy hẹn giờ trước

---

## ⚠️ Tình Huống Cảnh Báo

### Cảnh báo Mức 1: T > 45°C hoặc Độ ẩm > 90%
```
🟡 Biểu tượng: Cảnh báo (Vàng)
📋 Hành động:
  - Relay OFF (ngắt sạc)
  - Quạt ON (tản nhiệt / hút ẩm)
  - Còi OFF
  - SMS: Cảnh báo
  
⏱️ Hẹn giờ sạc: HỦY nếu có
```

### Cảnh báo Mức 2: T > 60°C hoặc Phát hiện KHÓI
```
🔴 Biểu tượng: Nguy hiểm (Đỏ)
📋 Hành động:
  - Relay OFF (ngắt sạc)
  - Quạt ON (toàn bộ)
  - Còi ON (báo động)
  - GỌIỆN thoại
  - SMS: Báo động nguy hiểm
  
⏱️ Hẹn giờ sạc: HỦY nếu có
```

### Pin Đầy: V_charge >= 54V
```
📊 Trạng thái: Pin đầy
📋 Hành động:
  - Relay OFF (ngắt sạc)
  - Quạt/Còi: Bình thường
  - SMS: "Pin đã đầy"
  
⏱️ Hẹn giờ sạc: HỦY nếu có
```

---

## 🔄 Đồng Bộ Dữ Liệu

### Firebase Structure
```
controls/
├── auto: true|false          (Chế độ tự động)
├── relay: true|false         (Trạng thái relay)
├── quat1, quat2: true|false  (Quạt)
├── coi1, coi2: true|false    (Còi)
├── charge_timer_active: true|false
└── charge_timer_end: 7200000 (Duration ms)

sensor/
├── nhiet_do_ben_trong: 28.5
├── nhiet_do_ben_ngoai: 25.3
├── nhiet_do_be_mat: 30.2
├── nhiet_do_moi_truong: 26.8
├── do_am: 65.5
├── dien_ap: 12.6
├── dong_sac: 2.3
├── pin_box: 85
└── khoi: false
```

### Thời Gian Cập Nhật
- **Sensor:** Mỗi 8 giây (ESP32 → Firebase)
- **Controls:** Mỗi 2 giây (Web/Firebase → ESP32)
- **Hẹn giờ:** Mỗi 1 giây (Web UI cập nhật countdown)

---

## 📊 Trạng Thái Relay

### Bảng Trạng Thái

| Trường Hợp | Relay | Quạt | Còi | Ghi Chú |
|-----------|-------|------|-----|---------|
| Bình thường | OFF | OFF | OFF | Hệ thống OK |
| Hẹn giờ sạc | ON | OFF | OFF | Đang sạc pin |
| Hẹn giờ hết | OFF | OFF | OFF | Sạc xong |
| T > 45°C | OFF | ON | OFF | Chạy quạt tản nhiệt |
| T > 60°C | OFF | ON | ON | Báo động |
| Khía phát hiện | OFF | ON | ON | Báo động nguy hiểm |
| Pin đầy | OFF | OFF | OFF | Sạc xong (tự động) |

---

## 💡 Mẹo & Lưu Ý

### ✅ Làm Sao Để
- **Hẹn giờ sạc chính xác?**
  - Nhập đúng giờ/phút cần sạc
  - Hệ thống sẽ tự động tắt sau thời gian

- **Kiểm tra relay có bật?**
  - Dashboard → Xem badge **"ON"** hay **"OFF"**
  - Hoặc nghe tiếng **"click"** từ relay

- **Biết pin đã đầy?**
  - Dashboard → Pin box >= 85%
  - SMS tự động: **"Pin đã đầy"**

- **Hủy hẹn giờ khẩn cấp?**
  - Click nút **"Hủy"** (Red button)
  - Relay sẽ **OFF** ngay lập tức

### ⚠️ Lưu Ý Quan Trọng
- **Không bao giờ bật relay khi:**
  - ❌ Hẹn giờ sạc đang hoạt động (hệ thống sẽ chặn)
  - ❌ Có cảnh báo T > 45°C
  - ❌ Pin quá cao (V_charge > 54V)

- **Hẹn giờ sạc sẽ tự động HỦY nếu:**
  - 🌡️ Nhiệt độ quá cao (T > 45°C)
  - 💨 Phát hiện khói
  - 🔋 Pin đầy (V_charge >= 54V)

- **Mục tiêu giữ:**
  - 🌡️ Nhiệt độ: < 40°C
  - 💨 Độ ẩm: < 80%
  - 🔋 Pin: 20% - 95%

---

## 🔧 Troubleshooting

### Relay không bật khi hẹn giờ
```
✓ Kiểm tra: Có kết nối Firebase không? (Xem connection status)
✓ Kiểm tra: ESP32 có nhận Firebase không? (Serial monitor)
✓ Kiểm tra: Có cảnh báo không? (Xem alert status)
→ Nếu OK: Refresh lại Web, bắt đầu lại hẹn giờ
```

### Hẹn giờ không đếm ngược
```
✓ Kiểm tra: Browser console có lỗi không?
✓ Kiểm tra: Tab vẫn còn active không?
✓ Kiểm tra: Kết nối Internet vẫn ổn định?
→ Refresh lại Web
```

### Relay bị tắt bất ngờ
```
✓ Kiểm tra: Có cảnh báo T > 45°C không?
✓ Kiểm tra: Pin có > 54V không?
✓ Kiểm tra: App.js có lỗi không?
→ Xem nhật ký (Logs tab)
```

### App.js lỗi khi điều khiển
```
✓ Console: Xem Error message
✓ Network: Kiểm tra Firebase request
✓ Permissions: Kiểm tra Firebase rules
→ Clear cache, reload trang
```

---

## 📞 Liên Hệ Hỗ Trợ

Nếu gặp vấn đề:
1. Xem **Nhật ký** (Logs tab) để tìm lỗi
2. Kiểm tra **Console** (F12 → Console)
3. Đọc **SYNC_UPDATE.md** để hiểu cách hoạt động

---

**Phiên bản: 1.0 - 05/01/2026**
