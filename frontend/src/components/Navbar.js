import React from 'react';
import '../index.css'; 
import { Link } from 'react-router-dom';
import axios from 'axios'; 

export const Navbar = ({ userImage , setCurrentSong}) => {
    const handleLogout = async () => {
        try {
            const response = await axios.get('http://localhost:4000/logout', { withCredentials: true });
            console.log(response.data.message); // Log the backend response
            localStorage.removeItem('token'); // Clear token if stored
            sessionStorage.clear(); // Clear session storage
            window.location.href = '/'; // Redirect to login page
        } catch (error) {
            console.error('Logout failed:', error);
            alert('Error logging out. Please try again.');
        }
    };

    return (
      <div className="font-ntr fixed top-0 left-0 w-full z-50 bg-neutral-950">
        <nav className="text-lightest-slate font-ntr font-bold py-4 flex items-center justify-between px-4 md:px-16">
          <div className="flex items-center space-x-4">
            <div className="text-2xl font-bold text-white hover:text-green-700">
              <Link to="/home">Moodify</Link>
            </div>
          </div>
          <div className="flex items-center justify-center gap-4 text-sm">
            <a href="#" className="hover:text-green-700 text-white py-2 px-4 rounded">Play history</a>
            <a href="#" className="hover:text-green-700 text-white py-2 px-4 rounded">Mood history</a>
            <button onClick={handleLogout} className="bg-green-500 hover:bg-green-700 text-white py-2 px-4 rounded-full">Logout</button>
            <div className="relative w-10 h-10">
              <img
                src={userImage || '/blank profile pic.jpg'} // Placeholder if no image
                alt="User Profile"
                className="w-full h-full rounded-full object-cover"
              />
            </div>
          </div>
        </nav>
      </div>
    );
};

export default Navbar;