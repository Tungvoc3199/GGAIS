import fs from 'node:fs';

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
