// ============================================================
// FIREBASE CONFIG — replace with YOUR project's keys
// Firebase Console → Project Settings → General → Your apps → SDK config
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAW3lEiD77wsiNlKzOKzWNhfLY3O2OBB60",
  authDomain: "lending-project-e0d98.firebaseapp.com",
  projectId: "lending-project-e0d98",
  storageBucket: "lending-project-e0d98.firebasestorage.app",
  messagingSenderId: "155955157465",
  appId: "1:155955157465:web:44d3c3a5cb23be02d4e1c8"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// Enable offline cache so the app keeps working with a weak connection
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn("Offline persistence not enabled:", err.code);
});
