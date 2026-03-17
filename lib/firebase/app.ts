import { initializeApp, getApps, getApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: 'AIzaSyCeceSDbqmGFeATeBMGcOhg9osUOJQTuVg',
  authDomain: 'escape-from-hades-irl.firebaseapp.com',
  projectId: 'escape-from-hades-irl',
  storageBucket: 'escape-from-hades-irl.firebasestorage.app',
  messagingSenderId: '844071641525',
  appId: '1:844071641525:web:f1291a909aa0ba431cf9fc',
  measurementId: 'G-088K2SGH1E',
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
