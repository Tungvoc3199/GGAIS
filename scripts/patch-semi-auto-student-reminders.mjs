import fs from 'node:fs';

const file = 'src/components/Students.tsx';
const marker = 'SEMI_AUTO_STUDENT_REMINDERS_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-semi-auto-student-reminders] already patched');
  process.exit(0);
}

function replaceOnce(oldText, newText, label) {
  if (!src.includes(oldText)) {
    throw new Error(`[patch-semi-auto-student-reminders] Missing block: ${label}`);
  }
  src = src.replace(oldText, newText);
}

src = src.replace(
  "  const [filterDebtOnly, setFilterDebtOnly] = useState(false);\n  const [filterInactiveOnly, setFilterInactiveOnly] = useState(false);",
  "  const [filterDebtOnly, setFilterDebtOnly] = useState(false);\n  const [filterNeedsReminder, setFilterNeedsReminder] = useState(false);\n  const [filterInactiveOnly, setFilterInactiveOnly] = useState(false);"
);

src = src.replace(
  "  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('sched');",
  "  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('enroll');"
);

replaceOnce(
  `    const templateTexts: Record<string, string> = {\n      sched: \`[LỊCH HỌC PRO] Chào anh/chị {TenHocVien}, trung tâm thông báo: Bạn đã được xếp lịch thực hành {LoaiBang} vào ngày {NgayHoc} lúc {GioHoc}. GV phụ trách: Thầy {GiaoVien} (SĐT: {GiaoVienSDT}). Điểm tập & đón: {DiemDon}. Xe tập: {XeTap}. Thân chúc bạn học tập kết quả tốt!\`,\n      remind: \`[LỊCH HỌC PRO] Nhắc nhở anh/chị {TenHocVien}: Bạn có lịch hẹn tập lái xe thực hành vào lúc {GioHoc} ngày mai ({NgayHoc}). Vui lòng có mặt đúng giờ tại {DiemDon}. Thầy {GiaoVien} liên hệ: {GiaoVienSDT}.\`,\n      payment: \`[LỊCH HỌC PRO] Kính gửi {TenHocVien} ({MaHocVien}) lớp {MonHoc}. Bộ phận giáo vụ đối soát học phí hiện tại: Số học phí còn dư nợ: {HocPhiNo} đ. Đề nghị bạn hoàn tất trước hạn chót {HanNop} để được tiếp nhận hồ sơ thi sát hạch.\`\n    };`,
  `    const templateTexts: Record<string, string> = {\n      enroll: \`Chào {TenHocVien}, trung tâm LỊCH HỌC PRO nhắc em hoàn tất lịch nhập học/hồ sơ để được xếp lịch học sớm. Nếu em đã chuẩn bị xong, phản hồi giúp thầy để thầy giữ lịch phù hợp nhé.\`,\n      sched: \`Chào {TenHocVien}, trung tâm thông báo lịch học thực hành {LoaiBang}: {NgayHoc}, khung giờ {GioHoc}. Giáo viên phụ trách: thầy {GiaoVien} ({GiaoVienSDT}). Điểm đón/tập: {DiemDon}. Xe tập: {XeTap}. Em xác nhận giúp thầy nhé.\`,\n      remind: \`Chào {TenHocVien}, thầy nhắc lịch học sắp tới của em: {NgayHoc}, {GioHoc}. Em vui lòng có mặt đúng giờ tại {DiemDon}. Nếu có thay đổi, báo lại sớm giúp thầy nhé.\`,\n      payment: \`Chào {TenHocVien}, trung tâm nhắc em còn học phí cần hoàn tất: {HocPhiNo}đ. Hạn dự kiến: {HanNop}. Em kiểm tra và phản hồi giúp thầy để trung tâm cập nhật hồ sơ nhé.\`,\n      exam: \`Chào {TenHocVien}, em đang trong nhóm cần theo dõi ôn tập/chuẩn bị thi. Trung tâm sẽ ưu tiên sắp xếp lịch ôn, xe chip và các nội dung còn thiếu. Em phản hồi lịch rảnh gần nhất giúp thầy nhé.\`,\n      dat: \`Chào {TenHocVien}, trung tâm nhắc em theo dõi tiến độ DAT/học thực hành để đủ điều kiện trước kỳ thi. Em gửi lịch rảnh gần nhất để thầy cân lịch phù hợp nhé.\`,\n      document: \`Chào {TenHocVien}, hồ sơ của em cần bổ sung/kiểm tra thêm giấy tờ. Em phản hồi hoặc gửi bổ sung giúp thầy để trung tâm hoàn thiện hồ sơ nhé.\`\n    };`,
  'notification templates'
);

replaceOnce(
  `  const handleSendNotification = async (channel: 'sms' | 'zalo', textMessage: string) => {\n    if (!selectedStudent) return;\n    if (!textMessage.trim()) {\n      alert('Nội dung nhắn không được trống!');\n      return;\n    }\n\n    setIsSendingNotif(true);\n    // Simulate high speed network delay\n    await new Promise(resolve => setTimeout(resolve, 1000));\n\n    // Save history log locally\n    const existingStr = localStorage.getItem('lhp_sent_notifications') || '[]';\n    let existing = [];\n    try {\n      existing = JSON.parse(existingStr);\n    } catch {\n      existing = [];\n    }\n\n    const newLog = {\n      id: \`notif_\${Date.now()}_\${Math.random().toString(36).substring(2, 6)}\`,\n      studentId: selectedStudent.id,\n      channel,\n      text: textMessage,\n      sentAt: new Date().toISOString()\n    };\n    existing.unshift(newLog);\n    localStorage.setItem('lhp_sent_notifications', JSON.stringify(existing));\n\n    // Push into system internal AuditLogs so "Lịch sử" is globally persisted and visible in audit tabs!\n    await addAuditLog(\n      \`Gửi thông báo \${channel.toUpperCase()}\`,\n      \`Gửi tự động qua \${channel === 'sms' ? 'SMS Brandname' : 'Zalo ZNS Doanh Nghiệp'} cho HV \${selectedStudent.name} (\${selectedStudent.phone}): "\${textMessage}"\`\n    );\n\n    setIsSendingNotif(false);\n    setNotifTriggerCount(prev => prev + 1);\n    alert(\`Đã truyền tải thông báo thành công cho học viên qua \${channel.toUpperCase()}!\`);\n  };`,
  `  // ${marker}\n  const normalizePhoneForContactLink = (phone: string) => {\n    const digits = String(phone || '').replace(/\\D/g, '');\n    if (!digits) return '';\n    if (digits.startsWith('84')) return digits;\n    if (digits.startsWith('0')) return '84' + digits.slice(1);\n    return digits;\n  };\n\n  const handleSendNotification = async (channel: 'sms' | 'zalo', textMessage: string) => {\n    if (!selectedStudent) return;\n    const message = textMessage.trim();\n    if (!message) {\n      alert('Nội dung nhắn không được trống!');\n      return;\n    }\n\n    setIsSendingNotif(true);\n    try {\n      try {\n        await navigator.clipboard?.writeText(message);\n      } catch {\n        console.warn('Không copy được nội dung vào clipboard, vẫn ghi log và mở kênh liên hệ.');\n      }\n\n      const phoneForLink = normalizePhoneForContactLink(selectedStudent.phone);\n      if (channel === 'zalo') {\n        const zaloUrl = phoneForLink ? \`https://zalo.me/\${phoneForLink}\` : 'https://zalo.me';\n        window.open(zaloUrl, '_blank', 'noopener,noreferrer');\n      } else {\n        const smsUrl = \`sms:\${selectedStudent.phone}?&body=\${encodeURIComponent(message)}\`;\n        window.location.href = smsUrl;\n      }\n\n      const existingStr = localStorage.getItem('lhp_sent_notifications') || '[]';\n      let existing: any[] = [];\n      try {\n        existing = JSON.parse(existingStr);\n      } catch {\n        existing = [];\n      }\n\n      const newLog = {\n        id: \`notif_\${Date.now()}_\${Math.random().toString(36).substring(2, 6)}\`,\n        studentId: selectedStudent.id,\n        channel,\n        text: message,\n        sentAt: new Date().toISOString(),\n        mode: 'semi-auto',\n        status: channel === 'zalo' ? 'Đã copy nội dung và mở Zalo' : 'Đã mở SMS nháp'\n      };\n      existing.unshift(newLog);\n      localStorage.setItem('lhp_sent_notifications', JSON.stringify(existing));\n\n      await updateStudent(selectedStudent.id, { reminderStatus: 'Đã nhắc' });\n      await addAuditLog(\n        \`Nhắc học viên bán tự động qua \${channel.toUpperCase()}\`,\n        \`Đã tạo mẫu nhắc, copy nội dung và mở \${channel === 'sms' ? 'SMS' : 'Zalo'} cho HV \${selectedStudent.name} (\${selectedStudent.phone}): "\${message}"\`\n      );\n\n      setNotifTriggerCount(prev => prev + 1);\n      await window.__lhpAlert?.({\n        title: 'Hoàn tất',\n        message: channel === 'zalo'\n          ? \`Đã copy mẫu nhắc và mở Zalo học viên: \${selectedStudent.name} (\${selectedStudent.phone}). Anh dán nội dung rồi bấm gửi tay.\`\n          : \`Đã mở SMS nháp cho học viên: \${selectedStudent.name} (\${selectedStudent.phone}). Anh kiểm tra rồi bấm gửi tay.\`,\n        tone: 'success'\n      });\n    } catch (err: any) {\n      alert(err?.message || 'Không tạo được mẫu nhắc học viên.');\n    } finally {\n      setIsSendingNotif(false);\n    }\n  };`,
  'handleSendNotification'
);

const needsReminderBlock = `\n  const studentNeedsReminder = (s: Student) => {\n    const neverReminded = (s.reminderStatus || 'Chưa nhắc') === 'Chưa nhắc';\n    const isNewLead = s.status === 'Danh sách chờ' || s.status === 'Mới đăng ký';\n    const hasDebt = Number(s.remainingAmount || 0) > 0;\n    const noRecentLog = getNotificationHistory(s.id).length === 0;\n    return neverReminded || isNewLead || hasDebt || noRecentLog;\n  };\n`;
src = src.replace(
  "  // Filter students\n  const filteredStudents = students.filter(s => {",
  needsReminderBlock + "\n  // Filter students\n  const filteredStudents = students.filter(s => {"
);

src = src.replace(
  "    // Inactive (No completed lessons in past 7 days)",
  "    // Reminder filter\n    const matchNeedsReminder = !filterNeedsReminder || studentNeedsReminder(s);\n\n    // Inactive (No completed lessons in past 7 days)"
);

src = src.replace(
  "    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;",
  "    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchNeedsReminder && matchInactive && matchTag && matchArchived;"
);

src = src.replace(
  `          <label className="flex items-center gap-1.5 cursor-pointer">\n            <input\n              type="checkbox"\n              checked={filterInactiveOnly}\n              onChange={(e) => setFilterInactiveOnly(e.target.checked)}\n              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"\n            />\n            <span>Dừng học &gt; 7 ngày</span>\n          </label>`,
  `          <label className="flex items-center gap-1.5 cursor-pointer">\n            <input\n              type="checkbox"\n              checked={filterNeedsReminder}\n              onChange={(e) => setFilterNeedsReminder(e.target.checked)}\n              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"\n            />\n            <span>Cần nhắc</span>\n          </label>\n\n          <label className="flex items-center gap-1.5 cursor-pointer">\n            <input\n              type="checkbox"\n              checked={filterInactiveOnly}\n              onChange={(e) => setFilterInactiveOnly(e.target.checked)}\n              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"\n            />\n            <span>Dừng học &gt; 7 ngày</span>\n          </label>`
);

src = src.replace("triggerInitTextForModal('sched', s.id);", "triggerInitTextForModal('enroll', s.id);");
src = src.replace("<span>SMS / Zalo</span>", "<span>Nhắc tin</span>");
src = src.replace("{ id: 'notif', label: 'Gửi SMS / Zalo ✨' }", "{ id: 'notif', label: 'Nhắc học viên ✨' }");
src = src.replace("{/* TAB 6: GỬI THÔNG BÁO SMS / ZALO */}", "{/* TAB 6: NHẮC HỌC VIÊN BÁN TỰ ĐỘNG */}");
src = src.replace("Bộ truyền thông báo tích hợp", "Module nhắc học viên bán tự động");
src = src.replace("Tự động hóa thông tin lịch huấn luyện hoặc dư nợ học vị thông qua hạ tầng SMS Brandname & Zalo ZNS.", "Tạo mẫu tin, copy nội dung, mở Zalo/SMS để anh gửi tay và ghi log đã nhắc.");
src = src.replace("● active Gateway", "● bán tự động");
src = src.replace("Kênh truyền tải sóng", "Kênh liên hệ");
src = src.replace("Zalo Notification (ZNS)", "Zalo cá nhân");
src = src.replace("SMS Brandname API", "SMS thường");
src = src.replace("Chọn kịch bản mẫu", "Chọn mẫu nhắc");
src = src.replace("<option value=\"sched\">📅 Xác nhận lịch đặt thực hành mới</option>", "<option value=\"enroll\">🚀 Giục nhập học / hoàn thiện hồ sơ</option>\n                          <option value=\"sched\">📅 Xác nhận lịch học</option>");
src = src.replace("<option value=\"remind\">🔔 Nhắc lịch hẹn ngày mai (Auto-DAT)</option>", "<option value=\"remind\">🔔 Nhắc lịch học sắp tới</option>");
src = src.replace("<option value=\"payment\">💳 Nhắc học phí dư nợ cuối khóa</option>", "<option value=\"payment\">💳 Nhắc học phí / công nợ</option>\n                          <option value=\"exam\">🏁 Nhắc ôn thi / xe chip</option>\n                          <option value=\"dat\">🛣️ Nhắc DAT / tiến độ điều kiện</option>\n                          <option value=\"document\">📁 Nhắc bổ sung hồ sơ</option>");
src = src.replace("Đang gửi thông điệp...", "Đang chuẩn bị mẫu nhắc...");
src = src.replace("Gửi thông báo ngay (Tự động hóa)", "Copy & mở kênh gửi tay");
src = src.replace("Zalo Business (ZNS)", "Zalo học viên");
src = src.replace("✓ Doanh Nghiệp Đã Xác Minh", "Copy nội dung rồi gửi tay");
src = src.replace("LICH HOC PRO", "SMS học viên");
src = src.replace("● SMS Brandname", "Tin nhắn thường");
src = src.replace("Active", "Manual");
src = src.replace("✉ Tin nhắn ZNS Hệ thống", "✉ Mẫu tin Zalo bán tự động");
src = src.replace("✓ Đã gửi", "✓ Chờ anh gửi");
src = src.replace("Vừa xong • Tin nhắn Brandname", "Vừa xong • SMS nháp");
src = src.replace("Sổ ký gửi & Lịch sử truyền thông điệp của học viên", "Lịch sử nhắc học viên");
src = src.replace("Học viên chưa từng nhận thông báo SMS hoặc Zalo nào từ hệ thống.", "Chưa có log nhắc học viên nào.");
src = src.replace("Đã Nhận", "Đã ghi log");

fs.writeFileSync(file, src);
console.log('[patch-semi-auto-student-reminders] patched semi-auto reminder module');
