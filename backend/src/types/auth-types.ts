// backend/src/types/auth-types.ts

// ユーザー情報の型定義
export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

// 認証リクエストの型定義
export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

// 認証レスポンスの型定義
export interface AuthResponse {
  success: boolean;
  message: string;
  user?: {
    id: string;
    username: string;
    email: string;
  };
  token?: string;
}

// バリデーションエラーの型定義
export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// JWT ペイロードの型定義
export interface JWTPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

// データベース用のユーザー作成データ
export interface CreateUserData {
  username: string;
  email: string;
  passwordHash: string;
}