import fs from 'node:fs';

const file = 'src/components/Students.tsx';
const marker = 'STUDENT_DETAIL_TABS_CLICK_FIX_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-student-detail-tabs-click] already patched');
  process.exit(0);
}

const oldTabs = `            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto shrink-0 bg-white">
              {[
                { id: 'info', label: 'Thông tin' },
                { id: 'progress', label: 'Tiến độ học' },
                { id: 'schedule', label: 'Lịch học' },
                { id: 'fee', label: 'Học phí & Sổ nợ' },
                { id: 'notes', label: 'Ghi chú nội bộ' },
                { id: 'notif', label: 'Gửi SMS / Zalo ✨' }
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setActiveTab(t.id as any);
                    if (t.id === 'notif') {
                      triggerInitTextForModal(selectedTemplateId, selectedStudent.id);
                    }
                  }}
                  className={\`py-3.5 px-4 scroll-mx-4 shrink-0 border-b-2 font-black transition-all cursor-pointer \${activeTab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/10' : 'border-transparent hover:text-slate-800'}\`}
                >
                  {t.label}
                </button>
              ))}
            </div>`;

const newTabs = `            {/* Navigation Tabs */}
            {/* ${marker}: keep student detail tabs above drawer body/bottom bars and make every tab an explicit non-submit button. */}
            <div
              className="relative z-30 flex border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto shrink-0 bg-white pointer-events-auto"
              role="tablist"
              aria-label="Chuyển tab hồ sơ học viên"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {[
                { id: 'info', label: 'Thông tin' },
                { id: 'progress', label: 'Tiến độ học' },
                { id: 'schedule', label: 'Lịch học' },
                { id: 'fee', label: 'Học phí & Sổ nợ' },
                { id: 'notes', label: 'Ghi chú nội bộ' },
                { id: 'notif', label: 'Nhắc học viên ✨' }
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === t.id}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setActiveTab(t.id as any);
                    if (t.id === 'notif') {
                      triggerInitTextForModal(selectedTemplateId, selectedStudent.id);
                    }
                  }}
                  className={\`relative z-40 py-3.5 px-4 scroll-mx-4 shrink-0 border-b-2 font-black transition-all cursor-pointer select-none pointer-events-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 \${activeTab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/40' : 'border-transparent hover:text-slate-800 hover:bg-slate-50'}\`}
                >
                  {t.label}
                </button>
              ))}
            </div>`;

if (src.includes(oldTabs)) {
  src = src.replace(oldTabs, newTabs);
  console.log('[patch-student-detail-tabs-click] patched exact tab block');
} else {
  console.log('[patch-student-detail-tabs-click] exact tab block not found, applying minimal safe replacements');
  src = src.replace(
    '            <div className="flex border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto shrink-0 bg-white">',
    `            {/* ${marker} */}\n            <div className="relative z-30 flex border-b border-slate-100 text-xs font-bold text-slate-500 overflow-x-auto shrink-0 bg-white pointer-events-auto">`
  );
  src = src.replaceAll('<button\n                  key={t.id}\n                  onClick={() => {', '<button\n                  key={t.id}\n                  type="button"\n                  onClick={(e) => {\n                    e.preventDefault();\n                    e.stopPropagation();');
}

src = src.replace(
  '<div className="p-5 pb-28 md:pb-5 overflow-y-auto flex-1 space-y-5 bg-slate-50/20">',
  '<div className="relative z-10 p-5 pb-28 md:pb-5 overflow-y-auto flex-1 space-y-5 bg-slate-50/20">'
);

src = src.replace(
  '<div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">',
  '<div className="relative z-20 p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">'
);

fs.writeFileSync(file, src);
console.log('[patch-student-detail-tabs-click] completed');
