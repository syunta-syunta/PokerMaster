// frontend/src/contexts/AuthContext.tsx

import React, { createContext, useContext, useReducer, useEffect, ReactNode } from 'react';
import { AuthState, AuthAction, LoginRequest, RegisterRequest } from '../types/auth';
import { authService } from '../services/authService';

// 初期状態
const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true,
  error: null,
};

// Reducer
function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'LOGIN_START':
    case 'REGISTER_START':
      return {
        ...state,
        loading: true,
        error: null,
      };

    case 'LOGIN_SUCCESS':
    case 'REGISTER_SUCCESS':
      return {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      };

    case 'LOGIN_FAILURE':
    case 'REGISTER_FAILURE':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: action.payload,
      };

    case 'LOGOUT':
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
      };

    case 'CLEAR_ERROR':
      return {
        ...state,
        error: null,
      };

    case 'SET_LOADING':
      return {
        ...state,
        loading: action.payload,
      };

    default:
      return state;
  }
}

// Context の型定義
interface AuthContextType {
  state: AuthState;
  login: (data: LoginRequest) => Promise<boolean>;
  register: (data: RegisterRequest) => Promise<boolean>;
  logout: () => void;
  clearError: () => void;
}

// Context を作成
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider コンポーネント
interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // 初期化時に認証状態をチェック
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { token, user } = authService.getCurrentAuth();
        
        if (token && user) {
          // トークンが有効かサーバーで確認
          const response = await authService.getMe();
          
          if (response.success && response.user) {
            dispatch({
              type: 'LOGIN_SUCCESS',
              payload: {
                user: response.user,
                token: token,
              },
            });
          } else {
            // トークンが無効な場合はクリア
            authService.logout();
            dispatch({ type: 'LOGOUT' });
          }
        } else {
          dispatch({ type: 'SET_LOADING', payload: false });
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
        authService.logout();
        dispatch({ type: 'LOGOUT' });
      }
    };

    initAuth();
  }, []);

  // ログイン関数
  const login = async (data: LoginRequest): Promise<boolean> => {
    console.log('Login attempt:', data); // デバッグログ
    dispatch({ type: 'LOGIN_START' });
    
    try {
      const response = await authService.login(data);
      console.log('Login response in context:', response); // デバッグログ
      
      if (response.success && response.user && response.token) {
        console.log('Login successful, dispatching success'); // デバッグログ
        dispatch({
          type: 'LOGIN_SUCCESS',
          payload: {
            user: response.user,
            token: response.token,
          },
        });
        return true;
      } else {
        console.log('Login failed:', response.message); // デバッグログ
        dispatch({
          type: 'LOGIN_FAILURE',
          payload: response.message || 'ログインに失敗しました',
        });
        return false;
      }
    } catch (error: any) {
      console.error('Login error in context:', error); // デバッグログ
      dispatch({
        type: 'LOGIN_FAILURE',
        payload: error.message || 'ネットワークエラーが発生しました',
      });
      return false;
    }
  };

  // 登録関数
  const register = async (data: RegisterRequest): Promise<boolean> => {
    console.log('Register attempt:', data);
    dispatch({ type: 'REGISTER_START' });
    
    try {
      const response = await authService.register(data);
      console.log('Register response in context:', response);
      
      if (response.success && response.user && response.token) {
        console.log('Register successful, dispatching success');
        dispatch({
          type: 'REGISTER_SUCCESS',
          payload: {
            user: response.user,
            token: response.token,
          },
        });
        return true;
      } else {
        console.log('Register failed:', response.message);
        let errorMessage = response.message || 'アカウント登録に失敗しました';
        
        // サーバーからの詳細なエラーがある場合
        if (response.errors && response.errors.length > 0) {
          errorMessage = response.errors.map(error => error.message).join(', ');
        }
        
        dispatch({
          type: 'REGISTER_FAILURE',
          payload: errorMessage,
        });
        return false;
      }
    } catch (error: any) {
      console.error('Register error in context:', error);
      dispatch({
        type: 'REGISTER_FAILURE',
        payload: error.message || 'ネットワークエラーが発生しました',
      });
      return false;
    }
  };

  // ログアウト関数
  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch({ type: 'LOGOUT' });
    }
  };

  // エラークリア関数
  const clearError = () => {
    dispatch({ type: 'CLEAR_ERROR' });
  };

  const value: AuthContextType = {
    state,
    login,
    register,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook for using auth context
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};