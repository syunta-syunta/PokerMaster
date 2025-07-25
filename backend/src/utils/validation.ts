// backend/src/utils/validation.ts

import { ValidationResult, ValidationError } from '../types/auth-types';

/**
 * メールアドレスの形式をチェックする
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * パスワードの強度をチェックする (8文字以上)
 */
export const isValidPassword = (password: string): boolean => {
  return password.length >= 8;
};

/**
 * ユーザー名のフォーマットをチェックする
 */
export const isValidUsername = (username: string): boolean => {
  // 3文字以上20文字以下、英数字とアンダースコアのみ
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

/**
 * 登録リクエストのバリデーション
 */
export const validateRegisterRequest = (username: string, email: string, password: string): ValidationResult => {
  const errors: ValidationError[] = [];

  // ユーザー名のバリデーション
  if (!username || username.trim().length === 0) {
    errors.push({
      field: 'username',
      message: 'ユーザー名は必須です'
    });
  } else if (!isValidUsername(username)) {
    errors.push({
      field: 'username',
      message: 'ユーザー名は3～20文字の英数字とアンダースコアのみ使用できます'
    });
  }

  // メールアドレスのバリデーション
  if (!email || email.trim().length === 0) {
    errors.push({
      field: 'email',
      message: 'メールアドレスは必須です'
    });
  } else if (!isValidEmail(email)) {
    errors.push({
      field: 'email',
      message: '有効なメールアドレスを入力してください'
    });
  }

  // パスワードのバリデーション
  if (!password || password.trim().length === 0) {
    errors.push({
      field: 'password',
      message: 'パスワードは必須です'
    });
  } else if (!isValidPassword(password)) {
    errors.push({
      field: 'password',
      message: 'パスワードは8文字以上で入力してください'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * ログインリクエストのバリデーション
 */
export const validateLoginRequest = (email: string, password: string): ValidationResult => {
  const errors: ValidationError[] = [];

  // メールアドレスのバリデーション
  if (!email || email.trim().length === 0) {
    errors.push({
      field: 'email',
      message: 'メールアドレスは必須です'
    });
  } else if (!isValidEmail(email)) {
    errors.push({
      field: 'email',
      message: '有効なメールアドレスを入力してください'
    });
  }

  // パスワードのバリデーション
  if (!password || password.trim().length === 0) {
    errors.push({
      field: 'password',
      message: 'パスワードは必須です'
    });
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * エラーメッセージをフォーマットする
 */
export const formatValidationErrors = (errors: ValidationError[]): string => {
  return errors.map(error => `${error.field}: ${error.message}`).join(', ');
};