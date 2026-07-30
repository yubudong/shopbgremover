#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

printf '%s\n' \
  "=== ShopBG Remover PayPal 沙盒诊断 ===" \
  "只验证本机 Sandbox 凭证，不读取或修改生产配置。"

cd "${PROJECT_ROOT}"
node scripts/paypal_sandbox.mjs check
