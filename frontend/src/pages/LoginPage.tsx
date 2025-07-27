// frontend/src/pages/LoginPage.tsx

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginFormData, FormErrors } from '../types/auth';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, login, clearError } = useAuth();
  
  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [showPassword, setShowPassword] = useState(false);

  // 認証済みの場合はホーム画面にリダイレクト
  useEffect(() => {
    if (state.isAuthenticated) {
      console.log('User is authenticated, redirecting to home');
      navigate('/', { replace: true });
    }
  }, [state.isAuthenticated, navigate]);

  // エラーのクリア（コンポーネントマウント時のみ）
  useEffect(() => {
    clearError();
  }, []); // 依存配列を空にして、マウント時のみ実行

  // フォームの変更を処理
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    
    // エラーをクリア
    if (formErrors[name as keyof FormErrors]) {
      setFormErrors((prev) => ({
        ...prev,
        [name]: undefined,
      }));
    }
  };

  // バリデーション
  const validateForm = (): boolean => {
    const errors: FormErrors = {};
    
    // メールアドレスのバリデーション
    if (!formData.email.trim()) {
      errors.email = 'メールアドレスは必須です';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = '無効なメールアドレスです';
    }
    
    // パスワードのバリデーション
    if (!formData.password) {
      errors.password = 'パスワードは必須です';
    } else if (formData.password.length < 8) {
      errors.password = '8文字以上で入力してください';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // フォーム送信を処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    console.log('Form submitted with data:', formData); // デバッグログ
    
    if (!validateForm()) {
      console.log('Form validation failed'); // デバッグログ
      return;
    }
    
    console.log('Form validation passed, attempting login'); // デバッグログ
    const success = await login(formData);
    console.log('Login result:', success); // デバッグログ
    
    if (success) {
      console.log('Login successful, navigating to home'); // デバッグログ
      navigate('/', { replace: true });
    } else {
      console.log('Login failed'); // デバッグログ
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#243243' }}>
      <div className="w-full max-w-md">
        {/* メインフォーム */}
        <div 
          className="rounded-lg p-8 shadow-lg border"
          style={{ 
            backgroundColor: '#1E2B3B',
            borderColor: '#505050'
          }}
        >
          {/* タイトル */}
          <h1 className="text-2xl font-bold text-center mb-8 text-white">
            ログイン
          </h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* メールアドレス入力 */}
            <div>
              <label 
                htmlFor="email" 
                className="block text-sm font-medium mb-2"
                style={{ color: '#B0B8C0' }}
              >
                メールアドレス
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="example@email.com"
                className="w-full px-4 py-3 rounded-md border text-white focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-[#05BB97]"
                style={{
                  backgroundColor: '#35404E',
                  borderColor: '#636363',
                  color: '#FFFFFF'
                }}
                disabled={state.loading}
              />
              {formErrors.email && (
                <p className="mt-1 text-sm" style={{ color: '#DB5C5C' }}>
                  ※{formErrors.email}
                </p>
              )}
            </div>

            {/* パスワード入力 */}
            <div>
              <label 
                htmlFor="password" 
                className="block text-sm font-medium mb-2"
                style={{ color: '#B0B8C0' }}
              >
                パスワード
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="8文字以上"
                  className="w-full px-4 py-3 pr-12 rounded-md border text-white focus:outline-none focus:ring-2 focus:ring-opacity-50 focus:ring-[#05BB97]"
                  style={{
                    backgroundColor: '#35404E',
                    borderColor: '#636363',
                    color: '#FFFFFF'
                  }}
                  disabled={state.loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  style={{ color: '#7A8A9A' }}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L9.878 9.878zm4.242 4.242L9.878 9.878m4.242 4.242a3 3 0 01-4.242-4.242m0 0L21 3m-6 6l2.121-2.121m0 0l1.415-1.414L21 3" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {formErrors.password && (
                <p className="mt-1 text-sm" style={{ color: '#DB5C5C' }}>
                  ※{formErrors.password}
                </p>
              )}
            </div>

            {/* ログインボタン */}
            <button
              type="submit"
              disabled={state.loading}
              className="w-full py-3 px-4 rounded-md font-medium text-white transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#05BB97' }}
            >
              {state.loading ? 'ログイン中...' : 'ログインする'}
            </button>

            {/* エラーメッセージ */}
            {state.error && (
              <div className="text-center">
                <p className="text-sm" style={{ color: '#DB5C5C' }}>
                  ※{state.error}
                </p>
              </div>
            )}

            {/* 一般的なエラーメッセージ */}
            {formErrors.general && (
              <div className="text-center">
                <p className="text-sm" style={{ color: '#DB5C5C' }}>
                  ※{formErrors.general}
                </p>
              </div>
            )}
          </form>

          {/* 区切り線 */}
          <div className="mt-8 flex items-center">
            <div className="flex-1 h-px" style={{ backgroundColor: '#5A6A7C' }}></div>
            <span className="px-4 text-sm" style={{ color: '#7A8A9A' }}>または</span>
            <div className="flex-1 h-px" style={{ backgroundColor: '#5A6A7C' }}></div>
          </div>

          {/* アカウント登録リンク */}
          <div className="mt-6 text-center">
            <p className="text-sm" style={{ color: '#B0B8C0' }}>
              初めて利用する場合{' '}
              <Link 
                to="/register" 
                className="font-medium hover:underline"
                style={{ color: '#05BB97' }}
              >
                アカウント登録する
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;