// backend/src/controllers/auth-controller.ts

import { Request, Response } from 'express';
import { 
  RegisterRequest, 
  LoginRequest, 
  AuthResponse,
  CreateUserData 
} from '../types/auth-types';
import { 
  validateRegisterRequest, 
  validateLoginRequest 
} from '../utils/validation';
import {
  generateToken,
  hashPassword,
  comparePassword,
  getUserIdFromRequest
} from '../middleware/auth-middleware';
import {
  createUser,
  findUserByEmail,
  findUserById,
  isEmailTaken,
  isUsernameTaken
} from '../services/memory-storage';

/**
 * アカウント登録
 * POST /api/auth/register
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password }: RegisterRequest = req.body;

    // バリデーションチェック
    const validation = validateRegisterRequest(username, email, password);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        message: '入力データにエラーがあります',
        errors: validation.errors
      });
      return;
    }

    // メールアドレスの重複チェック
    if (await isEmailTaken(email)) {
      res.status(400).json({
        success: false,
        message: 'このメールアドレスは既に使用されています',
        errors: [{ field: 'email', message: 'メールアドレスが重複しています' }]
      });
      return;
    }

    // ユーザー名の重複チェック
    if (await isUsernameTaken(username)) {
      res.status(400).json({
        success: false,
        message: 'このユーザー名は既に使用されています',
        errors: [{ field: 'username', message: 'ユーザー名が重複しています' }]
      });
      return;
    }

    // パスワードをハッシュ化
    const passwordHash = await hashPassword(password);

    // ユーザー作成
    const userData: CreateUserData = {
      username,
      email,
      passwordHash
    };
    
    const newUser = await createUser(userData);

    // JWTトークン生成
    const token = generateToken(newUser.id, newUser.email);

    // レスポンス
    const response: AuthResponse = {
      success: true,
      message: 'アカウントが正常に作成されました',
      user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email
      },
      token
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};

/**
 * ログイン
 * POST /api/auth/login
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // バリデーションチェック
    const validation = validateLoginRequest(email, password);
    if (!validation.isValid) {
      res.status(400).json({
        success: false,
        message: '入力データにエラーがあります',
        errors: validation.errors
      });
      return;
    }

    // ユーザー検索
    const user = await findUserByEmail(email);
    if (!user) {
      res.status(401).json({
        success: false,
        message: 'メールアドレスまたはパスワードが正しくありません',
        errors: [{ field: 'email', message: 'ユーザーが見つかりません' }]
      });
      return;
    }

    // パスワード検証
    const isPasswordValid = await comparePassword(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'メールアドレスまたはパスワードが正しくありません',
        errors: [{ field: 'password', message: 'パスワードが正しくありません' }]
      });
      return;
    }

    // JWTトークン生成
    const token = generateToken(user.id, user.email);

    // レスポンス
    const response: AuthResponse = {
      success: true,
      message: 'ログインに成功しました',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      },
      token
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};

/**
 * ユーザー情報取得
 * GET /api/auth/me
 */
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = getUserIdFromRequest(req);
    
    if (!userId) {
      res.status(401).json({
        success: false,
        message: '認証が必要です'
      });
      return;
    }

    // ユーザー検索
    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'ユーザーが見つかりません'
      });
      return;
    }

    // レスポンス
    const response: AuthResponse = {
      success: true,
      message: 'ユーザー情報を取得しました',
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};

/**
 * ログアウト
 * POST /api/auth/logout
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    // JWTの場合、クライアント側でトークンを削除するだけなので
    // サーバー側では特別な処理は不要
    const response: AuthResponse = {
      success: true,
      message: 'ログアウトしました'
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'サーバーエラーが発生しました'
    });
  }
};