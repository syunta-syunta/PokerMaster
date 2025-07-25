// backend/src/middleware/auth-middleware.ts

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { JWTPayload } from '../types/auth-types';

// JWT シークレットキー（環境変数から取得）
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = '24h';

// Request型を拡張してuserプロパティを追加
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * JWT トークンを生成する
 */
export const generateToken = (userId: string, email: string): string => {
  const payload: JWTPayload = {
    userId,
    email
  };
  
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

/**
 * JWT トークンを検証する
 */
export const verifyToken = (token: string): JWTPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
};

/**
 * パスワードをハッシュ化する
 */
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12;
  return await bcrypt.hash(password, saltRounds);
};

/**
 * パスワードを検証する
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

/**
 * 認証が必要なエンドポイントを保護するミドルウェア
 */
export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ 
      success: false, 
      message: 'アクセストークンが必要です' 
    });
    return;
  }

  const decoded = verifyToken(token);
  
  if (!decoded) {
    res.status(403).json({ 
      success: false, 
      message: '無効なトークンです' 
    });
    return;
  }

  req.user = decoded;
  next();
};

/**
 * 認証ヘルパー関数: リクエストからユーザーIDを取得
 */
export const getUserIdFromRequest = (req: Request): string | null => {
  return req.user?.userId || null;
};