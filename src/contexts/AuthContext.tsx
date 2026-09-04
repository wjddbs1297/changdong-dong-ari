import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from '../types';
import { dataService } from '../services/DataService';

interface AuthContextType {
    user: User | null;
    login: (userId: string, pin: string) => Promise<void>;
    logout: () => Promise<void>;
    changePin: (currentPin: string, newPin: string) => Promise<void>;
    mustChangePin: boolean;
    isLoading: boolean;
    error: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mustChangePin, setMustChangePin] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        dataService.restoreSession()
            .then(result => {
                if (result) { setUser(result.user); setMustChangePin(result.mustChangePin); }
            })
            .finally(() => setIsLoading(false));
    }, []);

    const login = async (userId: string, pin: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await dataService.login(userId, pin);
            setUser(result.user);
            setMustChangePin(result.mustChangePin);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '로그인 실패');
            throw err;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = async () => {
        await dataService.logout();
        setUser(null);
        setMustChangePin(false);
    };

    const changePin = async (currentPin: string, newPin: string) => {
        await dataService.changePin(currentPin, newPin);
        setMustChangePin(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, changePin, mustChangePin, isLoading, error }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
