import fs from 'node:fs';

const file = 'src/components/Students.tsx';
let src = fs.readFileSync(file, 'utf8');
let changed = false;

const oldFormula = `                      const compDist = reqDist > 0 && selectedStudent.totalSessions > 0
                        ? Math.min(reqDist, Math.round((selectedStudent.completedSessions / selectedStudent.totalSessions) * reqDist))
                        : 0;`;

const newFormula = `                      // DAT is real accumulated driving distance, not a derived value from lesson count.
                      // Prefer explicit student DAT fields. Fallback to summing real DAT fields on completed lessons.
                      const studentDatKm = Number(
                        (selectedStudent as any).datKm
                        ?? (selectedStudent as any).datDistanceKm
                        ?? (selectedStudent as any).datCompletedKm
                        ?? 0
                      );
                      const lessonDatKm = lessons
                        .filter(l => l.studentId === selectedStudent.id && l.status === 'Đã hoàn thành')
                        .reduce((sum, l) => {
                          const km = Number(
                            (l as any).datKm
                            ?? (l as any).datDistanceKm
                            ?? (l as any).actualDistanceKm
                            ?? 0
                          );
                          return sum + (Number.isFinite(km) && km > 0 ? km : 0);
                        }, 0);
                      const rawDatKm = studentDatKm > 0 ? studentDatKm : lessonDatKm;
                      const compDist = reqDist > 0
                        ? Math.min(reqDist, Math.max(0, Math.round(rawDatKm)))
                        : 0;
                      const hasDatEvidence = rawDatKm > 0;`;

if (src.includes(oldFormula)) {
  src = src.replace(oldFormula, newFormula);
  changed = true;
}

const oldDatRender = `                                  {compDist >= reqDist ? (
                                    <span className="text-emerald-600 font-extrabold">✓ Đã đạt ({compDist} / {reqDist} Km)</span>
                                  ) : (
                                    <span className="text-slate-700">Đang thực hiện ({compDist} / {reqDist} Km)</span>
                                  )}`;

const newDatRender = `                                  {compDist >= reqDist ? (
                                    <span className="text-emerald-600 font-extrabold">✓ Đã đạt ({compDist} / {reqDist} Km)</span>
                                  ) : hasDatEvidence ? (
                                    <span className="text-slate-700">Đang thực hiện ({compDist} / {reqDist} Km)</span>
                                  ) : (
                                    <span className="text-amber-600 font-extrabold">Chưa ghi nhận DAT thực tế (0 / {reqDist} Km)</span>
                                  )}`;

if (src.includes(oldDatRender)) {
  src = src.replace(oldDatRender, newDatRender);
  changed = true;
}

if (src.includes('completedSessions / selectedStudent.totalSessions) * reqDist')) {
  throw new Error('[patch-dat-progress] Vẫn còn công thức DAT chia đều theo số buổi. Dừng build.');
}

if (changed) {
  fs.writeFileSync(file, src);
  console.log('[patch-dat-progress] DAT progress now uses real DAT km fields only.');
} else {
  console.log('[patch-dat-progress] DAT progress already patched.');
}
