import fs from 'node:fs';

const file = 'server.ts';
const marker = 'EXAM_SCHEDULE_OCR_ROUTE_V1';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-exam-schedule-ocr-route] already patched');
  process.exit(0);
}

const anchor = '  app.get("/api/health", (req, res) => {\n';
const lines = [
  `  // ${marker}`,
  '  app.post("/api/ocr-exam-schedule", checkOcrAuth, async (req, res) => {',
  '    try {',
  '      const { image } = req.body || {};',
  '      if (!image || typeof image !== "string") {',
  '        return res.status(400).json({ success: false, error: "Thiếu ảnh lịch thi để nhận dạng." });',
  '      }',
  '      const dataUrlMatch = image.match(/^data:(.*?);base64,(.*)$/);',
  '      const mimeType = dataUrlMatch?.[1] || "image/jpeg";',
  '      const base64Data = dataUrlMatch?.[2] || image;',
  '      if (!base64Data || base64Data.length < 128) {',
  '        return res.status(400).json({ success: false, error: "Ảnh lịch thi không hợp lệ hoặc quá nhỏ." });',
  '      }',
  '      const ai = getGeminiClient();',
  '      const prompt = "Read the Vietnamese driving test schedule image. Extract all exam dates. Return valid JSON only with examDates as an array of YYYY-MM-DD strings. If the title contains month/year, use that year for all listed dates. Ignore row numbers and weekday names.";',
  '      const response = await withTimeout(',
  '        ai.models.generateContent({',
  '          model: "gemini-2.5-flash",',
  '          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],',
  '          config: {',
  '            responseMimeType: "application/json",',
  '            responseSchema: {',
  '              type: Type.OBJECT,',
  '              properties: { examDates: { type: Type.ARRAY, items: { type: Type.STRING } }, sourceMonth: { type: Type.STRING }, note: { type: Type.STRING } }',
  '            }',
  '          }',
  '        }),',
  '        45000,',
  '        "Máy chủ AI đọc lịch thi quá thời gian phản hồi."',
  '      );',
  '      let rawText = String((response as any).text || "").trim();',
  '      if (!rawText && (response as any).candidates?.[0]?.content?.parts?.[0]?.text) {',
  '        rawText = String((response as any).candidates[0].content.parts[0].text || "").trim();',
  '      }',
  '      const fence = String.fromCharCode(96).repeat(3);',
  '      rawText = rawText.replace(new RegExp("^" + fence + "json\\\\s*", "i"), "").replace(new RegExp("^" + fence + "\\\\s*", "i"), "").replace(new RegExp(fence + "$", "i"), "").trim();',
  '      let parsed: any = {};',
  '      try { parsed = rawText ? JSON.parse(rawText) : {}; } catch {',
  '        return res.status(502).json({ success: false, error: "AI đã phản hồi nhưng chưa đúng định dạng lịch thi. Vui lòng thử ảnh rõ hơn hoặc nhập tay." });',
  '      }',
  '      const normalize = (value: any) => {',
  '        const raw = String(value || "").trim();',
  '        const iso = raw.match(/^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})$/);',
  '        if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;',
  '        const vn = raw.match(/^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})$/);',
  '        if (vn) return `${vn[3]}-${vn[2].padStart(2, "0")}-${vn[1].padStart(2, "0")}`;',
  '        return "";',
  '      };',
  '      const dates = Array.isArray(parsed.examDates) ? parsed.examDates : [];',
  '      const examDates = Array.from(new Set(dates.map(normalize).filter(Boolean))).sort();',
  '      return res.json({ success: true, data: { examDates, sourceMonth: String(parsed.sourceMonth || ""), note: String(parsed.note || "") } });',
  '    } catch (error: any) {',
  '      console.error("[Exam Schedule OCR] Failed:", { message: error?.message, name: error?.name, code: error?.code });',
  '      const missingKey = String(error?.message || "").includes("GEMINI_API_KEY");',
  '      return res.status(missingKey ? 503 : 500).json({ success: false, error: missingKey ? "Máy chủ chưa cấu hình GEMINI_API_KEY cho nhận dạng AI." : (error?.message || "Không thể đọc ảnh lịch thi bằng AI lúc này.") });',
  '    }',
  '  });',
  ''
];

if (!src.includes(anchor)) throw new Error('[patch-exam-schedule-ocr-route] Missing health anchor');
src = src.replace(anchor, lines.join('\n') + anchor);
fs.writeFileSync(file, src);
console.log('[patch-exam-schedule-ocr-route] patched /api/ocr-exam-schedule route');
