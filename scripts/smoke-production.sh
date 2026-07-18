#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://www.monterminal.fun}}"
BASE_URL="${BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Smoke testing $BASE_URL"

curl --fail --silent --show-error "$BASE_URL/" > "$TMP_DIR/index.html"
grep -q "MonTerminal" "$TMP_DIR/index.html"
echo "✓ frontend"

curl --fail --silent --show-error "$BASE_URL/proof" > "$TMP_DIR/proof.html"
grep -q "MonTerminal" "$TMP_DIR/proof.html"
curl --fail --silent --show-error \
  "$BASE_URL/token/monad/0x350035555e10d9afaf1566aaebfced5ba6c27777" \
  > "$TMP_DIR/token.html"
grep -q "MonTerminal" "$TMP_DIR/token.html"
echo "✓ SPA deep links"

curl --fail --silent --show-error "$BASE_URL/docs/" > "$TMP_DIR/docs.html"
grep -q "MonTerminal Documentation" "$TMP_DIR/docs.html"
curl --fail --silent --show-error "$BASE_URL/docs/ai-agent-verification" > "$TMP_DIR/ai-docs.html"
grep -q "Five-minute verification" "$TMP_DIR/ai-docs.html"
curl --fail --silent --show-error "$BASE_URL/docs/tutorials" > "$TMP_DIR/tutorials.html"
grep -q "Terminal" "$TMP_DIR/tutorials.html"
grep -q "Swap · Bridge" "$TMP_DIR/tutorials.html"
grep -q "Portfolio" "$TMP_DIR/tutorials.html"
echo "✓ static documentation routes"

curl --fail --silent --show-error "$BASE_URL/sitemap" > "$TMP_DIR/sitemap.html"
grep -q "Everything, mapped" "$TMP_DIR/sitemap.html"
curl --fail --silent --show-error "$BASE_URL/sitemap.xml" > "$TMP_DIR/sitemap.xml"
grep -q "/docs/ai-agent-verification" "$TMP_DIR/sitemap.xml"
curl --fail --silent --show-error "$BASE_URL/sitemap.json" > "$TMP_DIR/sitemap.json"
node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(v.network?.chainId!==143||!v.proof?.limitBuyExecution)throw new Error("invalid machine sitemap")' "$TMP_DIR/sitemap.json"
curl --fail --silent --show-error "$BASE_URL/llms.txt" > "$TMP_DIR/llms.txt"
grep -q "AI verification guide" "$TMP_DIR/llms.txt"
curl --fail --silent --show-error "$BASE_URL/.well-known/ai-site.json" > "$TMP_DIR/ai-site.json"
node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(v.network?.chainId!==143||!v.verificationGuide)throw new Error("invalid AI manifest")' "$TMP_DIR/ai-site.json"
echo "✓ sitemap and AI discovery files"

curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
  "$BASE_URL/api/rpc" > "$TMP_DIR/rpc.json"
node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(v.result!=="0x8f")throw new Error(`unexpected chain id: ${v.result}`)' "$TMP_DIR/rpc.json"
echo "✓ Monad RPC chain id 143"

GECKO_PATH='%2Fapi%2Fv2%2Fnetworks%2Fmonad%2Ftrending_pools%3Finclude%3Dbase_token%26duration%3D24h'
curl --fail --silent --show-error "$BASE_URL/api/gecko?path=$GECKO_PATH" > "$TMP_DIR/gecko.json"
POOL="$(node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(!Array.isArray(v.data)||v.data.length===0)throw new Error("no live pools");const id=String(v.data[0].id||"");const m=id.match(/0x[0-9a-fA-F]{40,64}/);if(!m)throw new Error("missing pool address");process.stdout.write(m[0])' "$TMP_DIR/gecko.json")"
echo "✓ GeckoTerminal live pools"

curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  --data "{\"pools\":[\"$POOL\"],\"window\":\"week\"}" \
  "$BASE_URL/api/portfolio-history" > "$TMP_DIR/history.json"
node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(!v.series||!Number.isFinite(v.fetchedAt))throw new Error("invalid history response")' "$TMP_DIR/history.json"
echo "✓ portfolio history"

curl --fail --silent --show-error "$BASE_URL/api/capabilities" > "$TMP_DIR/capabilities.json"
node -e 'const fs=require("fs");const v=JSON.parse(fs.readFileSync(process.argv[1]));if(typeof v.orderPlannerConfigured!=="boolean"||typeof v.keeperPubliclyVerified!=="boolean")throw new Error("invalid capabilities")' "$TMP_DIR/capabilities.json"
echo "✓ capability truth state"

echo "All production smoke checks passed."
