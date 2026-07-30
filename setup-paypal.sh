#!/usr/bin/env bash

set -euo pipefail
umask 077

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${PROJECT_ROOT}/.dev.vars.paypal-sandbox"

printf '%s\n' \
  "=== ShopBG Remover PayPal 沙盒配置 ===" \
  "此命令只写本机 ${CONFIG_FILE}。" \
  "不会修改 Cloudflare Secret、生产 D1、Worker、Pages 或 PayPal Live 配置。" \
  "" \
  "请从 PayPal Developer Dashboard 的 Sandbox App 获取凭证。"

if [[ -e "${CONFIG_FILE}" ]]; then
  read -r -p "本机沙盒配置已存在，是否覆盖？输入 YES 继续：" CONFIRM
  if [[ "${CONFIRM}" != "YES" ]]; then
    echo "已取消，没有修改任何文件。"
    exit 0
  fi
fi

read -r -p "Sandbox Client ID：" PAYPAL_CLIENT_ID
read -r -s -p "Sandbox Secret（输入时不显示）：" PAYPAL_SECRET
printf '\n'

if [[ -z "${PAYPAL_CLIENT_ID}" || -z "${PAYPAL_SECRET}" ]]; then
  echo "Client ID 和 Secret 均不能为空。" >&2
  exit 1
fi

if [[ "${PAYPAL_CLIENT_ID}" == *$'\n'* || "${PAYPAL_SECRET}" == *$'\n'* ]]; then
  echo "凭证格式不正确。" >&2
  exit 1
fi

JWT_SECRET="$(openssl rand -hex 32)"
TEMP_FILE="$(mktemp "${TMPDIR:-/tmp}/shopbg-paypal-sandbox.XXXXXX")"
cleanup() {
  rm -f -- "${TEMP_FILE}"
}
trap cleanup EXIT

{
  printf 'PAYPAL_MODE="sandbox"\n'
  printf 'PAYPAL_CLIENT_ID="%s"\n' "${PAYPAL_CLIENT_ID//\"/\\\"}"
  printf 'PAYPAL_SECRET="%s"\n' "${PAYPAL_SECRET//\"/\\\"}"
  printf 'JWT_SECRET="%s"\n' "${JWT_SECRET}"
} > "${TEMP_FILE}"

chmod 600 "${TEMP_FILE}"
mv -- "${TEMP_FILE}" "${CONFIG_FILE}"
chmod 600 "${CONFIG_FILE}"

printf '%s\n' \
  "" \
  "沙盒凭证已安全保存；凭证内容没有输出到终端。" \
  "下一步运行：npm run paypal:sandbox:check" \
  "然后运行：npm run paypal:sandbox:run"
