// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAzjjUqlWnRSozpxPWxudDbH56lHBroH1Y",
    authDomain: "mc-invoice.firebaseapp.com",
    projectId: "mc-invoice",
    storageBucket: "mc-invoice.appspot.com",
    messagingSenderId: "724899311209",
    appId: "1:724899311209:web:ed6b328261b4dc47073cf8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);