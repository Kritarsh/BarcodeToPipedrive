import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import MonthEndInventory from './MonthEndInventory';
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/month-end-inventory" element={<MonthEndInventory />} />
      </Routes>
    </Router>
  </React.StrictMode>
);