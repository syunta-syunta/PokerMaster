import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const app = express();

// CORS設定
app.use(cors({
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  credentials: true
}));

// JSONパースミドルウェア
app.use(express.json());

// リクエストログ
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// APIルート（後で追加）
app.get('/api/test', (req, res) => {
  res.json({ message: 'PokerMaster API is running!' });
});

// 404ハンドラー
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// エラーハンドラー
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;