import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, ImagePlus, Sparkles, X } from 'lucide-react';
import { formatDateVN, parseDateVNToISO } from './PremiumDateInput';
import { useDatabase, OCR_API_TIMEOUT_MS } from '../context/DatabaseContext';

type ExamScheduleImporterProps = {
  dates: string[];
  onChange: (dates: string[]) => void;
};

const STORAGE_KEY = 'lhp_center_exam_dates_v1';

const normalizeExamDate = (value: string): string => {
  const parsed = parseDateVNToISO(String(value || '').trim());
  return /^\d{4}-\d{2}-\d{2}$/.test(parsed) ? parsed : '';
};

const uniqueSortedDates = (values: string[]): string[] => Array.from(new Set(values.map(normalizeExamDate).filter(Boolean))).sort();

const parseManualDates = (value: string): string[] => uniqueSortedDates(value.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean));

const fileToDataUrl = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

export const ExamScheduleImporter: React.FC<ExamScheduleImporterProps> = ({ dates, onChange }) => {
  const { authFetch } = useDatabase();
  const [manualText, setManualText] = useState('');
  const [isReading, setIsReading] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && dates.length === 0) {
        const parsed = uniqueSortedDates(JSON.parse(saved));
        if (parsed.length) onChange(parsed);
      }
    } catch {}
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(uniqueSortedDates(dates))); } catch {}
  }, [dates]);

  const displayText = useMemo(() => dates.map(formatDateVN).join(', '), [dates]);

  const handleManualApply = () => {
    const parsed = parseManualDates(manualText);
    if (parsed.length === 0) {
      window.__lhpAlert?.({ title: 'Chưa có ngày thi', message: 'Anh nhập ngày theo dạng dd/mm/yyyy, mỗi ngày một dòng hoặc cách nhau bằng dấu phẩy.', tone: 'warning' });
      return;
    }
    onChange(uniqueSortedDates([...dates, ...parsed]));
    setManualText('');
    window.__lhpToast?.(`Đã thêm ${parsed.length} ngày thi.`, 'success', 'Lịch thi trung tâm');
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsReading(true);
    try {
      const image = await fileToDataUrl(file);
      const payload = await authFetch('/api/ocr-exam-schedule', {
        method: 'POST',
        body: JSON.stringify({ image, locale: 'vi-VN', inputDateFormat: 'dd/mm/yyyy' })
      }, OCR_API_TIMEOUT_MS);
      if (!payload?.success) throw new Error(payload?.error || 'Không thể đọc ảnh lịch thi.');
      const parsed = uniqueSortedDates(payload?.data?.examDates || []);
      if (parsed.length === 0) {
        await window.__lhpAlert?.({ title: 'Chưa đọc được ngày thi', message: 'Ảnh lịch thi chưa đủ rõ. Anh nhập tay bên dưới để dùng tiếp.', tone: 'warning' });
        return;
      }
      onChange(uniqueSortedDates([...dates, ...parsed]));
      await window.__lhpAlert?.({ title: 'Đã đọc lịch thi', message: `Đã đọc được ${parsed.length} ngày thi:\n${parsed.map(formatDateVN).join(', ')}`, tone: 'success' });
    } catch (error: any) {
      await window.__lhpAlert?.({ title: 'Không đọc được ảnh lịch thi', message: error?.message || 'Anh nhập tay danh sách ngày thi để tiếp tục.', tone: 'warning' });
    } finally {
      setIsReading(false);
      event.target.value = '';
    }
  };

  return (
    <div className="rounded-3xl bg-white border border-slate-100 p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-black text-slate-900 flex items-center gap-2"><CalendarCheck2 className="h-4 w-4 text-red-600" /> Lịch thi trung tâm</h2>
          <p className="mt-1 text-[11px] font-bold text-slate-400">Ngày thi được đánh dấu đỏ và không tự xếp ca học. Ngày đó anh tự xếp tay để đưa học viên đi thi.</p>
        </div>
        <label className={`shrink-0 rounded-2xl px-3 py-2 text-[11px] font-black text-white shadow-lg ${isReading ? 'bg-slate-400' : 'bg-red-600 hover:bg-red-700'}`}>
          <input type="file" accept="image/*" onChange={handleUpload} disabled={isReading} className="hidden" />
          <span className="flex items-center gap-1.5"><ImagePlus className="h-3.5 w-3.5" /> {isReading ? 'Đang đọc...' : 'Upload ảnh'}</span>
        </label>
      </div>

      {dates.length > 0 ? (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-red-700"><Sparkles className="h-3.5 w-3.5" /> Ngày thi • tự xếp tay</div>
          <div className="flex flex-wrap gap-2">
            {dates.map(date => (
              <button key={date} type="button" onClick={() => onChange(dates.filter(item => item !== date))} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[11px] font-black text-red-700 border border-red-200 shadow-sm">
                {formatDateVN(date)} · Tự xếp tay <X className="h-3 w-3 text-red-300" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] font-bold text-red-700/70">App sẽ bỏ qua các ngày này khi tạo gợi ý lịch nháp: {displayText}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3 text-[11px] font-bold text-slate-400">Chưa có lịch thi tháng. App vẫn gợi ý được nhưng chưa biết ngày nào cần để trống đi thi.</div>
      )}

      <div className="grid grid-cols-1 gap-2">
        <textarea value={manualText} onChange={(event) => setManualText(event.target.value)} placeholder={'Nhập tay ngày thi, ví dụ:\n01/07/2026\n04/07/2026\n11/07/2026'} className="min-h-[92px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-bold text-slate-800 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100" />
        <button onClick={handleManualApply} className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white">Lưu ngày thi nhập tay</button>
      </div>
    </div>
  );
};
