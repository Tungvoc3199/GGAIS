import fs from 'node:fs';

function patchApp() {
  const f = 'src/App.tsx';
  let s = fs.readFileSync(f, 'utf8');
  let changed = false;
  if (!s.includes("./components/DatManagement")) {
    s = s.replace("import { Settings } from './components/Settings';", "import { Settings } from './components/Settings';\nimport { DatManagement } from './components/DatManagement';");
    changed = true;
  }
  if (!s.includes('  Gauge,')) {
    s = s.replace('  Car,', '  Car,\n  Gauge,');
    changed = true;
  }
  if (!s.includes("{ id: 'dat'")) {
    s = s.replace("{ id: 'xe-tap', label: 'Xe tập lái', icon: Car },", "{ id: 'xe-tap', label: 'Xe tập lái', icon: Car },\n    { id: 'dat', label: 'DAT', icon: Gauge },");
    changed = true;
  }
  if (!s.includes("activeView === 'dat'")) {
    s = s.replace("{activeView === 'cai-dat' && <Settings />}", "{activeView === 'dat' && <DatManagement />}\n          {activeView === 'cai-dat' && <Settings />}");
    changed = true;
  }
  if (changed) fs.writeFileSync(f, s);
  console.log('[patch-dat-ledger] DAT route connected=' + changed);
}

function patchStudents() {
  const f = 'src/components/Students.tsx';
  let s = fs.readFileSync(f, 'utf8');
  let changed = false;
  if (!s.includes("./DatLedgerPanel")) {
    s = s.replace("import { uploadStudentDocument } from '../services/storageService';", "import { uploadStudentDocument } from '../services/storageService';\nimport { DatLedgerPanel } from './DatLedgerPanel';");
    changed = true;
  }
  if (!s.includes('<DatLedgerPanel student={selectedStudent}')) {
    const needle = '<h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Yêu cầu đào tạo</h4>';
    const h = s.indexOf(needle);
    if (h > -1) {
      const start = s.lastIndexOf('                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-4 shadow-xs">', h);
      if (start > -1) {
        const panel = '                  <DatLedgerPanel student={selectedStudent} lessons={lessons} currentUser={currentUser} updateStudent={updateStudent} addAuditLog={addAuditLog} />\n\n';
        s = s.slice(0, start) + panel + s.slice(start);
        changed = true;
      }
    }
  }
  if (changed) fs.writeFileSync(f, s);
  console.log('[patch-dat-ledger] Student progress panel connected=' + changed);
}

patchApp();
patchStudents();
