import fs from 'node:fs';

const file = 'server.ts';
const marker = 'OCR_CARD_ROUTE_RESTORED_V2';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-ocr-card-route-v2] already patched');
  process.exit(0);
}

const anchor = '  app.get("/api/health", (req, res) => {\n';
const lines = [
  `  // ${marker}`,
  '  app.post("/api/ocr-card", checkOcrAuth, async (req, res) => {',
  '    try {',
  '      const { image, cardType } = req.body || {};',
  '      if (!image || typeof image !== "string") {',
  '        return res.status(400).json({ success: false, error: "Thiếu ảnh để nhận dạng." });',
  '      }',
  '      const dataUrlMatch = image.match(/^data:(.*?);base64,(.*)$/);',
  '      const mimeType = dataUrlMatch?.[1] || "image/jpeg";',
  '      const base64Data = dataUrlMatch?.[2] || image;',
  '      if (!base64Data || base64Data.length < 128) {',
  '        return res.status(400).json({ success: false, error: "Ảnh không hợp lệ hoặc quá nhỏ." });',
  '      }',
  '      const ai = getGeminiClient();',
  '      const sourceLabel = String(cardType || "");',
  '      const prompt = "Read the uploaded Vietnamese student enrollment source image. Return valid JSON only with fullName, dob, address. Unknown fields must be empty strings. Source: " + sourceLabel;',
  '      const response = await withTimeout(',
  '        ai.models.generateContent({',
  '          model: "gemini-2.5-flash",',
  '          contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64Data } }] }],',
  '          config: {',
  '            responseMimeType: "application/json",',
  '            responseSchema: {',
  '              type: Type.OBJECT,',
  '              properties: { fullName: { type: Type.STRING }, dob: { type: Type.STRING }, address: { type: Type.STRING } }',
  '            }',
  '          }',
  '        }),',
  '        45000,',
  '        "Máy chủ AI nhận dạng quá thời gian phản hồi."',
  '      );',
  '      let rawText = String((response as any).text || "").trim();',
  '      if (!rawText && (response as any).candidates?.[0]?.content?.parts?.[0]?.text) {',
  '        rawText = String((response as any).candidates[0].content.parts[0].text || "").trim();',
  '      }',
  '      const fence = String.fromCharCode(96).repeat(3);',
  '      rawText = rawText.replace(new RegExp("^" + fence + "json\\\\s*", "i"), "").replace(new RegExp("^" + fence + "\\\\s*", "i"), "").replace(new RegExp(fence + "$", "i"), "").trim();',
  '      let parsed = {};',
  '      try { parsed = rawText ? JSON.parse(rawText) : {}; } catch {',
  '        return res.status(502).json({ success: false, error: "AI đã phản hồi nhưng chưa đúng định dạng dữ liệu. Vui lòng thử ảnh rõ hơn." });',
  '      }',
  '      const clean = (value) => String(value || "").trim();',
  '      return res.json({ success: true, data: { fullName: clean(parsed.fullName).toUpperCase(), dob: clean(parsed.dob), address: clean(parsed.address), source: sourceLabel } });',
  '    } catch (error) {',
  '      console.error("[OCR Card] Recognition failed:", { message: error?.message, name: error?.name, code: error?.code });',
  '      const missingKey = String(error?.message || "").includes("GEMINI_API_KEY");',
  '      return res.status(missingKey ? 503 : 500).json({ success: false, error: missingKey ? "Máy chủ chưa cấu hình GEMINI_API_KEY cho nhận dạng AI." : (error?.message || "Không thể nhận dạng ảnh bằng AI lúc này.") });',
  '    }',
  '  });',
  ''
];

if (!src.includes(anchor)) throw new Error('[patch-ocr-card-route-v2] Missing health anchor');
src = src.replace(anchor, lines.join('\n') + anchor);
fs.writeFileSync(file, src);
console.log('[patch-ocr-card-route-v2] patched /api/ocr-card route');
