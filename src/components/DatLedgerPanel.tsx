import React, { useMemo, useState } from 'react';
import { Clock, Gauge, Moon, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Lesson, Student } from '../types';

type DatClass = 'BTĐ' | 'BSS' | 'C1';

type DatRecord = {
  id: string;
  studentId: string;
  lessonId?: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  nightMinutes: number;
  km: number;
  datVehicleClass: DatClass;
  targetLicenseClass: string;
  status: 'Hợp lệ' | 'Đã hủy';
  odometerStart?: number;
  odometerEnd?: number;
  note?: string;
  createdAt: string;
  createdBy: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
};

type Props = {
  student: Student;
  lessons: Lesson[];
  currentUser?: any;
  updateStudent: (id: string, updated: Partial<Student>) => Promise<{ success: boolean; error?: string }>;
  addAuditLog?: (action: string, details: string) => void;
};

const toMinutes = (time: string) => {
  const [h, m] = String(time || '00:00').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : 0;
};

const formatDuration = (minutes: number) => {
  const safe = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h${m ? String(m).padStart(2, '0') : ''}`;
};

const getRequirement = (licenseClass: string) => {
  if (licenseClass === 'B số tự động') return { km: 710, min: 720, night: 135, auto: 0, nightClass: 'BTĐ' as DatClass };
  if (licenseClass === 'B số sàn') return { km: 810, min: 1200, night: 135, auto: 240, nightClass: 'BSS' as DatClass };
  if (licenseClass === 'C1') return { km: 825, min: 1440, night: 135, auto: 240, nightClass: 'C1' as DatClass };
  return { km: 0, min: 0, night: 0, auto: 0, nightClass: undefined as DatClass | undefined };
};

const calcDuration = (start: string, end: string) => {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 1440;
  return Math.max(0, e - s);
};

const calcNight = (start: string, end: string) => {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (e <= s) e += 1440;
  let total = 0;
  for (let t = s; t < e; t++) {
    const d = t % 1440;
    if (d >= 1080 || d < 300) total++;
  }
  return total;
};

const buildSummary = (student: Student, records: DatRecord[]) => {
  const req = getRequirement(student.licenseClass);
  const valid = records.filter(r => r.status === 'Hợp lệ');
  const km = valid.reduce((s, r) => s + Number(r.km || 0), 0);
  const min = valid.reduce((s, r) => s + Number(r.durationMinutes || 0), 0);
  const auto = valid.filter(r => r.datVehicleClass === 'BTĐ').reduce((s, r) => s + Number(r.durationMinutes || 0), 0);
  const night = req.nightClass ? valid.filter(r => r.datVehicleClass === req.nightClass).reduce((s, r) => s + Number(r.nightMinutes || 0), 0) : 0;
  return {
    requiredKm: req.km,
    completedKm: km,
    remainingKm: Math.max(0, req.km - km),
    requiredMinutes: req.min,
    completedMinutes: min,
    remainingMinutes: Math.max(0, req.min - min),
    requiredNightMinutes: req.night,
    completedNightMinutes: night,
    requiredAutoBtdMinutes: req.auto,
    completedAutoBtdMinutes: auto,
    isDatCompleted: req.km === 0 || (km >= req.km && min >= req.min && night >= req.night && auto >= req.auto),
    recordCount: valid.length,
    updatedAt: new Date().toISOString()
  };
};

export const DatLedgerPanel: React.FC<Props> = ({ student, lessons, currentUser, updateStudent, addAuditLog }) => {
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('18:00');
  const [endTime, setEndTime] = useState('19:00');
  const [datVehicleClass, setDatVehicleClass] = useState<DatClass>('BTĐ');
  const [km, setKm] = useState('');
  const [odometerStart, setOdometerStart] = useState('');
  const [odometerEnd, setOdometerEnd] = useState('');
  const [lessonId, setLessonId] = useState('');
  const [note, setNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const records: DatRecord[] = Array.isArray((student as any).datRecords) ? (student as any).datRecords : [];
  const req = getRequirement(student.licenseClass);
  const summary = useMemo(() => buildSummary(student, records), [student, records]);
  const duration = calcDuration(startTime, endTime);
  const night = calcNight(startTime, endTime);
  const odoStart = Number(odometerStart || 0);
  const odoEnd = Number(odometerEnd || 0);
  const kmValue = odoStart > 0 && odoEnd > odoStart ? odoEnd - odoStart : Number(km || 0);
  const studentLessons = lessons.filter(l => l.studentId === student.id).sort((a, b) => `${b.date} ${b.startTime}`.localeCompare(`${a.date} ${a.startTime}`));

  const persistRecords = async (nextRecords: DatRecord[], successMessage: string) => {
    const datSummary = buildSummary(student, nextRecords);
    const res = await updateStudent(student.id, { datRecords: nextRecords, datSummary } as any);
    if (!res.success) {
      await window.__lhpAlert?.({ title: 'Cập nhật DAT thất bại', message: res.error || 'Không thể cập nhật DAT.', tone: 'danger' });
      return false;
    }
    window.__lhpToast?.(successMessage, 'success', 'DAT');
    return true;
  };

  const saveRecord = async () => {
    if (req.km <= 0) return;
    if (!date || !startTime || !endTime || duration <= 0 || !Number.isFinite(kmValue) || kmValue <= 0) {
      await window.__lhpAlert?.({ title: 'Thiếu dữ liệu DAT', message: 'Vui lòng nhập đủ ngày, giờ và số km DAT thực tế hoặc công tơ đầu/cuối hợp lệ.', tone: 'warning' });
      return;
    }
    if (odometerStart && odometerEnd && odoEnd <= odoStart) {
      await window.__lhpAlert?.({ title: 'Sai công tơ mét', message: 'Công tơ cuối phải lớn hơn công tơ đầu.', tone: 'warning' });
      return;
    }
    if (lessonId && records.some(r => r.lessonId === lessonId && r.status === 'Hợp lệ')) {
      await window.__lhpAlert?.({ title: 'Trùng bản DAT', message: 'Buổi học này đã có bản ghi DAT hợp lệ. Hãy hủy bản cũ rồi nhập bản mới.', tone: 'danger' });
      return;
    }
    setIsSaving(true);
    const fresh: DatRecord = {
      id: `dat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      studentId: student.id,
      lessonId: lessonId || undefined,
      date,
      startTime,
      endTime,
      durationMinutes: duration,
      nightMinutes: night,
      km: kmValue,
      datVehicleClass,
      targetLicenseClass: student.licenseClass,
      status: 'Hợp lệ',
      odometerStart: odometerStart ? odoStart : undefined,
      odometerEnd: odometerEnd ? odoEnd : undefined,
      note: note.trim(),
      createdAt: new Date().toISOString(),
      createdBy: currentUser?.displayName || currentUser?.email || 'Người dùng'
    };
    const ok = await persistRecords([fresh, ...records], `Đã ghi nhận ${kmValue}km DAT.`);
    setIsSaving(false);
    if (!ok) return;
    addAuditLog?.('Ghi nhận DAT', `Ghi nhận ${kmValue}km DAT ${datVehicleClass} cho học viên ${student.name}.`);
    setShowForm(false);
    setKm('');
    setOdometerStart('');
    setOdometerEnd('');
    setLessonId('');
    setNote('');
  };

  const softCancelRecord = async (record: DatRecord) => {
    const reason = cancelReason.trim();
    if (!reason) {
      await window.__lhpAlert?.({ title: 'Thiếu lý do hủy', message: 'Vui lòng nhập lý do hủy bản ghi DAT để phục vụ đối soát.', tone: 'warning' });
      return;
    }
    const nextRecords = records.map(r => r.id === record.id ? {
      ...r,
      status: 'Đã hủy' as const,
      cancelReason: reason,
      cancelledAt: new Date().toISOString(),
      cancelledBy: currentUser?.displayName || currentUser?.email || 'Người dùng'
    } : r);
    const ok = await persistRecords(nextRecords, 'Đã hủy mềm bản ghi DAT và đối soát lại tổng.');
    if (!ok) return;
    addAuditLog?.('Hủy DAT', `Hủy bản ghi ${record.km}km DAT của ${student.name}. Lý do: ${reason}`);
    setCancelingId(null);
    setCancelReason('');
  };

  const reconcileDat = async () => {
    const ok = await persistRecords(records, 'Đã đối soát lại tổng DAT từ sổ cái.');
    if (ok) addAuditLog?.('Đối soát DAT', `Đối soát lại DAT cho học viên ${student.name}.`);
  };

  const Stat = ({ label, value, ok }: { label: string; value: string; ok: boolean }) => (
    <div className={`rounded-2xl border p-3 ${ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-slate-50 border-slate-150 text-slate-700'}`}>
      <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black">{value}</div>
    </div>
  );

  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-1.5">
            <Gauge className="h-4 w-4 text-blue-600" /> DAT thực tế
          </h4>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Tính từ sổ cái DAT hợp lệ, không tính theo số buổi học.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={reconcileDat} className="rounded-xl bg-slate-100 px-3 py-2 text-[11px] font-black text-slate-700 flex items-center gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Đối soát
          </button>
          <button type="button" onClick={() => setShowForm(v => !v)} className="rounded-xl bg-blue-600 px-3 py-2 text-[11px] font-black text-white flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Ghi DAT
          </button>
        </div>
      </div>

      {req.km <= 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-xs font-bold text-slate-500">Hạng {student.licenseClass} chưa yêu cầu DAT.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <Stat label="Tổng km" value={`${Math.round(summary.completedKm)} / ${summary.requiredKm} km`} ok={summary.completedKm >= summary.requiredKm} />
            <Stat label="Tổng giờ" value={`${formatDuration(summary.completedMinutes)} / ${formatDuration(summary.requiredMinutes)}`} ok={summary.completedMinutes >= summary.requiredMinutes} />
            {summary.requiredAutoBtdMinutes > 0 && <Stat label="DAT BTĐ" value={`${formatDuration(summary.completedAutoBtdMinutes)} / ${formatDuration(summary.requiredAutoBtdMinutes)}`} ok={summary.completedAutoBtdMinutes >= summary.requiredAutoBtdMinutes} />}
            <Stat label={`Giờ đêm ${req.nightClass || ''}`} value={`${formatDuration(summary.completedNightMinutes)} / ${formatDuration(summary.requiredNightMinutes)}`} ok={summary.completedNightMinutes >= summary.requiredNightMinutes} />
          </div>
          <div className={`rounded-2xl border p-3 text-xs font-black ${summary.isDatCompleted ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'}`}>
            {summary.isDatCompleted ? '✓ Đã đạt điều kiện DAT' : 'Chưa đạt DAT'} • {summary.recordCount} bản ghi hợp lệ
          </div>
        </>
      )}

      {showForm && (
        <div className="rounded-2xl border border-blue-100 bg-blue-50/30 p-3 space-y-3 text-xs font-bold">
          <div className="grid grid-cols-2 gap-2.5">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
            <select value={datVehicleClass} onChange={e => setDatVehicleClass(e.target.value as DatClass)} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="BTĐ">DAT BTĐ</option><option value="BSS">DAT BSS</option><option value="C1">DAT C1</option></select>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
            <input type="number" min="0" step="0.1" value={km} onChange={e => setKm(e.target.value)} placeholder="Km thực chạy" className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
            <select value={lessonId} onChange={e => setLessonId(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2"><option value="">Không gắn buổi</option>{studentLessons.map(l => <option key={l.id} value={l.id}>{l.date} {l.startTime}-{l.endTime}</option>)}</select>
            <input type="number" min="0" value={odometerStart} onChange={e => setOdometerStart(e.target.value)} placeholder="Công tơ đầu" className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
            <input type="number" min="0" value={odometerEnd} onChange={e => setOdometerEnd(e.target.value)} placeholder="Công tơ cuối" className="rounded-xl border border-slate-200 bg-white px-3 py-2" />
          </div>
          <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Ghi chú/lý do đối soát DAT..." className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 min-h-16" />
          <div className="flex items-center justify-between rounded-xl bg-white border border-slate-100 px-3 py-2 text-[11px] text-slate-500"><span><Clock className="inline h-3.5 w-3.5" /> {formatDuration(duration)}</span><span><Moon className="inline h-3.5 w-3.5" /> đêm {formatDuration(night)}</span><span>Km: <b>{kmValue || 0}</b></span></div>
          <button type="button" disabled={isSaving} onClick={saveRecord} className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-black text-white disabled:opacity-50">{isSaving ? 'Đang lưu DAT...' : '✓ Lưu bản ghi DAT'}</button>
        </div>
      )}

      <div className="space-y-2">
        <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Lịch sử DAT</div>
        {records.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-center text-xs font-bold text-slate-400">Chưa có bản ghi DAT thực tế.</div> : records.map(r => (
          <div key={r.id} className={`rounded-2xl border p-3 text-xs font-bold ${r.status === 'Đã hủy' ? 'bg-slate-50 border-slate-100 text-slate-400' : 'bg-white border-slate-100 text-slate-700'}`}>
            <div className="flex justify-between gap-3">
              <div className="min-w-0"><div className="font-black text-slate-800">{r.date} • {r.startTime}-{r.endTime} • {r.datVehicleClass}</div><div className="mt-1 text-[11px] text-slate-500">{r.km}km • {formatDuration(r.durationMinutes)} • đêm {formatDuration(r.nightMinutes)} • {r.createdBy}</div>{r.odometerStart && r.odometerEnd && <div className="mt-1 text-[11px] text-slate-400">Công tơ: {r.odometerStart} → {r.odometerEnd}</div>}{r.note && <div className="mt-1 text-[11px] italic text-slate-400">{r.note}</div>}{r.status === 'Đã hủy' && <div className="mt-1 text-[11px] text-red-500">Đã hủy: {r.cancelReason}</div>}</div>
              {r.status === 'Hợp lệ' && <button type="button" onClick={() => setCancelingId(cancelingId === r.id ? null : r.id)} className="self-start rounded-xl bg-red-50 p-2 text-red-600 border border-red-100"><Trash2 className="h-4 w-4" /></button>}
            </div>
            {cancelingId === r.id && <div className="mt-3 flex gap-2"><input value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Lý do hủy DAT" className="min-w-0 flex-1 rounded-xl border border-red-100 bg-white px-3 py-2 text-[11px]" /><button onClick={() => softCancelRecord(r)} className="rounded-xl bg-red-600 px-3 py-2 text-[11px] font-black text-white">Xác nhận hủy</button></div>}
          </div>
        ))}
      </div>
    </div>
  );
};
