// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDcWQEzNnf4PuaxWqvWuGAWmRdmMBPIqfk",
  authDomain: "khkt2026-66085.firebaseapp.com",
  databaseURL: "https://khkt2026-66085-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "khkt2026-66085",
  storageBucket: "khkt2026-66085.firebasestorage.app",
  messagingSenderId: "173931175906",
  appId: "1:173931175906:web:1b668a14107231c18423bb",
  measurementId: "G-BTHP9SRLJE"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const database = getDatabase(app);

export { app, analytics, database };
