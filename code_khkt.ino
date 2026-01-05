#include <WiFi.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_MLX90614.h>
#include <HardwareSerial.h>
#include <DHT.h>

// ====== Cấu hình Người dùng ======
#define WIFI_SSID "Z Lab VN"
#define WIFI_PASS "88888888@"
#define PHONE_NUMBER "0979864822" 

// ====== Chân kết nối ======
#define DHT_PIN       13    
#define DHTTYPE       DHT11 
#define DS18B20       15    
#define SDA_MLX       21    
#define SCL_MLX       22    
#define BUZZER1       25
#define BUZZER2       26
#define FAN1          27
#define FAN2          14
#define RELAY_SAC     18
#define SIM_TX        17
#define SIM_RX        16
#define SIM_RST       5
#define SMOKE_PIN     4     // Chân cảm biến khói (Digital)

// Các chân ADC
#define ADC_PIN_VBAT  34
#define ADC_PIN_VCHG  35
#define ADC_PIN_IACS  33

// ====== Biến toàn cục ======
float t_dht = 0, h_dht = 0;   
float t_surface = 0;          
float t_in = 0;               
float t_out = 0;              
float v_bat, v_charge, i_charge, powerW, percentBat;
bool smokeDetected = false; // Trạng thái khói

// Trạng thái điều khiển
bool fan1=false, fan2=false, buz1=false, buz2=false, relayOn=true, autoMode=true;
unsigned long lastUpdate=0;

// Biến Tọa độ
String gps_lat = "0";
String gps_lon = "0";
unsigned long lastLocationCheck = 0;

// Biến hẹn giờ sạc
unsigned long chargeTimerEnd = 0;
bool chargeTimerActive = false;
unsigned long lastChargeTimerCheck = 0;
unsigned long chargeTimerStartTime = 0; // Thời gian bắt đầu sạc (millis boot time)

// Biến cảnh báo (Khởi tạo = 0)
unsigned long lastTimeSMS1 = 0;
unsigned long lastTimeSMS2 = 0;
unsigned long lastTimeCall = 0;

// Cập nhật: Tách riêng thời gian chống spam cho Gọi và SMS (30 giây)
const unsigned long TIME_LIMIT_SMS = 30000;  
const unsigned long TIME_LIMIT_CALL = 30000; 

// Biến trạng thái thông báo pin đầy (theo áp sạc)
bool fullBatNotified = false;

// Biến trạng thái thông báo hẹn giờ sạc xong
bool chargeTimerDoneNotified = false;

// Biến quản lý SIM & Firebase
unsigned long lastSendFirebase = 0;
unsigned long lastReadFirebase = 0; 
String alertStatus = "An toan"; 

// Biến khởi động hệ thống
int sensorStartupCount = 0;
const int STARTUP_SKIP_LIMIT = 5;

// ====== Firebase Config ======
String FIREBASE_URL = "https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app/";
String FIREBASE_PATH_SENSOR = "sensor"; 
String FIREBASE_PATH_CONTROLS = "controls"; 
String FIREBASE_AUTH = ""; 

// ====== Khởi tạo ======
HardwareSerial simSerial(2); 
OneWire oneWire_in(DS18B20);
DallasTemperature sensors(&oneWire_in);
Adafruit_MLX90614 mlx = Adafruit_MLX90614();
DHT dht(DHT_PIN, DHTTYPE);

// ==========================================
//       FORWARD DECLARATIONS (Prototype)
// ==========================================
void applyOutputs();
void updateSensors();
void checkSystemStatus();

// ==========================================
//          HÀM GIAO TIẾP SIM 
// ==========================================
String simSend(String cmd, uint32_t wait=500) {
  simSerial.println(cmd);
  delay(wait);
  String resp="";
  while(simSerial.available()) resp += (char)simSerial.read();
  return resp;
}

// Hàm lấy tọa độ 
void getSimLocation() {
  Serial.println("Lay toa do LBS...");
  simSend("AT+CLBS=1,1", 3000); 
  while(simSerial.available()) simSerial.read();
  simSerial.println("AT+CLBS=1,1");
  unsigned long t = millis();
  String resp = "";
  while(millis() - t < 3000) {
    while(simSerial.available()) resp += (char)simSerial.read();
  }
  
  int idx = resp.indexOf("+CLBS: 0,");
  if (idx != -1) {
    String tempLon = "", tempLat = "";
    int firstComma = resp.indexOf(',', idx);
    int secondComma = resp.indexOf(',', firstComma + 1);
    int thirdComma = resp.indexOf(',', secondComma + 1);
    
    if (firstComma != -1 && secondComma != -1) {
      tempLon = resp.substring(firstComma + 1, secondComma);
      if (thirdComma != -1) tempLat = resp.substring(secondComma + 1, thirdComma);
      else tempLat = resp.substring(secondComma + 1);
      
      float fLat = tempLat.toFloat();
      float fLon = tempLon.toFloat();
      if (fLat > fLon) { gps_lat = tempLon; gps_lon = tempLat; } 
      else { gps_lat = tempLat; gps_lon = tempLon; }
    }
  }
}

void sendSMS(String message) {
  Serial.println("Gui SMS: " + message);
  simSend("AT+CMGF=1", 200);
  simSerial.print("AT+CMGS=\"" + String(PHONE_NUMBER) + "\"\r");
  delay(200);
  simSerial.print(message);
  delay(200);
  simSerial.write(26);
}

void makeCall() {
  Serial.println("Goi dien...");
  simSend("ATD" + String(PHONE_NUMBER) + ";", 1000);
}
// ==========================================
//    FIREBASE COMMUNICATION (WiFi REST API)
// ==========================================

#include <HTTPClient.h>

// Đọc lệnh điều khiển từ Firebase qua WiFi
void readControlsFromFirebase() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[FIREBASE] WiFi khong ket noi");
    return;
  }

  HTTPClient http;
  String url = FIREBASE_URL + FIREBASE_PATH_CONTROLS + ".json";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println("[FIREBASE] Nhan dieu khien: " + payload);
    
    // Phân tích JSON đơn giản (tìm các trường)
    // Format: {"auto":true,"relay":false,"quat1":false,"quat2":false,"coi1":false,"coi2":false,...}
    
    // Đọc mode AUTO/MANUAL - ưu tiên
    if (payload.indexOf("\"auto\":true") != -1) {
      autoMode = true;
      Serial.println("[MODE] AUTO - Hệ thống tự quyết định");
    } else if (payload.indexOf("\"auto\":false") != -1) {
      autoMode = false;
      Serial.println("[MODE] MANUAL - Điều khiển từ Web App");
    }
    
    // ⭐ LUÔN ƯU TIÊN: Đồng bộ relay từ Firebase (controls/relay)
    // Firebase là SOURCE OF TRUTH cho relay state
    bool firebaseRelayState = relayOn;
    
    if (payload.indexOf("\"relay\":true") != -1) {
      firebaseRelayState = true;
      Serial.println("[FIREBASE] controls/relay = TRUE");
    } else if (payload.indexOf("\"relay\":false") != -1) {
      firebaseRelayState = false;
      Serial.println("[FIREBASE] controls/relay = FALSE");
    }
    
    // Áp dụng relay state từ Firebase (trừ khi có fire alert)
    if (alertStatus == "An toan") {
      // Không có cảnh báo → LUÔN dùng Firebase value
      relayOn = firebaseRelayState;
      if (relayOn) {
        Serial.println("[RELAY] BẬT (từ Firebase) - Sạc pin");
      } else {
        Serial.println("[RELAY] TẮT (từ Firebase)");
      }
    } else {
      // Có cảnh báo → Fire alert priority (relay OFF)
      Serial.println("[RELAY] FIRE ALERT - Firebase relay bị override");
      relayOn = false;
    }
      
      if (payload.indexOf("\"quat1\":true") != -1) fan1 = true;
      else if (payload.indexOf("\"quat1\":false") != -1) fan1 = false;
      
      if (payload.indexOf("\"quat2\":true") != -1) fan2 = true;
      else if (payload.indexOf("\"quat2\":false") != -1) fan2 = false;
      
      if (payload.indexOf("\"coi1\":true") != -1) buz1 = true;
      else if (payload.indexOf("\"coi1\":false") != -1) buz1 = false;
      
      if (payload.indexOf("\"coi2\":true") != -1) buz2 = true;
      else if (payload.indexOf("\"coi2\":false") != -1) buz2 = false;
      
      applyOutputs();
    }
    
    // Xử lý hẹn giờ sạc (độc lập với mode)
    if (payload.indexOf("\"charge_timer_active\":true") != -1) {
      if (!chargeTimerActive) {
        chargeTimerActive = true;
        chargeTimerStartTime = millis();
        chargeTimerDoneNotified = false;
        Serial.println("[CHARGE_TIMER] Bắt đầu");
        
        // Tìm duration
        int durationIdx = payload.indexOf("\"charge_timer_end\":");
        if (durationIdx != -1) {
          int numStart = durationIdx + 19;
          int numEnd = payload.indexOf(',', numStart);
          if (numEnd == -1) numEnd = payload.indexOf('}', numStart);
          String durationStr = payload.substring(numStart, numEnd);
          durationStr.trim();
          chargeTimerEnd = durationStr.toInt();
          Serial.print("[CHARGE_TIMER] Duration: ");
          Serial.print(chargeTimerEnd / 1000);
          Serial.println(" giay");
        }
      }
    } else if (payload.indexOf("\"charge_timer_active\":false") != -1) {
      if (chargeTimerActive) {
        chargeTimerActive = false;
        Serial.println("[CHARGE_TIMER] Hủy");
      }
    }
    
  } else if (httpCode == 404) {
    Serial.println("[FIREBASE] Chưa có dữ liệu controls/");
  } else {
    Serial.print("[FIREBASE] Lỗi HTTP: ");
    Serial.println(httpCode);
  }
  
  http.end();
}

// Gửi dữ liệu cảm biến lên Firebase (tùy chọn)
void sendSensorDataToFirebase() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  String url = FIREBASE_URL + FIREBASE_PATH_SENSOR + ".json";
  
  // Tạo JSON
  String json = "{";
  json += "\"nhiet_do_trong\":" + String(t_in, 1) + ",";
  json += "\"nhiet_do_ngoai\":" + String(t_out, 1) + ",";
  json += "\"nhiet_do_be_mat\":" + String(t_surface, 1) + ",";
  json += "\"nhiet_do_dht\":" + String(t_dht, 1) + ",";
  json += "\"do_am\":" + String(h_dht, 1) + ",";
  json += "\"dien_ap_sac\":" + String(v_charge, 1) + ",";
  json += "\"dien_ap_pin\":" + String(v_bat, 1) + ",";
  json += "\"dong_sac\":" + String(i_charge, 2) + ",";
  json += "\"pin_percent\":" + String((int)percentBat) + ",";
  json += "\"relay_on\":" + String(relayOn ? "true" : "false") + ",";
  json += "\"auto_mode\":" + String(autoMode ? "true" : "false") + ",";
  json += "\"alert_status\":\"" + alertStatus + "\"";
  json += "}";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int httpCode = http.PUT(json);
  
  if (httpCode == 200) {
    Serial.println("[SENSOR] Đã gửi dữ liệu lên Firebase");
  } else {
    Serial.print("[SENSOR] Lỗi: ");
    Serial.println(httpCode);
  }
  
  http.end();
}

// Lưu ý: Giao tiếp Firebase sẽ được xử lý qua WiFi REST API
// Module SIM chỉ dùng để gửi SMS/Call khi cảnh báo

// ==========================================
//          CẢM BIẾN & ĐIỀU KHIỂN
// ==========================================
float readVoltage(uint8_t pin, float R1, float R2, float cal=1.0){
  long sum = 0;
  for(int i=0; i<10; i++) { sum += analogRead(pin); delay(1); }
  float v = (sum/10.0 * 3.3) / 4095.0;
  return v * (R1 + R2) / R2 * cal;
}

void updateSensors(){
  // Doc cam bien Khoi
  smokeDetected = !digitalRead(SMOKE_PIN); 

  sensors.requestTemperatures();
  float t1 = sensors.getTempCByIndex(0);
  float t2 = sensors.getTempCByIndex(1);
  if(t1 < -100) t1 = 0;
  if(t2 < -100) t2 = 0;
  t_in = t2; 
  t_out = t1;

  // Đọc cảm biến MLX90614 (nhiệt độ bề mặt)
  float tempObj = mlx.readObjectTempC();
  float tempAmb = mlx.readAmbientTempC();
  
  // Kiểm tra giá trị hợp lệ
  if (!isnan(tempObj) && tempObj > -40 && tempObj < 300) {
    t_surface = tempObj;
  } else {
    // Fallback: sử dụng nhiệt độ môi trường nếu object temp lỗi
    if (!isnan(tempAmb) && tempAmb > -40 && tempAmb < 125) {
      t_surface = tempAmb;
    } else {
      t_surface = 0;
    }
  } 

  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (!isnan(h) && !isnan(t)) { h_dht = h; t_dht = t; }

  v_bat    = readVoltage(ADC_PIN_VBAT, 47000, 10000, 1.4);
  v_charge = readVoltage(ADC_PIN_VCHG, 147000, 10000, 1.18);
  
  float v_acs = analogRead(ADC_PIN_IACS) * 3.3 / 4095.0;
  i_charge = (v_acs - 2.58) / 0.066;
  if(i_charge < 0.05) i_charge = 0;
  powerW = v_charge * i_charge;

  percentBat = (v_bat - 3.2) / (4.2 - 3.2) * 100.0;
  percentBat = constrain(percentBat, 0, 100);
}

void applyOutputs(){
  digitalWrite(RELAY_SAC, relayOn);
  ledcWrite(0, buz1 ? 128 : 0);
  ledcWrite(1, buz2 ? 128 : 0);
  ledcWrite(2, fan1 ? 200 : 0);
  ledcWrite(3, fan2 ? 200 : 0);
}
void checkSystemStatus() {
  if (sensorStartupCount < STARTUP_SKIP_LIMIT) {
    sensorStartupCount++;
    Serial.print("Dang khoi dong he thong... ");
    Serial.print(sensorStartupCount);
    Serial.print("/");
    Serial.println(STARTUP_SKIP_LIMIT);
   
    buz1 = false; buz2 = false; fan1 = false; fan2 = false; 
    relayOn = false;
    alertStatus = "Dang khoi dong...";
    applyOutputs();
    return; 
  }
  
  unsigned long now = millis();
  
  // ⭐⭐⭐ RELAY CONTROL PRIORITY LEVELS ⭐⭐⭐
  // Level 0: FIRE ALERT (T>60°C / Smoke) → Relay OFF IMMEDIATELY
  // Level 1: Firebase controls/relay → Always read & apply (unless Level 0)
  // Level 2: Charge Timer → Control timing
  // Level 3: Battery Full (V>54V) → Auto shutoff
  // Level 4: Auto Mode → Temperature-based decision
  // 
  // NOTE: Firebase relay state is set in readControlsFromFirebase()
  //       which is called BEFORE checkSystemStatus() in loop()
  //       Fire alert can OVERRIDE Firebase (Level 0 priority)

  // 1. XỬ LÝ HẸN GIỜ SẠC - CHỮA ĐỦ THÔNG TIN ĐỂ TÍNH TOÁN
  if (chargeTimerActive && chargeTimerEnd > 0 && chargeTimerStartTime > 0) {
    // Tính thời gian còn lại dựa trên:
    // - chargeTimerEnd: Unix timestamp (ms) từ web app (Date.now())
    // - chargeTimerStartTime: boot time (millis()) khi nhận hẹn giờ
    // 
    // Vì ESP không có NTP time, ta dùng thời gian tương đối:
    // Gọi hẹn giờ từ web app = X ms (from now)
    // Khi ESP nhận = boot time T
    // Khi kiểm tra = boot time T + (now - T) = now
    
    // Cách tính: Dùng timestamp Firebase làm reference
    // Time elapsed = (now - chargeTimerStartTime) 
    // Time remaining = chargeTimerEnd - (chargeTimerEnd - X) - time_elapsed
    // = X - time_elapsed
    
    // Đơn giản: Web app gửi "còn 3600000 ms" có thể tính từ Date.now() khi gửi
    // ESP dùng boot time để count down
    
    unsigned long elapsedTime = now - chargeTimerStartTime;
    unsigned long initialDuration = chargeTimerEnd; // Dùng trực tiếp làm duration (ms)
    
    if (elapsedTime >= initialDuration) {
      // HẾT THỜI GIỜ SẠC
      Serial.println("[CHARGE TIMER] Het thoi gian sac - Ngat relay");
      chargeTimerActive = false;
      relayOn = false;
      
      // Gửi SMS thông báo hẹn giờ sạc xong
      if (!chargeTimerDoneNotified) {
        sendSMS("Thong bao: Hen gio sac da hoan thanh. Da sac xong.");
        chargeTimerDoneNotified = true;
      }
    } else {
      // ĐANG SẠC - relay BẬT
      relayOn = true;
      chargeTimerDoneNotified = false; // Reset flag khi sạc tiếp tục
      unsigned long remainingTime = initialDuration - elapsedTime;
      
      // Log mỗi 10 giây
      if (now - lastChargeTimerCheck >= 10000) {
        lastChargeTimerCheck = now;
        Serial.print("[CHARGE TIMER] Thoi gian con: ");
        Serial.print(remainingTime / 1000);
        Serial.println(" giay");
      }
    }
  }
  
  if (!autoMode) return; 

  // 2. Kiểm tra Pin đầy
  if (v_charge >= 54.0) {
    if (relayOn) { 
      relayOn = false; 
      chargeTimerActive = false; // Hủy hẹn giờ khi đầy
      if (!fullBatNotified) {
         sendSMS("Thong bao: Pin da day (54V). Da sac xong.");
         fullBatNotified = true;
      }
    }
  } else if (v_charge < 52.0) { 
    fullBatNotified = false; 
  }

  // 3. Kiểm tra Cảnh báo
  // Mức 1: Nhiệt độ > 45 HOẶC Độ ẩm > 90%
  bool highTempLevel1 = (t_dht > 45 || t_surface > 45 || t_out > 45);
  bool highHumLevel1 = (h_dht > 90);
  bool warnLevel1 = (highTempLevel1 || highHumLevel1);

  // Mức 2: Nhiệt độ > 60 HOẶC Có khói
  bool warnLevel2 = (t_dht > 60 || t_surface > 60 || t_out > 60 || smokeDetected); 

  if (warnLevel2) {
    // MỨC 2: Nguy hiểm cao - OVERRIDE Firebase relay
    if (smokeDetected) alertStatus = "NGUY HIEM: PHAT HIEN KHOI!";
    else alertStatus = "NGUY HIEM > 60C";
    
    relayOn = false;  // ⭐ LEVEL 0 PRIORITY: Force relay OFF
    chargeTimerActive = false;
    fan1 = true; fan2 = true; 
    buz1 = true; buz2 = true;

    if (now - lastTimeCall > TIME_LIMIT_CALL || lastTimeCall == 0) { 
      makeCall(); 
      lastTimeCall = now; 
    }
    if (now - lastTimeSMS2 > TIME_LIMIT_SMS || lastTimeSMS2 == 0) { 
      if (smokeDetected) sendSMS("CANH BAO: PHAT HIEN KHOI! Da ngat toan bo he thong.");
      else sendSMS("NGUY HIEM: Nhiet do > 60C. Da ngat sac, bat coi/quat."); 
      lastTimeSMS2 = now; 
    }

  } else if (warnLevel1) {
    // MỨC 1: Cảnh báo - OVERRIDE Firebase relay
    relayOn = false;  // ⭐ Level 1.5 PRIORITY: Turn off relay on warning
    chargeTimerActive = false;
    fan1 = true; fan2 = true; 
    buz1 = false; buz2 = false;
    
    if (highHumLevel1) {
        alertStatus = "Canh bao: Do am > 90%";
    } else {
        alertStatus = "Canh bao: Nhiet do > 45C";
    }
    
    if (now - lastTimeSMS1 > TIME_LIMIT_SMS || lastTimeSMS1 == 0) { 
      if (highHumLevel1) sendSMS("Canh bao: Do am > 90%. Da ngat sac, bat quat de hut am.");
      else sendSMS("Canh bao: Nhiet do > 45C. Da ngat sac, bat quat tan nhiet."); 
      lastTimeSMS1 = now; 
    }

  } else {
    // NO ALERT: Firebase relay state is active (set in readControlsFromFirebase)
    alertStatus = "An toan";
    // NOTE: relayOn value is maintained from Firebase controls/relay
    //       Do NOT reset here - let Firebase control it
    buz1 = buz2 = false;
    // Fans: Only turn off if no fire alert and not in auto mode
    if (!autoMode) {
      fan1 = fan2 = false;  // Manual mode: fans controlled by Firebase
    }
    // Auto mode: fans will be controlled by temperature in separate logic
  }
  applyOutputs();
}


void setup(){
  Serial.begin(115200);
  pinMode(RELAY_SAC, OUTPUT);
  pinMode(SMOKE_PIN, INPUT); // Cấu hình chân cảm biến khói

  ledcSetup(0,2000,8); ledcAttachPin(BUZZER1,0);
  ledcSetup(1,2000,8); ledcAttachPin(BUZZER2,1);
  ledcSetup(2,1000,8); ledcAttachPin(FAN1,2);
  ledcSetup(3,1000,8); ledcAttachPin(FAN2,3);

  // Kết nối WiFi (chỉ để ESP có Internet qua WiFi, không dùng cho Web Server)
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Ket noi WiFi");
  unsigned long wifiTimeout = millis();
  while(WiFi.status() != WL_CONNECTED && millis() - wifiTimeout < 15000){
    delay(500);
    Serial.print(".");
  }
  if(WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi ket noi thanh cong!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nKhong the ket noi WiFi - He thong se chi dung SIM!");
  }

  // Khởi tạo I2C cho MLX90614
  Wire.begin(SDA_MLX, SCL_MLX);
  delay(100);
  
  sensors.begin();
  
  // Khởi tạo MLX90614 với kiểm tra
  if (!mlx.begin()) {
    Serial.println("LOI: Khong tim thay MLX90614! Kiem tra ket noi I2C.");
    Serial.println("SDA: Pin 21, SCL: Pin 22");
  } else {
    Serial.println("MLX90614 khoi tao thanh cong!");
    Serial.print("Nhiet do moi truong: ");
    Serial.println(mlx.readAmbientTempC());
  }
  
  dht.begin();

  Serial.println("Cam bien da khoi tao!");

  simSerial.begin(115200, SERIAL_8N1, SIM_RX, SIM_TX);
  delay(3000);
  Serial.println("Khoi tao SIM800L...");
  simSend("AT"); 
  simSend("ATE0"); 
  simSend("AT+CMGF=1");  // Chỉ cấu hình SMS text mode
  
  Serial.println("SIM800L khoi tao - Chi su dung SMS va goi dien!");
  Serial.println("========================================");
  Serial.println("KHKT 2026 - He thong Phong Chong Chay No");
  Serial.println("Giao tiep Firebase qua WiFi tu Web App");
  Serial.println("========================================");
}

void loop(){
  unsigned long now = millis();
  
  // ⭐ PRIORITY: Đọc Firebase trước (Firebase = source of truth)
  if(now - lastReadFirebase > 3000){
    lastReadFirebase = now;
    readControlsFromFirebase();  // RELAY state updated from Firebase
  }
  
  // Cập nhật cảm biến mỗi 1 giây
  if(now - lastUpdate > 1000){
    lastUpdate = now;
    updateSensors();
    checkSystemStatus();  // Fire alert có thể override relay
    
    // In trạng thái ra Serial để debug
    if (now % 5000 == 0) {
      Serial.print("[STATUS] T_in:");
      Serial.print(t_in);
      Serial.print(" T_out:");
      Serial.print(t_out);
      Serial.print(" Relay:");
      Serial.print(relayOn ? "ON" : "OFF");
      Serial.print(" AutoMode:");
      Serial.print(autoMode ? "ON" : "OFF");
      Serial.print(" Alert:");
      Serial.println(alertStatus);
    }
  }
  
  // Gửi dữ liệu cảm biến lên Firebase mỗi 10 giây
  if(now - lastSendFirebase > 10000){
    lastSendFirebase = now;
    sendSensorDataToFirebase();
  }
}