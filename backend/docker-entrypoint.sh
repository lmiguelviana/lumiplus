#!/bin/sh
set -e

echo "🚀 LumiPlus Backend iniciando..."

# Aguarda o banco estar disponível
echo "⏳ Aguardando banco de dados..."
until npx prisma db push --skip-generate 2>/dev/null; do
  echo "   Banco ainda não disponível, tentando novamente em 3s..."
  sleep 3
done

echo "✅ Banco de dados pronto!"

# Executa seed inicial se necessário (apenas uma vez)
if [ "${RUN_SEED}" = "true" ]; then
  echo "🌱 Executando seed..."
  node dist/prisma/seed.js || echo "⚠️ Seed ignorado (pode já ter sido executado)"
fi

echo "▶️  Iniciando servidor..."
exec node dist/server.js
