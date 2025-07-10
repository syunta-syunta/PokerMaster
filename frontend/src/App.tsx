import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [backendStatus, setBackendStatus] = useState('接続中...');
  const [apiResponse, setApiResponse] = useState('');

  useEffect(() => {
    // バックエンドのヘルスチェック
    fetch('http://localhost:5000/health')
      .then(response => response.json())
      .then(data => {
        setBackendStatus(`✅ バックエンド接続成功: ${data.status}`);
      })
      .catch(error => {
        setBackendStatus('❌ バックエンド接続失敗');
        console.error('Error:', error);
      });

    // API テスト
    fetch('http://localhost:5000/api/test')
      .then(response => response.json())
      .then(data => {
        setApiResponse(data.message);
      })
      .catch(error => {
        console.error('Error:', error);
      });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>🎯 PokerMaster</h1>
        <p>{backendStatus}</p>
        <p>API応答: {apiResponse}</p>
        <p>
          フロントエンド（React）とバックエンド（Express）が<br/>
          正常に動作しています！
        </p>
      </header>
    </div>
  );
}

export default App;