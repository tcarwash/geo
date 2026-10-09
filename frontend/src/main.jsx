import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import './style.css';
createRoot(document.getElementById('root')).render(<App />);
