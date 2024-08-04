import { Routes, Route, useLocation } from 'react-router-dom';
import Login from './Login';
import Navbar from './Navbar';

const AppContent = () => {
  const location = useLocation();

  return (
    <div className="App">
      {location.pathname !== '/' && <Navbar />}
      <div className="content">
        <Routes>
          <Route path="/" element={<Login />} />
        </Routes>
      </div>
    </div>
  );
}

export default AppContent;
