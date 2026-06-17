import fs from 'node:fs';

const SERVER_FILE = 'server.ts';
const marker = 'Exact student progress reconciliation from completed lessons';
const source = fs.readFileSync(SERVER_FILE, 'utf8');

if (source.includes(marker)) {
  console.log('[patch-lesson-progress] server.ts already patched.');
  process.exit(0);
}

const oldBlock = `      await adminDb.runTransaction(async (transaction) => {
        transaction.update(lessonRef, updates);

        // Track completedSessions updates if status changes
        if (updates.status !== undefined && updates.status !== oldLesson.status) {
          const wasCompleted = oldLesson.status === "Đã hoàn thành";
          const isCompleted = updates.status === "Đã hoàn thành";
          if (wasCompleted !== isCompleted) {
            const studentRef = adminDb.collection("students").doc(studentId);
            const studentDoc = await transaction.get(studentRef);
            if (studentDoc.exists) {
              const sData = studentDoc.data() || {};
              const diff = isCompleted ? 1 : -1;
              const newCompleted = Math.max(0, (sData.completedSessions || 0) + diff);
              const newRemaining = Math.max(0, (sData.totalSessions || 0) - newCompleted);
              transaction.update(studentRef, {
                completedSessions: newCompleted,
                remainingSessions: newRemaining
              });
            }
          }
        }
      });`;

const newBlock = `      await adminDb.runTransaction(async (transaction) => {
        const shouldReconcileProgress = updates.status !== undefined && !!studentId;
        const studentRef = shouldReconcileProgress
          ? adminDb.collection("students").doc(studentId)
          : null;
        let studentDoc: any = null;
        let studentLessonsSnap: any = null;

        // Exact student progress reconciliation from completed lessons.
        // Firestore transactions must read before writing, so all reads happen first.
        if (shouldReconcileProgress && studentRef) {
          studentDoc = await transaction.get(studentRef);
          studentLessonsSnap = await transaction.get(
            adminDb.collection("lessons").where("studentId", "==", studentId)
          );
        }

        transaction.update(lessonRef, updates);

        if (shouldReconcileProgress && studentRef && studentDoc?.exists) {
          const sData = studentDoc.data() || {};
          let completedCount = 0;

          if (studentLessonsSnap) {
            studentLessonsSnap.forEach((doc: any) => {
              const item = doc.data() || {};
              const effectiveStatus = doc.id === lessonId && updates.status !== undefined
                ? updates.status
                : item.status;
              if (effectiveStatus === "Đã hoàn thành") {
                completedCount += 1;
              }
            });
          }

          const totalSessions = Number(sData.totalSessions || 0);
          const normalizedCompleted = Math.max(
            0,
            totalSessions > 0 ? Math.min(totalSessions, completedCount) : completedCount
          );
          const normalizedRemaining = Math.max(0, totalSessions - normalizedCompleted);

          const studentUpdates: any = {
            completedSessions: normalizedCompleted,
            remainingSessions: normalizedRemaining
          };

          if (
            normalizedCompleted > 0 &&
            (sData.status === "Mới đăng ký" || sData.status === "Danh sách chờ")
          ) {
            studentUpdates.status = "Đang học";
          }

          transaction.update(studentRef, studentUpdates);
        }
      });`;

if (!source.includes(oldBlock)) {
  throw new Error('[patch-lesson-progress] Không tìm thấy block update lesson cần vá trong server.ts. Dừng build để tránh deploy sai logic.');
}

fs.writeFileSync(SERVER_FILE, source.replace(oldBlock, newBlock));
console.log('[patch-lesson-progress] Patched lesson progress reconciliation in server.ts.');
