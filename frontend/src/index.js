import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import App from './App';
import MonthEndInventory from './MonthEndInventory';
import PriceManagement from './PriceManagement';
import Navigation from './Navigation';
import './App.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Router>
      <Navigation />
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/month-end-inventory" element={<MonthEndInventory />} />
        <Route path="/price-management" element={<PriceManagement />} />
      </Routes>
    </Router>
  </React.StrictMode>
);