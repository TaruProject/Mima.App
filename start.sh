#!/bin/bash

# Script de inicio para Hostinger
# Guarda esto como 'start.sh' en la raíz de tu hosting

cd "$(dirname "$0")"

echo "🚀 Iniciando servidor Mima..."
echo "📍 Directorio: $(pwd)"
echo "⏰ Fecha: $(date)"

# Verificar que Node.js está disponible
if ! command -v node &> /dev/null; then
    echo "❌ Error: Node.js no está instalado"
    exit 1
fi

echo "✅ Node.js versión: $(node --version)"

# Verificar que package.json existe
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json no encontrado"
    exit 1
fi

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Error al instalar dependencias"
        exit 1
    fi
fi

# Verificar que .env existe
if [ ! -f ".env" ]; then
    echo "⚠️  Advertencia: Archivo .env no encontrado"
    echo "   Asegúrate de crear el archivo .env con tus variables de entorno"
fi

# Matar proceso anterior si existe
if [ -f "server.pid" ]; then
    OLD_PID=$(cat server.pid)
    if ps -p $OLD_PID > /dev/null 2>&1; then
        echo "🛑 Deteniendo proceso anterior (PID: $OLD_PID)..."
        kill $OLD_PID
        sleep 2
    fi
fi

# Iniciar el servidor
echo "🎯 Iniciando servidor con tsx..."
npx tsx server.ts > server.log 2>&1 &
NEW_PID=$!
echo $NEW_PID > server.pid

echo ""
echo "✅ Servidor iniciado!"
echo "📝 PID: $NEW_PID"
echo "📄 Logs: tail -f server.log"
echo "🌐 URL: http://localhost:3000"
echo ""
echo "Para ver los logs en tiempo real:"
echo "  tail -f server.log"
