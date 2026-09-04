import { useEffect, useState } from 'react';
import { dataService } from '../services/DataService';
import { useAuth } from '../contexts/AuthContext';
import type { User } from '../types';

export function AdminAccounts() {
    const { user } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        if (user?.role !== 'admin') return;
        dataService.getConfig().then(config => setUsers(config.users)).finally(() => setLoading(false));
    }, [user]);

    const resetPin = async (target: User) => {
        const pin = prompt(`${target.name || target.id}의 새 임시 PIN 4자리를 입력하세요.`);
        if (pin === null) return;
        if (!/^\d{4}$/.test(pin) || /^(\d)\1{3}$/.test(pin) || ['1234', '4321', '0000'].includes(pin)) return alert('쉬운 번호를 제외한 4자리 숫자를 입력해주세요.');
        try { await dataService.adminResetPin(target.id, pin); alert('임시 PIN으로 초기화했습니다. 다음 로그인에서 변경을 요구합니다.'); }
        catch (error) { alert(error instanceof Error ? error.message : 'PIN 초기화에 실패했습니다.'); }
    };

    if (user?.role !== 'admin') return <div className="p-8 text-center text-red-500">관리자 전용 페이지입니다.</div>;
    return <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-5"><h1 className="text-2xl font-bold">동아리 계정 관리</h1><p className="mt-1 text-sm text-gray-500">임시 PIN으로 초기화하면 다음 로그인 시 PIN 변경이 필요합니다.</p></div>
        {loading ? <p>불러오는 중...</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50"><th className="p-3 text-left">아이디</th><th className="p-3 text-left">동아리명</th><th className="p-3">상태</th><th className="p-3"></th></tr></thead><tbody>
            {users.filter(item => item.role !== 'admin').map(item => <tr key={item.id} className="border-b"><td className="p-3 font-mono">{item.id}</td><td className="p-3">{item.name}</td><td className="p-3 text-center">{item.status}</td><td className="p-3 text-right"><button onClick={() => resetPin(item)} className="rounded-lg bg-brand-600 px-4 py-2 font-bold text-white">PIN 초기화</button></td></tr>)}
        </tbody></table></div>}
    </div>;
}
