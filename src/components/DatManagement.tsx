import React, { useMemo, useState } from 'react';
import { Gauge } from 'lucide-react';
import { useDatabase } from '../context/DatabaseContext';
import { DatLedgerPanel } from './DatLedgerPanel';

export const DatManagement: React.FC = () => {
  const { students, lessons, currentUser, updateStudent, addAuditLog } = useDatabase();
  const datStudents = useMemo(() => students.filter(s => ['B số tự động', 'B số sàn', 'C1'].includes(s.licenseClass)), [students]);
  const [selectedStudentId, setSelectedStudentId] = useState(datStudents[0]?.id || '');
  const selectedStudent = datStudents.find(s => s.id === selectedStudentId) || datStudents[0];

  return (
    <div className="font-sans py-4 px-2 max-w-5xl mx-auto space-y-5">
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <Gauge className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight uppercase">Quản lý DAT thực tế</h1>
            <p className="text-xs font-bold text-slate-400 mt-1">BTĐ: 710km/12h/2h15 đêm • BSS: 810km/20h/4h BTĐ/2h15 đêm • C1: 825km/24h/4h BTĐ/2h15 đêm</p>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">Chọn học viên</label>
          <select
            value={selectedStudent?.id || ''}
            onChange={e => setSelectedStudentId(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
          >
            {datStudents.map(s => (
              <option key={s.id} value={s.id}>{s.code} - {s.name} - {s.licenseClass}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedStudent ? (
        <DatLedgerPanel
          student={selectedStudent}
          lessons={lessons}
          currentUser={currentUser}
          updateStudent={updateStudent}
          addAuditLog={addAuditLog}
        />
      ) : (
        <div className="bg-white rounded-3xl border border-dashed border-slate-200 p-10 text-center text-sm font-bold text-slate-400">
          Chưa có học viên thuộc hạng cần DAT.
        </div>
      )}
    </div>
  );
};
