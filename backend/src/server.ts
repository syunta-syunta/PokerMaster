import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app';

// 環境変数を読み込み
dotenv.config();

const PORT = process.env.PORT || 5000;

// HTTPサーバーを作成
const server = createServer(app);

// Socket.IOサーバーを作成
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Socket.IOの接続処理
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  
  // プレイヤーがゲームに参加
  socket.on('join-game', (gameId: string) => {
    socket.join(gameId);
    console.log(`Player ${socket.id} joined game ${gameId}`);
    
    // TODO: ゲームロジックの実装
  });
  
  // プレイヤーのアクション
  socket.on('player-action', (action) => {
    console.log(`Player ${socket.id} action:`, action);
    
    // TODO: アクション処理の実装
  });
  
  // プレイヤーがゲームから退出
  socket.on('leave-game', () => {
    console.log(`Player ${socket.id} left game`);
    
    // TODO: 退出処理の実装
  });
  
  // 接続切断時
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    
    // TODO: 切断処理の実装
  });
});

// サーバーを開始
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
});

export default server;