// ===================== FIREBASE CONFIG =====================
// Generated from your Firebase project. Uses the "compat" SDK because
// index.html loads firebase-app-compat.js + firebase-database-compat.js
// (simplest to use with plain <script> tags, no build step needed).
//
// IMPORTANT: You must ENABLE "Realtime Database" in the Firebase console
// (Build -> Realtime Database -> Create Database) for online rooms to work.
// After creating it, copy the "databaseURL" it gives you and paste it below
// if it's different from the auto-generated one here.

const firebaseConfig = {
  apiKey: "AIzaSyDLC1j8Vf_pBI_8rxCqMgo1fvPgRwYr2Ps",
  authDomain: "ha-carrom.firebaseapp.com",
  databaseURL: "https://ha-carrom-default-rtdb.firebaseio.com",
  projectId: "ha-carrom",
  storageBucket: "ha-carrom.firebasestorage.app",
  messagingSenderId: "758417871373",
  appId: "1:758417871373:web:27c1f33c4f46771dfc7b44",
  measurementId: "G-YJ6H8EZFN5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();

// Your Realtime Database rules require `auth != null` on every room read/write,
// and the "chat" node further validates {senderId, text, timestamp} exactly
// (senderId must equal auth.uid, no extra fields allowed). Anonymous Auth
// gives every visitor a stable uid without needing a login screen.
//
// IMPORTANT: enable it in the Firebase console -> Build -> Authentication ->
// Sign-in method -> Anonymous -> Enable. Without this, signInAnonymously()
// below will fail and online rooms won't work.

const authReady = new Promise((resolve, reject) => {
  auth.onAuthStateChanged(user => {
    if (user) resolve(user);
  });
  auth.signInAnonymously().catch(err => {
    console.error("Anonymous sign-in failed — enable it in Firebase console (Authentication > Sign-in method > Anonymous).", err);
    reject(err);
  });
});
