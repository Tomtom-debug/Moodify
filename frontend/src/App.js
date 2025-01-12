import React from 'react';
import './App.css';
import AppContent from './components/AppContent';
import './index.css';
import { BrowserRouter as Router } from 'react-router-dom';

function App() {
  return (
    <Router>
      <AppContent/>
    </Router>
  );
}

export default App;
