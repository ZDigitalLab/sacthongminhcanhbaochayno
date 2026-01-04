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

// Biến cảnh báo (Khởi tạo = 0)
unsigned long lastTimeSMS1 = 0;
unsigned long lastTimeSMS2 = 0;
unsigned long lastTimeCall = 0;

// Cập nhật: Tách riêng thời gian chống spam cho Gọi và SMS (30 giây)
const unsigned long TIME_LIMIT_SMS = 30000;  
const unsigned long TIME_LIMIT_CALL = 30000; 

// Biến trạng thái thông báo pin đầy (theo áp sạc)
bool fullBatNotified = false;

// Biến quản lý SIM & Firebase
unsigned long lastSendFirebase = 0;
unsigned long lastReadFirebase = 0; 
String alertStatus = "An toan"; 

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
//          FIREBASE COMMUNICATION
// ==========================================

// Gửi dữ liệu cảm biến lên Firebase sensor/
void sendDataToFirebase() {
  Serial.println("========================================");
  Serial.println("GUI DU LIEU CAM BIEN LEN sensor/");
  
  // GIẢI PHÁP: Gửi toàn bộ object bằng PUT method với X-HTTP-Method-Override
  String url = FIREBASE_URL + FIREBASE_PATH_SENSOR + ".json";
  if (FIREBASE_AUTH.length()) url += "?auth=" + FIREBASE_AUTH;
  
  Serial.println("URL: " + url);

  // Validate và fix NaN values trước khi build JSON
  if (isnan(t_in) || t_in < -100 || t_in > 200) t_in = 0;
  if (isnan(t_out) || t_out < -100 || t_out > 200) t_out = 0;
  if (isnan(t_surface) || t_surface < -100 || t_surface > 200) t_surface = 0;
  if (isnan(t_dht) || t_dht < -100 || t_dht > 200) t_dht = 0;
  if (isnan(h_dht) || h_dht < 0 || h_dht > 100) h_dht = 0;

  // JSON chỉ chứa dữ liệu cảm biến
  String json = "{";
  json += "\"nhiet_do_ben_trong\":" + String(t_in, 1) + ",";
  json += "\"nhiet_do_ben_ngoai\":" + String(t_out, 1) + ",";
  json += "\"nhiet_do_be_mat\":" + String(t_surface, 1) + ",";
  json += "\"nhiet_do_moi_truong\":" + String(t_dht, 1) + ",";
  json += "\"do_am\":" + String(h_dht, 1) + ",";
  json += "\"dien_ap\":" + String(v_bat, 2) + ",";
  json += "\"dong_sac\":" + String(i_charge, 2) + ",";
  json += "\"pin_box\":" + String((int)percentBat) + ",";
  json += "\"khoi\":" + String(smokeDetected ? "true" : "false");
  json += "}";

  Serial.println("JSON: " + json);

  simSend("AT+HTTPTERM", 200);
  simSend("AT+HTTPINIT", 200);
  simSend("AT+HTTPPARA=\"CID\",1", 200);
  simSend("AT+HTTPPARA=\"URL\",\"" + url + "\"", 200);
  simSend("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 200);
  
  // Thêm header X-HTTP-Method-Override để force PUT method
  simSend("AT+HTTPPARA=\"USERDATA\",\"X-HTTP-Method-Override: PUT\"", 200);
  
  simSend("AT+HTTPDATA=" + String(json.length()) + ",5000", 300);
  simSerial.print(json);
  delay(500);
  
  // Dùng POST (1) nhưng với header override thành PUT
  String resp = simSend("AT+HTTPACTION=1", 3000);
  
  // Kiểm tra kết quả
  if (resp.indexOf("200") > 0 || resp.indexOf("204") > 0) {
    Serial.println("-> Thanh cong! (sensor/ da duoc ghi de)");
  } else {
    Serial.println("-> That bai hoac timeout");
    Serial.println("Response: " + resp);
  }
  
  simSend("AT+HTTPTERM", 200);
  Serial.println("========================================");
}

// Gửi trạng thái thiết bị lên Firebase controls/ (CHỈ khi AUTO)
void sendControlStatusToFirebase() {
  String url = FIREBASE_URL + FIREBASE_PATH_CONTROLS + ".json";
  if (FIREBASE_AUTH.length()) url += "?auth=" + FIREBASE_AUTH;
  
  Serial.println("[AUTO] Dong bo controls/ ...");
  Serial.println("URL: " + url);

  // JSON trạng thái thiết bị (BAO GỒM auto mode)
  String json = "{";
  json += "\"auto\":" + String(autoMode ? "true" : "false") + ",";
  json += "\"quat1\":" + String(fan1 ? "true" : "false") + ",";
  json += "\"quat2\":" + String(fan2 ? "true" : "false") + ",";
  json += "\"coi1\":" + String(buz1 ? "true" : "false") + ",";
  json += "\"coi2\":" + String(buz2 ? "true" : "false") + ",";
  json += "\"relay\":" + String(relayOn ? "true" : "false");
  json += "}";

  simSend("AT+HTTPTERM", 200);
  simSend("AT+HTTPINIT", 200);
  simSend("AT+HTTPPARA=\"CID\",1", 200);
  simSend("AT+HTTPPARA=\"URL\",\"" + url + "\"", 200);
  simSend("AT+HTTPPARA=\"CONTENT\",\"application/json\"", 200);
  simSend("AT+HTTPPARA=\"USERDATA\",\"X-HTTP-Method-Override: PUT\"", 200);
  
  simSend("AT+HTTPDATA=" + String(json.length()) + ",5000", 300);
  simSerial.print(json);
  delay(500);
  
  String resp = simSend("AT+HTTPACTION=1", 3000);
  
  if (resp.indexOf("200") > 0 || resp.indexOf("204") > 0) {
    Serial.println("-> controls/ da dong bo");
  } else {
    Serial.println("-> Loi: " + resp);
  }
  
  simSend("AT+HTTPTERM", 200);
}

// Đọc lệnh từ Firebase controls/
void readControlFromFirebase() {
  String url = FIREBASE_URL + FIREBASE_PATH_CONTROLS + ".json";
  if (FIREBASE_AUTH.length()) url += "?auth=" + FIREBASE_AUTH;

  simSend("AT+HTTPTERM", 200);
  simSend("AT+HTTPINIT", 200);
  simSend("AT+HTTPPARA=\"CID\",1", 200);
  simSend("AT+HTTPPARA=\"URL\",\"" + url + "\"", 200);
  simSend("AT+HTTPACTION=0", 3000); // GET (tối ưu timeout)
  
  simSerial.println("AT+HTTPREAD");
  unsigned long t = millis();
  String resp = "";
  while(millis() - t < 2000) { // Giảm timeout xuống 2s
    while(simSerial.available()) resp += (char)simSerial.read();
  }
  simSend("AT+HTTPTERM", 200);

  if (resp.indexOf("{") > 0) { 
    // Đọc mode TRƯỚC (quan trọng nhất)
    bool oldMode = autoMode;
    if (resp.indexOf("\"auto\":true") != -1) autoMode = true;
    else if (resp.indexOf("\"auto\":false") != -1) autoMode = false;
    
    // Phát hiện thay đổi mode
    if (oldMode != autoMode) {
      Serial.print("[MODE CHANGE] ");
      Serial.println(autoMode ? "AUTO" : "MANUAL");
    }

    // Đọc hẹn giờ sạc
    int timerActiveIdx = resp.indexOf("\"charge_timer_active\":");
    if (timerActiveIdx != -1) {
      if (resp.indexOf("true", timerActiveIdx) != -1) {
        chargeTimerActive = true;
        int endIdx = resp.indexOf("\"charge_timer_end\":");
        if (endIdx != -1) {
          int numStart = endIdx + 19;
          int numEnd = resp.indexOf(',', numStart);
          if (numEnd == -1) numEnd = resp.indexOf('}', numStart);
          String endTimeStr = resp.substring(numStart, numEnd);
          endTimeStr.trim();
          chargeTimerEnd = endTimeStr.toInt();
        }
      } else {
        chargeTimerActive = false;
        chargeTimerEnd = 0;
      }
    }

    // CHẾ ĐỘ THỦ CÔNG: Đọc và áp dụng tất cả lệnh từ Firebase
    if (!autoMode) {
      Serial.println("[MANUAL] Doc lenh tu Web...");
      
      // Quạt
      if (resp.indexOf("\"quat1\":true") != -1) fan1 = true;
      else if (resp.indexOf("\"quat1\":false") != -1) fan1 = false;
      
      if (resp.indexOf("\"quat2\":true") != -1) fan2 = true;
      else if (resp.indexOf("\"quat2\":false") != -1) fan2 = false;

      // Còi
      if (resp.indexOf("\"coi1\":true") != -1) buz1 = true;
      else if (resp.indexOf("\"coi1\":false") != -1) buz1 = false;
      
      if (resp.indexOf("\"coi2\":true") != -1) buz2 = true;
      else if (resp.indexOf("\"coi2\":false") != -1) buz2 = false;

      // Relay
      if (resp.indexOf("\"relay\":true") != -1) relayOn = true;
      else if (resp.indexOf("\"relay\":false") != -1) relayOn = false;
      
      applyOutputs();
      Serial.println("[MANUAL] Da ap dung!");
    } else {
      Serial.println("[AUTO] He thong tu xu ly");
    }
  }
}

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
int sensorStartupCount = 0;       // Biến đếm số lần đọc đầu tiên
const int STARTUP_SKIP_LIMIT = 5;
void checkSystemStatus() {
  if (sensorStartupCount < STARTUP_SKIP_LIMIT) {
    sensorStartupCount++;
    Serial.print("Dang khoi dong he thong... ");
    Serial.print(sensorStartupCount);
    Serial.print("/");
    Serial.println(STARTUP_SKIP_LIMIT);
   
    buz1 = false; buz2 = false; fan1 = false; fan2 = false; 
    alertStatus = "Dang khoi dong...";
    applyOutputs();
    return; 
  }
  
  unsigned long now = millis();

  // 1. Kiểm tra Hẹn giờ sạc từ Firebase
  if (chargeTimerActive && chargeTimerEnd > 0) {
    // Lấy thời gian hiện tại (Unix timestamp - milliseconds)
    // chargeTimerEnd từ Firebase là milliseconds
    unsigned long currentMillis = now; // Hoặc lấy từ NTP nếu có
    
    // Chuyển đổi chargeTimerEnd (từ web app) so với thời gian ESP
    // Web app gửi Date.now() (ms since 1970), ESP dùng millis() (ms since boot)
    // Cần tính toán offset hoặc dùng thời gian tương đối
    
    // Đơn giản hóa: Kiểm tra mỗi giây
    if (now - lastChargeTimerCheck >= 1000) {
      lastChargeTimerCheck = now;
      
      // Nếu đã hết thời gian (giả sử chargeTimerEnd là relative time)
      // Hoặc implement NTP để sync time chính xác
      // Tạm thời: Log để debug
      Serial.print("Charge timer active, end: ");
      Serial.println(chargeTimerEnd);
    }
    
    // Bật relay khi có hẹn giờ
    relayOn = true;
  } else {
    // Không có hẹn giờ - xử lý bình thường
  }
  
  if (!autoMode) return; 

  // 2. Kiểm tra Pin đầy
  if (v_charge >= 54.0) {
    if (relayOn) { 
      relayOn = false; 
      chargeTimerActive = false; // Hủy hẹn giờ khi đầy
      if (!fullBatNotified) {
         sendSMS("Thong bao: Pin da day (54V). Da ngat sac.");
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
    // MỨC 2: Nguy hiểm cao
    if (smokeDetected) alertStatus = "NGUY HIEM: PHAT HIEN KHOI!";
    else alertStatus = "NGUY HIEM > 60C";
    
    relayOn = false;
    chargeTimerActive = false; // Hủy hẹn giờ khi nguy hiểm
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
    // MỨC 1: Cảnh báo
    relayOn = false;
    chargeTimerActive = false; // Hủy hẹn giờ khi cảnh báo 
    fan1 = true; fan2 = true; 
    buz1 = false; buz2 = false;
    
    // Phân loại thông báo hiển thị
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
    alertStatus = "An toan";
    buz1 = buz2 = fan1 = fan2 = false;
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
  simSend("AT+CMGF=1");
  simSend("AT+CGATT=1", 2000);
  
  // Cấu hình GPRS cho Firebase
  Serial.println("Cau hinh GPRS...");
  simSend("AT+SAPBR=3,1,\"CONTYPE\",\"GPRS\"");
  simSend("AT+SAPBR=3,1,\"APN\",\"internet\""); 
  simSend("AT+SAPBR=1,1", 3000);
  simSend("AT+SAPBR=2,1");
  
  Serial.println("He thong khoi dong xong!");
  Serial.println("========================================");
  Serial.println("KHKT 2026 - He thong Phong Chong Chay No");
  Serial.println("Giao tiep Firebase qua SIM800L");
  Serial.println("========================================");
  
  // Khởi tạo đường dẫn Firebase lần đầu
  Serial.println("Khoi tao duong dan Firebase...");
  delay(2000);
  sendDataToFirebase();  // Tạo sensor/
  delay(1000);
  sendControlStatusToFirebase();  // Tạo controls/
  Serial.println("Duong dan Firebase da san sang!");
}

void loop(){
  unsigned long now = millis();
  
  if(now - lastUpdate > 1000){
    lastUpdate = now;
    updateSensors();
    checkSystemStatus(); 
  }

  if(now - lastLocationCheck > 60000) {
    lastLocationCheck = now;
    getSimLocation(); 
  }

  // Gửi sensor data mỗi 8s (tối ưu)
  if(now - lastSendFirebase > 8000){
    lastSendFirebase = now;
    sendDataToFirebase();
    delay(500);
    
    // CHỈ gửi controls khi ở chế độ AUTO (tránh ghi đè lệnh thủ công)
    if(autoMode) {
      sendControlStatusToFirebase();
    } else {
      Serial.println("[MANUAL] Khong ghi de controls/");
    }
  }

  // Đọc controls từ Firebase mỗi 2s để phản hồi nhanh
  if(now - lastReadFirebase > 2000){
    lastReadFirebase = now;
    readControlFromFirebase();
  }
}