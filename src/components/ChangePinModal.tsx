import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export function ChangePinModal({ open, required, onClose }: { open: boolean; required: boolean; onClose: () => void }) {
    const { changePin } = useAuth();
    const [currentPin, setCurrentPin] = useState('');
    const [newPin, setNewPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [loading, setLoading] = useState(false);
    if (!open) return null;

    const digits = (value: string) => value.replace(/\D/g, '').slice(0, 4);
    const submit = async () => {
        if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) return alert('PIN은 4자리 숫자로 입력해주세요.');
        if (newPin !== confirmPin) return alert('새 PIN이 서로 다릅니다.');
        if (newPin === currentPin) return alert('현재 PIN과 다른 PIN을 사용해주세요.');
        if (/^(\d)\1{3}$/.test(newPin) || ['1234', '4321', '0000'].includes(newPin)) return alert('너무 쉬운 PIN은 사용할 수 없습니다.');
        setLoading(true);
        try {
            await changePin(currentPin, newPin);
            setCurrentPin(''); setNewPin(''); setConfirmPin(''); onClose();
            alert('PIN이 변경되었습니다.');
        } catch (error) { alert(error instanceof Error ? error.message : 'PIN 변경에 실패했습니다.'); }
        finally { setLoading(false); }
    };

    return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold">PIN 변경</h2>
            {required && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">임시 PIN을 사용 중입니다. 계속하려면 PIN을 변경해주세요.</p>}
            <div className="mt-5 space-y-3">
                {[["현재 PIN", currentPin, setCurrentPin], ["새 PIN", newPin, setNewPin], ["새 PIN 확인", confirmPin, setConfirmPin]].map(([label, value, setter]) =>
                    <label key={label as string} className="block text-sm font-semibold">{label as string}<input type="password" inputMode="numeric" maxLength={4} value={value as string} onChange={e => (setter as (v:string)=>void)(digits(e.target.value))} className="mt-1 w-full rounded-xl border px-4 py-3 tracking-[0.5em]" /></label>
                )}
            </div>
            <div className="mt-5 flex gap-3">
                {!required && <button onClick={onClose} className="flex-1 rounded-xl border py-3 font-bold">취소</button>}
                <button onClick={submit} disabled={loading} className="flex-1 rounded-xl bg-brand-600 py-3 font-bold text-white disabled:bg-gray-300">{loading ? '변경중...' : '변경'}</button>
            </div>
        </div>
    </div>;
}
