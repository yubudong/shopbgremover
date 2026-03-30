// 测试线上 API 端点
const fs = require('fs');

async function testAPI() {
  console.log('🧪 测试线上 API...\n');

  // 使用测试图片
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const imageBuffer = Buffer.from(testImageBase64, 'base64');

  const FormData = require('form-data');
  const form = new FormData();
  form.append('image_file', imageBuffer, { filename: 'test.png', contentType: 'image/png' });

  try {
    const response = await fetch('https://api.shopbgremover.com/api/remove-bg', {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    console.log(`状态码: ${response.status}`);
    console.log(`状态文本: ${response.statusText}\n`);

    const contentType = response.headers.get('content-type');
    console.log(`Content-Type: ${contentType}\n`);

    if (contentType?.includes('application/json')) {
      const json = await response.json();
      console.log('响应 JSON:', JSON.stringify(json, null, 2));
    } else if (contentType?.includes('image')) {
      const buffer = await response.arrayBuffer();
      console.log(`✅ 返回图片，大小: ${buffer.byteLength} 字节`);
    } else {
      const text = await response.text();
      console.log('响应文本:', text);
    }

  } catch (error) {
    console.error('❌ 错误:', error.message);
  }
}

testAPI();
