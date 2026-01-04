# 🔋 Hệ Thống Hẹn Giờ Ngắt Sạc

## 📋 Tổng quan

Hệ thống hẹn giờ ngắt sạc tự động cho phép người dùng đặt thời gian sạc pin và tự động ngắt relay khi hết thời gian.

## 🎯 Tính năng

### 1. **Web App**
- ⏰ Form đặt hẹn giờ (giờ + phút)
- 🎨 Hiển thị thời gian đếm ngược real-time
- 🔔 Thông báo khi hết thời gian (Browser Notification)
- ✅ Tự động bật relay khi bắt đầu
- ❌ Tự động tắt relay khi hết giờ
- 🛑 Nút hủy hẹn giờ bất cứ lúc nào

### 2. **Arduino ESP32**
- 📡 Đọc lệnh hẹn giờ từ Firebase
- ⚡ Tự động bật/tắt relay theo lịch
- 🛡️ Tự động hủy hẹn giờ khi:
  - Pin đầy (≥ 54V)
  - Nhiệt độ cao (> 45°C)
  - Phát hiện khói
  - Chế độ tự động can thiệp

## 🔧 Cấu trúc Firebase

### Control Node
```json
{
  "auto": false,
  "fan1": false,
  "fan2": false,
  "buz1": false,
  "buz2": false,
  "relay": true,
  "charge_timer_active": true,
  "charge_timer_end": 1735891234567
}
```

**Các trường:**
- `charge_timer_active`: Boolean - Trạng thái hẹn giờ
- `charge_timer_end`: Number - Timestamp kết thúc (milliseconds)

## 📱 Hướng dẫn sử dụng

### Trên Web App:

1. **Bắt đầu hẹn giờ:**
   - Vào tab "Hẹn giờ" (Schedule)
   - Nhập số giờ và phút
   - Nhấn "Bắt đầu sạc"
   - Relay sẽ tự động BẬT

2. **Theo dõi:**
   - Xem thời gian còn lại đếm ngược
   - Nhật ký ghi lại khi bắt đầu/kết thúc

3. **Hủy hẹn giờ:**
   - Nhấn nút "Hủy"
   - Relay sẽ tự động TẮT

### Trên Arduino:

Arduino tự động:
- ✅ Đọc lệnh từ Firebase mỗi 5 giây
- ✅ Kiểm tra thời gian còn lại
- ✅ Bật relay khi có lệnh hẹn giờ
- ✅ Tắt relay khi hết giờ hoặc nguy hiểm

## ⚠️ An toàn

Hệ thống tự động **HỦY hẹn giờ** và **NGẮT relay** khi:

1. 🔥 Nhiệt độ > 45°C (Mức 1)
2. 🔥 Nhiệt độ > 60°C (Mức 2)
3. 💨 Phát hiện khói
4. 🔋 Pin đầy (≥ 54V)
5. 💧 Độ ẩm > 90%

## 🔄 Luồng hoạt động

```
User đặt hẹn giờ trên Web
    ↓
Firebase: charge_timer_active = true
Firebase: charge_timer_end = [timestamp]
Firebase: relay = true
    ↓
Arduino đọc từ Firebase
    ↓
Arduino bật relay
    ↓
[Đếm ngược thời gian]
    ↓
Hết giờ hoặc điều kiện nguy hiểm
    ↓
Arduino tắt relay
Firebase: charge_timer_active = false
    ↓
Web hiển thị "Đã hết thời gian"
Gửi notification
```

## 💡 Cải tiến trong tương lai

### Đồng bộ thời gian chính xác:

**Hiện tại:** Web app gửi `Date.now()` (Unix timestamp)
**Vấn đề:** ESP32 dùng `millis()` (thời gian từ lúc boot)

**Giải pháp:**

#### Option 1: NTP Time Sync (Khuyên dùng)
```cpp
#include <time.h>

void setupNTP() {
  configTime(7 * 3600, 0, "pool.ntp.org"); // GMT+7 Vietnam
}

unsigned long getCurrentTime() {
  time_t now;
  time(&now);
  return now * 1000; // Convert to milliseconds
}

void checkChargeTimer() {
  if (chargeTimerActive && chargeTimerEnd > 0) {
    unsigned long currentTime = getCurrentTime();
    if (currentTime >= chargeTimerEnd) {
      // Hết giờ - tắt relay
      relayOn = false;
      chargeTimerActive = false;
      sendSMS("Het gio sac - Da ngat relay");
    }
  }
}
```

#### Option 2: Relative Time
Web app gửi duration thay vì timestamp:
```javascript
// Web app
const durationMs = hours * 3600000 + minutes * 60000;
update(ref(database, 'control'), {
  charge_timer_active: true,
  charge_timer_duration: durationMs
});

// Arduino
chargeStartTime = millis();
if (millis() - chargeStartTime >= chargeTimerDuration) {
  // Hết giờ
  relayOn = false;
}
```

## 🔌 Cài đặt

1. Upload code Arduino lên ESP32
2. Mở web app trong trình duyệt
3. Cho phép notifications khi được hỏi
4. Sử dụng!

## 📊 Log Events

Tất cả hoạt động được ghi vào:
- Web app: Tab "Nhật ký"
- Serial Monitor: 115200 baud
- Firebase: (tùy chọn - có thể lưu lịch sử)

## 🎨 UI/UX

- **Card màu vàng** cho phần hẹn giờ sạc (nổi bật)
- **Input lớn** dễ nhập
- **Countdown timer** trực quan
- **Alert màu xanh** khi đang hoạt động
- **Responsive** trên mọi thiết bị

---

Made with ❤️ for KHKT 2026
