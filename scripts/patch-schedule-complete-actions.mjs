import fs from 'node:fs';

const file = 'src/components/Schedule.tsx';
const marker = 'SCHEDULE_COMPLETE_ACTIONS_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-schedule-complete-actions] already patched');
  process.exit(0);
}

const helper = [
  '  // ' + marker,
  "  const handleMarkLessonCompleted = async (lessonId: string, source: 'row' | 'modal' = 'row') => {",
  '    const targetLesson = lessons.find(l => l.id === lessonId);',
  "    if (!targetLesson) { showScheduleToast('Không tìm thấy buổi học để xác nhận.', 'error'); return; }",
  "    if (targetLesson.status === 'Đã hoàn thành' && targetLesson.attendanceStatus === 'Có mặt') {",
  "      showScheduleToast('Buổi học này đã được xác nhận hoàn thành trước đó.', 'success');",
  "      if (source === 'modal') setIsBooking(false);",
  '      return;',
  '    }',
  "    setLastSaveMessage('Đang xác nhận hoàn thành buổi học...');",
  '    setIsSavingLesson(true);',
  '    try {',
  "      const result = await updateLesson(lessonId, { status: 'Đã hoàn thành', attendanceStatus: 'Có mặt' });",
  '      if (!result?.success) {',
  "        const message = result?.error || 'Không thể xác nhận hoàn thành buổi học.';",
  "        showScheduleToast(message, 'error');",
  '        setLastSaveMessage(message);',
  '        return;',
  '      }',
  "      if (editingLessonId === lessonId) { setFormStatus('Đã hoàn thành'); setFormAttendance('Có mặt'); }",
  '      const student = students.find(s => s.id === targetLesson.studentId);',
  "      const successMessage = student?.name ? 'Đã xác nhận hoàn thành buổi học cho ' + student.name + '.' : 'Đã xác nhận hoàn thành buổi học.';",
  '      setLastSaveMessage(successMessage);',
  "      showScheduleToast(successMessage, 'success');",
  '      const premiumAlert = (window as any).__lhpAlert;',
  "      if (typeof premiumAlert === 'function') await premiumAlert({ title: 'Hoàn tất', message: successMessage + ' Tiến độ học viên đã được cập nhật.', tone: 'success' });",
  "      if (source === 'modal') setIsBooking(false);",
  '    } catch (err: any) {',
  "      const message = err?.message || 'Lỗi khi xác nhận hoàn thành buổi học.';",
  "      showScheduleToast(message, 'error');",
  '      setLastSaveMessage(message);',
  '    } finally { setIsSavingLesson(false); }',
  '  };',
  ''
].join('\n');

const returnAnchor = '  return (\n    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">';
if (!src.includes(returnAnchor)) throw new Error('[patch-schedule-complete-actions] Missing return anchor');
src = src.replace(returnAnchor, helper + '\n' + returnAnchor);

src = src.replace(/onClick=\{\(\) => \{\s*updateLesson\(les\.id, \{\s*status: 'Đã hoàn thành',\s*attendanceStatus: 'Có mặt'\s*\}\);\s*alert\('Đã cập nhật hoàn thành buổi học và điểm danh học viên!'\);\s*\}\}/m, "onClick={() => handleMarkLessonCompleted(les.id, 'row')}");

src = src.replace(
  "                            </button>\n                            <button\n                              onClick={() => shiftLessonDateDemo(les)}",
  "                            </button>\n                            <button\n                              onClick={() => handleMarkLessonCompleted(les.id, 'row')}\n                              disabled={isSavingLesson || (les.status === 'Đã hoàn thành' && les.attendanceStatus === 'Có mặt')}\n                              className=\"text-[10px] bg-emerald-600 border border-emerald-600 hover:bg-emerald-700 px-2 py-1 rounded-md text-white cursor-pointer disabled:opacity-70\"\n                            >\n                              {les.status === 'Đã hoàn thành' ? 'Đã xong' : 'Xong'}\n                            </button>\n                            <button\n                              onClick={() => shiftLessonDateDemo(les)}"
);

src = src.replace(
  "                    </button>\n                    \n                    {!showOverride && (",
  "                    </button>\n\n                    {editingLessonId && !showOverride && (\n                      <button\n                        type=\"button\"\n                        disabled={isSavingLesson || formStatus === 'Đã hoàn thành'}\n                        onClick={() => handleMarkLessonCompleted(editingLessonId, 'modal')}\n                        className=\"bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-100 disabled:text-emerald-700 text-white py-2.5 px-4 rounded-xl cursor-pointer disabled:cursor-default shadow-xs transition-all active:scale-95 font-black text-xs\"\n                      >\n                        {formStatus === 'Đã hoàn thành' ? '✓ ĐÃ HỌC' : '✓ XÁC NHẬN ĐÃ HỌC'}\n                      </button>\n                    )}\n                    \n                    {!showOverride && ("
);

fs.writeFileSync(file, src);
console.log('[patch-schedule-complete-actions] patched schedule complete actions');
