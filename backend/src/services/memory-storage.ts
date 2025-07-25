// backend/src/services/memory-storage.ts

import { User, CreateUserData } from '../types/auth-types';
import { v4 as uuidv4 } from 'uuid';

// メモリ内ユーザーストレージ
let users: User[] = [];

/**
 * ユーザーを作成する
 */
export const createUser = async (userData: CreateUserData): Promise<User> => {
  const newUser: User = {
    id: uuidv4(),
    username: userData.username,
    email: userData.email,
    passwordHash: userData.passwordHash,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  users.push(newUser);
  return newUser;
};

/**
 * メールアドレスでユーザーを検索する
 */
export const findUserByEmail = async (email: string): Promise<User | null> => {
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  return user || null;
};

/**
 * ユーザー名でユーザーを検索する
 */
export const findUserByUsername = async (username: string): Promise<User | null> => {
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  return user || null;
};

/**
 * IDでユーザーを検索する
 */
export const findUserById = async (id: string): Promise<User | null> => {
  const user = users.find(u => u.id === id);
  return user || null;
};

/**
 * メールアドレスが既に使用されているかチェック
 */
export const isEmailTaken = async (email: string): Promise<boolean> => {
  const existingUser = await findUserByEmail(email);
  return existingUser !== null;
};

/**
 * ユーザー名が既に使用されているかチェック
 */
export const isUsernameTaken = async (username: string): Promise<boolean> => {
  const existingUser = await findUserByUsername(username);
  return existingUser !== null;
};

/**
 * デバッグ用: 全ユーザーを取得する
 */
export const getAllUsers = async (): Promise<User[]> => {
  return [...users]; // コピーを返す
};

/**
 * デバッグ用: ユーザーデータをクリアする
 */
export const clearAllUsers = async (): Promise<void> => {
  users = [];
};

/**
 * デバッグ用: ユーザー数を取得する
 */
export const getUserCount = async (): Promise<number> => {
  return users.length;
};