// backend/src/server.ts

import app from './app';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// サーバー起動
const server = app.listen(PORT, () => {
  console.log('\n🚀 PokerMaster Backend Server Starting...');
  console.log('━'.repeat(50));
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('━'.repeat(50));
  console.log('\n📋 Available endpoints:');
  console.log('  • GET  /health              - Health check');
  console.log('  • GET  /api                 - API info');
  console.log('  • POST /api/auth/register   - User registration');
  console.log('  • POST /api/auth/login      - User login');
  console.log('  • GET  /api/auth/me         - Get user info');
  console.log('  • POST /api/auth/logout     - User logout');
  console.log('\n✅ Ready to accept connections!');
  console.log('━'.repeat(50));
});

// グレースフルシャットダウン
process.on('SIGTERM', () => {
  console.log('\n🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed successfully.');
    process.exit(0);
  });
});

// エラーハンドリング
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default server;