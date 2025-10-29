import React, { useState, useEffect } from 'react';
import Settings from './Components/Settings/Settings';
import Information from './Components/Information/Information';
import logo from './assets/logo3.png';
import './App.css';

function App() {
  const [supported, setSupported] = useState(true);
  const [active, setActive] = useState(false);
  const [stats, setStats] = useState({ legit: 0, scam: 0, uncertain: 0 });
  const [sessionStats, setSessionStats] = useState({ 
    legit: 0, 
    scam: 0, 
    uncertain: 0, 
    total_analyzed: 0,
    website: '',
    last_updated: null
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [backendConnected, setBackendConnected] = useState(false);


  // Test backend connection
  const testBackendConnection = async () => {
    try {
      await fetch('http://localhost:8000/docs', { 
        method: 'HEAD',
        mode: 'no-cors' // This will work even if CORS is not properly configured
      });
      setBackendConnected(true);
    } catch (error) {
      console.error('Backend connection failed:', error);
      setBackendConnected(false);
    }
  };

  useEffect(() => {
    // Test backend connection
    testBackendConnection();

    window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      const url = tabs[0].url || '';
      const supportedSites = [
        'amazon.com', 'amazon.co.uk', 'amazon.ca', 'amazon.de', 'amazon.fr',
        'amazon.it', 'amazon.es', 'amazon.in', 'amazon.co.jp', 'amazon.com.au',
        'walmart.com', 'target.com', 'bestbuy.com', 'newegg.com',
        'ebay.com', 'alibaba.com', 'aliexpress.com'
      ];
      const isSupported = supportedSites.some(site => url.includes(site));
      setSupported(isSupported);

      if (!isSupported) return;

      window.chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ACTIVE' }, (res) => {
        if (res && typeof res.active === 'boolean') setActive(res.active);
      });

      try {
        window.chrome.storage?.local?.get(['truthlens_session_stats'], (result) => {
          if (result && result.truthlens_session_stats) {
            setSessionStats(result.truthlens_session_stats);
          }
        });
      } catch (_) { }
    });

    // Listen for storage changes to update stats in real-time
    const handleStorageChange = (changes, area) => {
      if (area === 'local') {
        if (changes.truthlens_session_stats) {
          setSessionStats(changes.truthlens_session_stats.newValue || { 
            legit: 0, 
            scam: 0, 
            uncertain: 0, 
            total_analyzed: 0,
            website: '',
            last_updated: null
          });
        }
      }
    };

    try {
      window.chrome.storage?.onChanged?.addListener(handleStorageChange);
    } catch (_) { }

    // Cleanup listener on unmount
    return () => {
      try {
        window.chrome.storage?.onChanged?.removeListener(handleStorageChange);
      } catch (_) { }
    };
  }, []);

  const setActiveOnTab = (next) => {
    window.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || !tabs[0]) return;
      window.chrome.tabs.sendMessage(tabs[0].id, { type: 'SET_ACTIVE', active: next }, (res) => {
        if (res && typeof res.active === 'boolean') setActive(res.active);
      });
    });
  };


  // Show settings/info screens
  if (showSettings) {
    return <Settings onBack={() => setShowSettings(false)} />;
  }

  if (showInfo) {
    return <Information onBack={() => setShowInfo(false)} />;
  }

  if (!supported) {
    return (
      <div className="app">
        <div className="header">
          <div className="header-content">
            <h1>TruthLens</h1>
            <img src={logo} alt="TruthLens" />
          </div>
        </div>
        <div className="content">
          <div className="unsupported">
            <p>This site is not supported yet.</p>
            <p>Supported sites:</p>
            <ul>
              <li>Amazon (all regions)</li>
              <li>Walmart</li>
              <li>eBay</li>
              <li>Target</li>
              <li>Best Buy</li>
              <li>Newegg</li>
              <li>Alibaba</li>
              <li>AliExpress</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="header">
        <div className="header-content">
          <h1>TruthLens</h1>
          <img src={logo} alt="TruthLens" />
        </div>
        <p className="subtitle">Product Scam Detector</p>
      </div>

      <div className="content">
        <div className="status-section">
          <div className="status-indicator">
            <span className="status-dot" style={{ background: active ? '#4CAF50' : '#f44336' }}></span>
            {active ? 'On' : 'Off'}
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActiveOnTab(e.target.checked)}
            />
            <span className="slider" />
          </label>
        </div>

        <div className="stats-section">
          <h3>Current Session Analysis</h3>
          <div className="stats-grid">
            <div className="stat-item legit">
              <div className="stat-icon">✓</div>
              <div className="stat-info">
                <div className="stat-number">{sessionStats.legit}</div>
                <div className="stat-label">Legit</div>
              </div>
            </div>
            <div className="stat-item scam">
              <div className="stat-icon">✗</div>
              <div className="stat-info">
                <div className="stat-number">{sessionStats.scam}</div>
                <div className="stat-label">Scam</div>
              </div>
            </div>
            <div className="stat-item uncertain">
              <div className="stat-icon">...</div>
              <div className="stat-info">
                <div className="stat-number">{sessionStats.uncertain}</div>
                <div className="stat-label">Uncertain</div>
              </div>
            </div>
          </div>
          <div className="session-info">
            <p><strong>Total Analyzed:</strong> {sessionStats.total_analyzed}</p>
            <p><strong>Website:</strong> {sessionStats.website || 'N/A'}</p>
            {sessionStats.last_updated && (
              <p><strong>Last Updated:</strong> {new Date(sessionStats.last_updated).toLocaleTimeString()}</p>
            )}
          </div>
        </div>


        <div className="legend-section">
          <h3>How to Use</h3>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-icon" style={{background: '#4CAF50', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'}}>☑</div>
              <span>Select products to analyze</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon" style={{background: '#2196F3', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'}}>▶</div>
              <span>Click "Analyze Selected" button</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon" style={{background: '#ff9800', color: 'white', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px'}}>⏳</div>
              <span>Wait for analysis results</span>
            </div>
          </div>
        </div>

        <div className="legend-section">
          <h3>Analysis Results</h3>
          <div className="legend-items">
            <div className="legend-item">
              <div className="legend-icon legit">✓</div>
              <span>Legitimate Product</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon scam">✗</div>
              <span>Potential Scam</span>
            </div>
            <div className="legend-item">
              <div className="legend-icon uncertain">...</div>
              <span>Uncertain Status</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
