#!/bin/bash
# PayPal 沙盒支付配置脚本

echo "=== PayPal 沙盒支付配置向导 ==="
echo ""

# 检查 wrangler 是否安装
if ! command -v wrangler &> /dev/null; then
    echo "❌ wrangler 未安装"
    echo "安装命令: npm install -g wrangler"
    exit 1
fi

echo "✅ wrangler 已安装"
echo ""

# 提示用户输入凭证
echo "请访问 https://developer.paypal.com/dashboard/"
echo "切换到 Sandbox 标签，获取你的 App 凭证"
echo ""

read -p "请输入 PayPal Sandbox Client ID: " PAYPAL_CLIENT_ID
read -p "请输入 PayPal Sandbox Secret: " PAYPAL_SECRET

# 生成 JWT Secret
JWT_SECRET=$(openssl rand -base64 32)
echo ""
echo "✅ 已生成 JWT_SECRET: $JWT_SECRET"
echo ""

# 配置 Cloudflare Worker Secrets
echo "正在配置 Cloudflare Worker 环境变量..."
echo ""

echo "$PAYPAL_CLIENT_ID" | wrangler secret put PAYPAL_CLIENT_ID
echo "$PAYPAL_SECRET" | wrangler secret put PAYPAL_SECRET
echo "$JWT_SECRET" | wrangler secret put JWT_SECRET

echo ""
echo "✅ 环境变量配置完成！"
echo ""

# 初始化数据库
echo "正在初始化数据库..."
wrangler d1 execute shopbgremover-db --file=schema.sql --remote

echo ""
echo "✅ 数据库初始化完成！"
echo ""

# 部署 Worker
echo "正在部署 Worker..."
wrangler deploy

echo ""
echo "🎉 配置完成！"
echo ""
echo "下一步："
echo "1. 访问 https://www.shopbgremover.com/pricing.html"
echo "2. 使用 Google 登录"
echo "3. 点击 PayPal 按钮测试支付"
echo ""
