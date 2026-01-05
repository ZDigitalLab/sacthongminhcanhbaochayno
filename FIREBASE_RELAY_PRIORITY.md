# 🔴 Firebase controls/relay - ƯU TIÊN CAO NHẤT

## ✅ Cấu Trúc Mới - Firebase Là Source of Truth

### **Execution Flow (Mỗi Cycle)**

```
┌─────────────────────────────────────────────────────┐
│             Loop Execution Order                     │
└─────────────────────────────────────────────────────┘

STEP 1: Đọc Firebase (mỗi 3 giây)
        readControlsFromFirebase()
        ↓
        Nếu controls/relay = true  → relayOn = true
        Nếu controls/relay = false → relayOn = false
        ↓
        Serial: "[RELAY] BẬT (từ Firebase)" or "[RELAY] TẮT (từ Firebase)"

STEP 2: Cập nhật cảm biến (mỗi 1 giây)
        updateSensors()
        ↓
        Đọc: T, H, V, I, Smoke

STEP 3: Kiểm tra cảnh báo (mỗi 1 giây)
        checkSystemStatus()
        ↓
        ⚠️ Nếu T > 60°C HOẶC Smoke:
           → relayOn = FALSE (OVERRIDE Firebase)
           → Serial: "[RELAY] FIRE ALERT - Firebase relay bị override"
        ↓
        ⚠️ Nếu T > 45°C:
           → relayOn = FALSE (Turn off relay on warning)
        ↓
        ✅ Nếu An toan:
           → relayOn giữ nguyên (từ Firebase)

STEP 4: Gửi dữ liệu lên Firebase (mỗi 10 giây)
        sendSensorDataToFirebase()
        ↓
        Cập nhật sensor/ path
```

---

## 🎯 Relay Control Priority Levels

```
┌─────────────────────────────────────────────────────┐
│        RELAY CONTROL PRIORITY HIERARCHY              │
└─────────────────────────────────────────────────────┘

🔴 LEVEL 0 (HIGHEST): FIRE ALERT
   Condition: T > 60°C HOẶC Phát hiện khói
   Action: 
   ├─ relayOn = FALSE (Force OFF)
   ├─ fan1 = fan2 = TRUE (Cooling fans ON)
   ├─ buz1 = buz2 = TRUE (Buzzers ON)
   ├─ Call phone NOW
   └─ Send SMS NOW
   Source: Sensor reading
   Override: YES (override Firebase)

🟠 LEVEL 1 (HIGH): FIREBASE controls/relay
   Condition: WiFi connected + data from Firebase
   Action:
   ├─ relayOn = Firebase controls/relay value
   ├─ If true → "[RELAY] BẬT (từ Firebase) - Sạc pin"
   └─ If false → "[RELAY] TẮT (từ Firebase)"
   Source: Web App via Firebase
   Override: NO (unless Level 0 fires)

🟡 LEVEL 1.5 (HIGH): WARNING ALERT
   Condition: T > 45°C HOẶC H > 90%
   Action:
   ├─ relayOn = FALSE (Turn off relay)
   ├─ fan1 = fan2 = TRUE (Fans ON)
   ├─ Send SMS warning
   └─ alertStatus = "Canh bao..."
   Source: Sensor reading
   Override: YES (temporary override Firebase)

🟢 LEVEL 2 (MEDIUM): CHARGE TIMER
   Condition: chargeTimerActive = true
   Action: Count down + auto relay OFF
   Note: Only active if relay already ON from Firebase

⚪ LEVEL 3 (LOW): BATTERY FULL
   Condition: v_charge >= 54V
   Action: relayOn = FALSE (safety shutoff)
   Note: Independent check

⚪ LEVEL 4 (LOWEST): AUTO MODE
   Condition: autoMode = true (not used currently)
   Action: Temperature-based decision
   Note: Firebase usually in Manual mode
```

---

## 📡 Data Flow Diagram

```
┌──────────────────────────────────┐
│     Web App (index.html)          │
│  User toggles "Relay ON"          │
└────────────┬─────────────────────┘
             │
             ├─→ Update local state
             │
             └─→ Write to Firebase:
                 controls/relay = true

┌──────────────────────────────────┐
│   Firebase Realtime Database      │
│   controls/ path updated          │
│   Real-time listeners triggered   │
└────────────┬─────────────────────┘
             │
             └─→ data synced to Cloud

┌──────────────────────────────────┐
│  ESP32 loop() execution           │
│  (every 3 seconds)                │
└────────────┬─────────────────────┘
             │
             ├─→ readControlsFromFirebase()
             │
             ├─→ HTTP GET /controls.json
             │
             ├─→ Parse: "relay":true
             │
             ├─→ Set: firebaseRelayState = true
             │
             ├─→ Check: alertStatus == "An toan"?
             │
             ├─→ YES → relayOn = true
             │
             └─→ Serial: "[RELAY] BẬT (từ Firebase)"

┌──────────────────────────────────┐
│  checkSystemStatus()              │
│  (every 1 second)                 │
└────────────┬─────────────────────┘
             │
             ├─→ Check: warnLevel2 (T > 60°C)?
             │
             ├─→ NO → relayOn stays TRUE (Firebase)
             │
             └─→ YES → relayOn = FALSE (override)
                      alertStatus = "NGUY HIEM"

┌──────────────────────────────────┐
│  applyOutputs()                   │
└────────────┬─────────────────────┘
             │
             └─→ digitalWrite(GPIO_18, relayOn)
                 │
                 ├─→ relayOn = true  → PIN 18 = HIGH (3.3V)
                 └─→ relayOn = false → PIN 18 = LOW (0V)

┌──────────────────────────────────┐
│  Relay Hardware (60V Charger)     │
└────────────┬─────────────────────┘
             │
             ├─→ PIN 18 = HIGH → Optocoupler ON
             │
             ├─→ Relay coil energized (5V supply)
             │
             ├─→ Main contact closed
             │
             └─→ 60V charging voltage to battery
```

---

## 🔍 Serial Output Examples

### **Scenario 1: User bấm "Relay ON" trên Web**

```
[FIREBASE] Nhan dieu khien: {"auto":false,"relay":true,...}
[FIREBASE] controls/relay = TRUE
[RELAY] BẬT (từ Firebase) - Sạc pin
[STATUS] T_in:28.5 T_out:28.1 Relay:ON AutoMode:OFF Alert:An toan
[SENSOR] Đã gửi dữ liệu lên Firebase
```

**GPIO 18 State:** 3.3V (HIGH)
**Relay Status:** Energized, 60V charging ON

---

### **Scenario 2: User bấm "Relay OFF" trên Web**

```
[FIREBASE] Nhan dieu khien: {"auto":false,"relay":false,...}
[FIREBASE] controls/relay = FALSE
[RELAY] TẮT (từ Firebase)
[STATUS] T_in:28.5 T_out:28.1 Relay:OFF AutoMode:OFF Alert:An toan
```

**GPIO 18 State:** 0V (LOW)
**Relay Status:** De-energized, 60V OFF

---

### **Scenario 3: Relay ON nhưng T tăng > 60°C**

```
[RELAY] BẬT (từ Firebase) - Sạc pin
[STATUS] T_in:61.5 T_out:60.2 Relay:ON AutoMode:OFF Alert:An toan
...
(Temperature keeps rising)
...
[STATUS] T_in:62.0 T_out:61.0 Relay:ON AutoMode:OFF Alert:An toan
[STATUS] T_in:65.0 T_out:63.5 Relay:ON AutoMode:OFF Alert:NGUY HIEM > 60C
[RELAY] FIRE ALERT - Firebase relay bị override
Goi dien...
Gui SMS: NGUY HIEM: Nhiet do > 60C. Da ngat sac, bat coi/quat.
[STATUS] T_in:65.1 T_out:63.6 Relay:OFF AutoMode:OFF Alert:NGUY HIEM > 60C
```

**What happened:**
- Step 1: Firebase says relay ON → GPIO 18 = HIGH
- Step 2: Temperature > 60°C detected
- Step 3: Fire alert triggered → Override relay OFF
- Step 4: GPIO 18 = LOW (relay physically de-energized)

---

### **Scenario 4: Relay OFF nhưng T > 45°C (Warning)**

```
[RELAY] TẮT (từ Firebase)
[STATUS] T_in:46.0 T_out:45.5 Relay:OFF AutoMode:OFF Alert:Canh bao: Nhiet do > 45C
Gui SMS: Canh bao: Nhiet do > 45C. Da ngat sac, bat quat tan nhiet.
[STATUS] T_in:46.1 T_out:45.6 Relay:OFF AutoMode:OFF Alert:Canh bao: Nhiet do > 45C
```

**What happened:**
- Firebase says relay OFF → relayOn = false
- Warning detected (T > 45°C) → relayOn stays false
- Fan turns ON automatically

---

## ✨ Các Cải Thiện Chính

### **Trước (Old Code)**
```cpp
// Relay chỉ được áp dụng nếu MANUAL MODE
if (!autoMode && alertStatus == "An toan") {
    // Apply relay
}
// Problem: Relay không sync nếu ở AUTO MODE
```

### **Sau (New Code)**
```cpp
// Relay LUÔN được áp dụng từ Firebase (trừ khi fire alert)
if (alertStatus == "An toan") {
    relayOn = firebaseRelayState;  // Always apply
} else {
    relayOn = false;  // Fire alert override
}
// Solution: Relay = Source of Truth từ Firebase
```

---

## 🔐 Safety Guarantees

| Situation | Relay Action | Reason |
|-----------|-------------|--------|
| **Normal + Firebase ON** | ON | Firebase control |
| **Normal + Firebase OFF** | OFF | Firebase control |
| **T > 45°C** | OFF | Warning safety |
| **T > 60°C** | OFF | Fire alert |
| **Smoke detected** | OFF | Fire alert |
| **Startup** | OFF | Safe default |
| **WiFi lost** | Last state | (no change until reconnected) |

---

## 🧪 Testing Checklist

- [ ] Bấm "Relay ON" trên Web → "[RELAY] BẬT (từ Firebase)" in ra
- [ ] GPIO 18 = 3.3V khi relay BẬT
- [ ] Bấm "Relay OFF" → "[RELAY] TẮT (từ Firebase)" in ra
- [ ] GPIO 18 = 0V khi relay TẮT
- [ ] Tăng T > 60°C → "[RELAY] FIRE ALERT" in ra
- [ ] Relay OFF immediately khi fire alert
- [ ] Khi hạ T xuống bình thường → Relay back to Firebase state
- [ ] Mỗi 3 giây thấy "[FIREBASE]" message (Firebase sync active)

---

## 📋 Execution Summary

```
┌─────────────────────────────────────────────────┐
│  Priority Flow for RELAY Control (GPIO 18)       │
├─────────────────────────────────────────────────┤
│                                                  │
│  1️⃣  Read Firebase controls/relay (every 3s)   │
│      └─→ Set firebaseRelayState                 │
│                                                  │
│  2️⃣  Check Fire Alert (every 1s)               │
│      └─→ If T>60°C: relayOn = FALSE             │
│                                                  │
│  3️⃣  Apply Output                              │
│      └─→ digitalWrite(GPIO_18, relayOn)         │
│                                                  │
│  ✅ Result: Firebase controls relay, except     │
│            when fire alert (Level 0 priority)   │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 🎓 Key Takeaway

**Firebase `controls/relay` is now the PRIMARY SOURCE OF TRUTH for relay state.**

- Web App sends command → Firebase stores it
- ESP32 reads Firebase value (every 3 seconds)
- ESP32 applies relay state unless fire alert
- Fire alert (Level 0) can override Firebase
- All other logic respects Firebase decision

**Serial messages show which path relay took:**
- `[RELAY] BẬT (từ Firebase)` = Firebase control
- `[RELAY] FIRE ALERT - Firebase relay bị override` = Fire alert override
- `[RELAY] TẮT (từ Firebase)` = Firebase control OFF

---

**Status:** ✅ COMPLETE - Firebase controls/relay is now properly prioritized
**File:** code_khkt.ino (Updated)
**Next:** Test with Web App + Serial Monitor
