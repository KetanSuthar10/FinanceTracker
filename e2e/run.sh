#!/usr/bin/env bash
# Builds the app against a fake Supabase URL, serves it, and runs every browser test at phone and laptop width.
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-4108}"
VITE_SUPABASE_URL=https://abcdefghijklmnopqrst.supabase.co \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_TestOnlyKey1234567890 \
  npx vite build --outDir e2e/out/dist --emptyOutDir >/dev/null
npx vite preview --outDir e2e/out/dist --port "$PORT" --strictPort >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 3
status=0
for test in e2e/test_*.py; do
  sizes=("360 760" "1366 860")
  [[ "$test" == *desktop* ]] && sizes=("1024 768" "1366 860" "1920 1080")
  for size in "${sizes[@]}"; do
    echo "== $test ($size)"
    BASE="http://localhost:$PORT" python3 "$test" $size | tail -1 || status=1
  done
done
exit $status
