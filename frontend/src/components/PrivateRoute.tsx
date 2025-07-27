// frontend/src/components/PrivateRoute.tsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { state } = useAuth();
  const location = useLocation();

  // ローディング中は何も表示しない（またはローディングスピナー）
  if (state.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#243243' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: '#05BB97' }}></div>
          <p className="text-white">読み込み中...</p>
        </div>
      </div>
    );
  }

  // 認証されていない場合はログインページにリダイレクト
  if (!state.isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 認証されている場合は子コンポーネントを表示
  return <>{children}</>;
};

export default PrivateRoute;