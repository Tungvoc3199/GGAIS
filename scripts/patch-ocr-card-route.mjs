import fs from 'node:fs';

const file = 'server.ts';
const marker = 'OCR_CARD_ROUTE_RESTORED_VNEID_PRIMARY';
let src = fs.readFileSync(file, 'utf8');

if (src.includes(marker)) {
  console.log('[patch-ocr-card-route] already patched');
  process.exit(0);
}

const anchor = `  app.get("/api/health", (req, res) => {\n`;

const route = `  // ${marker}\n  app.post("/api/ocr-card", checkOcrAuth, async (req, res) => {\n    try {\n      const { image, cardType } = req.body || {};\n      if (!image || typeof image !== "string") {\n        return res.status(400).json({ success: false, error: "Thiếu ảnh để nhận dạng." });\n      }\n\n      const dataUrlMatch = image.match(/^data:(.*?);base64,(.*)$/);\n      const mimeType = dataUrlMatch?.[1] || "image/jpeg";\n      const base64Data = dataUrlMatch?.[2] || image;\n\n      if (!base64Data || base64Data.length < 128) {\n        return res.status(400).json({ success: false, error: "Ảnh không hợp lệ hoặc quá nhỏ." });\n      }\n\n      const ai = getGeminiClient();\n      const isVneid = String(cardType || "").toLowerCase().includes("vneid") || String(cardType || "").toLowerCase().includes("điện tử");\n      const prompt = `Trích xuất dữ liệu tuyển sinh từ ảnh giấy tờ học viên.\\n` +\n        `Nguồn ảnh: ${isVneid ? "VNeID" : "CCCD"}. Nếu là VNeID, ưu tiên địa chỉ đang hiển thị trên VNeID.\\n` +\n        `Chỉ trả JSON hợp lệ gồm các trường: fullName, dob dạng YYYY-MM-DD nếu đọc được, address. Trường không chắc thì để chuỗi rỗng.`;\n\n      const response = await withTimeout(\n        ai.models.generateContent({\n          model: "gemini-2.5-flash",\n          contents: [\n            {\n              role: "user",\n              parts: [\n                { text: prompt },\n                { inlineData: { mimeType, data: base64Data } }\n              ]\n            }\n          ],\n          config: {\n            responseMimeType: "application/json",\n            responseSchema: {\n              type: Type.OBJECT,\n              properties: {\n                fullName: { type: Type.STRING },\n                dob: { type: Type.STRING },\n                address: { type: Type.STRING }\n              }\n            }\n          }\n        }),\n        45000,\n        "Máy chủ AI nhận dạng quá thời gian phản hồi."\n      );\n\n      let rawText = String((response as any).text || "").trim();\n      if (!rawText && (response as any).candidates?.[0]?.content?.parts?.[0]?.text) {\n        rawText = String((response as any).candidates[0].content.parts[0].text || "").trim();\n      }\n      rawText = rawText.replace(/^```json\\s*/i, "").replace(/^```\\s*/i, "").replace(/```$/i, "").trim();\n\n      let parsed: any = {};\n      try {\n        parsed = rawText ? JSON.parse(rawText) : {};\n      } catch {\n        return res.status(502).json({ success: false, error: "AI đã phản hồi nhưng chưa đúng định dạng dữ liệu. Vui lòng thử ảnh rõ hơn." });\n      }\n\n      const clean = (value: any) => String(value || "").trim();\n      return res.json({\n        success: true,\n        data: {\n          fullName: clean(parsed.fullName).toUpperCase(),\n          dob: clean(parsed.dob),\n          address: clean(parsed.address),\n          source: isVneid ? "vneid" : "cccd"\n        }\n      });\n    } catch (error: any) {\n      console.error("[OCR Card] Recognition failed:", { message: error?.message, name: error?.name, code: error?.code });\n      const missingKey = String(error?.message || "").includes("GEMINI_API_KEY");\n      return res.status(missingKey ? 503 : 500).json({\n        success: false,\n        error: missingKey ? "Máy chủ chưa cấu hình GEMINI_API_KEY cho nhận dạng AI." : (error?.message || "Không thể nhận dạng giấy tờ bằng AI lúc này.")\n      });\n    }\n  });\n\n`;

if (!src.includes(anchor)) {
  throw new Error('[patch-ocr-card-route] Could not find /api/health anchor');
}

src = src.replace(anchor, route + anchor);
fs.writeFileSync(file, src);
console.log('[patch-ocr-card-route] patched /api/ocr-card route');
