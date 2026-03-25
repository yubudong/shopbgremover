# Phase 3 部署说明

## 已完成
✅ Google OAuth 登录集成
✅ D1 数据库 schema（4 张表）
✅ 积分系统 API（查询 + 扣减）
✅ 历史记录 API（查询 + 保存）
✅ 前端登录界面 + 积分显示 + 历史弹窗
✅ 批量处理（并发 5 张）

## 部署前必做

### 1. 初始化 D1 数据库表
在 Cloudflare Dashboard 执行 `schema.sql`：
```bash
# 方式 1：命令行（需要 CLOUDFLARE_API_TOKEN）
wrangler d1 execute shopbgremover-db --file=schema.sql --remote

# 方式 2：Dashboard 手动执行
# 访问 https://dash.cloudflare.com -> D1 -> shopbgremover-db -> Console
# 复制粘贴 schema.sql 内容并执行
```

### 2. 配置 Cloudflare Pages 环境变量
在 Pages 项目设置中添加：
- `REMOVE_BG_API_KEY` = XQ4tTk1g4cQMixrojMzJCw9R
- `GOOGLE_CLIENT_ID` = 346511510193-lbstnvotup93lfumjci8c7us1ooj542s.apps.googleusercontent.com
- `GOOGLE_CLIENT_SECRET` = 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
- `NEXTAUTH_SECRET` = L0L7tZy5A0SagIGKkjoXnMrrbHGA5fhyvCcq1XIsrSA=
- `NEXTAUTH_URL` = https://shopbgremover.com

### 3. Google OAuth 回调 URL
在 Google Cloud Console 添加授权回调：
```
https://shopbgremover.com/api/auth/callback/google
```

### 4. 部署
```bash
npm run pages:deploy
```

## 测试清单
- [ ] 访问 shopbgremover.com，点击 "Sign in with Google"
- [ ] 登录后查看右上角积分显示（新用户应该是 20）
- [ ] 上传 1 张图片处理，积分减 1
- [ ] 点击 History 查看历史记录
- [ ] 上传 5 张图片批量处理，积分减 5

## 下一步（Phase 4）
- 尺寸预设（Shopify/Amazon/eBay）
- 自定义背景色（HEX 输入）
- 批量重命名模板
