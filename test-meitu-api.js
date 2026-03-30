// 测试美图 API 接入
const ACCESS_KEY = '3d0c069dac0c45879a1ea3f9c03b2030';
const SECRET_KEY = '57dbc6cc16d04fb3b7cf413c3dc08ecb';

// SHA-256 哈希
async function sha256Hex(str) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

// HMAC-SHA256
async function hmacSha256Hex(key, str) {
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(str, 'utf8').digest('hex');
}

// 格式化时间为 yyyyMMddTHHmmssZ
function toBasicDate(d) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

// 美图签名函数
async function meituSign(method, urlStr, extraHeaders, body, ak, sk) {
  const url = new URL(urlStr);
  const t = new Date();
  const dateTime = toBasicDate(t);

  const canonicalURI = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';

  const sortedQuery = Array.from(url.searchParams.entries())
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const allHeaders = {
    'content-type': 'application/json',
    'x-sdk-content-sha256': 'UNSIGNED-PAYLOAD',
    'host': url.hostname,
    'x-sdk-date': dateTime,
    ...Object.fromEntries(Object.entries(extraHeaders || {}).map(([k, v]) => [k.toLowerCase(), v])),
  };

  const signedHeaderKeys = Object.keys(allHeaders).sort();
  const canonicalHeaders = signedHeaderKeys.map(k => `${k}:${allHeaders[k]}`).join('\n');
  const signedHeadersStr = signedHeaderKeys.join(';');
  const hexencode = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [method.toUpperCase(), canonicalURI, sortedQuery, canonicalHeaders, signedHeadersStr, hexencode].join('\n');

  const crHash = await sha256Hex(canonicalRequest);
  const stringToSign = `SDK-HMAC-SHA256\n${dateTime}\n${crHash}`;

  const signature = await hmacSha256Hex(sk, stringToSign);

  const rawAuth = `SDK-HMAC-SHA256 Access=${ak}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;
  const authorization = 'Bearer ' + Buffer.from(rawAuth).toString('base64');

  return {
    'Authorization': authorization,
    'X-Sdk-Date': dateTime,
    'X-Sdk-Content-Sha256': 'UNSIGNED-PAYLOAD',
    'Content-Type': 'application/json',
    'Host': url.hostname,
  };
}

// 测试函数
async function testMeituAPI() {
  console.log('🧪 开始测试美图 API...\n');

  // 使用一个简单的测试图片（1x1 像素的 PNG）
  const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  const pushUrl = 'https://openapi.meitu.com/api/v1/sdk/sync/push';
  const pushBody = JSON.stringify({
    task: '/v1/sod',
    task_type: 'mtlab',
    params: JSON.stringify({
      parameter: {
        nMask: false,
        model_type: 1  // 1=商品抠图
      }
    }),
    init_images: [{
      url: testImageBase64,
      profile: {
        media_profiles: { media_data_type: 'jpg' },
        version: 'v1'
      }
    }],
    sync_timeout: 30,
    rsp_media_type: 'jpg'
  });

  console.log('📤 提交抠图任务到美图 API...');
  const pushHeaders = await meituSign('POST', pushUrl, { 'Content-Type': 'application/json' }, pushBody, ACCESS_KEY, SECRET_KEY);

  try {
    const pushRes = await fetch(pushUrl, {
      method: 'POST',
      headers: pushHeaders,
      body: pushBody,
    });

    const pushText = await pushRes.text();
    console.log(`\n📥 响应状态: ${pushRes.status}`);
    console.log(`📥 响应内容: ${pushText}\n`);

    if (!pushRes.ok) {
      console.error('❌ API 请求失败');
      return;
    }

    const pushData = JSON.parse(pushText);

    if (pushData.code && pushData.code !== 0) {
      console.error(`❌ 美图 API 返回错误: ${pushData.message || '未知错误'}`);
      console.error(`错误代码: ${pushData.code}`);
      return;
    }

    const status = pushData?.data?.status;
    console.log(`\n✅ 任务状态: ${status}`);

    // status=10 表示同步完成
    if (status === 10 || status === 9) {
      const mediaList = pushData?.data?.result?.media_info_list;
      if (mediaList?.[0]?.media_data) {
        const resultUrl = mediaList[0].media_data;
        console.log(`✅ 处理成功！`);
        console.log(`✅ 结果图片: ${resultUrl}`);
        console.log(`\n🎉 美图 API 测试完全成功！`);
      } else {
        console.log('⚠️  未找到返回图片');
      }
    } else if (status === 2) {
      console.error('❌ 处理失败');
    } else {
      console.log(`⚠️  未知状态: ${status}`);
    }

  } catch (error) {
    console.error('\n❌ 测试过程中出错:', error.message);
    console.error(error.stack);
  }
}

testMeituAPI();
