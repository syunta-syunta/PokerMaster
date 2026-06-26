import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import app from './app';
import dotenv from 'dotenv';
import { setupSocketHandlers } from './socket/socket-handler';

dotenv.config();

const PORT = parseInt(process.env.PORT || '5000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

const server = http.createServer(app);

const io = new SocketIOServer(server, {
  cors: {
    origin: FRONTEND_URL,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

setupSocketHandlers(io);

server.listen(PORT, HOST, () => {
  console.log('\n🚀 PokerMaster Backend Server Starting...');
  console.log('━'.repeat(50));
  console.log(`📡 Server running on: http://${HOST}:${PORT}`);
  console.log(`🌍 Environment: ${NODE_ENV}`);
  console.log(`⏰ Started at: ${new Date().toISOString()}`);
  console.log('━'.repeat(50));
  console.log('\n📋 Available endpoints:');
  console.log('  • GET  /health              - Health check');
  console.log('  • POST /api/auth/register   - User registration');
  console.log('  • POST /api/auth/login      - User login');
  console.log('  • GET  /api/auth/me         - Get user info');
  console.log('  • WS   socket.io            - Game events');
  console.log('\n✅ Ready to accept connections!');
  console.log('━'.repeat(50));
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
  process.exit(1);
});

export default server;
