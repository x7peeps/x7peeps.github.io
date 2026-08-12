#!/bin/bash
# ============================================================
# Hermes 自定义音色 TTS 一键部署脚本（macOS Apple Silicon）
# 配套文章：x7peeps.com《macOS 本地 TTS 朗读服务优化实录》
# 用法：bash deploy_tts.sh
# ============================================================
set -euo pipefail

echo "==> [1/5] 创建虚拟环境"
python3 -m venv ~/work/qwen3tts-venv
source ~/work/qwen3tts-venv/bin/activate

echo "==> [2/5] 安装依赖（TUNA 镜像）"
pip install -q -i https://pypi.tuna.tsinghua.edu.cn/simple \
  transformers==4.57.3 \
  accelerate==1.12.0 \
  torch torchaudio \
  soundfile librosa einops onnxruntime \
  sox==1.5.0 \
  qwen-tts

echo "==> [3/5] 下载模型（hf-mirror）"
mkdir -p ~/.hermes/models
cd ~/.hermes/models
if [ ! -d "Qwen3-TTS-12Hz-1.7B-Base" ]; then
  git lfs install
  git clone https://hf-mirror.com/Qwen/Qwen3-TTS-12Hz-1.7B-Base
else
  echo "    模型已存在，跳过"
fi

echo "==> [4/5] 准备参考音色"
mkdir -p ~/.hermes/tts
if [ ! -f ~/.hermes/tts/dalu_ref_20s.wav ]; then
  echo "    ⚠️ 请将你的一段 20 秒连贯人声独白（参考音色）放到："
  echo "       ~/.hermes/tts/dalu_ref_20s.wav"
  echo "       并同步修改 tts_daemon.py 中的 REF_20S_TEXT 为对应转写文本"
fi

echo "==> [5/5] 拉起守护进程（懒拉起，首次朗读自动启动）"
cat > ~/.hermes/tts/deploy_test.txt << 'EOF'
部署完成，测试朗读。
EOF
~/work/qwen3tts-venv/bin/python3 ~/.hermes/tts/dalu_tts.py \
  --input-path ~/.hermes/tts/deploy_test.txt \
  --output-path ~/.hermes/tts/deploy_test.wav \
  --format wav --engine qwen3tts

echo ""
echo "✅ 部署完成！测试音频：~/.hermes/tts/deploy_test.wav"
echo "   在 Hermes 配置 tts.providers.dalu 指向 dalu_tts.py 即可使用大鹿音色朗读。"
echo "   详细配置与排障见网站文章（x7peeps.com AI 工程化板块）。"
