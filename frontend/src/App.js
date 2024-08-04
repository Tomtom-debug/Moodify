import './App.css';
import Navbar from './components/Navbar';
import './index.css';
import { BrowserRouter as Router, Route, Switch } from 'react-router-dom';


function App() {
  return (
    <Router>
      <div className="App">
        <Navbar/>
      </div>
    </Router>
  );
}

export default App;
