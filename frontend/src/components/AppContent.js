import { Routes, Route, useLocation } from 'react-router-dom';
import React, { useState } from 'react';
import Login from './Login';
import Navbar from './Navbar';
import { Home } from './Home';
import NowPlaying from './NowPlaying';

const AppContent = () => {
  const location = useLocation();
  const [currentSong, setCurrentSong] = useState(null); // State for the current song

  return (
    <div className="bg-black">
      {location.pathname !== '/' && <Navbar />}
      <div className="content">
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/home" element={<Home setCurrentSong={setCurrentSong} />} />
        </Routes>
      </div>
      {location.pathname !== '/' && <NowPlaying song={currentSong} />}
    </div>
  );
};

export default AppContent;