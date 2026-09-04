import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { ArrowRight, Loader2 } from 'lucide-react';

export function Login() {
    const [userId, setUserId] = useState('');
    const [pin, setPin] = useState('');
    const { login, isLoading, error } = useAuth();
    const navigate = useNavigate();
    const isDailyUser = ['daily', '데일리'].includes(userId.trim().toLowerCase());

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId.trim() || (!isDailyUser && !/^\d{4}$/.test(pin))) return;

        try {
            await login(userId.trim(), isDailyUser ? '' : pin);
            navigate('/');
        } catch (err) {
            // Error handled in context/state, but logged here
            console.error(err);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden animate-slide-up">
                <div className="bg-white p-8 text-center border-b border-gray-100">
                    <div className="mx-auto flex items-center justify-center mb-4">
                        <img
                            src="/logo.jpg"
                            alt="시립창동청소년센터"
                            className="h-24 object-contain"
                        />
                    </div>
                </div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">시립창동청소년센터</h1>
                        <p className="text-gray-500">동아리 연습실 대관 시스템</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {!isDailyUser && <div>
                            <label htmlFor="userId" className="block text-sm font-medium text-gray-700 mb-2">
                                동아리 아이디
                            </label>
                            <input
                                type="text"
                                id="userId"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                placeholder="동아리 아이디를 입력해주세요"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none"
                                disabled={isLoading}
                            />
                        </div>}

                        {isDailyUser && <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-700">데일리 계정은 PIN 없이 로그인합니다.</div>}

                        <div>
                            <label htmlFor="pin" className="block text-sm font-medium text-gray-700 mb-2">4자리 PIN</label>
                            <input
                                type="password"
                                id="pin"
                                inputMode="numeric"
                                autoComplete="current-password"
                                maxLength={4}
                                value={pin}
                                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                                placeholder="4자리 숫자"
                                className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition-all outline-none tracking-[0.5em]"
                                disabled={isLoading}
                            />
                        </div>

                        {error && (
                            <div className="p-4 bg-red-50 text-red-600 text-sm rounded-lg border border-red-100 flex items-center">
                                <span className="font-semibold mr-1">Error:</span> {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading || !userId.trim() || (!isDailyUser && pin.length !== 4)}
                            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <Loader2 className="animate-spin" size={20} />
                            ) : (
                                <>
                                    <span>로그인</span>
                                    <ArrowRight size={20} className="ml-2" />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 text-center text-sm text-gray-500 bg-gray-50 p-4 rounded-lg">
                        <p className="font-semibold mb-1">📢 안내</p>
                        부여받은 <span className="text-brand-600 font-bold">동아리 아이디</span>를 입력해주세요.
                    </div>
                </div>
            </div>
        </div>
    );
}
