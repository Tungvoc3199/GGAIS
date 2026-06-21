import fs from 'node:fs';

const file = 'src/components/Schedule.tsx';
const marker = 'SCHEDULE_COMPLETE_ACTIONS_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-schedule-complete-actions] already patched');
  process.exit(0);
}

function hardInsert(anchor, insertText, label) {
  if (!src.includes(anchor)) {
    throw new Error(`[patch-schedule-complete-actions] Missing required anchor: ${label}`);
  }
  src = src.replace(anchor, insertText + anchor);
}

function softReplace(oldText, newText, label) {
  if (!src.includes(oldText)) {
    console.log(`[patch-schedule-complete-actions] skip optional block: ${label}`);
    return false;
  }
  src = src.replace(oldText, newText);
  return true;
}

const completeHelper = `
  // ${marker}
  const handleMarkLessonCompleted = async (lessonId: string, source: 'row' | 'modal' = 'row') => {
    const targetLesson = lessons.find(l => l.id === lessonId);
    if (!targetLesson) {
      showScheduleToast('Không tìm thấy buổi học để xác nhận.', 'error');
      return;
    }

    if (targetLesson.status === 'Đã hoàn thành' && targetLesson.attendanceStatus === 'Có mặt') {
      showScheduleToast('Buổi học này đã được xác nhận hoàn thành trước đó.', 'success');
      if (source === 'modal') setIsBooking(false);
      return;
    }

    setLastSaveMessage('Đang xác nhận hoàn thành buổi học...');
    setIsSavingLesson(true);
    try {
      const result = await updateLesson(lessonId, {
        status: 'Đã hoàn thành',
        attendanceStatus: 'Có mặt'
      });

      if (!result?.success) {
        const message = result?.error || 'Không thể xác nhận hoàn thành buổi học.';
        showScheduleToast(message, 'error');
        setLastSaveMessage(message);
        return;
      }

      if (editingLessonId === lessonId) {
        setFormStatus('Đã hoàn thành');
        setFormAttendance('Có mặt');
      }

      const student = students.find(s => s.id === targetLesson.studentId);
      const successMessage = student?.name
        ? `Đã xác nhận hoàn thành buổi học cho ${student.name}.`
        : 'Đã xác nhận hoàn thành buổi học.';

      setLastSaveMessage(successMessage);
      showScheduleToast(successMessage, 'success');

      const premiumAlert = (window as any).__lhpAlert;
      if (typeof premiumAlert === 'function') {
        await premiumAlert({
          title: 'Hoàn tất',
          message: successMessage + ' Tiến độ học viên đã được cập nhật.',
          tone: 'success'
        });
      }

      if (source === 'modal') setIsBooking(false);
    } catch (err: any) {
      const message = err?.message || 'Lỗi khi xác nhận hoàn thành buổi học.';
      showScheduleToast(message, 'error');
      setLastSaveMessage(message);
    } finally {
      setIsSavingLesson(false);
    }
  };
`;

hardInsert(
  `  return (\n    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">`,
  completeHelper,
  'component return block'
);

softReplace(
  `          {/* 3. Hoàn thành */}\n          <button\n            type="button"\n            onClick={() => {\n              updateLesson(les.id, { \n                status: 'Đã hoàn thành',\n                attendanceStatus: 'Có mặt'\n              });\n              alert('Đã cập nhật hoàn thành buổi học và điểm danh học viên!');\n            }}\n            className={\`flex flex-col items-center justify-center p-2 rounded-2xl active:scale-95 transition-all text-[9px] sm:text-[10px] font-black cursor-pointer min-h-[50px] border \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' : 'bg-slate-50 border-slate-100 text-slate-705 hover:bg-slate-100'}\`}\n          >\n            <CheckCircle className="h-4.5 w-4.5 mb-1 shrink-0" />\n            <span>Xong</span>\n          </button>`,
  `          {/* 3. Hoàn thành */}\n          <button\n            type="button"\n            onClick={() => handleMarkLessonCompleted(les.id, 'row')}\n            disabled={isSavingLesson || (les.status === 'Đã hoàn thành' && les.attendanceStatus === 'Có mặt')}\n            className={\`flex flex-col items-center justify-center p-2 rounded-2xl active:scale-95 transition-all text-[9px] sm:text-[10px] font-black min-h-[50px] border \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-slate-50 border-slate-100 text-slate-705 hover:bg-slate-100 cursor-pointer'} disabled:opacity-80\`}\n          >\n            <CheckCircle className="h-4.5 w-4.5 mb-1 shrink-0" />\n            <span>{les.status === 'Đã hoàn thành' ? 'Đã xong' : 'Xong'}</span>\n          </button>`,
  'mobile card complete button'
);

softReplace(
  `                            </button>\n                            <button\n                              onClick={() => shiftLessonDateDemo(les)}`,
  `                            </button>\n                            <button\n                              onClick={() => handleMarkLessonCompleted(les.id, 'row')}\n                              disabled={isSavingLesson || (les.status === 'Đã hoàn thành' && les.attendanceStatus === 'Có mặt')}\n                              className={\`text-[10px] border px-2 py-1 rounded-md cursor-pointer disabled:cursor-default disabled:opacity-80 \${les.status === 'Đã hoàn thành' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'}\`}\n                              title="Xác nhận đã học và cộng tiến độ học viên"\n                            >\n                              {les.status === 'Đã hoàn thành' ? 'Đã xong' : 'Xong'}\n                            </button>\n                            <button\n                              onClick={() => shiftLessonDateDemo(les)}`,
  'desktop row complete button'
);

softReplace(
  `                    </button>\n                    \n                    {!showOverride && (`,
  `                    </button>\n\n                    {editingLessonId && !showOverride && (\n                      <button\n                        type="button"\n                        disabled={isSavingLesson || formStatus === 'Đã hoàn thành'}\n                        onClick={() => handleMarkLessonCompleted(editingLessonId, 'modal')}\n                        className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-100 disabled:text-emerald-700 text-white py-2.5 px-4 rounded-xl cursor-pointer disabled:cursor-default shadow-xs transition-all active:scale-95 font-black text-xs"\n                        title="Xác nhận đã học, điểm danh có mặt và cập nhật tiến độ học viên"\n                      >\n                        {formStatus === 'Đã hoàn thành' ? '✓ ĐÃ HỌC' : '✓ XÁC NHẬN ĐÃ HỌC'}\n                      </button>\n                    )}\n                    \n                    {!showOverride && (`,
  'modal complete button'
);

fs.writeFileSync(file, src);
console.log('[patch-schedule-complete-actions] patched schedule complete buttons');
