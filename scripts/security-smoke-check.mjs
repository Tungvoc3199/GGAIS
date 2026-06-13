/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'http';

const BASE_URL = 'http://localhost:3000';

async function runCheck(name, fn) {
  try {
    await fn();
    console.log(`[PASS] ${name}`);
  } catch (err) {
    console.error(`[FAIL] ${name}:`, err.message);
    process.exit(1);
  }
}

// Helper to make custom backend requests
function makeRequest(url, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 5000
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed = data;
        if (data) {
          try {
            parsed = JSON.parse(data);
          } catch (e) {
            parsed = data;
          }
        }
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: parsed
        });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  console.log('=== STARTING SECURITY SMOKE CHECK ===');

  await runCheck('Chặn truy cập ẩn danh (Không có Token) - Thêm Học Viên', async () => {
    const res = await makeRequest(`${BASE_URL}/api/students/create`, 'POST', {}, { name: 'Unauthorized test student' });
    if (res.statusCode !== 401 && res.statusCode !== 403) {
      throw new Error(`Đầu ra trả về mã ${res.statusCode} (Kỳ vọng: 401 hoặc 403)`);
    }
  });

  await runCheck('Chặn truy cập ẩn danh (Không có Token) - Xóa Học Viên', async () => {
    const res = await makeRequest(`${BASE_URL}/api/students/delete`, 'POST', {}, { studentId: 'test-id' });
    if (res.statusCode !== 401 && res.statusCode !== 403) {
      throw new Error(`Đầu ra trả về mã ${res.statusCode} (Kỳ vọng: 401 hoặc 403)`);
    }
  });

  await runCheck('Chặn truy cập ẩn danh (Không có Token) - Lưu trữ học viên', async () => {
    const res = await makeRequest(`${BASE_URL}/api/students/archive`, 'POST', {}, { studentId: 'test-id' });
    if (res.statusCode !== 401 && res.statusCode !== 403) {
      throw new Error(`Đầu ra trả về mã ${res.statusCode} (Kỳ vọng: 401 hoặc 403)`);
    }
  });

  console.log('=== SECURITY SMOKE CHECK COMPLETED SUCCESSFULLY ===');
}

main().catch((err) => {
  console.error('Lỗi nghiêm trọng trong kiểm tra bảo mật:', err);
  process.exit(1);
});
