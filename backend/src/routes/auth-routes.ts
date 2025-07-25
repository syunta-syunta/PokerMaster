// backend/src/routes/auth-routes.ts

import { Router } from 'express';
import { register, login, getMe, logout } from '../controllers/auth-controller';
import { authenticateToken } from '../middleware/auth-middleware';

const router = Router();

/**
 * 認証関連のルート設定
 */

// アカウント登録
router.post('/register', register);

// ログイン
router.post('/login', login);

// ユーザー情報取得（認証が必要）
router.get('/me', authenticateToken, getMe);

// ログアウト（認証が必要）
router.post('/logout', authenticateToken, logout);

export default router;