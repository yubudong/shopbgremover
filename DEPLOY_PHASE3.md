# Phase 3 历史部署说明（已停用）

此文件记录的是早期 Next.js / Pages Functions 方案，不能再作为当前生产部署手册。

当前生产基线请阅读：

- `README.md`
- `docs/PRODUCT-SPEC-AND-PROGRESS.md`
- `worker/schema.sql`
- `worker/migrations/README.md`
- `wrangler.toml`

## 安全说明

此文件过去曾包含明文 API 和 OAuth 凭据。明文值已从当前版本移除，但
Git 历史仍可能保留旧值。所有曾在此处出现过的凭据都必须视为已泄露并完成轮换。

需要通过 Cloudflare Secret 管理的变量包括：

- `FAL_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `JWT_SECRET`
- `PAYPAL_CLIENT_ID`
- `PAYPAL_SECRET`
- `PAYPAL_MODE`
- `RESEND_API_KEY`
- `RESEND_FROM`

不要把凭据写入命令参数、Markdown、Shell 脚本或 Git。使用交互式命令：

```bash
npx wrangler secret put SECRET_NAME
```

## 当前部署入口

- 前端：Cloudflare Pages，静态页面源文件位于仓库根目录及语言目录。
- API：`worker/index.js`。
- D1：`shopbgremover-db`，当前结构以 `worker/schema.sql` 为准。

部署前必须：

1. 确认工作区干净且目标提交已推送。
2. 备份生产 D1。
3. 在隔离数据库验证迁移。
4. 运行语法、差异和关键业务测试。
5. 部署后验证登录、AI 成功扣费、失败不扣费、支付幂等和 ZIP 下载。
6. 更新 `docs/PRODUCT-SPEC-AND-PROGRESS.md`，未部署内容不得标记为上线。
