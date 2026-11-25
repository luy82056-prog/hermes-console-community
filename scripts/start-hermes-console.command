#!/bin/zsh
set -e

cd "$(dirname "$0")/.."

if [ -d "release/model-sync/mac-arm64/Hermes Console.app" ]; then
  open "release/model-sync/mac-arm64/Hermes Console.app"
elif [ -d "release/layout-optimized/mac-arm64/Hermes Console.app" ]; then
  open "release/layout-optimized/mac-arm64/Hermes Console.app"
elif [ -d "release/personal-agent/mac-arm64/Hermes Console.app" ]; then
  open "release/personal-agent/mac-arm64/Hermes Console.app"
elif [ -d "release/mac-arm64/Hermes Console.app" ]; then
  open "release/mac-arm64/Hermes Console.app"
else
  export ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
  npm run dev
fi
