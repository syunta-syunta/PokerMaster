// frontend/src/pages/HomePage.tsx

import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const HomePage: React.FC = () => {
  const { state, logout } = useAuth();

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#243243' }}>
      {/* ヘッダー */}
      <header className="border-b" style={{ backgroundColor: '#1E2B3B', borderColor: '#505050' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white">PokerMaster</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-white">
                ようこそ、{state.user?.username}さん
              </span>
              <button
                onClick={handleLogout}
                className="px-4 py-2 rounded-md text-white transition-colors duration-200 hover:opacity-80"
                style={{ backgroundColor: '#05BB97' }}
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* メインコンテンツ */}
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div 
            className="rounded-lg p-8 shadow-lg border"
            style={{ 
              backgroundColor: '#1E2B3B',
              borderColor: '#505050'
            }}
          >
            <h2 className="text-2xl font-bold text-white mb-6">
              🎉 認証システム構築完了！
            </h2>
            
            <div className="space-y-4 text-white">
              <p>
                <strong>ユーザー情報:</strong>
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4" style={{ color: '#B0B8C0' }}>
                <li>ID: {state.user?.id}</li>
                <li>ユーザー名: {state.user?.username}</li>
                <li>メールアドレス: {state.user?.email}</li>
              </ul>
              
              <div className="mt-8 p-4 rounded-md" style={{ backgroundColor: '#35404E' }}>
                <h3 className="text-lg font-semibold mb-3">🚀 実装完了機能</h3>
                <ul className="list-disc list-inside space-y-1" style={{ color: '#B0B8C0' }}>
                  <li>ユーザー登録・ログイン</li>
                  <li>JWT認証</li>
                  <li>フォームバリデーション</li>
                  <li>エラーハンドリング</li>
                  <li>認証状態管理</li>
                  <li>UI仕様書準拠のデザイン</li>
                </ul>
              </div>
              
              <div className="mt-6 p-4 rounded-md" style={{ backgroundColor: '#05BB97', color: '#FFFFFF' }}>
                <p className="font-semibold">
                  🎯 Phase 2 完了！次はポーカーゲームの実装ですね。
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default HomePage;