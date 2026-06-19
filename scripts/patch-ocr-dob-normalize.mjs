import fs from 'node:fs';

const file = 'src/components/Students.tsx';
const marker = 'OCR_DOB_NORMALIZE_TO_DATE_INPUT';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-ocr-dob-normalize] already patched');
  process.exit(0);
}

const anchor = `  const handleOcrUpload = async (e: React.ChangeEvent<HTMLInputElement>, cardType: 'cccd' | 'avatar' | 'eid') => {\n`;
const helper = `  // ${marker}\n  const normalizeOcrDobForInput = (value: string): string => {\n    const raw = String(value || '').trim();\n    if (!raw) return '';\n\n    const isoMatch = raw.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})$/);\n    if (isoMatch) {\n      const year = isoMatch[1];\n      const month = isoMatch[2].padStart(2, '0');\n      const day = isoMatch[3].padStart(2, '0');\n      return year + '-' + month + '-' + day;\n    }\n\n    const vnMatch = raw.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$/);\n    if (vnMatch) {\n      const day = vnMatch[1].padStart(2, '0');\n      const month = vnMatch[2].padStart(2, '0');\n      const year = vnMatch[3];\n      return year + '-' + month + '-' + day;\n    }\n\n    return raw;\n  };\n\n  const formatDobForVietnameseDisplay = (value: string): string => {\n    const normalized = normalizeOcrDobForInput(value);\n    const match = normalized.match(/^(\\d{4})-(\\d{2})-(\\d{2})$/);\n    return match ? match[3] + '/' + match[2] + '/' + match[1] : String(value || '').trim();\n  };\n\n`;

if (!src.includes(anchor)) {
  throw new Error('[patch-ocr-dob-normalize] Could not find handleOcrUpload anchor');
}
src = src.replace(anchor, helper + anchor);

const oldBlock = `            if (dob) {\n              setNewDob(dob);\n            }\n            alert(\`🔍 HỆ THỐNG AI ĐÃ TỰ ĐỘNG QUÉT THẺ THÀNH CÔNG:\\n- Họ tên: \${fullName || 'Chưa nhận dạng được'}\\n- Ngày sinh: \${dob || 'Chưa nhận dạng được'}\\n- Địa chỉ: \${address || 'Chưa nhận dạng được'}\`);`;
const newBlock = `            const normalizedDob = dob ? normalizeOcrDobForInput(dob) : '';\n            if (normalizedDob) {\n              setNewDob(normalizedDob);\n            }\n            const displayDob = dob ? formatDobForVietnameseDisplay(dob) : '';\n            alert(\`🔍 HỆ THỐNG AI ĐÃ TỰ ĐỘNG QUÉT THẺ THÀNH CÔNG:\\n- Họ tên: \${fullName || 'Chưa nhận dạng được'}\\n- Ngày sinh: \${displayDob || 'Chưa nhận dạng được'}\\n- Địa chỉ: \${address || 'Chưa nhận dạng được'}\`);`;

if (!src.includes(oldBlock)) {
  throw new Error('[patch-ocr-dob-normalize] Could not find DOB setNewDob block');
}
src = src.replace(oldBlock, newBlock);

fs.writeFileSync(file, src);
console.log('[patch-ocr-dob-normalize] patched OCR DOB date input normalization');
