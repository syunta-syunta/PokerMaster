// frontend/src/services/authService.ts

import axios, { AxiosResponse } from 'axios';
import { 
  AuthResponse, 
  LoginRequest, 
  RegisterRequest, 
  API_ENDPOINTS 
} from '../types/auth';

// APIベースURL
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

// Axiosインスタンスを作成
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// リクエストインターセプター（認証トークンを自動付与）
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// レスポンスインターセプター（エラーハンドリング）
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 認証エラーの場合、トークンを削除
      localStorage.removeItem('authToken');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

/**
 * 認証サービスクラス
 */
class AuthService {
  /**
   * ユーザー登録
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    try {
      console.log('Register request:', data); // デバッグログ
      const response: AxiosResponse<AuthResponse> = await api.post(
        API_ENDPOINTS.REGISTER,
        data
      );
      
      console.log('Register response:', response.data); // デバッグログ
      
      // 成功時はトークンとユーザー情報を保存
      if (response.data.success && response.data.token) {
        this.setAuthData(response.data.token, response.data.user!);
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Register error:', error); // デバッグログ
      if (error.response?.data) {
        return error.response.data;
      }
      return {
        success: false,
        message: 'ネットワークエラーが発生しました',
        errors: []
      };
    }
  }

  /**
   * ログイン
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    try {
      console.log('Login request:', data); // デバッグログ
      const response: AxiosResponse<AuthResponse> = await api.post(
        API_ENDPOINTS.LOGIN,
        data
      );
      
      console.log('Login response:', response.data); // デバッグログ
      
      // 成功時はトークンとユーザー情報を保存
      if (response.data.success && response.data.token) {
        this.setAuthData(response.data.token, response.data.user!);
      }
      
      return response.data;
    } catch (error: any) {
      console.error('Login error:', error); // デバッグログ
      if (error.response?.data) {
        return error.response.data;
      }
      return {
        success: false,
        message: 'ネットワークエラーが発生しました',
        errors: []
      };
    }
  }

  /**
   * ログアウト
   */
  async logout(): Promise<void> {
    try {
      await api.post(API_ENDPOINTS.LOGOUT);
    } catch (error) {
      // ログアウトエラーでも認証情報はクリア
      console.error('Logout error:', error);
    } finally {
      this.clearAuthData();
    }
  }

  /**
   * ユーザー情報取得
   */
  async getMe(): Promise<AuthResponse> {
    try {
      const response: AxiosResponse<AuthResponse> = await api.get(
        API_ENDPOINTS.ME
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.data) {
        return error.response.data;
      }
      throw new Error('ユーザー情報の取得に失敗しました');
    }
  }

  /**
   * 認証データを保存
   */
  private setAuthData(token: string, user: any): void {
    localStorage.setItem('authToken', token);
    localStorage.setItem('user', JSON.stringify(user));
  }

  /**
   * 認証データをクリア
   */
  private clearAuthData(): void {
    localStorage.removeItem('authToken');
    localStorage.removeItem('user');
  }

  /**
   * 現在の認証状態を取得
   */
  getCurrentAuth(): { token: string | null; user: any | null } {
    const token = localStorage.getItem('authToken');
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;
    
    return { token, user };
  }

  /**
   * 認証されているかチェック
   */
  isAuthenticated(): boolean {
    const { token } = this.getCurrentAuth();
    return !!token;
  }
}

// シングルトンインスタンスをエクスポート
export const authService = new AuthService();
export default authService;