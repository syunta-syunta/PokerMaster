// backend/src/app.ts

import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth-routes';

// 環境変数を読み込み
dotenv.config();

const app: Application = express();

/**
 * ミドルウェアの設定
 */

// CORS設定
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// JSONパーサー設定
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// リクエストログミドルウェア
app.use((req: Request, res: Response, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

/**
 * ルート設定
 */

// ヘルスチェックエンドポイント
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'OK',
    message: 'PokerMaster Backend is running',
    timestamp: new Date().toISOString()
  });
});

// APIルートのベースパス
app.get('/api', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'PokerMaster API v1.0',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        logout: 'POST /api/auth/logout'
      }
    }
  });
});

// 認証ルート
app.use('/api/auth', authRoutes);

// 404エラーハンドラー
app.all('*', (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `ルート ${req.method} ${req.path} が見つかりません`
  });
});

// グローバルエラーハンドラー
app.use((error: any, req: Request, res: Response, next: any) => {
  console.error('Global error handler:', error);
  res.status(500).json({
    success: false,
    message: 'サーバー内部エラーが発生しました'
  });
});

export default app;