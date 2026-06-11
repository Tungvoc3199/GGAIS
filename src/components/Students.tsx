/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { useDatabase } from '../context/DatabaseContext';
import { Student, StudentStatus, Lesson, Payment } from '../types';
import { exportStudentsToExcel, printStudentsPDF, printStudentContractPDF } from '../utils/exportUtils';
import { getLocalTodayString, getLocalOffsetString } from '../utils/dateUtils';
import { uploadStudentDocument } from '../services/storageService';
import {
  Search,
  Filter,
  User,
  Phone,
  Calendar,
  DollarSign,
  Briefcase,
  AlertCircle,
  Plus,
  Trash2,
  X,
  CreditCard,
  FileText,
  UserCheck,
  CheckCircle,
  PhoneCall,
  Clock,
  Download,
  Printer,
  Send,
  MessageSquare
} from 'lucide-react';

interface StudentsProps {
  quickFormOpen: boolean;
  onCloseQuickForm: () => void;
  quickFormType: 'student' | 'schedule' | 'payment' | null;
  globalSelectedStudentId?: string | null;
  onClearGlobalSelectedStudentId?: () => void;
}

const AVAILABLE_TAGS = ['Đang ôn thi', 'Mới nhập môn', 'Cần phụ đạo', 'Yếu lý thuyết', 'Lái yếu'];

export const Students: React.FC<StudentsProps> = ({
  quickFormOpen,
  onCloseQuickForm,
  quickFormType,
  globalSelectedStudentId,
  onClearGlobalSelectedStudentId
}) => {
  const {
    currentUser,
    students,
    instructors,
    vehicles,
    lessons,
    payments,
    settings,
    addStudent,
    updateStudent,
    deleteStudent,
    archiveStudent,
    addPayment,
    addAuditLog,
    authFetch,
    isFirebase
  } = useDatabase();

  // Search & Filtering States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterInstructor, setFilterInstructor] = useState<string>('all');
  const [filterDebtOnly, setFilterDebtOnly] = useState(false);
  const [filterInactiveOnly, setFilterInactiveOnly] = useState(false);
  const [filterTag, setFilterTag] = useState<string>('all');

  // Detail View State
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'progress' | 'schedule' | 'fee' | 'notes' | 'notif'>('info');

  // Search & Filtering extra states
  const [showArchived, setShowArchived] = useState(false);

  // Student Edit States
  const [isEditingStudent, setIsEditingStudent] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Student>>({});
  const [isSavingStudent, setIsSavingStudent] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccessMsg, setEditSuccessMsg] = useState<string | null>(null);

  // Student Delete States
  const [deleteTargetStudent, setDeleteTargetStudent] = useState<Student | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeletingStudent, setIsDeletingStudent] = useState(false);
  const [deleteSuccessMsg, setDeleteSuccessMsg] = useState<string | null>(null);

  const openEditStudent = () => {
    if (!selectedStudent) return;
    setEditForm({
      name: selectedStudent.name,
      phone: selectedStudent.phone,
      dob: selectedStudent.dob,
      address: selectedStudent.address,
      licenseClass: selectedStudent.licenseClass,
      courseType: selectedStudent.courseType,
      totalFee: selectedStudent.totalFee,
      totalSessions: selectedStudent.totalSessions,
      nextPaymentDeadline: selectedStudent.nextPaymentDeadline,
      status: selectedStudent.status,
      assignedInstructorId: selectedStudent.assignedInstructorId,
      assignedVehicleId: selectedStudent.assignedVehicleId,
      notes: selectedStudent.notes
    });
    setEditError(null);
    setEditSuccessMsg(null);
    setIsEditingStudent(true);
  };

  const handleSaveStudent = async () => {
    if (!selectedStudent) return;
    setEditError(null);
    setEditSuccessMsg(null);

    // Validate
    if (!editForm.name || !editForm.name.trim()) {
      setEditError('Họ và tên không được để trống.');
      return;
    }
    if (!editForm.phone || !editForm.phone.trim()) {
      setEditError('Số điện thoại không được để trống.');
      return;
    }
    const feeVal = Number(editForm.totalFee);
    if (isNaN(feeVal) || feeVal < 0) {
      setEditError('Tổng học phí phải lớn hơn hoặc bằng 0.');
      return;
    }
    const sessionsVal = Number(editForm.totalSessions);
    if (isNaN(sessionsVal) || sessionsVal < (selectedStudent.completedSessions || 0)) {
      setEditError(`Tổng số buổi học không được nhỏ hơn số buổi đã hoàn thành (${selectedStudent.completedSessions || 0}).`);
      return;
    }

    setIsSavingStudent(true);
    try {
      const res = await updateStudent(selectedStudent.id, {
        name: editForm.name.trim(),
        phone: editForm.phone.trim(),
        dob: editForm.dob || '',
        address: editForm.address || '',
        licenseClass: editForm.licenseClass || '',
        courseType: editForm.courseType || '',
        totalFee: feeVal,
        totalSessions: sessionsVal,
        nextPaymentDeadline: editForm.nextPaymentDeadline || '',
        status: editForm.status as any || 'Mới đăng ký',
        assignedInstructorId: editForm.assignedInstructorId || '',
        assignedVehicleId: editForm.assignedVehicleId || '',
        notes: editForm.notes || ''
      });

      if (res && res.success) {
        setIsEditingStudent(false);
        setDeleteSuccessMsg('Cập nhật hồ sơ học viên thành công!');
        setTimeout(() => setDeleteSuccessMsg(null), 3500);
      } else {
        setEditError(res?.error || 'Có lỗi xảy ra khi cập nhật hồ sơ.');
      }
    } catch (err: any) {
      console.error('Lỗi khi lưu học viên:', err);
      setEditError(err.message || String(err));
    } finally {
      setIsSavingStudent(false);
    }
  };

  const handleDeleteStudent = async () => {
    if (!deleteTargetStudent) return;
    setDeleteError('');
    if (deleteConfirmText !== 'XOA') {
      setDeleteError('Vui lòng nhập đúng chữ XOA để xác nhận.');
      return;
    }

    setIsDeletingStudent(true);
    try {
      const res = await deleteStudent(deleteTargetStudent.id);
      if (res && res.success) {
        setDeleteTargetStudent(null);
        setSelectedStudentId(null);
        setDeleteSuccessMsg('Đã xóa học viên thành công!');
        setTimeout(() => setDeleteSuccessMsg(null), 3500);
      } else {
        setDeleteError(res?.error || 'Có lỗi xảy ra trong quá trình xóa.');
      }
    } catch (err: any) {
      console.error('Lỗi khi xóa học viên:', err);
      setDeleteError(err.message || String(err));
    } finally {
      setIsDeletingStudent(false);
    }
  };

  // Listen to Global Student focus request
  useEffect(() => {
    if (globalSelectedStudentId) {
      setSelectedStudentId(globalSelectedStudentId);
      setActiveTab('info');
      if (onClearGlobalSelectedStudentId) {
        onClearGlobalSelectedStudentId();
      }
    }
  }, [globalSelectedStudentId, onClearGlobalSelectedStudentId]);

  // Notification States
  const [selectedNotifChannel, setSelectedNotifChannel] = useState<'zalo' | 'sms'>('zalo');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('sched');
  const [customNotifMessage, setCustomNotifMessage] = useState<string>('');
  const [isSendingNotif, setIsSendingNotif] = useState<boolean>(false);
  const [notifTriggerCount, setNotifTriggerCount] = useState<number>(0);

  // New Student State
  const [isAdding, setIsAdding] = useState(false);
  const [isWaitlist, setIsWaitlist] = useState(false);
  const [isCreatingStudent, setIsCreatingStudent] = useState(false);

  useEffect(() => {
    if (quickFormOpen && quickFormType === 'student') {
      setIsAdding(true);
      if (onCloseQuickForm) {
        onCloseQuickForm();
      }
    }
  }, [quickFormOpen, quickFormType, onCloseQuickForm]);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDob, setNewDob] = useState('1998-01-01');
  const [newAddress, setNewAddress] = useState('');
  const [newLicenseClass, setNewLicenseClass] = useState<'A1' | 'A' | 'B số tự động' | 'B số sàn' | 'C1'>('B số tự động');
  const [newCourseType, setNewCourseType] = useState('Trọn gói hạng B1');
  const [newTotalFee, setNewTotalFee] = useState(15000000);
  const [newTotalSessions, setNewTotalSessions] = useState(14);
  const [newInstructorId, setNewInstructorId] = useState('inst_2');
  const [newVehicleId, setNewVehicleId] = useState('veh_1');
  const [newNotes, setNewNotes] = useState('');
  const [newTags, setNewTags] = useState<string[]>([]);

  // State hooks for identity document upload & smart OCR auto fill
  const [cccdImage, setCccdImage] = useState<string>('');
  const [avatarImage, setAvatarImage] = useState<string>('');
  const [eidImage, setEidImage] = useState<string>('');
  const [cccdFile, setCccdFile] = useState<File | null>(null);
  const [eidFile, setEidFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState<boolean>(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);

  // Local Note Adding
  const [tempNote, setTempNote] = useState('');
  const [editingNoteStudentId, setEditingNoteStudentId] = useState<string | null>(null);
  const [quickNoteValue, setQuickNoteValue] = useState<string>('');

  const handleSaveQuickNote = async (studentId: string, value: string) => {
    updateStudent(studentId, { notes: value });
    setEditingNoteStudentId(null);
    setQuickNoteValue('');
    if (addAuditLog) {
      await addAuditLog(
        'Ghi chú nhanh học viên',
        `Cập nhật ghi chú nhanh / nhận xét điểm yếu cho học viên ID ${studentId}`
      );
    }
  };

  // Local Quick payment trigger from study detail
  const [quickPayAmount, setQuickPayAmount] = useState(0);
  const [quickPayMethod, setQuickPayMethod] = useState<'Tiền mặt' | 'Chuyển khoản' | 'Khác'>('Chuyển khoản');
  const [quickPayCat, setQuickPayCat] = useState<'Đợt 1' | 'Đợt 2' | 'Đợt 3' | 'Thanh toán bổ sung'>('Đợt 2');

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  // Reminders / automatic templates helpers
  const getNextLessonForStudent = (sId: string): Lesson | undefined => {
    const studentLessons = lessons.filter(l => l.studentId === sId);
    if (studentLessons.length === 0) return undefined;
    const todayStr = getLocalTodayString();
    // first upcoming sorted asc
    const upcoming = studentLessons.filter(l => l.date >= todayStr);
    if (upcoming.length > 0) {
      return [...upcoming].sort((a, b) => a.date.localeCompare(b.date))[0];
    }
    // fallback to most recent past lesson
    return [...studentLessons].sort((a, b) => b.date.localeCompare(a.date))[0];
  };

  const getInterpolatedTemplate = (templateId: string, studentId: string): string => {
    const s = students.find(item => item.id === studentId);
    if (!s) return '';
    const nextL = getNextLessonForStudent(studentId);
    const inst = instructors.find(i => i.id === s.assignedInstructorId);
    const veh = vehicles.find(v => v.id === s.assignedVehicleId);

    let lessonDateStr = 'Chưa xếp lịch học';
    let lessonTimeStr = 'Chưa xếp giờ';
    if (nextL) {
      const parts = nextL.date.split('-');
      lessonDateStr = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : nextL.date;
      lessonTimeStr = `${nextL.startTime} - ${nextL.endTime}`;
    }

    const templateTexts: Record<string, string> = {
      sched: `[LỊCH HỌC PRO] Chào anh/chị {TenHocVien}, trung tâm thông báo: Bạn đã được xếp lịch thực hành {LoaiBang} vào ngày {NgayHoc} lúc {GioHoc}. GV phụ trách: Thầy {GiaoVien} (SĐT: {GiaoVienSDT}). Điểm tập & đón: {DiemDon}. Xe tập: {XeTap}. Thân chúc bạn học tập kết quả tốt!`,
      remind: `[LỊCH HỌC PRO] Nhắc nhở anh/chị {TenHocVien}: Bạn có lịch hẹn tập lái xe thực hành vào lúc {GioHoc} ngày mai ({NgayHoc}). Vui lòng có mặt đúng giờ tại {DiemDon}. Thầy {GiaoVien} liên hệ: {GiaoVienSDT}.`,
      payment: `[LỊCH HỌC PRO] Kính gửi {TenHocVien} ({MaHocVien}) lớp {MonHoc}. Bộ phận giáo vụ đối soát học phí hiện tại: Số học phí còn dư nợ: {HocPhiNo} đ. Đề nghị bạn hoàn tất trước hạn chót {HanNop} để được tiếp nhận hồ sơ thi sát hạch.`
    };

    const text = templateTexts[templateId] || '';
    return text
      .replace(/{TenHocVien}/g, s.name)
      .replace(/{MaHocVien}/g, s.code)
      .replace(/{LoaiBang}/g, s.licenseClass)
      .replace(/{MonHoc}/g, s.courseType)
      .replace(/{NgayHoc}/g, lessonDateStr)
      .replace(/{GioHoc}/g, lessonTimeStr)
      .replace(/{GiaoVien}/g, inst ? inst.name : 'Chưa phân bổ')
      .replace(/{GiaoVienSDT}/g, inst ? inst.phone : 'N/A')
      .replace(/{DiemDon}/g, nextL ? nextL.pickupLocation : 'Địa điểm tập chỉ định')
      .replace(/{XeTap}/g, veh ? `${veh.name} [${veh.plate}]` : 'Chưa phân bổ xe')
      .replace(/{HocPhiNo}/g, s.remainingAmount.toLocaleString('vi-VN'))
      .replace(/{HanNop}/g, s.nextPaymentDeadline ? s.nextPaymentDeadline.split('-').reverse().join('/') : '30/06/2026');
  };

  const getNotificationHistory = (sId: string) => {
    const existingStr = localStorage.getItem('lhp_sent_notifications');
    if (!existingStr) return [];
    try {
      const parsed = JSON.parse(existingStr);
      return Array.isArray(parsed) ? parsed.filter(item => item.studentId === sId) : [];
    } catch {
      return [];
    }
  };

  const triggerInitTextForModal = (templateId: string, sId: string) => {
    const text = getInterpolatedTemplate(templateId, sId);
    setCustomNotifMessage(text);
  };

  // Filter students
  const filteredStudents = students.filter(s => {
    // Search
    const matchSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm);

    // License Class
    const matchClass = filterClass === 'all' || s.licenseClass === filterClass;

    // Status
    const matchStatus = filterStatus === 'all' || s.status === filterStatus;

    // Instructor
    const matchInst = filterInstructor === 'all' || s.assignedInstructorId === filterInstructor;

    // Debt
    const matchDebt = !filterDebtOnly || s.remainingAmount > 0;

    // Inactive (No completed lessons in past 7 days)
    let matchInactive = true;
    if (filterInactiveOnly) {
      const getTodayString = () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const TODAY = getTodayString();
      const studentLessons = lessons.filter(l => l.studentId === s.id && l.status === 'Đã hoàn thành');
      if (studentLessons.length === 0) {
        matchInactive = true;
      } else {
        const lastDateStr = studentLessons.reduce((latest, l) => l.date > latest ? l.date : latest, '1970-01-01');
        const diffMs = new Date(TODAY).getTime() - new Date(lastDateStr).getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        matchInactive = diffDays >= 7;
      }
    }

    // Tag filter
    const matchTag = filterTag === 'all' || (s.tags && s.tags.includes(filterTag));

    // Archiving filter: Hide if showArchived is false and isArchived is true.
    const matchArchived = showArchived ? true : !s.isArchived;

    return matchSearch && matchClass && matchStatus && matchInst && matchDebt && matchInactive && matchTag && matchArchived;
  });

  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>, cardType: 'cccd' | 'avatar' | 'eid') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = async () => {
      const base64Str = reader.result as string;
      if (cardType === 'cccd') {
        setCccdImage(base64Str);
        setCccdFile(file);
      } else if (cardType === 'avatar') {
        setAvatarImage(base64Str);
        setAvatarFile(file);
      } else if (cardType === 'eid') {
        setEidImage(base64Str);
        setEidFile(file);
      }

      // Automatically trigger OCR for CCCD or EID (electronic card) to read name, dob, and address
      if (cardType === 'cccd' || cardType === 'eid') {
        if (!isFirebase) {
          alert('Đã đính kèm ảnh trong chế độ demo offline. OCR tự động chỉ hoạt động khi đăng nhập Cloud.');
          return;
        }
        setIsOcrLoading(true);
        try {
          const typeLabel = cardType === 'cccd' ? 'Căn Cước Công Dân' : 'Căn cước điện tử VNeID';
          const result = await authFetch('/api/ocr-card', {
            method: 'POST',
            body: JSON.stringify({ image: base64Str, cardType: typeLabel }),
          });
          if (result.success && result.data) {
            const { fullName, address, dob } = result.data;
            if (fullName) {
              setNewName(fullName);
            }
            if (address) {
              setNewAddress(address);
            }
            if (dob) {
              setNewDob(dob);
            }
            alert(`🔍 HỆ THỐNG AI ĐÃ TỰ ĐỘNG QUÉT THẺ THÀNH CÔNG:\n- Họ tên: ${fullName || 'Chưa nhận dạng được'}\n- Ngày sinh: ${dob || 'Chưa nhận dạng được'}\n- Địa chỉ: ${address || 'Chưa nhận dạng được'}`);
          } else {
            console.warn('OCR error response: ', result.error);
            alert(`Lỗi phân tích thẻ từ Gemini: ${result.error || 'Vui lòng điền thông tin học viên bằng tay.'}`);
          }
        } catch (err: any) {
          console.error('OCR API call failed: ', err);
          alert('Không thể kết nối đến máy chủ nhận dạng AI. Thầy vui lòng điền tay các thông tin.');
        } finally {
          setIsOcrLoading(false);
        }
      } else {
        // Just uploaded avatar picture - notify student photo is attached
        alert('Đã đính kèm ảnh thẻ/ảnh chân dung thành công vào hồ sơ học viên!');
      }
    };
    reader.onerror = () => {
      alert('Không thể đọc file hình ảnh.');
    };
    reader.readAsDataURL(file);
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPhone) {
      alert('Vui lòng nhập tên và số điện thoại học viên.');
      return;
    }

    // Phone format check
    const vnPhoneRegex = /(03|05|07|08|09|01[2|6|8|9])+([0-9]{8})\b/;
    if (!vnPhoneRegex.test(newPhone)) {
      alert('Số điện thoại không hợp lệ. Vui lòng nhập định dạng số điện thoại Việt Nam (e.g. 0912345678).');
      return;
    }

    if (newTotalFee <= 0 || newTotalSessions <= 0) {
      alert('Học phí và số buổi học phải lớn hơn 0.');
      return;
    }

    setIsCreatingStudent(true);
    try {
      const studentId = `stud_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      let finalCccdImage = isFirebase ? '' : cccdImage;
      let finalEidImage = isFirebase ? '' : eidImage;
      let finalAvatarImage = isFirebase ? '' : avatarImage;

      if (isFirebase) {
        try {
          if (cccdFile) {
            finalCccdImage = await uploadStudentDocument(studentId, 'cccd', cccdFile);
          }
          if (eidFile) {
            finalEidImage = await uploadStudentDocument(studentId, 'eid', eidFile);
          }
          if (avatarFile) {
            finalAvatarImage = await uploadStudentDocument(studentId, 'avatar', avatarFile);
          }
        } catch (uploadErr: any) {
          console.error('Lỗi tải file lên Firebase Storage:', uploadErr);
          alert(`Tải tài liệu học viên lên Cloud thất bại: ${uploadErr.message || String(uploadErr)}. Vui lòng thử lại.`);
          setIsCreatingStudent(false);
          return;
        }
      }

      await addStudent({
        id: studentId,
        name: newName.trim(),
        phone: newPhone.trim(),
        dob: newDob,
        address: newAddress.trim(),
        licenseClass: newLicenseClass,
        courseType: newCourseType,
        totalFee: newTotalFee,
        registrationDate: getLocalTodayString(),
        nextPaymentDeadline: getLocalOffsetString(15),
        status: isWaitlist ? 'Danh sách chờ' : 'Mới đăng ký',
        totalSessions: newTotalSessions,
        assignedInstructorId: newInstructorId,
        assignedVehicleId: newVehicleId,
        notes: newNotes,
        reminderStatus: 'Chưa nhắc',
        tags: newTags,
        cccdImage: finalCccdImage,
        avatarImage: finalAvatarImage,
        eidImage: finalEidImage
      });

      alert('Đăng ký tuyển sinh học viên thành công!');

      // Reset Form (Only on safe success)
      setNewName('');
      setNewPhone('');
      setNewAddress('');
      setNewNotes('');
      setNewTags([]);
      setIsWaitlist(false);
      setIsAdding(false);
      setCccdImage('');
      setAvatarImage('');
      setEidImage('');
      setCccdFile(null);
      setEidFile(null);
      setAvatarFile(null);
    } catch (err: any) {
      console.error('Đăng ký học viên thất bại:', err);
      alert(`Đăng ký học viên thất bại: ${err.message || String(err)}. Vui lòng thử lại.`);
    } finally {
      setIsCreatingStudent(false);
    }
  };

  const handleSaveNote = () => {
    if (!selectedStudentId || !tempNote) return;
    const currentNotes = selectedStudent?.notes || '';
    const dateFormatted = new Date().toLocaleDateString('vi-VN');
    const author = currentUser?.displayName || 'Cán bộ';
    const updatedNotes = `${currentNotes}\n[${dateFormatted} - ${author}]: ${tempNote}`;
    updateStudent(selectedStudentId, { notes: updatedNotes });
    setTempNote('');
    alert('Đã cập nhật ghi chú học viên thành công.');
  };

  const handleQuickPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudent) return;
    if (quickPayAmount <= 0) {
      alert('Vui lòng nhập số tiền thanh toán thực tế.');
      return;
    }

    if (quickPayAmount > selectedStudent.remainingAmount) {
      const confirmOverpay = window.confirm(
        `Số tiền đóng (${quickPayAmount.toLocaleString('vi-VN')} ₫) lớn hơn số nợ còn lại (${selectedStudent.remainingAmount.toLocaleString('vi-VN')} ₫). Bạn có chắc chắn học viên muốn đóng thừa tiền?`
      );
      if (!confirmOverpay) return;
    }

    const res = await addPayment({
      studentId: selectedStudent.id,
      paymentDate: getLocalTodayString(),
      amount: quickPayAmount,
      method: quickPayMethod,
      category: quickPayCat,
      receiver: currentUser?.displayName || 'Thu ngân tự động',
      notes: `Thu nhanh từ bảng học viên: ${quickPayCat}`,
      status: 'Chờ duyệt' // Staff adds, will be 'Chờ duyệt'. Admin will automatically approve/pre-approve if allowed.
    });

    if (res.success) {
      setQuickPayAmount(0);
      alert('Gửi yêu cầu thu nợ học phí thành công! Biên lai đã được chuyển tới bộ phận kế toán.');
    } else {
      alert(res.error || 'Có lỗi phát sinh trong quá trình thanh toán.');
    }
  };

  const handleSendNotification = async (channel: 'sms' | 'zalo', textMessage: string) => {
    if (!selectedStudent) return;
    if (!textMessage.trim()) {
      alert('Nội dung nhắn không được trống!');
      return;
    }

    setIsSendingNotif(true);
    // Simulate high speed network delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Save history log locally
    const existingStr = localStorage.getItem('lhp_sent_notifications') || '[]';
    let existing = [];
    try {
      existing = JSON.parse(existingStr);
    } catch {
      existing = [];
    }

    const newLog = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      studentId: selectedStudent.id,
      channel,
      text: textMessage,
      sentAt: new Date().toISOString()
    };
    existing.unshift(newLog);
    localStorage.setItem('lhp_sent_notifications', JSON.stringify(existing));

    // Push into system internal AuditLogs so "Lịch sử" is globally persisted and visible in audit tabs!
    await addAuditLog(
      `Gửi thông báo ${channel.toUpperCase()}`,
      `Gửi tự động qua ${channel === 'sms' ? 'SMS Brandname' : 'Zalo ZNS Doanh Nghiệp'} cho HV ${selectedStudent.name} (${selectedStudent.phone}): "${textMessage}"`
    );

    setIsSendingNotif(false);
    setNotifTriggerCount(prev => prev + 1);
    alert(`Đã truyền tải thông báo thành công cho học viên qua ${channel.toUpperCase()}!`);
  };

  const setReminderText = (statusRem: 'Chưa nhắc' | 'Đã nhắc' | 'Đã hẹn ngày thanh toán') => {
    if (!selectedStudentId) return;
    updateStudent(selectedStudentId, { reminderStatus: statusRem });
  };

  return (
    <div className="font-sans py-4 px-2 max-w-7xl mx-auto space-y-5">
      
      {/* Top action section */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">SỔ QUẢN LÝ HỌC VIÊN</h1>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-1">
            Tổng cộng: <strong className="text-slate-800">{filteredStudents.length}</strong> học viên phù hợp bộ lọc
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Export Excel Button */}
          <button
            onClick={() => exportStudentsToExcel(filteredStudents, instructors, vehicles)}
            className="bg-emerald-600 hover:bg-emerald-700 font-bold text-xs text-white px-4 py-3 rounded-2xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all text-center self-start sm:self-auto uppercase"
            title="Xuất bảng tính Excel học viên hiện tại"
          >
            <Download className="h-4 w-4" />
            <span>Xuất Excel</span>
          </button>

          {/* Export PDF Button */}
          <button
            onClick={() => printStudentsPDF(filteredStudents, instructors, vehicles)}
            className="bg-slate-700 hover:bg-slate-800 font-bold text-xs text-white px-4 py-3 rounded-2xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all text-center self-start sm:self-auto uppercase"
            title="In sổ học viên ra khổ A4 / PDF"
          >
            <Printer className="h-4 w-4" />
            <span>In Báo Cáo</span>
          </button>

          <button
            onClick={() => setIsAdding(true)}
            className="bg-blue-600 hover:bg-blue-700 font-bold text-xs text-white px-4 py-3 rounded-2xl cursor-pointer shadow-sm flex items-center gap-1.5 transition-all self-start sm:self-auto uppercase"
          >
            <Plus className="h-4.5 w-4.5" />
            THÊM HỌC VIÊN MỚI
          </button>
        </div>
      </div>

      {/* Filters block */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {/* Search bar */}
          <div className="relative sm:col-span-2 md:col-span-2">
            <Search className="absolute left-3.5 top-3.5 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm theo Mã HV, Họ tên or Số điện thoại..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:bg-white transition-all text-slate-800 font-medium"
            />
          </div>

          {/* License Filter */}
          <div className="relative">
            <select
              value={filterClass}
              onChange={(e) => setFilterClass(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-sm focus:outline-none text-slate-700 font-bold appearance-none cursor-pointer"
            >
              <option value="all">🚙 Tất cả Hạng Bằng</option>
              <option value="A1">Hạng bằng A1</option>
              <option value="A">Hạng bằng A</option>
              <option value="B số tự động">Hạng bằng B Tự Động</option>
              <option value="B số sàn">Hạng bằng B Số Sàn</option>
              <option value="C1">Hạng bằng C (Xe Tải)</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-sm focus:outline-none text-slate-700 font-bold appearance-none cursor-pointer"
            >
              <option value="all">🚦 Tất cả Trạng Thái</option>
              {['Danh sách chờ', 'Mới đăng ký', 'Đang học', 'Tạm dừng', 'Đã hoàn thành', 'Đã thi'].map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>

          {/* Tag Filter */}
          <div className="relative">
            <select
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-3 px-4 text-sm focus:outline-none text-slate-700 font-bold appearance-none cursor-pointer"
            >
              <option value="all">🏷️ Tất cả Nhãn</option>
              {AVAILABLE_TAGS.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Extra check filters checklist */}
        <div className="flex flex-wrap items-center gap-5 pt-1.5 text-xs font-bold text-slate-600">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filterDebtOnly}
              onChange={(e) => setFilterDebtOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>Nợ học phí</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={filterInactiveOnly}
              onChange={(e) => setFilterInactiveOnly(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>Dừng học &gt; 7 ngày</span>
          </label>

          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
            />
            <span>Hiển thị học viên đã lưu trữ</span>
          </label>

          <div className="flex items-center gap-1.5 ml-auto text-[11px] text-slate-400 font-medium">
            <span>Dùng checkbox bộ chọn tối ưu</span>
          </div>
        </div>
      </div>

      {/* Main Students List Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredStudents.length === 0 ? (
          <div className="col-span-full bg-white rounded-3xl p-10 border border-slate-100 text-center text-slate-400 text-xs">
            Không tìm thấy học viên nào khớp các điều kiện tìm kiếm.
          </div>
        ) : (
          filteredStudents.map((s) => {
            let statusColor = 'bg-blue-50 text-blue-700 border-blue-100';
            if (s.status === 'Danh sách chờ') statusColor = 'bg-amber-100 text-amber-800 border-amber-200';
            if (s.status === 'Đang học') statusColor = 'bg-indigo-50 text-indigo-700 border-indigo-100';
            if (s.status === 'Đã hoàn thành') statusColor = 'bg-emerald-50 text-emerald-700 border-emerald-100';
            if (s.status === 'Đã thi') statusColor = 'bg-purple-100 text-purple-700 border-purple-200';
            if (s.status === 'Tạm dừng') statusColor = 'bg-slate-100 text-slate-700 border-slate-200';

            return (
              <div
                key={s.id}
                onClick={() => {
                  setSelectedStudentId(s.id);
                  setActiveTab('info');
                }}
                className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm hover:border-blue-200 hover:shadow-md cursor-pointer transition-all flex flex-col justify-between gap-3.5 group"
              >
                <div className="space-y-2">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-widest">{s.code}</span>
                    <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${statusColor}`}>
                      {s.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-black text-slate-800 group-hover:text-blue-600 transition-colors uppercase leading-tight">
                    {s.name}
                  </h3>

                  {s.tags && s.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.tags.map((tag) => (
                        <span key={tag} className="bg-slate-50 border border-slate-150 text-slate-500 font-extrabold px-1.5 py-0.5 rounded text-[9px] uppercase">
                          🏷️ {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-slate-500 font-bold">
                    <div className="flex items-center gap-1.5">
                      <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{s.phone}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>{s.courseType} ({s.licenseClass})</span>
                    </div>
                  </div>
                </div>

                {/* Ledger metrics inside card */}
                <div className="pt-3 border-t border-slate-50 grid grid-cols-2 gap-2 text-[11px] font-bold">
                  <div>
                    <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider">Đã Đóng</span>
                    <span className="text-slate-700">{s.paidAmount.toLocaleString('vi-VN')} ₫</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] font-semibold uppercase tracking-wider">Còn Nợ</span>
                    <span className={s.remainingAmount > 0 ? 'text-red-600 font-extrabold' : 'text-slate-500'}>
                      {s.remainingAmount.toLocaleString('vi-VN')} ₫
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-[10px] font-bold text-slate-400 flex justify-between">
                  <span>Đăng ký: {new Date(s.registrationDate).toLocaleDateString('vi-VN')}</span>
                  <span>Đạt lý thuyết</span>
                </div>

                {/* Quick notes segment */}
                <div 
                  className="pt-2 border-t border-slate-50 text-[11px] text-slate-500 font-bold"
                  onClick={(e) => e.stopPropagation()}
                >
                  {editingNoteStudentId === s.id ? (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-[9px] font-extrabold text-blue-600 uppercase tracking-wider">
                        <span>📝 Ghi chú nhanh học viên</span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSaveQuickNote(s.id, quickNoteValue)}
                            className="bg-emerald-550 text-white hover:bg-emerald-600 border border-emerald-600 px-2 py-0.5 rounded-md cursor-pointer select-none transition-all"
                          >
                            Lưu
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingNoteStudentId(null);
                              setQuickNoteValue('');
                            }}
                            className="bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200 px-2 py-0.5 rounded-md cursor-pointer select-none transition-all"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={quickNoteValue}
                        onChange={(e) => setQuickNoteValue(e.target.value)}
                        placeholder="Có điểm yếu gì cần chú ý, điều chỉnh buổi tới tuyển tập..."
                        className="w-full bg-slate-50 border border-slate-200 hover:border-slate-300 focus:border-blue-500 rounded-xl p-2 text-[11px] font-semibold text-slate-800 leading-normal resize-none focus:outline-hidden"
                        autoFocus
                      />
                    </div>
                  ) : (
                    <div 
                      onClick={() => {
                        setEditingNoteStudentId(s.id);
                        setQuickNoteValue(s.notes || '');
                      }}
                      className="group/note p-2 rounded-xl bg-slate-50/50 hover:bg-blue-50/40 border border-dashed border-slate-150 hover:border-blue-200 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center justify-between text-[9px] text-slate-400 font-extrabold uppercase tracking-wider mb-0.5 group-hover/note:text-blue-500 transition-colors">
                        <span>📝 Điểm yếu / Ghi chú buổi học:</span>
                        <span className="hidden group-hover/note:inline text-[8px] text-blue-600 uppercase">Chỉnh sửa ✎</span>
                      </div>
                      <p className="text-slate-700 text-[10.5px] font-medium leading-normal line-clamp-2">
                        {s.notes ? s.notes : (
                          <span className="text-slate-400 font-semibold italic">Chưa ghi nhận điểm yếu cần khắc phục. Ấn vào đây để viết nhanh...</span>
                        )}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-50 flex justify-between items-center text-[10px] font-extrabold text-slate-500">
                  <span>Tiến độ: {s.completedSessions}/{s.totalSessions} buổi</span>
                  
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedStudentId(s.id);
                      setActiveTab('notif');
                      triggerInitTextForModal('sched', s.id);
                    }}
                    className="bg-blue-50 hover:bg-blue-100 border border-blue-100 text-blue-700 px-2.5 py-1 rounded-lg flex items-center gap-1 cursor-pointer transition-all uppercase text-[8.5px] font-black select-none"
                  >
                    <MessageSquare className="h-3 w-3" />
                    <span>SMS / Zalo</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Slide Drawer/Modal for Student Detail */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex justify-end">
          <div className="bg-white w-full max-w-2xl h-full flex flex-col shadow-2xl animate-slide-left relative overflow-hidden">
            
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
              <div>
                <span className="text-[10px] font-bold text-slate-400 font-mono block tracking-widest">{selectedStudent.code}</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">{selectedStudent.name}</h2>
                  {selectedStudent.status === 'Danh sách chờ' && (
                    <span className="bg-amber-100 text-amber-700 font-extrabold text-[9px] px-2 py-0.5 rounded-md uppercase border border-amber-200">
                      Danh sách chờ
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(currentUser?.role === 'Admin' || currentUser?.role === 'Staff') && (
                  <button
                    type="button"
                    onClick={openEditStudent}
                    className="min-h-[44px] px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold cursor-pointer flex items-center gap-1 shadow-sm transition-all animate-fade-in"
                  >
                    <span>✎</span> Chỉnh sửa
                  </button>
                )}
                <button
                  onClick={() => setSelectedStudentId(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="h-5.5 w-5.5" />
                </button>
              </div>
            </div>

            {/* Navigation Tabs */}
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
                  className={`py-3.5 px-4 scroll-mx-4 shrink-0 border-b-2 font-black transition-all cursor-pointer ${activeTab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/10' : 'border-transparent hover:text-slate-800'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Convert waiting list banner */}
            {selectedStudent.status === 'Danh sách chờ' && (
              <div className="bg-amber-50 border-b border-amber-100 px-5 py-3.5 flex text-[11px] font-black items-center justify-between shadow-xs shrink-0 select-none animate-slide-left">
                <div className="flex items-center gap-1.5 text-amber-800 font-bold">
                  <span className="text-sm">⏱️</span>
                  <span>Học viên nằm trong Danh sách chờ. Chuyển sang chính thức khi nhận hồ sơ.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updateStudent(selectedStudent.id, { status: 'Mới đăng ký' });
                    if (addAuditLog) {
                      addAuditLog('Tuyển sinh chính thức', `Chuyển học viên ${selectedStudent.name} (${selectedStudent.code}) từ Danh sách chờ sang học viên chính thức.`);
                    }
                    alert(`Đã nhận học viên chính thức thành công cho: ${selectedStudent.name}!`);
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[10px] tracking-tight px-3 py-1.5 rounded-lg uppercase cursor-pointer shadow-xs transition-colors"
                >
                  Nhận học viên chính thức
                </button>
              </div>
            )}

            {/* Dynamic Content Panel */}
            <div className="p-5 pb-28 md:pb-5 overflow-y-auto flex-1 space-y-5 bg-slate-50/20">
              
              {/* TAB 1: THÔNG TIN CHI TIẾT */}
              {activeTab === 'info' && (
                <div className="space-y-4">

                  {/* Nhãn tiến độ quản lý */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3.5 shadow-xs animate-fade-in">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.55">
                        <span className="text-blue-600">🏷️</span> Nhãn quản lý tiến độ
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold normal-case">Nhấp để bật/tắt</span>
                    </h3>

                    <div className="flex flex-wrap gap-1.5">
                      {AVAILABLE_TAGS.map((tag) => {
                        const hasTag = selectedStudent.tags?.includes(tag);
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              const currentTags = selectedStudent.tags || [];
                              const updatedTags = hasTag
                                ? currentTags.filter((t) => t !== tag)
                                : [...currentTags, tag];
                              updateStudent(selectedStudent.id, { tags: updatedTags });
                              addAuditLog(
                                'Cập nhật nhãn',
                                `Chỉnh sửa nhãn cho học viên ${selectedStudent.name}: ${hasTag ? 'Gỡ bỏ' : 'Gán mới'} nhãn [${tag}]`
                              );
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black border transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                              hasTag
                                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                : 'bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-150'
                            }`}
                          >
                            <span>{hasTag ? '✓' : '+'}</span>
                            <span>{tag}</span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="pt-2 flex gap-2 items-center">
                      <input
                        type="text"
                        placeholder="Thêm nhãn tự chọn khác..."
                        id="custom-tag-input"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            const inputEls = document.getElementById('custom-tag-input') as HTMLInputElement;
                            const val = inputEls?.value?.trim();
                            if (val) {
                              const currentTags = selectedStudent.tags || [];
                              if (!currentTags.includes(val)) {
                                updateStudent(selectedStudent.id, { tags: [...currentTags, val] });
                                addAuditLog(
                                  'Cập nhật nhãn',
                                  `Gán nhãn tự chọn [${val}] cho học viên ${selectedStudent.name}`
                                );
                              }
                              inputEls.value = '';
                            }
                          }
                        }}
                        className="bg-slate-50 border border-slate-250 rounded-lg py-1 px-2.5 text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 w-44"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold italic">Ấn Enter để tạo</span>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3.5 shadow-xs">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-50 flex items-center gap-1.5">
                      <User className="h-4 w-4 text-blue-600" /> Hồ sơ gốc học viên
                    </h3>

                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-slate-400 block font-semibold">Họ và tên</span>
                        <strong className="text-slate-800 text-sm">{selectedStudent.name}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Điện thoại</span>
                        <strong className="text-slate-800">{selectedStudent.phone}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Ngày sinh</span>
                        <strong className="text-slate-700">{new Date(selectedStudent.dob).toLocaleDateString('vi-VN')}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Địa chỉ liên lạc</span>
                        <strong className="text-slate-700 leading-relaxed">{selectedStudent.address}</strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Hạng bằng đăng ký</span>
                        <span className="inline-block mt-0.5 bg-blue-50 border border-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded text-[10px]">
                          {selectedStudent.licenseClass}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Môn học/Khóa học</span>
                        <span className="text-slate-700 font-bold">{selectedStudent.courseType}</span>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-50 flex items-center justify-between">
                      <div className="text-[10px] text-slate-400 font-semibold italic">Tự động điền theo thông tin cơ bản</div>
                      <button
                        type="button"
                        onClick={() => {
                          const instName = instructors.find(i => i.id === selectedStudent.assignedInstructorId)?.name || '';
                          const vehicle = vehicles.find(v => v.id === selectedStudent.assignedVehicleId);
                          const vehName = vehicle ? `${vehicle.name} (${vehicle.plate})` : '';
                          printStudentContractPDF(selectedStudent, settings.schoolName || 'LỊCH HỌC PRO', instName, vehName);
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[10.5px] font-black py-2 px-3.5 rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5 transition-all select-none uppercase tracking-wide"
                        title="Tải xuống / in hợp đồng đào tạo lái xe tự động chuẩn A4"
                      >
                        <FileText className="h-4 w-4" />
                        <span>In Hợp Đồng (A4)</span>
                      </button>
                    </div>
                  </div>

                  {currentUser?.role === 'Admin' && (
                    <div className="bg-white p-5 rounded-2xl border border-slate-150 space-y-4 shadow-sm animate-fade-in text-xs">
                      <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-100 flex items-center gap-1.5">
                        <span>⚙️</span> THAO TÁC QUẢN TRỊ
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={async () => {
                            setIsSavingStudent(true);
                            const res = await archiveStudent(selectedStudent.id);
                            setIsSavingStudent(false);
                            if (res && res.success) {
                              setSelectedStudentId(null);
                              setDeleteSuccessMsg('Lưu trữ học viên và chuyển sang Tạm dừng thành công!');
                              setTimeout(() => setDeleteSuccessMsg(null), 3500);
                            } else {
                              alert(res && res.error ? res.error : 'Có lỗi phát sinh khi lưu trữ.');
                            }
                          }}
                          disabled={isSavingStudent}
                          className="min-h-[44px] cursor-pointer bg-slate-500 hover:bg-slate-650 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all w-full shadow-xs disabled:opacity-50"
                        >
                          <span>📦</span> {isSavingStudent ? 'Đang xử lý...' : 'Lưu trữ học viên'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTargetStudent(selectedStudent);
                            setDeleteConfirmText('');
                            setDeleteError('');
                          }}
                          className="min-h-[44px] cursor-pointer bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 transition-all w-full shadow-xs"
                        >
                          <span>🗑</span> Xóa vĩnh viễn
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Photocopies of Identification documents and interactive zoom preview */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3.5 shadow-xs animate-fade-in text-xs">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-800 block text-sm">📂</span> 
                        <span>Hồ sơ ảnh định danh học viên</span>
                      </div>
                      <span className="text-[9px] text-slate-400 font-bold italic normal-case">Nhấp ảnh để xem to phóng đại</span>
                    </h3>

                    <div className="grid grid-cols-3 gap-2.5 text-center font-bold">
                      {/* CCCD Group of selected Student */}
                      <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl flex flex-col justify-between items-center relative min-h-24">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Căn cước công dân</span>
                        {selectedStudent.cccdImage ? (
                          <div className="w-full flex-1 flex flex-col items-center justify-center">
                            <img
                              src={selectedStudent.cccdImage}
                              alt="Ảnh CCCD"
                              className="w-full h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 active:scale-95 transition-all shadow-3xs"
                              onClick={() => setPreviewImageUrl(selectedStudent.cccdImage!)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("Gỡ tài liệu ảnh chụp này khỏi hồ sơ học viên?")) {
                                  updateStudent(selectedStudent.id, { cccdImage: "" });
                                }
                              }}
                              className="text-[9px] text-red-500 hover:text-red-700 font-bold mt-1.5 cursor-pointer block uppercase tracking-tight"
                            >
                              Gỡ bỏ
                            </button>
                          </div>
                        ) : (
                          <label className="flex-1 flex flex-col items-center justify-center cursor-pointer p-1">
                            <span className="text-lg">🪪</span>
                            <span className="text-[9px] text-blue-600 hover:underline">Tải lên CCCD</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    updateStudent(selectedStudent.id, { cccdImage: reader.result as string });
                                    alert("Đã cập nhật ảnh CCCD thành công!");
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* Avatar Group of selected Student */}
                      <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl flex flex-col justify-between items-center relative min-h-24">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Ảnh chân dung</span>
                        {selectedStudent.avatarImage ? (
                          <div className="w-full flex-1 flex flex-col items-center justify-center">
                            <img
                              src={selectedStudent.avatarImage}
                              alt="Ảnh thẻ"
                              className="w-12 h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 active:scale-95 transition-all shadow-3xs"
                              onClick={() => setPreviewImageUrl(selectedStudent.avatarImage!)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("Gỡ ảnh chân dung thẻ này khỏi hồ sơ học viên?")) {
                                  updateStudent(selectedStudent.id, { avatarImage: "" });
                                }
                              }}
                              className="text-[9px] text-red-500 hover:text-red-700 font-bold mt-1.5 cursor-pointer block uppercase tracking-tight"
                            >
                              Gỡ bỏ
                            </button>
                          </div>
                        ) : (
                          <label className="flex-1 flex flex-col items-center justify-center cursor-pointer p-1">
                            <span className="text-lg">👤</span>
                            <span className="text-[9px] text-blue-600 hover:underline">Tải ảnh 3x4</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    updateStudent(selectedStudent.id, { avatarImage: reader.result as string });
                                    alert("Đã cập nhật ảnh thẻ thành công!");
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>

                      {/* VNeID Group of selected Student */}
                      <div className="border border-slate-100 bg-slate-50/50 p-2 rounded-xl flex flex-col justify-between items-center relative min-h-24">
                        <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Thẻ VNeID ĐT</span>
                        {selectedStudent.eidImage ? (
                          <div className="w-full flex-1 flex flex-col items-center justify-center">
                            <img
                              src={selectedStudent.eidImage}
                              alt="VNeID"
                              className="w-full h-12 object-cover rounded-lg border border-slate-200 cursor-zoom-in hover:opacity-90 active:scale-95 transition-all shadow-3xs"
                              onClick={() => setPreviewImageUrl(selectedStudent.eidImage!)}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm("Gỡ tài liệu ảnh chụp này khỏi hồ sơ học viên?")) {
                                  updateStudent(selectedStudent.id, { eidImage: "" });
                                }
                              }}
                              className="text-[9px] text-red-500 hover:text-red-700 font-bold mt-1.5 cursor-pointer block uppercase tracking-tight"
                            >
                              Gỡ bỏ
                            </button>
                          </div>
                        ) : (
                          <label className="flex-1 flex flex-col items-center justify-center cursor-pointer p-1">
                            <span className="text-lg">📱</span>
                            <span className="text-[9px] text-blue-600 hover:underline">Tải lên VNeID</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    updateStudent(selectedStudent.id, { eidImage: reader.result as string });
                                    alert("Đã cập nhật ảnh VNeID thành công!");
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3.5 shadow-xs">
                    <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider pb-2 border-b border-slate-50 flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4 text-blue-600" /> Biên chế đào tạo & Xe
                    </h3>

                    <div className="grid grid-cols-2 gap-4 text-xs font-medium">
                      <div>
                        <span className="text-slate-400 block font-semibold">Giảng viên hướng dẫn</span>
                        <strong className="text-slate-700">
                          {instructors.find(i => i.id === selectedStudent.assignedInstructorId)?.name || 'Chưa điều phối'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-semibold">Xe tập gán riêng</span>
                        <strong className="text-slate-700">
                          {vehicles.find(v => v.id === selectedStudent.assignedVehicleId)?.name || 'Chưa gán xe'} ({vehicles.find(v => v.id === selectedStudent.assignedVehicleId)?.plate})
                        </strong>
                      </div>
                    </div>
                  </div>


                </div>
              )}

              {/* TAB 2: TIẾN ĐỘ HỌC TẬP */}
              {activeTab === 'progress' && (
                <div className="space-y-4">
                  <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-xs text-center space-y-4">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Tỉ lệ hoàn thành chương trình</span>
                    
                    {/* Ring simulation or ratio bar */}
                    <div className="relative h-4 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full transition-all duration-500"
                        style={{ width: `${(selectedStudent.completedSessions / selectedStudent.totalSessions) * 100}%` }}
                      ></div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 pt-3 text-xs font-bold">
                      <div className="bg-indigo-50/50 p-2.5 rounded-xl border border-indigo-50">
                        <span className="text-[10px] text-slate-400 uppercase block tracking-wider font-semibold">Cần học</span>
                        <span className="text-xl text-indigo-700 font-black">{selectedStudent.totalSessions} buổi</span>
                      </div>
                      <div className="bg-emerald-50 p-2.5 rounded-xl border border-emerald-50">
                        <span className="text-[10px] text-slate-400 uppercase block tracking-wider font-semibold">Đã học</span>
                        <span className="text-xl text-emerald-700 font-black">{selectedStudent.completedSessions} buổi</span>
                      </div>
                      <div className="bg-slate-100 p-2.5 rounded-xl border border-slate-200/50">
                        <span className="text-[10px] text-slate-400 uppercase block tracking-wider font-semibold">Còn lại</span>
                        <span className="text-xl text-slate-700 font-black">{selectedStudent.remainingSessions} buổi</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-4 rounded-2xl border border-slate-100 space-y-3 shadow-xs">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">Yêu cầu đào tạo</h4>
                    {(() => {
                      const reqDist = selectedStudent.licenseClass === 'B số tự động' ? 710 
                                    : selectedStudent.licenseClass === 'C1' ? 825
                                    : ['A1', 'A'].includes(selectedStudent.licenseClass) ? 0
                                    : 810; // default for "B số sàn" or others

                      const compDist = reqDist > 0 && selectedStudent.totalSessions > 0
                        ? Math.min(reqDist, Math.round((selectedStudent.completedSessions / selectedStudent.totalSessions) * reqDist))
                        : 0;

                      return (
                        <ul className="text-xs font-bold text-slate-600 space-y-2.5">
                          <li className="flex justify-between items-center">
                            <span>Ôn lý thuyết & cabin ảo:</span>
                            <span className="text-emerald-600 font-extrabold flex items-center gap-1">✓ Đã đạt</span>
                          </li>
                          <li className="flex justify-between items-center">
                            <span>Đào tạo đường trường thực tế (DAT):</span>
                            <span>
                              {reqDist === 0 ? (
                                <span className="text-slate-400 italic">Không yêu cầu (Hạng {selectedStudent.licenseClass})</span>
                              ) : (
                                <span>
                                  {compDist >= reqDist ? (
                                    <span className="text-emerald-600 font-extrabold">✓ Đã đạt ({compDist} / {reqDist} Km)</span>
                                  ) : (
                                    <span className="text-slate-700">Đang thực hiện ({compDist} / {reqDist} Km)</span>
                                  )}
                                </span>
                              )}
                            </span>
                          </li>
                          {reqDist > 0 && (
                            <li className="flex justify-between items-center">
                              <span>Ghép ngang, dọc bãi xe sa hình:</span>
                              <span className={selectedStudent.completedSessions >= 4 ? 'text-emerald-500 font-black' : 'text-slate-400'}>
                                {selectedStudent.completedSessions >= 4 ? '✓ Đã luyện tốt' : 'Luyện trong buổi kế'}
                              </span>
                            </li>
                          )}
                        </ul>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* TAB 3: DANH SÁCH LỊCH HỌC */}
              {activeTab === 'schedule' && (
                <div className="space-y-3">
                  <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Lịch sử và lịch học đặt trước</span>

                  {lessons.filter(l => l.studentId === selectedStudent.id).length === 0 ? (
                    <div className="p-10 text-center bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">
                      Học viên chưa được xếp lịch học cụ thể nào.
                    </div>
                  ) : (
                    lessons
                      .filter(l => l.studentId === selectedStudent.id)
                      .sort((a,b)=> b.date.localeCompare(a.date))
                      .map((les) => {
                        let statusStyle = 'bg-blue-50 text-blue-700 border-blue-100';
                        if (les.status === 'Đã hoàn thành') statusStyle = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                        if (les.status.includes('nghỉ') || les.status === 'Hủy lịch') statusStyle = 'bg-red-50 text-red-700 border-red-100';

                        return (
                          <div key={les.id} className="p-3.5 bg-white rounded-2xl border border-slate-100 shadow-xs flex justify-between items-start gap-2">
                            <div className="space-y-1 text-xs">
                              <div className="font-extrabold text-slate-800 flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-blue-600" /> {new Date(les.date).toLocaleDateString('vi-VN')} ({les.startTime} - {les.endTime})
                              </div>
                              <div className="text-slate-500 font-bold">
                                Loại lớp: {les.lessonType} • Địa điểm: {les.trainingLocation}
                              </div>
                              {les.resultNote && (
                                <div className="text-[11px] font-bold text-orange-600 italic bg-orange-50/20 p-1.5 rounded-lg border border-orange-50 mt-1">
                                  GV kết luận: {les.resultNote}
                                </div>
                              )}
                            </div>
                            <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${statusStyle} shrink-0`}>
                              {les.status}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              )}

              {/* TAB 4: HỌC PHÍ & SỔ ĐÓNG TIỀN */}
              {activeTab === 'fee' && (
                <div className="space-y-4">
                  
                  {/* Financial Metrics */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3 text-xs font-bold font-mono">
                    <div className="flex justify-between pb-2 border-b border-slate-50">
                      <span>Tổng gói học phí đăng ký:</span>
                      <span className="text-slate-800">{selectedStudent.totalFee.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div className="flex justify-between pb-2 border-b border-slate-50 text-emerald-600">
                      <span>Tổng số tiền đã nộp học:</span>
                      <span>+ {selectedStudent.paidAmount.toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div className="flex justify-between items-baseline pt-1">
                      <span className="text-slate-500 font-sans">DƯ NỢ CÒN LẠI:</span>
                      <span className="text-base font-black font-sans text-red-600">
                        {selectedStudent.remainingAmount.toLocaleString('vi-VN')} ₫
                      </span>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex justify-between items-center font-sans text-[11px] font-bold">
                      <span className="text-slate-400">Hạn thanh toán kế tiếp:</span>
                      <span className={selectedStudent.remainingAmount > 0 && selectedStudent.nextPaymentDeadline < (() => {
                        const d = new Date();
                        const year = d.getFullYear();
                        const month = String(d.getMonth() + 1).padStart(2, '0');
                        const day = String(d.getDate()).padStart(2, '0');
                        return `${year}-${month}-${day}`;
                      })() ? 'text-red-600 font-extrabold' : 'text-slate-600'}>
                        {new Date(selectedStudent.nextPaymentDeadline).toLocaleDateString('vi-VN')}
                      </span>
                    </div>
                  </div>

                  {/* Payment controls */}
                  {selectedStudent.remainingAmount > 0 ? (
                    <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
                      <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Ghi nhận biên bản thu nhanh</h4>
                      
                      <form onSubmit={handleQuickPaymentSubmit} className="space-y-3.5">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Số tiền nộp (₫)</label>
                            <input
                              type="number"
                              required
                              placeholder="e.g. 5000000"
                              value={quickPayAmount || ''}
                              onChange={(e) => setQuickPayAmount(Number(e.target.value))}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2 px-3 rounded-lg text-xs font-bold"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Phương thức</label>
                            <select
                              value={quickPayMethod}
                              onChange={(e) => setQuickPayMethod(e.target.value as any)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2 px-3 rounded-lg text-xs font-bold"
                            >
                              <option value="Chuyển khoản">Chuyển khoản</option>
                              <option value="Tiền mặt">Tiền mặt</option>
                              <option value="Khác">Khác</option>
                            </select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Hạng mục thu</label>
                            <select
                              value={quickPayCat}
                              onChange={(e) => setQuickPayCat(e.target.value as any)}
                              className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2 px-3 rounded-lg text-xs font-bold"
                            >
                              <option value="Đợt 1">Nộp Đợt 1</option>
                              <option value="Đợt 2">Nộp Đợt 2</option>
                              <option value="Đợt 3">Nộp Đợt 3</option>
                              <option value="Thanh toán bổ sung">Nộp Bổ Sung</option>
                            </select>
                          </div>

                          <div className="flex items-end">
                            <button
                              type="submit"
                              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-3 rounded-lg text-xs cursor-pointer shadow-xs"
                            >
                              ✓ Ghi biên lai
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  ) : (
                    <div className="p-3 bg-emerald-50 border border-emerald-200/50 rounded-2xl text-center text-xs font-bold text-emerald-700">
                      ✓ Học viên này đã hoàn tất đầy đủ 100% nghĩa vụ học phí.
                    </div>
                  )}

                  {/* Payment history list */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Lịch sử nộp tiền thực tế</span>
                    {payments.filter(p => p.studentId === selectedStudent.id).length === 0 ? (
                      <div className="p-5 text-center text-xs text-slate-400 bg-white border border-slate-100 rounded-xl">
                        Không tìm thấy hóa đơn thanh toán nào.
                      </div>
                    ) : (
                      payments
                        .filter(p => p.studentId === selectedStudent.id)
                        .map((pay) => (
                          <div key={pay.id} className="p-3 bg-white rounded-xl border border-slate-100 text-xs font-bold flex justify-between items-center">
                            <div>
                              <div className="text-slate-850">{pay.category} ({pay.method})</div>
                              <div className="text-[10px] text-slate-400 font-medium">Lập ngày: {new Date(pay.paymentDate).toLocaleDateString('vi-VN')} by {pay.receiver}</div>
                              {pay.isCancelled && <span className="text-[9px] text-red-500 block mt-0.5 uppercase">Đã Hủy: {pay.cancellationReason}</span>}
                            </div>
                            <span className={pay.isCancelled ? 'text-slate-400 line-through shrink-0' : 'text-emerald-600 shrink-0'}>
                              {pay.isCancelled ? '-' : '+'} {pay.amount.toLocaleString('vi-VN')} ₫
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              )}

              {/* TAB 5: GHI CHÚ NỘI BỘ */}
              {activeTab === 'notes' && (
                <div className="space-y-4">
                  <span className="text-xs font-extrabold text-slate-400 uppercase tracking-widest block">Sổ tay theo dõi tiến trình của cán bộ</span>

                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs space-y-3">
                    <textarea
                      placeholder="Thêm các cập nhật tình trạng mới nhất về tiến trình lái xe, sai phạm sa hình, hoặc cam kết đóng nợ..."
                      value={tempNote}
                      onChange={(e) => setTempNote(e.target.value)}
                      className="w-full h-24 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-600 focus:outline-none focus:bg-white text-slate-800"
                    ></textarea>
                    
                    <div className="flex justify-end">
                      <button
                        onClick={handleSaveNote}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold py-2 px-3.5 rounded-xl cursor-pointer shadow-xs transition-all"
                      >
                        Thêm nội dung ghi chú
                      </button>
                    </div>
                  </div>

                  {/* Render logs list line break */}
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs whitespace-pre-line text-xs leading-relaxed text-slate-650 font-medium">
                    {selectedStudent.notes || 'Chưa ghi nhận phản hồi bổ sung nào cho học viên.'}
                  </div>
                </div>
              )}

              {/* TAB 6: GỬI THÔNG BÁO SMS / ZALO */}
              {activeTab === 'notif' && (
                <div className="space-y-4">
                  <div className="bg-slate-800 text-slate-100 p-4 rounded-2xl flex items-center justify-between shadow-xs gap-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-black uppercase tracking-wider text-amber-400">Bộ truyền thông báo tích hợp</h4>
                      <p className="text-[11px] text-slate-300 font-medium leading-tight text-left">
                        Tự động hóa thông tin lịch huấn luyện hoặc dư nợ học vị thông qua hạ tầng SMS Brandname & Zalo ZNS.
                      </p>
                    </div>
                    <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded border border-emerald-500/30 font-mono tracking-wide uppercase shrink-0">
                      ● active Gateway
                    </span>
                  </div>

                  {/* Inner grid partition */}
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    
                    {/* Setup block */}
                    <div className="lg:col-span-7 bg-white p-4 rounded-2xl border border-slate-100 space-y-4 shadow-xs text-left">
                      {/* Select channel */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                          Kênh truyền tải sóng
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNotifChannel('zalo');
                            }}
                            className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${selectedNotifChannel === 'zalo' ? 'border-sky-500 bg-sky-50 text-sky-700 font-black' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span>
                            Zalo Notification (ZNS)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedNotifChannel('sms');
                            }}
                            className={`py-2 px-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${selectedNotifChannel === 'sms' ? 'border-amber-500 bg-amber-50 text-amber-700 font-black' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                          >
                            <span className="w-2.5 h-2.5 rounded-full bg-amber-600"></span>
                            SMS Brandname API
                          </button>
                        </div>
                      </div>

                      {/* Select Template */}
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                          Chọn kịch bản mẫu
                        </label>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => {
                            const tempId = e.target.value;
                            setSelectedTemplateId(tempId);
                            triggerInitTextForModal(tempId, selectedStudent.id);
                          }}
                          className="w-full bg-slate-50 border border-slate-200 text-slate-800 py-2.5 px-3 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-blue-600"
                        >
                          <option value="sched">📅 Xác nhận lịch đặt thực hành mới</option>
                          <option value="remind">🔔 Nhắc lịch hẹn ngày mai (Auto-DAT)</option>
                          <option value="payment">💳 Nhắc học phí dư nợ cuối khóa</option>
                        </select>
                      </div>

                      {/* Custom Editor text */}
                      <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                            Nội dung tin nhắn gửi đi
                          </label>
                          <span className="text-[10px] font-mono font-bold text-slate-400">
                            {customNotifMessage.length} ký tự
                          </span>
                        </div>
                        <textarea
                          rows={6}
                          value={customNotifMessage}
                          onChange={(e) => setCustomNotifMessage(e.target.value)}
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold leading-relaxed focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600 text-slate-800"
                          placeholder="Nhập nội dung thông báo..."
                        />
                      </div>

                      {/* Action trigger button */}
                      <button
                        type="button"
                        onClick={() => handleSendNotification(selectedNotifChannel, customNotifMessage)}
                        disabled={isSendingNotif}
                        className={`w-full font-black text-xs text-white py-3 rounded-xl shadow-md cursor-pointer transition-all block text-center uppercase flex items-center justify-center gap-1.5 ${isSendingNotif ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                      >
                        {isSendingNotif ? (
                          <>
                            <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            <span>Đang gửi thông điệp...</span>
                          </>
                        ) : (
                          <>
                            <Send className="h-4 w-4" />
                            <span>Gửi thông báo ngay (Tự động hóa)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Right column preview smartphone */}
                    <div className="lg:col-span-5 flex flex-col items-center justify-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 self-start flex items-center gap-1">
                        📱 Bản xem trước trên di động
                      </span>
                      
                      {/* Simulated iPhone frame */}
                      <div className="w-full bg-slate-900 border-[6px] border-slate-950 rounded-[35px] shadow-xl overflow-hidden p-1.5 relative border-b-[8px]">
                        {/* Speaker notch */}
                        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 w-20 h-4.5 bg-black rounded-b-xl z-20 flex justify-center items-center pointer-events-none">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-800 mr-2"></span>
                          <span className="w-8 h-1 bg-slate-800 rounded-full"></span>
                        </div>

                        {/* Screen */}
                        <div className="w-full h-[320px] bg-slate-50 rounded-[28px] overflow-hidden flex flex-col font-sans">
                          {/* Inner status bar */}
                          <div className="pt-2.5 pb-2 px-4 flex justify-between bg-white text-[9px] font-bold text-slate-700 shrink-0 select-none">
                            <span>09:41</span>
                            <div className="flex gap-1 items-center">
                              <span>📶</span>
                              <span>LTE</span>
                              <span>🔋</span>
                            </div>
                          </div>

                          {/* Chat App Header preview */}
                          <div className="px-3.5 py-2 border-b border-slate-100 bg-white flex items-center gap-2 shrink-0">
                            <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[9px] shrink-0 font-mono">
                              {selectedNotifChannel === 'zalo' ? 'Z' : 'S'}
                            </div>
                            <div className="text-left leading-none">
                              <span className="text-[10px] font-black text-slate-800 block">
                                {selectedNotifChannel === 'zalo' ? 'Zalo Business (ZNS)' : 'LICH HOC PRO'}
                              </span>
                              <span className="text-[8px] font-medium text-emerald-500">
                                {selectedNotifChannel === 'zalo' ? '✓ Doanh Nghiệp Đã Xác Minh' : '● SMS Brandname'}
                              </span>
                            </div>
                            <span className="ml-auto text-[8px] bg-slate-100 text-slate-500 font-bold px-1.5 py-0.5 rounded uppercase">
                              Active
                            </span>
                          </div>

                          {/* Message bubble core */}
                          <div className="p-3 overflow-y-auto flex-1 flex flex-col justify-end">
                            {selectedNotifChannel === 'zalo' ? (
                              /* Zalo style */
                              <div className="bg-white border border-slate-150 rounded-2xl rounded-tl-none p-3 max-w-[85%] text-[10px] text-slate-850 shadow-xs self-start text-left space-y-2">
                                <div className="text-[9px] font-black text-slate-400 select-none uppercase tracking-wide border-b border-slate-100 pb-1">
                                  ✉ Tin nhắn ZNS Hệ thống
                                </div>
                                <p className="whitespace-pre-line leading-relaxed font-semibold break-words">
                                  {customNotifMessage || 'Đang chuẩn bị bản tin nhắn...'}
                                </p>
                                <div className="flex justify-between items-center text-[8px] text-slate-400 pt-1">
                                  <span>Vừa xong</span>
                                  <span className="text-sky-500 font-black font-semibold">✓ Đã gửi</span>
                                </div>
                              </div>
                            ) : (
                              /* SMS style */
                              <div className="bg-white border border-slate-150 rounded-2xl rounded-tl-none p-2.5 max-w-[85%] text-[10px] text-slate-850 self-start text-left space-y-1 shadow-xs">
                                <p className="whitespace-pre-line leading-relaxed font-mono font-bold text-[9px] break-words text-slate-705">
                                  {customNotifMessage || 'Đang chuẩn bị bản tin nhắn...'}
                                </p>
                                <div className="text-[7.5px] text-slate-400 text-right">
                                  Vừa xong • Tin nhắn Brandname
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* History of Sent Messages of THIS student */}
                  <div className="space-y-2.5">
                    <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="h-4 w-4 text-blue-600" /> Sổ ký gửi & Lịch sử truyền thông điệp của học viên ({getNotificationHistory(selectedStudent.id).length})
                    </h4>

                    {getNotificationHistory(selectedStudent.id).length === 0 ? (
                      <div className="p-6 text-center bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-bold">
                        Học viên chưa từng nhận thông báo SMS hoặc Zalo nào từ hệ thống.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {getNotificationHistory(selectedStudent.id).map((notif: any) => (
                          <div key={notif.id} className="p-3 bg-white rounded-2xl border border-slate-100 shadow-xs text-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                            <div className="space-y-1 text-left flex-1 min-w-0">
                              <div className="font-bold text-slate-800 break-words line-clamp-2">
                                {notif.text}
                              </div>
                              <span className="text-[10px] text-slate-400 font-medium block">
                                Gửi đi: {new Date(notif.sentAt).toLocaleString('vi-VN')}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                              {notif.channel === 'zalo' ? (
                                <span className="bg-sky-50 text-sky-700 border border-sky-100 font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase">
                                  Zalo
                                </span>
                              ) : (
                                <span className="bg-amber-50 text-amber-700 border border-amber-100 font-extrabold text-[9px] px-2 py-0.5 rounded-full uppercase">
                                  SMS
                                </span>
                              )}
                              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                                <CheckCircle className="h-3 w-3 shrink-0" />
                                Đã Nhận
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

            </div>

            {/* Bottom Actions of Slide Over */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-bold text-slate-400">Trạng thái nhắc nợ:</span>
                <span className="text-xs font-black text-slate-700">{selectedStudent.reminderStatus}</span>
              </div>

              {selectedStudent.remainingAmount > 0 && (
                <div className="flex gap-1">
                  <button
                    onClick={() => setReminderText('Đã nhắc')}
                    className="bg-white border border-slate-200 hover:bg-slate-100 font-bold text-[10px] text-slate-700 py-1.5 px-3 rounded-lg cursor-pointer"
                  >
                    🔔 Đã Gọi Nhắc
                  </button>
                  <button
                    onClick={() => setReminderText('Đã hẹn ngày thanh toán')}
                    className="bg-amber-600 hover:bg-amber-700 font-bold text-[10px] text-white py-1.5 px-3 rounded-lg cursor-pointer shadow-xs"
                  >
                    🤝 Đã Hẹn Ngày
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* MODAL FORM: THÊM HỌC VIÊN MỚI */}
      {isAdding && (
        <div className="fixed inset-0 bg-slate-900/60 z-50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-xl overflow-hidden animate-zoom-in max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 flex-shrink-0">
              <h2 className="text-base font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Plus className="h-5 w-5 text-blue-600" /> THÊM HỌC VIÊN MỚI
              </h2>
              <button
                onClick={() => setIsAdding(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="h-5.5 w-5.5" />
              </button>
            </div>

            <form onSubmit={handleCreateStudent} className="p-5 space-y-4 text-xs font-bold overflow-y-auto flex-1">
              {/* Identity Document Uploader Area */}
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-205/60 space-y-3 shadow-2xs leading-normal">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-slate-800">
                    <span className="text-blue-600 font-bold block text-sm">📂</span>
                    <span className="font-black uppercase tracking-wider text-[10px] text-slate-700">TẢI LÊN HỒ SƠ ĐỊNH DANH HỌC VIÊN</span>
                  </div>
                  {isOcrLoading && (
                    <span className="text-[9px] text-blue-600 font-extrabold tracking-tight animate-pulse flex items-center gap-1 bg-white border border-blue-150 px-2.5 py-1 rounded-full shadow-2xs">
                      🤖 AI ĐANG ĐỌC THẺ...
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2.5">
                  {/* CCCD Uploader */}
                  <div className="relative group border border-dashed rounded-xl p-2 bg-white flex flex-col items-center justify-center text-center cursor-pointer min-h-24 hover:bg-slate-50/50 transition-colors border-slate-200">
                    {cccdImage ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-between">
                        <img src={cccdImage} alt="CCCD" className="w-full h-16 object-cover rounded-lg" />
                        <span className="text-[9px] text-emerald-600 font-extrabold mt-1 max-w-[120px] truncate flex items-center gap-0.5">✓ CCCD Đã tải</span>
                        <button
                          type="button"
                          onClick={() => setCccdImage('')}
                          className="absolute -top-1 -right-1 bg-red-50 hover:bg-red-100 p-1 rounded-full text-red-600 shadow-3xs cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center dialog-file-label">
                        <span className="text-lg">🪪</span>
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-tight">Mặt trước CCCD</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-0.5 leading-none">Quét lấy họ tên & địa chỉ</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleOcrUpload(e, 'cccd')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* Avatar Uploader */}
                  <div className="relative group border border-dashed rounded-xl p-2 bg-white flex flex-col items-center justify-center text-center cursor-pointer min-h-24 hover:bg-slate-50/50 transition-colors border-slate-200">
                    {avatarImage ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-between">
                        <img src={avatarImage} alt="Avatar" className="w-24 h-16 object-cover rounded-lg" />
                        <span className="text-[9px] text-emerald-600 font-extrabold mt-1 flex items-center gap-0.5">✓ Ảnh thẻ đã tải</span>
                        <button
                          type="button"
                          onClick={() => setAvatarImage('')}
                          className="absolute -top-1 -right-1 bg-red-50 hover:bg-red-100 p-1 rounded-full text-red-600 shadow-3xs cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center dialog-file-label">
                        <span className="text-lg">👤</span>
                        <span className="text-[10px] font-black text-slate-600 uppercase tracking-tight">Ảnh thẻ 3x4</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-0.5 leading-none">Làm ảnh thẻ hồ sơ</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleOcrUpload(e, 'avatar')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>

                  {/* EID Uploader */}
                  <div className="relative group border border-dashed rounded-xl p-2 bg-white flex flex-col items-center justify-center text-center cursor-pointer min-h-24 hover:bg-slate-50/50 transition-colors border-slate-200">
                    {eidImage ? (
                      <div className="relative w-full h-full flex flex-col items-center justify-between">
                        <img src={eidImage} alt="e-ID" className="w-full h-16 object-cover rounded-lg" />
                        <span className="text-[9px] text-emerald-600 font-extrabold mt-1 max-w-[120px] truncate flex items-center gap-0.5">✓ VNeID Đã tải</span>
                        <button
                          type="button"
                          onClick={() => setEidImage('')}
                          className="absolute -top-1 -right-1 bg-red-50 hover:bg-red-100 p-1 rounded-full text-red-600 shadow-3xs cursor-pointer"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer w-full h-full flex flex-col items-center justify-center dialog-file-label">
                        <span className="text-lg">📱</span>
                        <span className="text-[10px] font-black text-purple-600 uppercase tracking-tight">VNeID / Thẻ ĐT</span>
                        <span className="text-[8px] text-slate-400 font-bold mt-0.5 leading-none">Quét thông tin VNeID</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleOcrUpload(e, 'eid')}
                          className="hidden"
                        />
                      </label>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Họ và tên học viên *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nguyễn Văn A"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Số điện thoại *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 0912345678"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Ngày sinh *</label>
                  <input
                    type="date"
                    required
                    value={newDob}
                    onChange={(e) => setNewDob(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Địa chỉ hiện tại</label>
                  <input
                    type="text"
                    placeholder="Quận/Huyện, Hà Nội"
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Hạng bằng đăng ký</label>
                  <select
                    value={newLicenseClass}
                    onChange={(e) => {
                      const val = e.target.value as any;
                      setNewLicenseClass(val);
                      // Auto populate defaults for license types
                      if (val.includes('B')) {
                        setNewCourseType('Trọn gói hạng B1');
                        setNewTotalFee(15000000);
                        setNewTotalSessions(14);
                      } else if (val === 'C1') {
                        setNewCourseType('Hạng C');
                        setNewTotalFee(18000000);
                        setNewTotalSessions(16);
                      } else {
                        setNewCourseType('Trọn gói hạng A1');
                        setNewTotalFee(2500000);
                        setNewTotalSessions(2);
                      }
                    }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs"
                  >
                    <option value="A1">A1</option>
                    <option value="A">A</option>
                    <option value="B số tự động">B Số Tự Động</option>
                    <option value="B số sàn">B Số Sàn</option>
                    <option value="C1">C1 (Xe Tải)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Loại chương trình trọn gói</label>
                  <input
                    type="text"
                    required
                    value={newCourseType}
                    onChange={(e) => setNewCourseType(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3 text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3.5">
                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Học phí trọn gói (₫)</label>
                  <input
                    type="number"
                    required
                    value={newTotalFee}
                    onChange={(e) => setNewTotalFee(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Tổng số buổi bổ túc</label>
                  <input
                    type="number"
                    required
                    value={newTotalSessions}
                    onChange={(e) => setNewTotalSessions(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Giảng viên chỉ định</label>
                  <select
                    value={newInstructorId}
                    onChange={(e) => setNewInstructorId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 px-3 text-slate-800 text-xs"
                  >
                    {instructors.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Gán nhãn ban đầu (Tags)</label>
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 rounded-xl border border-slate-150 mb-2.5">
                  {AVAILABLE_TAGS.map((tag) => {
                    const isSelected = newTags.includes(tag);
                    return (
                      <button
                        type="button"
                        key={tag}
                        onClick={() => {
                          setNewTags((prev) =>
                            isSelected ? prev.filter((t) => t !== tag) : [...prev, tag]
                          );
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all border cursor-pointer select-none ${
                          isSelected
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-white border-slate-200 text-slate-650 hover:bg-slate-100'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Waitlist designation control option checkbox */}
              <div className="flex items-center gap-2 py-1 select-none">
                <input
                  type="checkbox"
                  id="isWaitlist"
                  checked={isWaitlist}
                  onChange={(e) => setIsWaitlist(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-4 w-4 shrink-0 cursor-pointer"
                />
                <label htmlFor="isWaitlist" className="text-slate-700 cursor-pointer text-xs font-black">
                  <span>Thêm học viên vào Danh sách chờ</span> <span className="text-[10px] text-slate-400 font-semibold">(Chưa nộp hồ sơ chính thức, chưa xếp lịch học)</span>
                </label>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 uppercase mb-1.5">Hồ sơ đính kèm & Thỏa thuận</label>
                <textarea
                  placeholder="e.g. Biên nhận hồ sơ gốc gốc, Đã nộp 4 ảnh 3x4 cùng phô tô CMTND..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full h-16 p-3 bg-slate-50 border border-slate-200 rounded-xl"
                ></textarea>
              </div>

              <div className="pt-2 border-t border-slate-100 flex gap-3 justify-end">
                <button
                  type="button"
                  disabled={isCreatingStudent}
                  onClick={() => setIsAdding(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 px-4 rounded-xl cursor-pointer disabled:opacity-50"
                >
                  HỦY BỎ
                </button>
                <button
                  type="submit"
                  disabled={isCreatingStudent}
                  className="bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-5 rounded-xl cursor-pointer shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isCreatingStudent ? (
                    <>
                      <Clock className="animate-spin h-3.5 w-3.5 text-white" /> ĐANG ĐĂNG KÝ...
                    </>
                  ) : (
                    '✓ ĐĂNG KÝ HỌC VIÊN'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Dynamic zoom-in image preview modal overlay */}
      {previewImageUrl && (
        <div 
          className="fixed inset-0 bg-slate-950/80 z-55 backdrop-blur-xs flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-2xl w-full flex items-center justify-center animate-zoom-in" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImageUrl} 
              alt="Preview" 
              className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl border border-slate-800" 
            />
            <button 
              className="absolute -top-12 right-0 text-white font-black hover:text-slate-200 text-xs bg-slate-900/80 border border-slate-800 rounded-full py-1.5 px-3.5 cursor-pointer flex items-center gap-1.5"
              onClick={() => setPreviewImageUrl(null)}
            >
              <X className="h-4 w-4" /> ĐÓNG
            </button>
          </div>
        </div>
      )}

      {/* 🔔 SUCCESS FLOATING TOAST NOTIFICATION */}
      {deleteSuccessMsg && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-emerald-600 border border-emerald-500 text-white font-extrabold text-xs px-5 py-3.5 rounded-2xl shadow-xl z-[120] flex items-center gap-2 animate-bounce">
          <span>✅</span>
          <span>{deleteSuccessMsg}</span>
        </div>
      )}

      {/* ✎ EDIT STUDENT PROFILE MODAL */}
      {isEditingStudent && (
        <div className="fixed inset-0 bg-slate-950/70 z-[100] backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-lg shadow-2xl animate-zoom-in max-h-[90vh] overflow-y-auto border border-slate-100 flex flex-col">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50 sticky top-0 z-10 shrink-0">
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>✎</span> Chỉnh sửa hồ sơ học viên
              </h2>
              <button
                type="button"
                onClick={() => setIsEditingStudent(false)}
                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Error Display */}
            {editError && (
              <div className="mx-5 mt-4 p-3.5 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-xs font-bold leading-relaxed animate-fade-in">
                ⚠️ {editError}
              </div>
            )}

            {/* Body */}
            <div className="p-5 space-y-4 flex-1">
              {/* Họ & tên */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Họ và tên *</label>
                <input
                  type="text"
                  value={editForm.name || ''}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Nguyễn Văn A"
                />
              </div>

              {/* Điện thoại & Ngày sinh */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Điện thoại *</label>
                  <input
                    type="text"
                    value={editForm.phone || ''}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0912345678"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Ngày sinh</label>
                  <input
                    type="date"
                    value={editForm.dob || ''}
                    onChange={(e) => setEditForm({ ...editForm, dob: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Địa chỉ */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Địa chỉ liên lạc</label>
                <input
                  type="text"
                  value={editForm.address || ''}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Hà Nội, Việt Nam"
                />
              </div>

              {/* Hạng bằng & Khóa học */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Hạng bằng</label>
                  <select
                    value={editForm.licenseClass || ''}
                    onChange={(e) => setEditForm({ ...editForm, licenseClass: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {['B số sàn', 'B số tự động', 'C1', 'A1', 'A', 'C', 'D', 'E'].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Khóa học</label>
                  <select
                    value={editForm.courseType || ''}
                    onChange={(e) => setEditForm({ ...editForm, courseType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {settings.courseTypes?.map(ct => (
                      <option key={ct} value={ct}>{ct}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Tổng học phí & Tổng số buổi */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng học phí (đ)</label>
                  <input
                    type="number"
                    value={editForm.totalFee ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, totalFee: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Tổng số buổi học</label>
                  <input
                    type="number"
                    value={editForm.totalSessions ?? ''}
                    onChange={(e) => setEditForm({ ...editForm, totalSessions: e.target.value === '' ? 0 : Number(e.target.value) })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Hạn thanh toán & Trạng thái */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Hạn nộp tiền tiếp</label>
                  <input
                    type="date"
                    value={editForm.nextPaymentDeadline || ''}
                    onChange={(e) => setEditForm({ ...editForm, nextPaymentDeadline: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Trạng thái học tập</label>
                  <select
                    value={editForm.status || ''}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as any })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {['Danh sách chờ', 'Mới đăng ký', 'Đang học', 'Tạm dừng', 'Đã hoàn thành', 'Đã thi'].map(st => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Giáo viên & Xe tập */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Giảng viên phụ trách</label>
                  <select
                    value={editForm.assignedInstructorId || ''}
                    onChange={(e) => setEditForm({ ...editForm, assignedInstructorId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chưa điều phối --</option>
                    {instructors.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Xe tập gán riêng</label>
                  <select
                    value={editForm.assignedVehicleId || ''}
                    onChange={(e) => setEditForm({ ...editForm, assignedVehicleId: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Chưa gán xe --</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id}>{v.name} ({v.plate})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="space-y-1">
                <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">Ghi chú nội bộ</label>
                <textarea
                  rows={2}
                  value={editForm.notes || ''}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-slate-800 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Các lưu ý đặc biệt về học viên..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 sticky bottom-0 z-10 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditingStudent(false)}
                className="bg-white border border-slate-200 text-slate-550 font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-slate-55 cursor-pointer transition-all"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                onClick={handleSaveStudent}
                disabled={isSavingStudent}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl cursor-pointer shadow-md transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingStudent ? 'ĐANG LƯU...' : 'LƯU THAY ĐỔI'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🗑 DETAILED DELETE CONFIRMATION MODAL */}
      {deleteTargetStudent && (
        <div className="fixed inset-0 bg-slate-950/80 z-[110] backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-red-55 p-6 space-y-4 animate-scale-up">
            <div className="flex items-start gap-3">
              <div className="bg-red-100 p-2.5 rounded-2xl text-red-650">
                <Trash2 className="h-6 w-6" />
              </div>
              <div className="space-y-1 flex-1">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Xác nhận xóa học viên</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Thao tác này sẽ xóa vĩnh viễn hồ sơ của học viên <strong>{deleteTargetStudent.name}</strong> ({deleteTargetStudent.code}) khỏi cơ sở dữ liệu và không thể khôi phục lại.
                </p>
              </div>
            </div>

            <div className="bg-red-50 p-3 rounded-2xl border border-red-100 text-[11px] text-red-700 font-bold leading-relaxed">
              ⚠️ Thao tác này không thể hoàn tác. Hãy nhập chính xác chữ <span className="underline decoration-wavy font-black text-rose-800">XOA</span> dưới đây để tiếp tục xóa vĩnh viễn.
            </div>

            {deleteError && (
              <div className="p-3 bg-rose-100 rounded-2xl border border-rose-200 text-[11px] text-red-800 font-black leading-relaxed">
                {deleteError}
              </div>
            )}

            <div className="space-y-2.5">
              <input
                type="text"
                placeholder="Nhập chữ XOA để xác thực"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs text-center text-slate-900 font-black tracking-widest placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500 uppercase"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTargetStudent(null)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-650 font-black text-xs py-3 rounded-xl cursor-pointer transition-all"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                onClick={handleDeleteStudent}
                disabled={deleteConfirmText !== 'XOA' || isDeletingStudent}
                className="flex-1 bg-red-600 hover:bg-red-750 text-white font-black text-xs py-3 rounded-xl cursor-pointer shadow-md transition-all flex items-center justify-center gap-1.5 disabled:opacity-55 disabled:cursor-not-allowed"
              >
                {isDeletingStudent ? 'ĐANG XÓA...' : 'XÓA VĨNH VIỄN'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
