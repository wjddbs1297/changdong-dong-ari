import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, Clock3 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../services/DataService';
import type { Booking, HolidayInfo, Room, User } from '../types';

type PeriodMode = 'week' | 'month' | 'quarter' | 'year';
type Basis = 'ended' | 'completed';
type SlotKey = 'weekdayMorning' | 'weekdayAfternoon' | 'saturdayMorning' | 'saturdayAfternoon' | 'holidayMorning' | 'holidayAfternoon';

type StatCell = { visits: Booking[]; hours: number };
type StatRow = {
    userId: string;
    name: string;
    cells: Record<SlotKey, StatCell>;
    totalVisits: number;
    totalHours: number;
    male: number;
    female: number;
    participants: number;
};

const SLOT_GROUPS: Array<{ day: string; morning: SlotKey; afternoon: SlotKey; className: string }> = [
    { day: '평일', morning: 'weekdayMorning', afternoon: 'weekdayAfternoon', className: 'bg-sky-50 text-sky-800' },
    { day: '토요일', morning: 'saturdayMorning', afternoon: 'saturdayAfternoon', className: 'bg-violet-50 text-violet-800' },
    { day: '공휴일', morning: 'holidayMorning', afternoon: 'holidayAfternoon', className: 'bg-rose-50 text-rose-800' },
];

const EMPTY_CELLS = (): Record<SlotKey, StatCell> => ({
    weekdayMorning: { visits: [], hours: 0 }, weekdayAfternoon: { visits: [], hours: 0 },
    saturdayMorning: { visits: [], hours: 0 }, saturdayAfternoon: { visits: [], hours: 0 },
    holidayMorning: { visits: [], hours: 0 }, holidayAfternoon: { visits: [], hours: 0 },
});

const isDaily = (value: string) => ['daily', '데일리'].includes(value.trim().toLowerCase());
const parseHour = (value: string) => Number(String(value || '').split(':')[0]);
const bookingHours = (booking: Booking) => Math.max(0, parseHour(booking.endTime) - parseHour(booking.startTime));
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

function weekRange(anchor: string) {
    const parsed = new Date(`${anchor}T12:00:00`);
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const monday = new Date(date);
    monday.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { start: dateKey(monday), end: dateKey(sunday) };
}

function moveWeek(anchor: string, amount: number) {
    const parsed = new Date(`${anchor}T12:00:00`);
    parsed.setDate(parsed.getDate() + amount * 7);
    return dateKey(parsed);
}

function bookingGenderCounts(booking: Booking) {
    if (!isCompleted(booking) || !booking.headcount) return { male: 0, female: 0 };
    return {
        male: booking.headcount.elemM + booking.headcount.midM + booking.headcount.highM + booking.headcount.u24M,
        female: booking.headcount.elemF + booking.headcount.midF + booking.headcount.highF + booking.headcount.u24F,
    };
}

function hasEnded(booking: Booking) {
    const end = new Date(`${booking.date}T${booking.endTime || '00:00'}:00`);
    return !Number.isNaN(end.getTime()) && end.getTime() <= Date.now();
}

function isCompleted(booking: Booking) {
    return booking.reportStatus === 'Completed' || !!booking.activityContent?.trim();
}

function isInPeriod(date: string, mode: PeriodMode, year: number, month: number, quarter: number, weekStart: string, weekEnd: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
    if (!match) return false;
    if (mode === 'week') return date >= weekStart && date <= weekEnd;
    if (Number(match[1]) !== year) return false;
    const bookingMonth = Number(match[2]);
    if (mode === 'month') return bookingMonth === month;
    if (mode === 'quarter') return Math.ceil(bookingMonth / 3) === quarter;
    return true;
}

function slotFor(booking: Booking, holidayDates: Set<string>): SlotKey {
    const date = new Date(`${booking.date}T12:00:00`);
    const day = date.getDay();
    const time = parseHour(booking.startTime) < 13 ? 'Morning' : 'Afternoon';
    if (day === 0 || holidayDates.has(booking.date)) return `holiday${time}` as SlotKey;
    if (day === 6) return `saturday${time}` as SlotKey;
    return `weekday${time}` as SlotKey;
}

function periodLabel(mode: PeriodMode, year: number, month: number, quarter: number, weekStart: string, weekEnd: string) {
    if (mode === 'week') return `${weekStart.replace(/-/g, '.')} ~ ${weekEnd.replace(/-/g, '.')}`;
    if (mode === 'month') return `${year}년 ${month}월`;
    if (mode === 'quarter') return `${year}년 ${quarter}분기`;
    return `${year}년`;
}

export function AdminStats() {
    const { user } = useAuth();
    const now = new Date();
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [rooms, setRooms] = useState<Room[]>([]);
    const [holidays, setHolidays] = useState<HolidayInfo[]>([]);
    const [availableYears, setAvailableYears] = useState<number[]>([]);
    const [holidayWarning, setHolidayWarning] = useState('');
    const [loadError, setLoadError] = useState('');
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState<PeriodMode>('month');
    const [basis, setBasis] = useState<Basis>('ended');
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth() + 1);
    const [quarter, setQuarter] = useState(Math.floor(now.getMonth() / 3) + 1);
    const [weekDate, setWeekDate] = useState(dateKey(now));
    const [selected, setSelected] = useState<{ row: StatRow; key: SlotKey; label: string } | null>(null);
    const selectedWeek = useMemo(() => weekRange(weekDate), [weekDate]);

    useEffect(() => {
        if (user?.role !== 'admin') return;
        const load = async () => {
            const config = await dataService.getConfig();
            setUsers(config.users);
            setRooms(config.rooms);
        };
        load().catch(error => {
            console.error(error);
            setLoadError('동아리와 연습실 정보를 불러오지 못했습니다.');
        });
    }, [user]);

    useEffect(() => {
        if (user?.role !== 'admin') return;
        setLoading(true);
        dataService.getPerformanceData({ mode, year, month, quarter, weekStart: selectedWeek.start, weekEnd: selectedWeek.end, basis }).then(result => {
            setBookings(result.bookings);
            setHolidays(result.holidays);
            setAvailableYears(result.availableYears);
            setLoadError('');
            setHolidayWarning(result.available ? '' : '한국 공휴일을 불러오지 못해 현재는 일요일만 공휴일로 분류했습니다. Apps Script 캘린더 권한을 확인해주세요.');
        }).catch(error => {
            console.error(error);
            setBookings([]);
            setHolidays([]);
            setLoadError(error instanceof Error ? error.message : '이용 실적을 불러오지 못했습니다.');
        }).finally(() => setLoading(false));
    }, [user, mode, year, month, quarter, selectedWeek.start, selectedWeek.end, basis]);

    const years = [...new Set<number>([now.getFullYear(), ...availableYears])].sort((a, b) => b - a);

    const holidayDates = useMemo(() => new Set(holidays.map(item => item.date)), [holidays]);
    const holidayNames = useMemo(() => new Map(holidays.map(item => [item.date, item.name])), [holidays]);
    const roomNames = useMemo(() => new Map(rooms.map(room => [room.id, room.name])), [rooms]);

    const rows = useMemo<StatRow[]>(() => {
        const clubUsers = users
            .filter(item => item.role !== 'admin' && item.status === 'Active' && !isDaily(item.id))
            .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id, 'ko'));
        const result = clubUsers.map(item => ({
            userId: item.id, name: item.name || item.id, cells: EMPTY_CELLS(),
            totalVisits: 0, totalHours: 0, male: 0, female: 0, participants: 0,
        }));
        const byId = new Map(result.map(item => [item.userId.trim().toLowerCase(), item]));

        bookings.forEach(booking => {
            if (!isInPeriod(booking.date, mode, year, month, quarter, selectedWeek.start, selectedWeek.end) || !hasEnded(booking)) return;
            if (basis === 'completed' && !isCompleted(booking)) return;
            const row = byId.get(booking.userId.trim().toLowerCase());
            if (!row) return;
            const key = slotFor(booking, holidayDates);
            const hours = bookingHours(booking);
            const genderCounts = bookingGenderCounts(booking);
            row.cells[key].visits.push(booking);
            row.cells[key].hours += hours;
            row.totalVisits += 1;
            row.totalHours += hours;
            row.male += genderCounts.male;
            row.female += genderCounts.female;
            row.participants += genderCounts.male + genderCounts.female;
        });
        return result;
    }, [users, bookings, holidayDates, mode, year, month, quarter, selectedWeek.start, selectedWeek.end, basis]);

    const totals = useMemo(() => rows.reduce((acc, row) => ({
        clubs: acc.clubs + (row.totalVisits > 0 ? 1 : 0),
        visits: acc.visits + row.totalVisits,
        hours: acc.hours + row.totalHours,
        male: acc.male + row.male,
        female: acc.female + row.female,
        participants: acc.participants + row.participants,
    }), { clubs: 0, visits: 0, hours: 0, male: 0, female: 0, participants: 0 }), [rows]);

    if (user?.role !== 'admin') return <div className="p-8 text-center text-red-500">관리자 전용 페이지입니다.</div>;

    const renderCell = (row: StatRow, key: SlotKey, label: string) => {
        const cell = row.cells[key];
        if (!cell.visits.length) return <span className="text-gray-300">-</span>;
        return (
            <button type="button" onClick={() => setSelected({ row, key, label })} className="w-full rounded-lg px-2 py-2 hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-brand-400">
                <span className="block font-bold text-gray-900">{cell.visits.length}회</span>
                <span className="block text-xs text-gray-500">{cell.hours}시간</span>
            </button>
        );
    };

    return (
        <div className="space-y-6">
            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-brand-700"><BarChart3 size={22} /><span className="text-sm font-bold">관리자 전용</span></div>
                        <h1 className="text-2xl font-bold text-gray-900">동아리 이용 실적</h1>
                        <p className="mt-2 text-sm text-gray-500">{periodLabel(mode, year, month, quarter, selectedWeek.start, selectedWeek.end)} 종료 예약을 시간대별로 집계합니다.</p>
                    </div>
                    <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs font-semibold text-gray-500">기간 단위
                            <select value={mode} onChange={e => { setMode(e.target.value as PeriodMode); setSelected(null); }} className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                                <option value="week">주별</option><option value="month">월별</option><option value="quarter">분기별</option><option value="year">연도별</option>
                            </select>
                        </label>
                        {mode !== 'week' && <label className="text-xs font-semibold text-gray-500">연도
                            <select value={year} onChange={e => { setYear(Number(e.target.value)); setSelected(null); }} className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                                {years.map(item => <option key={item} value={item}>{item}년</option>)}
                            </select>
                        </label>}
                        {mode === 'week' && <div className="text-xs font-semibold text-gray-500">기준일
                            <div className="mt-1 flex items-center gap-1">
                                <button type="button" onClick={() => { setWeekDate(value => moveWeek(value, -1)); setSelected(null); }} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50">이전 주</button>
                                <input type="date" value={weekDate} onChange={e => { setWeekDate(e.target.value); setSelected(null); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-normal text-gray-900" />
                                <button type="button" onClick={() => { setWeekDate(value => moveWeek(value, 1)); setSelected(null); }} className="rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-sm text-gray-600 hover:bg-gray-50">다음 주</button>
                            </div>
                        </div>}
                        {mode === 'month' && <label className="text-xs font-semibold text-gray-500">월
                            <select value={month} onChange={e => { setMonth(Number(e.target.value)); setSelected(null); }} className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                                {Array.from({ length: 12 }, (_, i) => i + 1).map(item => <option key={item} value={item}>{item}월</option>)}
                            </select>
                        </label>}
                        {mode === 'quarter' && <label className="text-xs font-semibold text-gray-500">분기
                            <select value={quarter} onChange={e => { setQuarter(Number(e.target.value)); setSelected(null); }} className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                                {[1, 2, 3, 4].map(item => <option key={item} value={item}>{item}분기</option>)}
                            </select>
                        </label>}
                        <label className="text-xs font-semibold text-gray-500">집계 기준
                            <select value={basis} onChange={e => { setBasis(e.target.value as Basis); setSelected(null); }} className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
                                <option value="ended">종료된 예약 전체</option><option value="completed">활동일지 완료만</option>
                            </select>
                        </label>
                    </div>
                </div>
                {holidayWarning && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{holidayWarning}</div>}
                {loadError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</div>}
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><CalendarDays className="mb-3 text-brand-600" size={22} /><div className="text-sm text-gray-500">이용 동아리</div><div className="mt-1 text-2xl font-bold">{totals.clubs}개</div></div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><BarChart3 className="mb-3 text-brand-600" size={22} /><div className="text-sm text-gray-500">총 이용 횟수</div><div className="mt-1 text-2xl font-bold">{totals.visits}회</div></div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><Clock3 className="mb-3 text-brand-600" size={22} /><div className="text-sm text-gray-500">총 이용 시간</div><div className="mt-1 text-2xl font-bold">{totals.hours}시간</div></div>
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><CalendarDays className="mb-3 text-brand-600" size={22} /><div className="text-sm text-gray-500">실제 활동인원</div><div className="mt-1 text-2xl font-bold">{totals.participants}명</div><div className="mt-1 text-xs text-gray-500">남 {totals.male}명 · 여 {totals.female}명</div></div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
                <div className="border-b border-gray-100 px-6 py-4 text-sm text-gray-500">오전은 시작 시각이 13:00 이전인 예약입니다. 공휴일은 일요일을 포함하며 토요일과 겹치면 공휴일로 집계합니다. 남녀 인원은 제출된 활동일지의 실제 인원만 합산합니다.</div>
                {loading ? <div className="py-16 text-center text-gray-500">데이터를 불러오는 중...</div> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-[1040px] w-full border-collapse text-sm">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    <th rowSpan={2} className="sticky left-0 z-20 min-w-40 bg-gray-50 px-4 py-3 text-left font-bold text-gray-700">동아리</th>
                                    {SLOT_GROUPS.map(group => <th key={group.day} colSpan={2} className={`border-l border-gray-200 px-3 py-3 text-center font-bold ${group.className}`}>{group.day}</th>)}
                                    <th rowSpan={2} className="border-l border-gray-200 px-4 py-3 text-center font-bold text-gray-700">이용 합계</th>
                                    <th colSpan={3} className="border-l border-gray-200 bg-emerald-50 px-4 py-3 text-center font-bold text-emerald-800">실제 활동인원</th>
                                </tr>
                                <tr className="border-b border-gray-200 bg-gray-50">
                                    {SLOT_GROUPS.flatMap(group => [<th key={`${group.day}-am`} className="border-l border-gray-200 px-3 py-2 text-center text-xs text-gray-500">오전</th>, <th key={`${group.day}-pm`} className="px-3 py-2 text-center text-xs text-gray-500">오후</th>])}
                                    <th className="border-l border-gray-200 bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-700">남</th>
                                    <th className="bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-700">여</th>
                                    <th className="bg-emerald-50 px-3 py-2 text-center text-xs text-emerald-700">합계</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {rows.map(row => <tr key={row.userId} className="hover:bg-gray-50/70">
                                    <td className="sticky left-0 z-10 bg-white px-4 py-3"><div className="font-bold text-gray-900">{row.name}</div><div className="text-xs text-gray-400">{row.userId}</div></td>
                                    {SLOT_GROUPS.flatMap(group => [
                                        <td key={group.morning} className="border-l border-gray-100 bg-gray-50/30 px-2 py-1 text-center">{renderCell(row, group.morning, `${group.day} 오전`)}</td>,
                                        <td key={group.afternoon} className="bg-gray-50/30 px-2 py-1 text-center">{renderCell(row, group.afternoon, `${group.day} 오후`)}</td>,
                                    ])}
                                    <td className="border-l border-gray-100 px-4 py-3 text-center"><div className="font-bold">{row.totalVisits}회</div><div className="text-xs text-gray-500">{row.totalHours}시간</div></td>
                                    <td className="border-l border-gray-100 bg-emerald-50/40 px-3 py-3 text-center font-semibold text-blue-700">{row.male}명</td>
                                    <td className="bg-emerald-50/40 px-3 py-3 text-center font-semibold text-rose-600">{row.female}명</td>
                                    <td className="bg-emerald-50/40 px-3 py-3 text-center font-bold text-gray-900">{row.participants}명</td>
                                </tr>)}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {selected && <section className="rounded-2xl border border-brand-100 bg-white p-6 shadow-sm">
                <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-gray-900">{selected.row.name} · {selected.label}</h2><p className="mt-1 text-sm text-gray-500">{periodLabel(mode, year, month, quarter, selectedWeek.start, selectedWeek.end)} 이용 내역</p></div><button onClick={() => setSelected(null)} className="rounded-lg px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-100">닫기</button></div>
                <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">
                    {[...selected.row.cells[selected.key].visits].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)).map(booking => {
                        const genderCounts = bookingGenderCounts(booking);
                        const participantText = isCompleted(booking) ? `남 ${genderCounts.male}명 · 여 ${genderCounts.female}명 · 총 ${genderCounts.male + genderCounts.female}명` : '활동일지 미작성';
                        return <div key={booking.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[120px_160px_1fr_220px]">
                            <div className="font-semibold text-gray-900">{booking.date}</div><div className="text-gray-600">{booking.startTime} ~ {booking.endTime}</div><div className="text-gray-500">{roomNames.get(booking.roomId) || booking.roomId}{holidayNames.get(booking.date) ? ` · ${holidayNames.get(booking.date)}` : ''}</div><div className="text-gray-600">{participantText}</div>
                        </div>;
                    })}
                </div>
            </section>}
        </div>
    );
}
