// frontend/src/types/auth.ts

// =========================================
// フロントエンド認証関連の型定義
// =========================================

// ユーザー情報
export interface User {
  id: string;
  username: string;
  email: string;
}

// 認証状態
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  token: string | null;
  loading: boolean;
  error: string | null;
}

// API リクエスト型
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// API レスポンス型
export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
  token?: string;
  errors?: ValidationError[];
}

// バリデーションエラー
export interface ValidationError {
  field: string;
  message: string;
}

// フォーム状態
export interface LoginFormData {
  email: string;
  password: string;
}

export interface RegisterFormData {
  username: string;
  email: string;
  password: string;
}

// フォームエラー状態
export interface FormErrors {
  email?: string;
  password?: string;
  username?: string;
  general?: string;
}

// 認証コンテキストのアクション
export type AuthAction = 
  | { type: 'LOGIN_START' }
  | { type: 'LOGIN_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'LOGIN_FAILURE'; payload: string }
  | { type: 'REGISTER_START' }
  | { type: 'REGISTER_SUCCESS'; payload: { user: User; token: string } }
  | { type: 'REGISTER_FAILURE'; payload: string }
  | { type: 'LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean };

// API エンドポイント定数
export const API_ENDPOINTS = {
  LOGIN: '/api/auth/login',
  REGISTER: '/api/auth/register',
  ME: '/api/auth/me',
  LOGOUT: '/api/auth/logout'
} as const;