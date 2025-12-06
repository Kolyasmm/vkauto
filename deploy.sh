#!/bin/bash

# Скрипт деплоя VK Automation Platform на Timeweb VPS
# Использование: ./deploy.sh

set -e

echo "🚀 VK Automation Platform - Deploy Script"
echo "=========================================="
echo ""

# Проверка что скрипт запущен с правами root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите скрипт с sudo: sudo ./deploy.sh"
    exit 1
fi

echo "📦 Шаг 1: Обновление системы и установка зависимостей..."
apt-get update
apt-get install -y curl git docker.io docker-compose

echo "✅ Docker установлен"

echo ""
echo "🔧 Шаг 2: Настройка Docker..."
systemctl start docker
systemctl enable docker

echo "✅ Docker запущен и добавлен в автозагрузку"

echo ""
echo "📁 Шаг 3: Настройка проекта..."

# Проверяем наличие .env файла
if [ ! -f ".env" ]; then
    echo "⚠️  Файл .env не найден. Копирую .env.production..."
    cp .env.production .env
    echo ""
    echo "📝 ВАЖНО: Отредактируйте файл .env и заполните все значения:"
    echo "   nano .env"
    echo ""
    echo "После редактирования запустите скрипт снова: sudo ./deploy.sh"
    exit 0
fi

echo "✅ Файл .env найден"

echo ""
echo "🏗️  Шаг 4: Сборка Docker образов..."
docker-compose -f docker-compose.prod.yml build

echo "✅ Образы собраны"

echo ""
echo "🚀 Шаг 5: Запуск контейнеров..."
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

echo "✅ Контейнеры запущены"

echo ""
echo "⏳ Ожидание запуска сервисов (30 секунд)..."
sleep 30

echo ""
echo "📊 Статус контейнеров:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "✅ Деплой завершен!"
echo ""
echo "🌐 Ваш сервис доступен по адресу:"
echo "   http://$(curl -s ifconfig.me)"
echo ""
echo "📋 Полезные команды:"
echo "   Просмотр логов API:    docker-compose -f docker-compose.prod.yml logs -f api"
echo "   Просмотр логов Web:    docker-compose -f docker-compose.prod.yml logs -f web"
echo "   Остановить:            docker-compose -f docker-compose.prod.yml down"
echo "   Перезапустить:         docker-compose -f docker-compose.prod.yml restart"
echo "   Статус:                docker-compose -f docker-compose.prod.yml ps"
echo ""
echo "🔐 Не забудьте настроить firewall и SSL сертификат!"
