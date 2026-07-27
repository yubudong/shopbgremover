import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname);
const output = path.join(root, 'output');
const visual = path.join(root, 'assets', 'generated-background-removal-visual.png');
const mark = path.join(root, 'assets', 'shopbgremover-mark.png');
const font = 'STHeiti, PingFang SC, Noto Sans CJK SC, sans-serif';

await mkdir(output, { recursive: true });

function svgDocument(content, extra = '') {
  return Buffer.from(`
    <svg width="1080" height="1080" viewBox="0 0 1080 1080" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="page" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#F8FAFF"/>
          <stop offset="1" stop-color="#EEF4FF"/>
        </linearGradient>
        <linearGradient id="blue" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#225DE8"/>
          <stop offset="1" stop-color="#4387FF"/>
        </linearGradient>
        <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="16" stdDeviation="22" flood-color="#0B1F3A" flood-opacity=".12"/>
        </filter>
      </defs>
      ${extra}
      ${content}
    </svg>
  `);
}

function brandHeader(kicker = 'ShopBG Remover') {
  return `
    <rect x="54" y="48" width="972" height="92" rx="28" fill="#FFFFFF" fill-opacity=".96"/>
    <image href="data:image/png;base64,MARK_DATA" x="72" y="59" width="70" height="70"/>
    <text x="160" y="107" font-family="${font}" font-size="34" font-weight="800" fill="#0B1F3A">${kicker}</text>
    <rect x="814" y="72" width="184" height="46" rx="23" fill="#FFF2A8"/>
    <text x="906" y="104" text-anchor="middle" font-family="${font}" font-size="22" font-weight="800" fill="#6B5100">虚拟商品</text>
  `;
}

async function withMark(svg) {
  const markData = await sharp(mark).png().toBuffer();
  return Buffer.from(svg.toString().replace('MARK_DATA', markData.toString('base64')));
}

async function makeCover({ credits, price, filename, audience }) {
  const base = await sharp(visual).resize(1080, 1080, { fit: 'cover' }).png().toBuffer();
  const overlay = await withMark(svgDocument(`
    <rect width="1080" height="1080" fill="url(#topFade)"/>
    ${brandHeader()}
    <text x="62" y="218" font-family="${font}" font-size="32" font-weight="700" fill="#225DE8">电商图片处理服务</text>
    <text x="58" y="348" font-family="${font}">
      <tspan font-size="126" font-weight="900" fill="#0B1F3A">${credits}</tspan>
      <tspan dx="26" dy="-14" font-size="50" font-weight="900" fill="#225DE8">积分</tspan>
    </text>
    <rect x="62" y="380" width="298" height="60" rx="30" fill="#0B1F3A"/>
    <text x="211" y="420" text-anchor="middle" font-family="${font}" font-size="26" font-weight="800" fill="#FFFFFF">一次性兑换码</text>
    <rect x="62" y="464" width="256" height="104" rx="28" fill="#FFD600" filter="url(#shadow)"/>
    <text x="190" y="535" text-anchor="middle" font-family="${font}" font-size="54" font-weight="900" fill="#0B1F3A">¥${price}</text>
    <text x="62" y="624" font-family="${font}" font-size="27" font-weight="700" fill="#334155">${audience}</text>
    <rect x="0" y="930" width="1080" height="150" fill="#0B1F3A"/>
    <text x="540" y="990" text-anchor="middle" font-family="${font}" font-size="28" font-weight="800" fill="#FFFFFF">付款在闲鱼完成 · 无实物物流</text>
    <text x="540" y="1034" text-anchor="middle" font-family="${font}" font-size="23" font-weight="600" fill="#B9D2FF">卡密仅可成功兑换一次 · 付费积分永久有效</text>
  `, `
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".99"/>
      <stop offset=".56" stop-color="#FFFFFF" stop-opacity=".91"/>
      <stop offset=".78" stop-color="#FFFFFF" stop-opacity=".08"/>
    </linearGradient>
  `));

  await sharp(base)
    .composite([{ input: overlay }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, filename));
}

async function makeDetail({ filename, title, subtitle, content }) {
  const document = await withMark(svgDocument(`
    <rect width="1080" height="1080" fill="url(#page)"/>
    ${brandHeader('ShopBG Remover · 上架说明')}
    <text x="62" y="232" font-family="${font}" font-size="58" font-weight="900" fill="#0B1F3A">${title}</text>
    <text x="64" y="282" font-family="${font}" font-size="26" font-weight="600" fill="#58708F">${subtitle}</text>
    ${content}
    <rect x="54" y="958" width="972" height="72" rx="24" fill="#0B1F3A"/>
    <text x="540" y="1004" text-anchor="middle" font-family="${font}" font-size="24" font-weight="700" fill="#FFFFFF">ShopBG Remover · 专为电商商品图设计</text>
  `));

  await sharp(document)
    .png({ compressionLevel: 9 })
    .toFile(path.join(output, filename));
}

const bullet = (y, heading, detail) => `
  <circle cx="90" cy="${y - 8}" r="20" fill="#2F6BFF"/>
  <path d="M80 ${y - 8}l7 7 14-17" fill="none" stroke="#FFF" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="130" y="${y}" font-family="${font}" font-size="31" font-weight="800" fill="#0B1F3A">${heading}</text>
  <text x="130" y="${y + 42}" font-family="${font}" font-size="23" font-weight="500" fill="#58708F">${detail}</text>
`;

const step = (y, number, heading, detail) => `
  <rect x="58" y="${y}" width="964" height="142" rx="30" fill="#FFFFFF" filter="url(#shadow)"/>
  <circle cx="130" cy="${y + 71}" r="40" fill="url(#blue)"/>
  <text x="130" y="${y + 83}" text-anchor="middle" font-family="${font}" font-size="32" font-weight="900" fill="#FFFFFF">${number}</text>
  <text x="200" y="${y + 60}" font-family="${font}" font-size="31" font-weight="800" fill="#0B1F3A">${heading}</text>
  <text x="200" y="${y + 101}" font-family="${font}" font-size="23" font-weight="500" fill="#58708F">${detail}</text>
`;

await Promise.all([
  makeCover({
    credits: '100',
    price: '22',
    filename: '01-cover-100-credits.png',
    audience: '适合初次购买与轻量处理',
  }),
  makeCover({
    credits: '300',
    price: '60',
    filename: '02-cover-300-credits.png',
    audience: '适合店铺日常图片运营',
  }),
  makeCover({
    credits: '1000',
    price: '160',
    filename: '03-cover-1000-credits.png',
    audience: '适合高频批量处理',
  }),
  makeDetail({
    filename: '04-what-you-get.png',
    title: '你购买的是什么？',
    subtitle: '自有网站图片处理服务的一次性兑换码',
    content: `
      <rect x="58" y="330" width="964" height="540" rx="36" fill="#FFFFFF" filter="url(#shadow)"/>
      ${bullet(410, '一张一次性卡密', '付款后通过闲鱼聊天发送，卡密只能成功兑换一次')}
      ${bullet(535, '对应套餐的付费积分', '可选择 100、300 或 1000 积分，兑换后进入当前账号')}
      ${bullet(660, '付费积分永久有效', '只用于 ShopBG Remover 图片处理，不能提现或兑换现金')}
      ${bullet(785, '每次成功 AI 去背景扣 1 积分', '透明图跳过及浏览器本地处理不会因此扣除 AI 积分')}
    `,
  }),
  makeDetail({
    filename: '05-purchase-and-redeem.png',
    title: '购买与兑换流程',
    subtitle: '所有付款都在闲鱼内完成，不接受私下转账',
    content: `
      ${step(328, '1', '在闲鱼选择套餐并付款', '确认需要 100、300 或 1000 积分')}
      ${step(490, '2', '卖家核对订单并发送卡密', '通过闲鱼聊天发送一次性兑换码')}
      ${step(652, '3', '登录 ShopBG Remover', '进入“卡密充值”，请确认登录的是使用账号')}
      ${step(814, '4', '输入卡密完成兑换', '成功后积分立即进入当前账号')}
    `,
  }),
  makeDetail({
    filename: '06-features.png',
    title: '可以处理什么？',
    subtitle: '面向 Shopify、Amazon、eBay 等电商商品图',
    content: `
      <rect x="58" y="330" width="458" height="220" rx="34" fill="#FFFFFF" filter="url(#shadow)"/>
      <rect x="564" y="330" width="458" height="220" rx="34" fill="#FFFFFF" filter="url(#shadow)"/>
      <rect x="58" y="586" width="458" height="220" rx="34" fill="#FFFFFF" filter="url(#shadow)"/>
      <rect x="564" y="586" width="458" height="220" rx="34" fill="#FFFFFF" filter="url(#shadow)"/>
      <text x="96" y="402" font-family="${font}" font-size="34" font-weight="900" fill="#225DE8">AI 去背景</text>
      <text x="96" y="452" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">商品主体自动抠图</text>
      <text x="96" y="493" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">支持批量处理</text>
      <text x="602" y="402" font-family="${font}" font-size="34" font-weight="900" fill="#225DE8">自定义背景</text>
      <text x="602" y="452" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">白色、透明、纯色</text>
      <text x="602" y="493" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">或上传模板背景</text>
      <text x="96" y="658" font-family="${font}" font-size="34" font-weight="900" fill="#225DE8">平台尺寸</text>
      <text x="96" y="708" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">Shopify / Amazon / eBay</text>
      <text x="96" y="749" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">TikTok Shop / Shopee</text>
      <text x="602" y="658" font-family="${font}" font-size="34" font-weight="900" fill="#225DE8">批量导出</text>
      <text x="602" y="708" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">PNG / JPEG / WebP</text>
      <text x="602" y="749" font-family="${font}" font-size="24" font-weight="600" fill="#58708F">ZIP 与 SKU 文件夹</text>
      <rect x="58" y="844" width="964" height="72" rx="24" fill="#FFF5B8"/>
      <text x="540" y="890" text-anchor="middle" font-family="${font}" font-size="23" font-weight="800" fill="#6B5100">局部修图功能仅用于本人拥有或已获得授权的图片</text>
    `,
  }),
  makeDetail({
    filename: '07-before-you-buy.png',
    title: '购买前请确认',
    subtitle: '建议先使用网站免费额度确认是否符合需求',
    content: `
      <rect x="58" y="330" width="964" height="550" rx="36" fill="#FFFFFF" filter="url(#shadow)"/>
      ${bullet(405, '虚拟商品，无实物物流', '付款后交付一次性兑换码，不会寄送实体卡片')}
      ${bullet(520, '先登录正确的使用账号', '兑换成功后积分进入当时登录账号，不能转移')}
      ${bullet(635, '素材不同，处理效果会有差异', '毛发、玻璃、半透明和复杂边缘可能需要进一步调整')}
      ${bullet(750, '卡密异常请立即联系', '无法兑换时会核对订单、卡密状态并协助处理')}
      ${bullet(865, '退款按闲鱼规则和实际使用情况处理', '已兑换并开始使用的数字服务需结合使用记录协商')}
    `,
  }),
]);

const previewFiles = [
  '01-cover-100-credits.png',
  '02-cover-300-credits.png',
  '03-cover-1000-credits.png',
  '04-what-you-get.png',
  '05-purchase-and-redeem.png',
  '06-features.png',
  '07-before-you-buy.png',
];
const previewTiles = await Promise.all(previewFiles.map(async (file, index) => ({
  input: await sharp(path.join(output, file)).resize(510, 510).png().toBuffer(),
  left: index % 2 === 0 ? 20 : 550,
  top: Math.floor(index / 2) * 530 + 20,
})));
await sharp({
  create: {
    width: 1080,
    height: 2140,
    channels: 4,
    background: '#E8EEF8',
  },
})
  .composite(previewTiles)
  .jpeg({ quality: 90 })
  .toFile(path.join(root, 'preview-contact-sheet.jpg'));

console.log(`Generated 7 Xianyu listing images in ${output}`);
