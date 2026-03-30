#!/bin/bash
# PayPal 沙盒支付诊断脚本

echo "=== PayPal 沙盒支付诊断 ==="
echo ""

# 1. 检查项目文件
echo "📁 检查项目文件..."
if [ -f "worker/index.js" ]; then
    echo "✅ worker/index.js 存在"
else
    echo "❌ worker/index.js 不存在"
fi

if [ -f "public/pricing.html" ]; then
    echo "✅ public/pricing.html 存在"
else
    echo "❌ public/pricing.html 不存在"
fi

if [ -f "schema.sql" ]; then
    echo "✅ schema.sql 存在"
else
    echo "❌ schema.sql 不存在"
fi

echo ""

# 2. 检查 PayPal API 端点
echo "🔍 检查 PayPal API 端点..."
grep -n "paypal/create-order" worker/index.js | head -3
grep -n "paypal/capture-order" worker/index.js | head -3

echo ""

# 3. 检查前端 Client ID
echo "🔍 检查前端 PayPal Client ID..."
grep "paypal.com/sdk/js" public/pricing.html

echo ""

# 4. 检查 wrangler 配置
echo "📋 检查 wrangler.toml..."
cat wrangler.toml

echo ""
echo "=== 诊断完成 ==="
