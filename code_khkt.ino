#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_MLX90614.h>
#include <HardwareSerial.h>
#include <DHT.h>

/* ================= CẤU HÌNH ================= */
#define WIFI_SSID     "Z Lab VN"
#define WIFI_PASS     "88888888@"
#define FIREBASE_URL  "https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app"
#define PHONE_NUMBER  "0979864822"

/* ================= CHÂN KẾT NỐI ================= */
#define DHT_PIN       13
#define DHTTYPE       DHT11
#define DS18B20_PIN   15
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

#define SMOKE_PIN     4

#define ADC_PIN_VBAT  34
#define ADC_PIN_VCHG  35
#define ADC_PIN_IACS  33

/* ================= KHAI BÁO ================= */
DHT dht(DHT_PIN, DHTTYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
Adafruit_MLX90614 mlx = Adafruit_MLX90614();
HardwareSerial sim800(1);

/* ================= WIFI ================= */
void connectWiFi() {
  Serial.print("[WIFI] Connecting");
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\n[WIFI] Connected");
}

/* ================= ADC ================= */
float readVoltage(int pin) {
  return analogRead(pin) * 3.3 / 4095.0 * 2;
}

/* ================= HTTP CƠ BẢN ================= */
bool httpPUT(String path, String payload) {
  HTTPClient http;
  String url = FIREBASE_URL + path + ".json";

  Serial.println("[HTTP PUT] " + url);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.PUT(payload);
  Serial.println("[HTTP CODE] " + String(code));
  http.end();
  return (code == 200);
}

bool httpPATCH(String path, String payload) {
  HTTPClient http;
  String url = FIREBASE_URL + path + ".json";

  Serial.println("[HTTP PATCH] " + url);
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  int code = http.PATCH(payload);
  Serial.println("[HTTP CODE] " + String(code));
  http.end();
  return (code == 200);
}

bool httpGET(String path, String &response) {
  HTTPClient http;
  String url = FIREBASE_URL + path + ".json";

  Serial.println("[HTTP GET] " + url);
  http.begin(url);
  int code = http.GET();
  Serial.println("[HTTP CODE] " + String(code));

  if (code == 200) {
    response = http.getString();
    http.end();
    return true;
  }
  http.end();
  return false;
}

/* ================= KHỞI TẠO FIREBASE ================= */
void initFirebaseStructure() {
  Serial.println("=== INIT FIREBASE STRUCTURE ===");

  httpPATCH("/sensor", "{}");
  httpPATCH("/device", "{}");
  httpPUT("/relay/relay_on", "false");

  Serial.println("=== FIREBASE READY ===");
}

/* ================= GỬI SENSOR ================= */
void pushSensorData() {
  Serial.println(">> Push sensor data");

  ds18b20.requestTemperatures();

  StaticJsonDocument<768> doc;
  doc["nhiet_do_dht"]     = dht.readTemperature();
  doc["do_am"]           = dht.readHumidity();
  doc["nhiet_do_trong"]  = ds18b20.getTempCByIndex(0);
  doc["nhiet_do_be_mat"] = mlx.readObjectTempC();
  doc["nhiet_do_ngoai"]  = mlx.readAmbientTempC();

  doc["dien_ap_pin"] = readVoltage(ADC_PIN_VBAT);
  doc["dien_ap_sac"] = readVoltage(ADC_PIN_VCHG);
  doc["dong_sac"]    = analogRead(ADC_PIN_IACS);
  doc["pin_percent"] = 100;

  doc["alert_status"] = digitalRead(SMOKE_PIN) ? "An toan" : "Nguy hiem";
  doc["auto_mode"]    = true;

  String json;
  serializeJson(doc, json);
  httpPATCH("/sensor", json);
}

/* ================= GỬI DEVICE ================= */
void pushDeviceStatus() {
  Serial.println(">> Push device status");

  StaticJsonDocument<256> doc;
  doc["auto"] = false;
  doc["che_do"] = "Thu cong";
  doc["timestamp"] = millis();

  String json;
  serializeJson(doc, json);
  httpPATCH("/device", json);
}

/* ================= ĐỌC RELAY ================= */
bool getRelayCommand() {
  Serial.println(">> Get relay command");

  String res;
  if (!httpGET("/relay/relay_on", res)) {
    Serial.println("[WARN] relay_on missing -> create default");
    httpPUT("/relay/relay_on", "false");
    return false;
  }

  return res == "true";
}

/* ================= SMS ================= */
void sendSMS(const char* msg) {
  Serial.println("[SIM] Send SMS");
  sim800.println("AT+CMGF=1");
  delay(300);
  sim800.print("AT+CMGS=\"");
  sim800.print(PHONE_NUMBER);
  sim800.println("\"");
  delay(300);
  sim800.print(msg);
  sim800.write(26);
}

/* ================= CẢNH BÁO CHÁY ================= */
void fireAlert() {
  Serial.println("!!! FIRE ALERT !!!");

  digitalWrite(BUZZER1, HIGH);
  digitalWrite(BUZZER2, HIGH);
  digitalWrite(FAN1, HIGH);
  digitalWrite(FAN2, HIGH);

  sendSMS("CANH BAO CHAY - HE THONG SAC THONG MINH");
}

/* ================= SETUP ================= */
void setup() {
  Serial.begin(115200);
  sim800.begin(9600, SERIAL_8N1, SIM_RX, SIM_TX);

  pinMode(BUZZER1, OUTPUT);
  pinMode(BUZZER2, OUTPUT);
  pinMode(FAN1, OUTPUT);
  pinMode(FAN2, OUTPUT);
  pinMode(RELAY_SAC, OUTPUT);
  pinMode(SMOKE_PIN, INPUT);

  dht.begin();
  ds18b20.begin();
  Wire.begin(SDA_MLX, SCL_MLX);
  mlx.begin();

  connectWiFi();
  initFirebaseStructure();
}

/* ================= LOOP ================= */
void loop() {
  pushSensorData();
  pushDeviceStatus();

  bool relayCmd = getRelayCommand();
  digitalWrite(RELAY_SAC, relayCmd);

  if (digitalRead(SMOKE_PIN) == LOW) {
    fireAlert();
  } else {
    digitalWrite(BUZZER1, LOW);
    digitalWrite(BUZZER2, LOW);
    digitalWrite(FAN1, LOW);
    digitalWrite(FAN2, LOW);
  }

  delay(2000);
}
