import fs from 'node:fs';

const file = 'src/components/Schedule.tsx';
const marker = 'SCHEDULE_COMPLETE_ACTIONS_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-schedule-complete-actions] already patched');
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!src.includes(oldText)) {
    throw new Error(`[patch-schedule-complete-actions] Missing block: ${label}`);
  }
  src = src.replace(oldText, newText);
}

const helperAnchor = `  const handleApplyAlternative = (alt: { date: string; startTime: string; endTime: string }) => {\n    setFormDate(alt.date);\n    setFormStart(alt.startTime);\n    setFormEnd(alt.endTime);\n    // Clear warning\n    setConflictWarning([]);\n    setConflictAlternatives([]);\n    setShowOverride(false);\n  };\n`;

const helperBlock = helperAnchor + `\n  // ${marker}\n  const handleMarkLessonCompleted = async (lessonId: string, source: 'row' | 'modal' = 'row') => {\n    const targetLesson = lessons.find(l => l.id === lessonId);\n    if (!targetLesson) {\n      showScheduleToast('Không tìm thấy buổi học để xác nhận.', 'error');\n      return;\n    }\n\n    if (targetLesson.status === 'Đã hoàn thành' && targetLesson.attendanceStatus === 'Có mặt') {\n      showScheduleToast('Buổi học này đã được xác nhận hoàn thành trước đó.', 'success');\n      if (source === 'modal') setIsBooking(false);\n      return;\n    }\n\n    setLastSaveMessage('Đang xác nhận hoàn thành buổi học...');\n    setIsSavingLesson(true);\n    try {\n      const result = await updateLesson(lessonId, {\n        status: 'Đã hoàn thành',\n        attendanceStatus: 'Có mặt'\n      });\n\n      if (!result?.success) {\n        const message = result?.error || 'Không thể xác nhận hoàn thành buổi học.';\n        showScheduleToast(message, 'error');\n        setLastSaveMessage(message);\n        return;\n      }\n\n      if (editingLessonId === lessonId) {\n        setFormStatus('Đã hoàn thành');\n        setFormAttendance('Có mặt');\n      }\n\n      const student = students.find(s => s.id === targetLesson.studentId);\n      const successMessage = student?.name\n        ? \`Đã xác nhận hoàn thành buổi học cho \${student.name}.\`\n        : 'Đã xác nhận hoàn thành buổi học.';\n\n      setLastSaveMessage(successMessage);\n      showScheduleToast(successMessage, 'success');\n\n      const premiumAlert = (window as any).__lhpAlert;\n      if (typeof premiumAlert === 'function') {\n        await premiumAlert({\n          title: 'Hoàn tất',\n          message: successMessage + ' Tiến độ học viên đã được cập nhật.',\n          tone: 'success'\n        });\n      }\n\n      if (source === 'modal') setIsBooking(false);\n    } catch (err: any) {\n      const message = err?.message || 'Lỗi khi xác nhận hoàn thành buổi học.';\n      showScheduleToast(message, 'error');\n      setLastSaveMessage(message);\n    } finally {\n      setIsSavingLesson(false);\n    }\n  };\n`;

replaceOnce(helperAnchor, helperBlock, 'complete lesson helper');

replaceOnce(
  `          {/* 3. Hoàn thành */}\n          <button\n            type="button"\n            onClick={() => {\n              updateLesson(les.id, { \n                status: 'Đã hoàn thành',\n                attendanceStatus: 'Có mặt'\n              });\n              alert('Đã cập nhật hoàn thành buổi học và điểm danh học viên!');\n            }}\n            className={\`flex flex-col items-center justify-center p-2 rounded-2xl active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px] border \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-100 text-slate-705 hover:bg-slate-100'}\`}\n          >\n            <CheckCircle className="h-4.5 w-4.5 mb-1 shrink-0" />\n            <span>Xong</span>\n          </button>`,
  `          {/* 3. Hoàn thành */}\n          <button\n            type="button"\n            onClick={() => handleMarkLessonCompleted(les.id, 'row')}\n            disabled={isSavingLesson || (les.status === 'Đã hoàn thành' && les.attendanceStatus === 'Có mặt')}\n            className={\`flex flex-col items-center justify-center p-2 rounded-2xl active:scale-95 transition-all text-[9px] sm:text-[10px] font-black min-h-[50px] border \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-705 hover:bg-slate-100 cursor-pointer'} disabled:opacity-80\`}\n          >\n            <CheckCircle className="h-4.5 w-4.5 mb-1 shrink-0" />\n            <span>{les.status === 'Đã hoàn thành' ? 'Đã xong' : 'Xong'}</span>\n          </button>`,
  'mobile card complete button'
);

replaceOnce(
  `                             <button\n                              onClick={() => handleOpenEditBooking(les)}\n                              className="text-[10px] bg-slate-100 border border-slate-200 hover:bg-slate-200 px-2 py-1 rounded-md text-slate-700 cursor-pointer"\n                            >\n                              Sửa\n                            </button>`,
  `                             <button\n                              onClick={() => handleOpenEditBooking(les)}\n                              className="text-[10px] bg-slate-100 border border-slate-200 hover:bg-slate-200 px-2 py-1 rounded-md text-slate-700 cursor-pointer"\n                            >\n                              Sửa\n                            </button>\n                            <button\n                              onClick={() => handleMarkLessonCompleted(les.id, 'row')}\n                              disabled={isSavingLesson || (les.status === 'Đã hoàn thành' && les.attendanceStatus === 'Có mặt')}\n                              className={\`text-[10px] border px-2 py-1 rounded-md cursor-pointer disabled:cursor-default disabled:opacity-80 \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'}\`}\n                              title="Xác nhận đã học và cộng tiến độ học viên"\n                            >\n                              {les.status === 'Đã hoàn thành' ? 'Đã xong' : 'Xong'}\n                            </button>`,
  'desktop row complete button'
);

replaceOnce(
  `                    <button\n                      type="button"\n                      disabled={isSavingLesson}\n                      onClick={() => setIsBooking(false)}\n                      className="bg-slate-100 text-slate-700 hover:bg-slate-200 py-2.5 px-4 rounded-xl cursor-pointer disabled:opacity-50"\n                    >\n                      QUAY LẠI\n                    </button>\n                    \n                    {!showOverride && (`,
  `                    <button\n                      type="button"\n                      disabled={isSavingLesson}\n                      onClick={() => setIsBooking(false)}\n                      className="bg-slate-100 text-slate-700 hover:bg-slate-200 py-2.5 px-4 rounded-xl cursor-pointer disabled:opacity-50"\n                    >\n                      QUAY LẠI\n                    </button>\n\n                    {editingLessonId && !showOverride && (\n                      <button\n                        type="button"\n                        disabled={isSavingLesson || formStatus === 'Đã hoàn thành'}\n                        onClick={() => handleMarkLessonCompleted(editingLessonId, 'modal')}\n                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-100 disabled:text-emerald-700 text-white py-2.5 px-4 rounded-xl cursor-pointer disabled:cursor-default shadow-xs transition-all active:scale-95 font-black text-xs"\n                        title="Xác nhận đã học, điểm danh có mặt và cập nhật tiến độ học viên"\n                      >\n                        {formStatus === 'Đã hoàn thành' ? '✓ ĐÃ HỌC' : '✓ XÁC NHẬN ĐÃ HỌC'}\n                      </button>\n                    )}\n                    \n                    {!showOverride && (`,
  'modal complete button'
);

fs.writeFileSync(file, src);
console.log('[patch-schedule-complete-actions] patched schedule complete buttons');
