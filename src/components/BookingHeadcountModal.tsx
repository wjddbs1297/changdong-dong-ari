import { useState } from 'react';

interface BookingHeadcountModalProps {
    isOpen: boolean;
    isLoading: boolean;
    roomName: string;
    dateStr: string;
    timeStr: string;
    onClose: () => void;
    onSubmit: (expectedHeadcount: number) => void;
}

export function BookingHeadcountModal({
    isOpen, isLoading, roomName, dateStr, timeStr, onClose, onSubmit,
}: BookingHeadcountModalProps) {
    const [value, setValue] = useState('');
    if (!isOpen) return null;

    const submit = () => {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 99) {
            alert('예정 활동인원을 1~99명 사이로 입력해주세요.');
            return;
        }
        onSubmit(count);
        setValue('');
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl">
                <div className="border-b p-5">
                    <h2 className="text-lg font-bold text-gray-900">예약 확인</h2>
                    <p className="mt-1 text-sm text-gray-500">{roomName} · {dateStr} · {timeStr}</p>
                </div>
                <div className="p-5">
                    <label htmlFor="expected-headcount" className="mb-2 block text-sm font-semibold text-gray-700">
                        예정 활동인원 <span className="text-red-500">(필수)</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input
                            id="expected-headcount"
                            type="number"
                            min={1}
                            max={99}
                            value={value}
                            onChange={e => setValue(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                            autoFocus
                            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-lg focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
                            placeholder="0"
                        />
                        <span className="font-medium text-gray-600">명</span>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-gray-500">
                        활동이 끝난 뒤 다음 로그인 시 실제 참여자와 활동 내용을 작성하게 됩니다.
                    </p>
                </div>
                <div className="flex gap-3 rounded-b-2xl border-t bg-gray-50 p-5">
                    <button onClick={onClose} className="flex-1 rounded-xl border bg-white py-3 font-bold text-gray-600">취소</button>
                    <button onClick={submit} disabled={isLoading} className="flex-1 rounded-xl bg-brand-600 py-3 font-bold text-white disabled:bg-gray-300">
                        {isLoading ? '처리중...' : '예약 완료'}
                    </button>
                </div>
            </div>
        </div>
    );
}
