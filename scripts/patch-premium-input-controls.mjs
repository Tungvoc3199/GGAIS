import fs from 'node:fs';

function replaceOnce(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(`[patch-premium-input-controls] Missing block: ${label}`);
  }
  return source.replace(oldText, newText);
}

function patchSchedule() {
  const file = 'src/components/Schedule.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('PREMIUM_INPUT_CONTROLS_SCHEDULE')) {
    console.log('[patch-premium-input-controls] Schedule already patched');
    return;
  }

  src = replaceOnce(
    src,
    `import { checkLessonConflicts, suggestAvailableSlots } from '../services/scheduling';\n`,
    `import { checkLessonConflicts, suggestAvailableSlots } from '../services/scheduling';\nimport { PremiumTimeSelect } from './PremiumTimeSelect';\n// PREMIUM_INPUT_CONTROLS_SCHEDULE\n`,
    'Schedule import'
  );

  src = replaceOnce(
    src,
    `                    <input\n                      type="time"\n                      required\n                      value={formStart}\n                      onChange={(e) => setFormStart(e.target.value)}\n                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850 font-mono"\n                    />`,
    `                    <PremiumTimeSelect\n                      required\n                      value={formStart}\n                      onChange={setFormStart}\n                    />`,
    'Schedule formStart time input'
  );

  src = replaceOnce(
    src,
    `                    <input\n                      type="time"\n                      required\n                      value={formEnd}\n                      onChange={(e) => setFormEnd(e.target.value)}\n                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-1.5 px-3 text-slate-850 font-mono"\n                    />`,
    `                    <PremiumTimeSelect\n                      required\n                      value={formEnd}\n                      onChange={setFormEnd}\n                    />`,
    'Schedule formEnd time input'
  );

  src = replaceOnce(
    src,
    `                  <input\n                    type="time"\n                    value={newStart}\n                    onChange={(e) => setNewStart(e.target.value)}\n                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"\n                  />`,
    `                  <PremiumTimeSelect\n                    value={newStart}\n                    onChange={setNewStart}\n                  />`,
    'Schedule quick reschedule start input'
  );

  src = replaceOnce(
    src,
    `                  <input\n                    type="time"\n                    value={newEnd}\n                    onChange={(e) => setNewEnd(e.target.value)}\n                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs focus:outline-none focus:border-blue-500"\n                  />`,
    `                  <PremiumTimeSelect\n                    value={newEnd}\n                    onChange={setNewEnd}\n                  />`,
    'Schedule quick reschedule end input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-premium-input-controls] patched Schedule time controls');
}

function patchStudents() {
  const file = 'src/components/Students.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('PREMIUM_INPUT_CONTROLS_STUDENTS')) {
    console.log('[patch-premium-input-controls] Students already patched');
    return;
  }

  src = replaceOnce(
    src,
    `import { useDatabase } from '../context/DatabaseContext';\n`,
    `import { useDatabase } from '../context/DatabaseContext';\nimport { PremiumMoneyInput } from './PremiumMoneyInput';\n// PREMIUM_INPUT_CONTROLS_STUDENTS\n`,
    'Students import'
  );

  src = replaceOnce(
    src,
    `                  <input\n                    type="number"\n                    required\n                    value={newTotalFee}\n                    onChange={(e) => setNewTotalFee(Number(e.target.value))}\n                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 font-mono"\n                  />`,
    `                  <PremiumMoneyInput\n                    required\n                    value={newTotalFee}\n                    onChange={setNewTotalFee}\n                  />`,
    'Students newTotalFee input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-premium-input-controls] patched Students money input');
}

function patchSettings() {
  const file = 'src/components/Settings.tsx';
  let src = fs.readFileSync(file, 'utf8');
  if (src.includes('PREMIUM_INPUT_CONTROLS_SETTINGS')) {
    console.log('[patch-premium-input-controls] Settings already patched');
    return;
  }

  src = replaceOnce(
    src,
    `import { useDatabase } from '../context/DatabaseContext';\n`,
    `import { useDatabase } from '../context/DatabaseContext';\nimport { PremiumMoneyInput } from './PremiumMoneyInput';\nimport { PremiumTimeSelect } from './PremiumTimeSelect';\n// PREMIUM_INPUT_CONTROLS_SETTINGS\n`,
    'Settings import'
  );

  const moneyInputs = [
    {
      label: 'Settings tuitionA1 input',
      oldText: `              <input\n                type="number"\n                disabled={!isEditable}\n                value={tuitionA1}\n                onChange={(e) => setTuitionA1(Number(e.target.value))}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, A1: tuitionA1, A: tuitionA1 } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
      newText: `              <PremiumMoneyInput\n                disabled={!isEditable}\n                value={tuitionA1}\n                onChange={setTuitionA1}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, A1: tuitionA1, A: tuitionA1 } })}\n              />`
    },
    {
      label: 'Settings tuitionBAuto input',
      oldText: `              <input\n                type="number"\n                disabled={!isEditable}\n                value={tuitionBAuto}\n                onChange={(e) => setTuitionBAuto(Number(e.target.value))}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, 'B số tự động': tuitionBAuto } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
      newText: `              <PremiumMoneyInput\n                disabled={!isEditable}\n                value={tuitionBAuto}\n                onChange={setTuitionBAuto}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, 'B số tự động': tuitionBAuto } })}\n              />`
    },
    {
      label: 'Settings tuitionBManual input',
      oldText: `              <input\n                type="number"\n                disabled={!isEditable}\n                value={tuitionBManual}\n                onChange={(e) => setTuitionBManual(Number(e.target.value))}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, 'B số sàn': tuitionBManual } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
      newText: `              <PremiumMoneyInput\n                disabled={!isEditable}\n                value={tuitionBManual}\n                onChange={setTuitionBManual}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, 'B số sàn': tuitionBManual } })}\n              />`
    },
    {
      label: 'Settings tuitionC1 input',
      oldText: `              <input\n                type="number"\n                disabled={!isEditable}\n                value={tuitionC1}\n                onChange={(e) => setTuitionC1(Number(e.target.value))}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, C1: tuitionC1 } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
      newText: `              <PremiumMoneyInput\n                disabled={!isEditable}\n                value={tuitionC1}\n                onChange={setTuitionC1}\n                onBlur={() => isEditable && triggerAutoSave({ tuitionPrices: { ...settings.tuitionPrices, C1: tuitionC1 } })}\n              />`
    }
  ];

  for (const item of moneyInputs) {
    src = replaceOnce(src, item.oldText, item.newText, item.label);
  }

  src = replaceOnce(
    src,
    `              <input\n                type="time"\n                disabled={!isEditable}\n                value={workingStart}\n                onChange={(e) => setWorkingStart(e.target.value)}\n                onBlur={() => isEditable && triggerAutoSave({ autoSchedulingRules: { ...settings.autoSchedulingRules, workingHourStart: workingStart } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
    `              <PremiumTimeSelect\n                disabled={!isEditable}\n                value={workingStart}\n                onChange={setWorkingStart}\n                onBlur={() => isEditable && triggerAutoSave({ autoSchedulingRules: { ...settings.autoSchedulingRules, workingHourStart: workingStart } })}\n              />`,
    'Settings workingStart time input'
  );

  src = replaceOnce(
    src,
    `              <input\n                type="time"\n                disabled={!isEditable}\n                value={workingEnd}\n                onChange={(e) => setWorkingEnd(e.target.value)}\n                onBlur={() => isEditable && triggerAutoSave({ autoSchedulingRules: { ...settings.autoSchedulingRules, workingHourEnd: workingEnd } })}\n                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-805 font-mono disabled:opacity-75"\n              />`,
    `              <PremiumTimeSelect\n                disabled={!isEditable}\n                value={workingEnd}\n                onChange={setWorkingEnd}\n                onBlur={() => isEditable && triggerAutoSave({ autoSchedulingRules: { ...settings.autoSchedulingRules, workingHourEnd: workingEnd } })}\n              />`,
    'Settings workingEnd time input'
  );

  fs.writeFileSync(file, src);
  console.log('[patch-premium-input-controls] patched Settings money/time inputs');
}

patchSchedule();
patchStudents();
patchSettings();
