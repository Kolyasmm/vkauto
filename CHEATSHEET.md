# 🚀 Шпаргалка по командам

## Локальная разработка

### Первый запуск:
```bash
npm install                                    # Установка зависимостей
docker compose up -d                           # Запуск PostgreSQL + Redis
cd apps/api && npx prisma migrate dev          # Миграции БД
npx prisma generate                            # Генерация Prisma Client
cd ../..
npm run dev                                    # Запуск dev сервера
```

### Ежедневная работа:
```bash
npm run dev                # Запуск backend + frontend
npm run dev:api            # Только backend (порт 4000)
npm run dev:web            # Только frontend (порт 3000)
```

### База данных:
```bash
cd apps/api
npx prisma studio          # GUI для БД (http://localhost:5555)
npx prisma migrate dev     # Создать миграцию
npx prisma generate        # Обновить Prisma Client
npx prisma db push         # Быстрое обновление без миграции
```

### Docker:
```bash
docker compose up -d       # Запустить БД
docker compose down        # Остановить
docker compose ps          # Статус
docker compose logs -f     # Логи
```

---

## Production (Timeweb VPS)

### Первый деплой:
```bash
ssh root@ваш-ip                                # Подключение
cd /root/vkauto
cp .env.production .env                        # Копирование настроек
nano .env                                      # Редактирование (Ctrl+X, Y, Enter)
./deploy.sh                                    # Автоматический деплой
```

### Управление:
```bash
# Просмотр статуса
docker compose -f docker-compose.prod.yml ps

# Просмотр логов
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f web

# Перезапуск
docker compose -f docker-compose.prod.yml restart

# Остановка
docker compose -f docker-compose.prod.yml down

# Запуск
docker compose -f docker-compose.prod.yml up -d

# Пересборка и запуск
docker compose -f docker-compose.prod.yml up -d --build
```

### Обновление кода:
```bash
# Если используете Git
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Если загружаете через SCP
# На Mac: scp -r vkauto root@ваш-ip:/root/
# На сервере:
docker compose -f docker-compose.prod.yml up -d --build
```

### Бэкап:
```bash
# Создать бэкап БД
docker exec vk-automation-postgres pg_dump -U postgres vk_automation > backup_$(date +%Y%m%d).sql

# Восстановить
docker exec -i vk-automation-postgres psql -U postgres vk_automation < backup_20240101.sql

# Скачать бэкап на Mac
scp root@ваш-ip:/root/backup_20240101.sql ~/Desktop/
```

### Мониторинг:
```bash
# Ресурсы контейнеров
docker stats

# Место на диске
df -h

# Оперативная память
free -h

# Процессы
htop
```

---

## Безопасность

### Firewall:
```bash
ufw allow 22    # SSH
ufw allow 80    # HTTP
ufw allow 443   # HTTPS
ufw enable
ufw status
```

### Смена SSH порта:
```bash
nano /etc/ssh/sshd_config
# Измените: Port 22 → Port 2222
systemctl restart sshd
ufw allow 2222
```

---

## Telegram Bot

### Получить Chat ID:
```bash
# 1. Напишите боту в Telegram
# 2. Откройте в браузере:
https://api.telegram.org/bot<ВАШ_ТОКЕН>/getUpdates

# 3. Найдите: "chat":{"id":123456789}
# 4. Обновите в БД:
docker exec -it vk-automation-postgres psql -U postgres vk_automation
UPDATE users SET telegram_chat_id = 123456789 WHERE id = 1;
\q
```

---

## Полезные одноразовые команды

### Очистка Docker:
```bash
docker system prune -a     # Удалить неиспользуемые образы
docker volume prune        # Удалить неиспользуемые volumes
```

### Перезапуск только одного сервиса:
```bash
docker compose -f docker-compose.prod.yml restart api
docker compose -f docker-compose.prod.yml restart web
```

### Выполнить команду в контейнере:
```bash
docker exec -it vk-automation-api sh
docker exec -it vk-automation-postgres psql -U postgres vk_automation
```

### Просмотр переменных окружения:
```bash
docker exec vk-automation-api printenv
```

---

## Git

### Инициализация и первый коммит:
```bash
cd /Users/nikolajorehov/Downloads/vkauto
git init
git add .
git commit -m "Initial commit: VK Automation Platform MVP"
git branch -M main
git remote add origin https://github.com/USERNAME/vk-automation.git
git push -u origin main
```

### Обновление:
```bash
git add .
git commit -m "Update: описание изменений"
git push
```

---

## Быстрые тесты

### Проверка API:
```bash
curl http://localhost:4000/api/rules
curl http://ваш-ip/api/rules
```

### Проверка БД:
```bash
docker exec vk-automation-postgres pg_isready -U postgres
```

### Проверка Redis:
```bash
docker exec vk-automation-redis redis-cli ping
# Должен вернуть: PONG
```

---

## URL-адреса

### Локально:
- Frontend: http://localhost:3000
- API: http://localhost:4000/api
- Prisma Studio: http://localhost:5555

### Production:
- Frontend: http://ваш-ip
- API: http://ваш-ip/api

---

## Переменные окружения (.env)

### Критически важные:
```env
VK_ACCESS_TOKEN=           # VK токен
VK_AD_ACCOUNT_ID=          # ID кабинета
POSTGRES_PASSWORD=         # Пароль БД
JWT_SECRET=                # Секрет для JWT
NEXT_PUBLIC_API_URL=       # URL API
```

### Опциональные:
```env
TELEGRAM_BOT_TOKEN=        # Telegram бот
TELEGRAM_NOTIFICATIONS_ENABLED=true
SCHEDULER_ENABLED=true
DEFAULT_RUN_TIME=09:00
```

---

## Устранение проблем

### Контейнер не запускается:
```bash
docker compose -f docker-compose.prod.yml logs имя-контейнера
docker compose -f docker-compose.prod.yml restart имя-контейнера
```

### Порт занят:
```bash
# Узнать что использует порт
lsof -i :4000
lsof -i :3000

# Убить процесс
kill -9 PID
```

### Нет места на диске:
```bash
df -h                      # Проверка места
docker system prune -a     # Очистка Docker
```

### База не подключается:
```bash
docker compose -f docker-compose.prod.yml restart postgres
docker compose -f docker-compose.prod.yml logs postgres
```

---

## Горячие клавиши

### Nano (текстовый редактор):
- Сохранить: `Ctrl + X`, затем `Y`, затем `Enter`
- Отмена: `Ctrl + X`, затем `N`
- Поиск: `Ctrl + W`

### Docker logs:
- Выход: `Ctrl + C`
- Прокрутка: `стрелки` или `Page Up/Down`

### SSH:
- Отключение: `exit` или `Ctrl + D`

---

**Сохраните эту шпаргалку - она пригодится!** 📌
