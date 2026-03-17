import CopyrightCreator from './components/CopyrightCreator';
import CopyrightVerifier from './components/CopyrightVerifier';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Picture Copyright v1.1 (1-Pixel Border)</h1>
      </header>
      <main className="dashboard">
        <section className="dashboard-section"><CopyrightCreator /></section>
        <hr />
        <section className="dashboard-section"><CopyrightVerifier /></section>
      </main>
    </div>
  );
}
export default App;
