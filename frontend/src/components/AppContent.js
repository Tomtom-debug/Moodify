import { Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import Navbar from './Navbar';
import { Home } from './Home';

const AppContent = () => {
  const location = useLocation();

  return (
    <div className="bg-black">
      {location.pathname !== '/' && <Navbar />}
      <div className="content">
        <Routes>
          <Route path="/" element={<Login />} />
        </Routes>
        <Routes>
          <Route path="/home" element={<Home />} />
        </Routes>
      </div>
    </div>
  );
}

export default AppContent;
