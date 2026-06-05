/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Student, Lesson, Instructor, Vehicle } from '../types';

/**
 * Escapes characters for CSV values to ensure compatibility with Microsoft Excel
 */
const escapeCSV = (val: any): string => {
  if (val === null || val === undefined) return '';
  const str = String(val);
  // Replace double quotes with double-double quotes and wrap in quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

/**
 * Exports Student list to a highly compatible Microsoft Excel CSV (UTF-8 with BOM)
 */
export const exportStudentsToExcel = (
  students: Student[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  fileName = 'danh_sach_hoc_vien_lichhocpro.csv'
) => {
  const headers = [
    'Mã Học Viên',
    'Họ Và Tên',
    'Số Điện Thoại',
    'Ngày Sinh',
    'Địa Chỉ',
    'Hạng Giấy Phép',
    'Tên Khóa Học',
    'Ngày Đăng Ký',
    'Tổng Học Phí (₫)',
    'Đã Đóng học phí (₫)',
    'Học Phí Còn Nợ (₫)',
    'Hạn Đóng Học Phí',
    'Trạng Thái Học',
    'Số Buổi Học',
    'Đã Học (Buổi)',
    'Chưa Học (Buổi)',
    'Giảng Viên Phụ Trách',
    'Xe Tập Phân Bổ',
    'Trạng Thái Nhắc Nợ',
    'Ghi Chú Chi Tiết'
  ];

  const rows = students.map((s) => {
    const inst = instructors.find((i) => i.id === s.assignedInstructorId);
    const veh = vehicles.find((v) => v.id === s.assignedVehicleId);

    return [
      s.code,
      s.name,
      s.phone,
      s.dob,
      s.address,
      s.licenseClass,
      s.courseType,
      s.registrationDate,
      s.totalFee,
      s.paidAmount,
      s.remainingAmount,
      s.nextPaymentDeadline,
      s.status,
      s.totalSessions,
      s.completedSessions,
      s.remainingSessions,
      inst ? inst.name : 'Chưa phân bổ',
      veh ? `${veh.name} [${veh.plate}]` : 'Chưa phân bổ',
      s.reminderStatus,
      s.notes
    ];
  });

  // UTF-8 BOM
  let csvContent = '\uFEFF';
  csvContent += headers.map(escapeCSV).join(',') + '\n';
  rows.forEach((row) => {
    csvContent += row.map(escapeCSV).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exports current Lesson Schedule to highly compatible Microsoft Excel CSV (UTF-8 with BOM)
 */
export const exportScheduleToExcel = (
  lessons: Lesson[],
  students: Student[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  fileName = 'ke_khai_lich_hoc_lichhocpro.csv'
) => {
  const headers = [
    'Mã Lịch Hẹn',
    'Ngày Học',
    'Giờ Bắt Đầu',
    'Giờ Kết Thúc',
    'Tên Học Viên',
    'Mã Số Học Viên',
    'Giảng Viên Dạy',
    'Phương Tiện Tập Lái',
    'Chuyên Đề Học Phần',
    'Điểm Đón Trả',
    'Địa Điểm Tập',
    'Trạng Thái Ca Dạy',
    'Điểm Danh',
    'Nhận Xét / Sổ Học Tập',
    'Ghi Chú Đơn Đặt'
  ];

  const sortedLessons = [...lessons].sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    return a.startTime.localeCompare(b.startTime);
  });

  const rows = sortedLessons.map((l) => {
    const student = students.find((s) => s.id === l.studentId);
    const inst = instructors.find((i) => i.id === l.instructorId);
    const veh = vehicles.find((v) => v.id === l.vehicleId);

    return [
      l.id,
      l.date,
      l.startTime,
      l.endTime,
      student ? student.name : 'N/A',
      student ? student.code : 'N/A',
      inst ? inst.name : 'N/A',
      veh ? `${veh.name} (${veh.plate})` : 'N/A',
      l.lessonType,
      l.pickupLocation,
      l.trainingLocation,
      l.status,
      l.attendanceStatus,
      l.resultNote || 'Chưa có ghi chú sư phạm',
      l.notes || ''
    ];
  });

  // UTF-8 BOM
  let csvContent = '\uFEFF';
  csvContent += headers.map(escapeCSV).join(',') + '\n';
  rows.forEach((row) => {
    csvContent += row.map(escapeCSV).join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Spawns an offscreen iframe element to print document content in isolation.
 */
const printIsolatedDocument = (title: string, bodyHTML: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    alert('Không thể kết nối bộ giải trình in ấn!');
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap');
          @page {
            size: A4 landscape;
            margin: 1.2cm;
          }
          body {
            font-family: 'Roboto', sans-serif;
            color: #0f172a;
            padding: 0;
            margin: 0;
            background: white;
            font-size: 11px;
            line-height: 1.5;
          }
          .doc-header-block {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2.5px double #1e293b;
            padding-bottom: 12px;
            margin-bottom: 20px;
          }
          .school-info {
            text-align: left;
          }
          .school-name {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: #1e3a8a;
          }
          .school-sub {
            font-size: 9px;
            color: #475569;
            margin-top: 3px;
          }
          .creation-stamp {
            text-align: right;
            font-size: 9px;
            color: #64748b;
          }
          .doc-title {
            text-align: center;
            font-size: 18px;
            font-weight: 800;
            color: #0f172a;
            letter-spacing: 0.8px;
            margin: 15px 0 5px 0;
            text-transform: uppercase;
          }
          .doc-subtitle {
            text-align: center;
            font-size: 10px;
            color: #475569;
            margin-bottom: 22px;
            font-weight: 500;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10px;
            margin-bottom: 30px;
          }
          th {
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 700;
            border: 1px solid #94a3b8;
            padding: 8px 6px;
            text-transform: uppercase;
            font-size: 9px;
            text-align: left;
          }
          td {
            border: 1px solid #cbd5e1;
            padding: 7px 6px;
            text-align: left;
            color: #334155;
          }
          tr:nth-child(even) {
            background-color: #f8fafc;
          }
          .nowrap {
            white-space: nowrap;
          }
          .text-right {
            text-align: right;
          }
          .text-center {
            text-align: center;
          }
          .badge {
            display: inline-block;
            padding: 2px 5px;
            border-radius: 3px;
            font-size: 8px;
            font-weight: 700;
            text-transform: uppercase;
            border: 0.5px solid;
          }
          .badge-blue { background-color: #f0f7ff; color: #1e40af; border-color: #bfdbfe; }
          .badge-green { background-color: #f0fdf4; color: #166534; border-color: #bbf7d0; }
          .badge-yellow { background-color: #fffbeb; color: #854d0e; border-color: #fde68a; }
          .badge-red { background-color: #fef2f2; color: #991b1b; border-color: #fca5a5; }
          .badge-slate { background-color: #f8fafc; color: #334155; border-color: #cbd5e1; }
          
          .summary-legend {
            font-size: 10px;
            margin-top: 15px;
            color: #475569;
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
            border-radius: 6px;
            background-color: #f8fafc;
            display: inline-block;
          }
          .totals-bar {
            text-align: right;
            font-weight: bold;
            font-size: 11px;
            margin-top: -20px;
            margin-bottom: 25px;
            color: #0f172a;
          }
          .doc-footer-block {
            margin-top: 45px;
            display: flex;
            justify-content: space-between;
            page-break-inside: avoid;
          }
          .sig-box {
            text-align: center;
            width: 25%;
          }
          .sig-role {
            font-weight: 700;
            font-size: 10px;
            text-transform: uppercase;
            color: #1e293b;
            margin-bottom: 60px;
          }
          .sig-placeholder {
            border-top: 1px dashed #cbd5e1;
            padding-top: 5px;
            font-size: 9px;
            color: #64748b;
            display: inline-block;
            width: 140px;
          }
          @media print {
            body { padding: 0; margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${bodyHTML}
        <script>
          // Run printing
          window.onload = function() {
            setTimeout(function() {
              window.print();
              // Async cleanup frame
              setTimeout(function() {
                if (window.frameElement && window.frameElement.parentNode) {
                  window.frameElement.parentNode.removeChild(window.frameElement);
                }
              }, 1000);
            }, 500);
          };
        </script>
      </body>
    </html>
  `);
  doc.close();
};

/**
 * Formats data and prints the Student Portfolio using isolated browser PDF engine
 */
export const printStudentsPDF = (
  students: Student[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  logoText = 'LỊCH HỌC PRO'
) => {
  const dateFormatted = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const totalFeeCollected = students.reduce((sum, s) => sum + s.paidAmount, 0);
  const totalFeeRemaining = students.reduce((sum, s) => sum + s.remainingAmount, 0);

  let tableRowsHTML = '';
  students.forEach((s) => {
    const inst = instructors.find((i) => i.id === s.assignedInstructorId);
    const instName = inst ? inst.name : 'Chưa phân bổ';

    let statusClass = 'badge-slate';
    if (s.status === 'Đang học') statusClass = 'badge-blue';
    else if (s.status === 'Đã hoàn thành' || s.status === 'Đã thi') statusClass = 'badge-green';
    else if (s.status === 'Tạm dừng') statusClass = 'badge-yellow';

    tableRowsHTML += `
      <tr>
        <td class="nowrap font-semibold"><strong>${s.code}</strong></td>
        <td class="nowrap"><strong>${s.name}</strong></td>
        <td class="nowrap">${s.phone}</td>
        <td class="nowrap text-center">${s.licenseClass}</td>
        <td>${s.courseType}</td>
        <td class="text-right whitespace-nowrap">${s.totalFee.toLocaleString('vi-VN')} đ</td>
        <td class="text-right whitespace-nowrap text-emerald-700 font-semibold">${s.paidAmount.toLocaleString('vi-VN')} đ</td>
        <td class="text-right whitespace-nowrap text-amber-700 font-semibold">${s.remainingAmount.toLocaleString('vi-VN')} đ</td>
        <td class="nowrap text-center"><span class="badge ${statusClass}">${s.status}</span></td>
        <td class="nowrap text-center font-semibold">${s.completedSessions}/${s.totalSessions}</td>
        <td>${instName}</td>
      </tr>
    `;
  });

  const bodyHTML = `
    <div class="doc-header-block">
      <div class="school-info">
        <div class="school-name">HỆ THỐNG TRƯỜNG ĐÀO TẠO & SÁT HẠCH LÁI XE ${logoText}</div>
        <div class="school-sub">Số cái lưu trữ - Báo cáo thông tin hồ sơ học viên chính thức</div>
      </div>
      <div class="creation-stamp">
        <div>Ngày lập báo cáo: ${dateFormatted}</div>
        <div>Mã tài liệu: BC-LHP-STU-${Date.now().toString().slice(-6)}</div>
      </div>
    </div>
    
    <div class="doc-title">BÁO CÁO TOÀN DIỆN KHÓA HỌC & HỌC PHÍ HỌC VIÊN</div>
    <div class="doc-subtitle">Dữ liệu kết xuất từ hệ thống quản lý tập lái lịch học chuyên nghiệp</div>
    
    <table>
      <thead>
        <tr>
          <th width="8%" class="nowrap">Mã Học Viên</th>
          <th width="15%" class="nowrap">Họ Và Tên</th>
          <th width="10%" class="nowrap">SĐT</th>
          <th width="5%" class="nowrap text-center">Hạng GP</th>
          <th width="18%">Tên Khóa Học</th>
          <th width="10%" class="text-right">Tổng Lệ Phí</th>
          <th width="10%" class="text-right">Đã Thanh Toán</th>
          <th width="10%" class="text-right">Học Phí Còn Nợ</th>
          <th width="6%" class="text-center nowrap">Trạng Thái</th>
          <th width="6%" class="text-center nowrap">Số Ca Học</th>
          <th width="12%">Giảng Viên Phụ Trách</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHTML}
      </tbody>
    </table>

    <div class="totals-bar">
      👉 TỔNG CỘNG TIỀN ĐÃ THU: <span style="color: #166534; font-size: 13px;">+${totalFeeCollected.toLocaleString('vi-VN')} đ</span>
      &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp; 
      Tổng dư nợ học vụ: <span style="color: #b91c1c; font-size: 13px;">${totalFeeRemaining.toLocaleString('vi-VN')} đ</span>
    </div>

    <div class="summary-legend">
      <strong>Quy cách số liệu thống kê học vụ:</strong><br/>
      • Thống kê dựa trên <strong>${students.length} học viên</strong> đang thuộc phạm vi điều chỉnh và quản lý của trung tâm.<br/>
      • Mọi biên lai thu chi được đối soát trực tiếp với Sổ quỹ quỹ học phí trường lái.
    </div>

    <div class="doc-footer-block">
      <div class="sig-box">
        <div class="sig-role">Người Lập Biểu</div>
        <div class="sig-placeholder">Ký ghi rõ họ tên</div>
      </div>
      <div class="sig-box">
        <div class="sig-role">Trưởng Bộ Phận Giáo Vụ</div>
        <div class="sig-placeholder">Ký và kiểm soát</div>
      </div>
      <div class="sig-box">
        <div class="sig-role">Ban Giám Đốc Duyệt</div>
        <div class="sig-placeholder">Đóng dấu mộc tròn</div>
      </div>
    </div>
  `;

  printIsolatedDocument('Bao_cao_hoc_vien_LichHocPro', bodyHTML);
};

/**
 * Formats data and prints the Class Schedule utilizing the isolated browser PDF engine
 */
export const printSchedulePDF = (
  lessons: Lesson[],
  students: Student[],
  instructors: Instructor[],
  vehicles: Vehicle[],
  viewTitle = 'Danh Sách Lịch Trình Lên Lớp',
  logoText = 'LỊCH HỌC PRO'
) => {
  const dateFormatted = new Date().toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const sortedLessons = [...lessons].sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    return a.startTime.localeCompare(b.startTime);
  });

  let tableRowsHTML = '';
  sortedLessons.forEach((l) => {
    const student = students.find((s) => s.id === l.studentId);
    const inst = instructors.find((i) => i.id === l.instructorId);
    const veh = vehicles.find((v) => v.id === l.vehicleId);

    const sName = student ? student.name : 'N/A';
    const sCode = student ? student.code : 'N/A';
    const sPhone = student ? student.phone : '';
    const iName = inst ? inst.name : 'N/A';
    const vName = veh ? `${veh.name} (${veh.plate})` : 'N/A';

    let statusClass = 'badge-slate';
    if (l.status === 'Đã hoàn thành') statusClass = 'badge-green';
    else if (l.status === 'Đã xác nhận') statusClass = 'badge-blue';
    else if (l.status === 'Chờ xác nhận') statusClass = 'badge-yellow';
    else if (l.status.includes('nghỉ') || l.status === 'Hủy lịch') statusClass = 'badge-red';

    let attClass = 'badge-slate';
    if (l.attendanceStatus === 'Có mặt') attClass = 'badge-green';
    else if (l.attendanceStatus === 'Vắng') attClass = 'badge-red';

    // Format Date from yyyy-MM-dd to dd/MM/yyyy
    const parts = l.date.split('-');
    const displayDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : l.date;

    tableRowsHTML += `
      <tr>
        <td class="nowrap text-center"><strong>${displayDate}</strong></td>
        <td class="nowrap text-center font-semibold text-blue-800">${l.startTime} - ${l.endTime}</td>
        <td>
          <div><strong>${sName}</strong></div>
          <div style="font-size: 8px; color: #64748b;">Mã: ${sCode} | ${sPhone}</div>
        </td>
        <td class="font-semibold">${iName}</td>
        <td>${vName}</td>
        <td class="nowrap">${l.lessonType}</td>
        <td><div style="max-height: 35px; overflow: hidden; text-overflow: ellipsis;" title="${l.pickupLocation}">${l.pickupLocation}</div></td>
        <td class="text-center nowrap"><span class="badge ${statusClass}">${l.status}</span></td>
        <td class="text-center nowrap"><span class="badge ${attClass}">${l.attendanceStatus}</span></td>
        <td><div style="font-size: 9px; max-height: 32px; overflow: hidden;">${l.resultNote || '<i>Trống</i>'}</div></td>
      </tr>
    `;
  });

  const bodyHTML = `
    <div class="doc-header-block">
      <div class="school-info">
        <div class="school-name">HỆ THỐNG TRƯỜNG ĐÀO TẠO & SÁT HẠCH LÁI XE ${logoText}</div>
        <div class="school-sub">Số ban giáo vụ - Kế hoạch thực hành & Sự kiện sát hạch sa hình</div>
      </div>
      <div class="creation-stamp">
        <div>Ngày xuất bản: ${dateFormatted}</div>
        <div>Mã hồ sơ sổ: BC-LHP-SCH-${Date.now().toString().slice(-6)}</div>
      </div>
    </div>
    
    <div class="doc-title">BẢNG KÊ CHI TIẾT LỊCH TRÌNH GIẢNG DẠY</div>
    <div class="doc-subtitle">[Phạm vi bộ lọc: ${viewTitle}] - Báo cáo phục vụ giảng dạy ngoại tuyến, điểm danh thực địa</div>

    <table>
      <thead>
        <tr>
          <th width="8%" class="text-center nowrap">Ngày Học</th>
          <th width="10%" class="text-center nowrap">Thời Gian</th>
          <th width="18%">Học Viên Thụ Huấn</th>
          <th width="12%">Giảng Viên Giảng Dạy</th>
          <th width="12%">Xe Đào Tạo</th>
          <th width="10%" class="nowrap">Chuyên Đề</th>
          <th width="12%">Điểm Đón Trả học viên</th>
          <th width="8%" class="text-center nowrap">Trạng Thái Ca</th>
          <th width="6%" class="text-center nowrap">Sổ Điểm Danh</th>
          <th width="14%">Đánh Giá Kết Quả Buổi Học</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHTML}
      </tbody>
    </table>

    <div class="summary-legend">
      <strong>Quy trình thực hiện kiểm diện dạy lái xe:</strong><br/>
      • Giảng viên có trách nhiệm điểm danh trực tiếp sau khi kết thúc ca học. Chữ ký xác minh của học viên là căn cứ để nghiệm thu giờ bay.<br/>
      • Số liệu kế hoạch gồm <strong>${lessons.length} sự kiện ca dạy học thực tế</strong> đã lên lớp theo thời gian biểu chỉ định.
    </div>

    <div class="doc-footer-block">
      <div class="sig-box">
        <div class="sig-role">Giảng Viên Biên Chế</div>
        <div class="sig-placeholder">Ký xác nhận tay</div>
      </div>
      <div class="sig-box">
        <div class="sig-role">Cơ Quan Cấp Phát / Giáo Vụ</div>
        <div class="sig-placeholder">Ký đóng dấu kiểm soát</div>
      </div>
    </div>
  `;

  printIsolatedDocument('Ke_hoach_giang_day_LichHocPro', bodyHTML);
};

/**
 * Spawns an offscreen iframe element to print document content in isolation (A4 Portrait).
 */
const printPortraitIsolatedDocument = (title: string, bodyHTML: string) => {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.opacity = '0';
  iframe.style.border = '0';
  iframe.style.zIndex = '-9999';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) {
    alert('Không thể kết nối bộ giải trình in ấn!');
    return;
  }

  doc.open();
  doc.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700;900&display=swap');
          @page {
            size: A4 portrait;
            margin: 1.8cm 1.5cm 1.5cm 1.5cm;
          }
          body {
            font-family: 'Roboto', sans-serif;
            color: #1e293b;
            padding: 0;
            margin: 0;
            background: white;
            font-size: 11.5px;
            line-height: 1.6;
          }
          .header-national {
            text-align: center;
            margin-bottom: 20px;
          }
          .header-national .quoc-hieu {
            font-size: 11px;
            font-weight: 700;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: #0f172a;
          }
          .header-national .tieu-ngu {
            font-size: 9.5px;
            font-weight: 700;
            margin-top: 3px;
            color: #0f172a;
          }
          .header-national .divider {
            width: 130px;
            height: 1px;
            background-color: #475569;
            margin: 6px auto 0 auto;
          }
          .doc-header-block {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 1px solid #cbd5e1;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .school-info {
            text-align: left;
          }
          .school-name {
            font-size: 9.5px;
            font-weight: 700;
            text-transform: uppercase;
            color: #1e3a8a;
          }
          .school-sub {
            font-size: 8.5px;
            color: #64748b;
            margin-top: 2px;
          }
          .creation-stamp {
            text-align: right;
            font-size: 8.5px;
            color: #64748b;
          }
          .doc-title {
            text-align: center;
            font-size: 15px;
            font-weight: 900;
            color: #0f172a;
            letter-spacing: 0.5px;
            margin: 5px 0 3px 0;
            text-transform: uppercase;
          }
          .doc-subtitle {
            text-align: center;
            font-size: 9.5px;
            font-style: italic;
            color: #475569;
            margin-bottom: 20px;
          }
          .section-title {
            font-size: 11px;
            font-weight: 700;
            color: #0f172a;
            margin: 14px 0 6px 0;
            text-transform: uppercase;
            border-bottom: 1.5px solid #1e293b;
            padding-bottom: 2px;
          }
          .info-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px 15px;
            margin-bottom: 10px;
          }
          .info-row {
            display: flex;
            margin-bottom: 4px;
            font-size: 10.5px;
          }
          .info-label {
            font-weight: 500;
            color: #475569;
            width: 140px;
            flex-shrink: 0;
          }
          .info-value {
            font-weight: 600;
            color: #0f172a;
          }
          .clause-list {
            margin: 8px 0;
            padding-left: 15px;
            font-size: 10.5px;
          }
          .clause-item {
            margin-bottom: 6px;
            text-align: justify;
          }
          .clause-heading {
            font-weight: 700;
            color: #0f172a;
          }
          .doc-footer-block {
            margin-top: 35px;
            display: flex;
            justify-content: space-around;
            page-break-inside: avoid;
          }
          .sig-box {
            text-align: center;
            width: 45%;
          }
          .sig-role {
            font-weight: 700;
            font-size: 10.5px;
            text-transform: uppercase;
            color: #1e293b;
            margin-bottom: 3px;
          }
          .sig-note {
            font-size: 8.5px;
            font-style: italic;
            color: #64748b;
            margin-bottom: 50px;
          }
          .sig-placeholder {
            border-top: 1px dashed #cbd5e1;
            padding-top: 5px;
            font-size: 9.5px;
            font-weight: 700;
            color: #1e293b;
            display: inline-block;
            width: 160px;
          }
          @media print {
            body { padding: 0; margin: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${bodyHTML}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
              setTimeout(function() {
                if (window.frameElement && window.frameElement.parentNode) {
                  window.frameElement.parentNode.removeChild(window.frameElement);
                }
              }, 1000);
            }, 500);
          };
        <\/script>
      </body>
    </html>
  `);
  doc.close();
};

/**
 * Generates and prints a professional Student Training Contract PDF (A4 Portrait)
 */
export const printStudentContractPDF = (
  student: Student,
  schoolName: string,
  instructorName?: string,
  vehicleName?: string
) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '.../.../.....';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const bodyHTML = `
    <div class="header-national">
      <div class="quoc-hieu">CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
      <div class="tieu-ngu">Độc lập - Tự do - Hạnh phúc</div>
      <div class="divider"></div>
    </div>

    <div class="doc-header-block">
      <div class="school-info">
        <div class="school-name">Hệ thống Lớp tập lái ${schoolName}</div>
        <div class="school-sub">Hồ sơ đào tạo ô tô ban chuẩn</div>
      </div>
      <div class="creation-stamp">
        <div>Mã hợp đồng: HĐĐT-${student.code}</div>
        <div>Ngày đăng ký: ${formatDate(student.registrationDate)}</div>
      </div>
    </div>

    <div class="doc-title">HỢP ĐỒNG ĐÀO TẠO LÁI XE Ô TÔ</div>
    <div class="doc-subtitle">Số văn bản lưu: TR-${student.code}-${student.licenseClass}</div>

    <div class="section-title">BÊN A: ĐƠN VỊ ĐÀO TẠO LÁI XE CHUYÊN NGHIỆP</div>
    <div class="info-row">
      <div class="info-label">Cơ sở đào tạo:</div>
      <div class="info-value">Hệ thống Trung tâm Đạt chuẩn ${schoolName}</div>
    </div>
    <div class="info-row">
      <div class="info-label">Giải pháp quản lý:</div>
      <div class="info-value">Hệ thống Trợ lý Xếp lịch Đào tạo LịchHọcPro</div>
    </div>
    <div class="info-row">
      <div class="info-label">Đại diện tác nghiệp:</div>
      <div class="info-value">Ban Tuyển sinh & Đồng hành Sát hạch viên</div>
    </div>

    <div class="section-title">BÊN B: HỌC VIÊN ĐĂNG KÝ HỌC</div>
    <div class="info-grid">
      <div class="info-row">
        <div class="info-label">Họ và tên học viên:</div>
        <div class="info-value" style="text-transform: uppercase;">${student.name}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Mã số học viên:</div>
        <div class="info-value">${student.code}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Ngày sinh:</div>
        <div class="info-value">${formatDate(student.dob)}</div>
      </div>
      <div class="info-row">
        <div class="info-label">Điện thoại di động:</div>
        <div class="info-value">${student.phone}</div>
      </div>
      <div class="info-row" style="grid-column: span 2;">
        <div class="info-label">Địa chỉ liên lạc:</div>
        <div class="info-value">${student.address || 'Đã ghi nhận trên hệ thống cơ sở dữ liệu'}</div>
      </div>
    </div>

    <div class="section-title">ĐIỀU KHOẢN THỎA THUẬN KHÓA HỌC TRỰC QUAN</div>
    <ol class="clause-list">
      <li class="clause-item">
        <span class="clause-heading">Điều 1. Nội dung đào tạo học phần:</span>
        Bên A nhận đào tạo thực hành lái xe cho Bên B để tham gia kỳ sát hạch cấp Giấy phép lái xe hạng <strong>Hạng ${student.licenseClass}</strong>, chương trình đào tạo trọn gói: <strong>${student.courseType || 'Tiêu chuẩn thực hành 1 kèm 1'}</strong>. Số buổi thực hành sa hình & cabin quy chuẩn là <strong>${student.totalSessions} ca / buổi học tập trung</strong>.
      </li>
      <li class="clause-item">
        <span class="clause-heading">Điều 2. Thời gian biểu xếp ca và Thiết bị:</span>
        Kế hoạch xếp lớp bắt đầu kích hoạt tự động từ ngày đăng ký học viên. Bên B cam kết đi học đầy đủ theo đúng lịch do hai bên xếp đặt trên phần mềm. Giáo viên hướng dẫn được ưu tiên bố trí theo hồ sơ: <strong>${instructorName || 'Ban giáo vụ luân chuyển bám sát ca'}</strong>. Phương tiện huấn luyện dán tem an toàn kiểm định: <strong>${vehicleName || 'Xe thực hành theo tiêu chuẩn cơ sở'}</strong>.
      </li>
      <li class="clause-item">
        <span class="clause-heading">Điều 3. Kinh phí đào tạo & Thỏa thuận đóng lệ phí:</span>
        <div style="margin-top: 3px; padding-left: 10px;">
          • Tổng học phí trọn gói cam kết không phát sinh: <strong>${student.totalFee.toLocaleString('vi-VN')} VNĐ</strong> (Không bao gồm lệ phí thi chứng chỉ sát hạch của cơ quan nhà nước).<br/>
          • Số tiền học viên Bên B đã đóng: <strong style="color: #166534;">${student.paidAmount.toLocaleString('vi-VN')} VNĐ</strong>.<br/>
          • Dư nợ học phí còn lại: <strong style="color: #c2410c;">${student.remainingAmount.toLocaleString('vi-VN')} VNĐ</strong>.<br/>
          • Hạn cuối hoàn thiện dư nợ (nếu có nợ): Trước ngày <strong>${formatDate(student.nextPaymentDeadline)}</strong>.
        </div>
      </li>
      <li class="clause-item">
        <span class="clause-heading">Điều 4. Quyền và Trách nhiệm của các bên:</span>
        Bên A có nghĩa vụ cập nhật đầy đủ số giờ tập DAT, đảm bảo xe tập có phanh phụ bảo an hoạt động tốt. Bên B có trách nhiệm chấp hành nghiêm chỉnh luật an toàn giao thông, tuân thủ hướng dẫn kỹ thuật của giảng viên phụ trách cabin xe.
      </li>
    </ol>

    <div class="doc-footer-block">
      <div class="sig-box">
        <div class="sig-role">ĐẠI DIỆN BÊN A</div>
        <div class="sig-note">(Ký tên và ghi rõ chức vụ)</div>
        <div class="sig-placeholder">Giám đốc đào tạo</div>
      </div>
      <div class="sig-box">
        <div class="sig-role">ĐẠI DIỆN BÊN B</div>
        <div class="sig-note">(Học viên ký và ghi rõ họ tên)</div>
        <div class="sig-placeholder">${student.name}</div>
      </div>
    </div>
  `;

  printPortraitIsolatedDocument(`Hop_dong_dao_tao_${student.code}`, bodyHTML);
};

