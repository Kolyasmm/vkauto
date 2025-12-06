# VK Automation Platform

Веб-платформа для автоматизации рекламы ВКонтакте с функцией автоматического дублирования успешных групп объявлений.

## Возможности

- **Автодублирование групп объявлений** — автоматическое создание копий успешных рекламных связок
- **Гибкие правила** — настройка порогов CPL, минимального количества лидов и числа копий
- **Планировщик** — ежедневный запуск правил в заданное время
- **Telegram-уведомления** — отчеты о выполнении правил
- **Dashboard** — удобная визуализация статистики и результатов
- **История выполнений** — отслеживание всех запусков и созданных копий

## Технологии

- **Backend**: NestJS (Node.js), TypeScript
- **Frontend**: Next.js 14, React, TailwindCSS
- **База данных**: PostgreSQL + Prisma ORM
- **Очереди**: Redis (для планировщика)
- **API**: VK Ads API

## Требования

- Node.js >= 18
- PostgreSQL >= 14
- Redis >= 7
- npm >= 9

## Быстрый старт

### 1. Клонирование и установка зависимостей

```bash
cd vkauto
npm install
```

### 2. Настройка окружения

Скопируйте файл с примером настроек:

```bash
cp .env.example .env
```

Отредактируйте [.env](.env) и заполните переменные:

```env
# VK API токен (получить в настройках рекламного кабинета VK)
VK_ACCESS_TOKEN=your_vk_access_token_here
VK_AD_ACCOUNT_ID=your_ad_account_id

# JWT секрет (любая случайная строка)
JWT_SECRET=your-super-secret-jwt-key

# Telegram (опционально)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_NOTIFICATIONS_ENABLED=true
```

### 3. Запуск базы данных

```bash
# Запуск PostgreSQL и Redis через Docker
docker-compose up -d
```

Проверьте, что контейнеры запустились:

```bash
docker-compose ps
```

### 4. Миграция базы данных

```bash
cd apps/api
npx prisma migrate dev
npx prisma generate
cd ../..
```

### 5. Запуск приложения

```bash
# Запуск backend и frontend одновременно
npm run dev
```

Или запускайте отдельно:

```bash
# Backend (порт 4000)
npm run dev:api

# Frontend (порт 3000)
npm run dev:web
```

### 6. Открытие приложения

- Frontend: http://localhost:3000
- API: http://localhost:4000/api

## Использование

### Получение VK Access Token

1. Перейдите в [VK Ads API](https://ads.vk.com/)
2. Откройте раздел "Настройки" → "API"
3. Создайте новый токен с правами на управление объявлениями
4. Скопируйте токен и вставьте в `.env`

### Получение Ad Account ID

1. Откройте рекламный кабинет VK
2. ID кабинета виден в URL: `https://ads.vk.com/hq/dashboard/ad_plan?act=YOUR_ACCOUNT_ID`
3. Вставьте ID в `.env`

### Создание правила автодублирования

1. Откройте веб-интерфейс http://localhost:3000
2. Перейдите в раздел "Правила"
3. Нажмите "Создать правило"
4. Заполните параметры:
   - **Название** — описательное имя правила
   - **Порог CPL** — максимальная стоимость лида (по умолчанию 200₽)
   - **Минимум лидов** — минимальное количество лидов за вчера (по умолчанию 3)
   - **Количество копий** — сколько копий создавать для каждой успешной группы (по умолчанию 3)
   - **Время запуска** — когда проверять и создавать копии (по умолчанию 09:00 МСК)
5. Сохраните правило

### Логика работы

Каждый день в заданное время система:

1. Получает статистику всех групп объявлений **за вчера**
2. Для каждой группы проверяет условия:
   - Количество лидов >= минимум
   - CPL < порог
3. Если **ОБА** условия выполнены:
   - Помечает группу как «успешную»
   - Создаёт N копий
   - Запускает копии автоматически
4. Отправляет отчёт в Telegram (если настроен)

### Тестирование правила

Перед автоматическим запуском можно протестировать правило:

1. Откройте правило
2. Нажмите кнопку "Тестировать" (иконка колбы)
3. Система покажет, сколько групп подходят под условия, без создания копий

### Ручной запуск

Можно запустить правило вручную:

1. Откройте правило
2. Нажмите кнопку "Запустить сейчас" (иконка Play)

## Структура проекта

```
vkauto/
├── apps/
│   ├── api/                    # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── vk/         # VK API интеграция
│   │   │   │   ├── rules/      # Правила автодублирования
│   │   │   │   ├── scheduler/  # Cron задачи
│   │   │   │   ├── notifications/ # Telegram
│   │   │   │   ├── auth/       # Авторизация
│   │   │   │   └── ad-accounts/ # Рекламные кабинеты
│   │   │   └── main.ts
│   │   └── prisma/
│   │       └── schema.prisma   # Схема БД
│   │
│   └── web/                    # Next.js Frontend
│       ├── src/
│       │   ├── app/            # Страницы (App Router)
│       │   ├── components/     # React компоненты
│       │   └── lib/            # Утилиты
│       └── package.json
│
├── docker-compose.yml          # PostgreSQL + Redis
├── .env.example                # Пример настроек
└── package.json                # Монорепозиторий
```

## API Endpoints

### Правила

- `GET /api/rules` — получить все правила
- `POST /api/rules` — создать правило
- `GET /api/rules/:id` — получить правило
- `PUT /api/rules/:id` — обновить правило
- `DELETE /api/rules/:id` — удалить правило
- `POST /api/rules/:id/test` — тестировать правило (симуляция)
- `POST /api/rules/:id/run` — запустить правило вручную
- `GET /api/rules/:id/history` — история выполнений

### Рекламные кабинеты

- `GET /api/ad-accounts` — список кабинетов
- `POST /api/ad-accounts/sync` — синхронизация с VK
- `GET /api/ad-accounts/:id/campaigns` — кампании кабинета
- `GET /api/ad-accounts/:id/ad-groups` — группы объявлений
- `GET /api/ad-accounts/:id/stats` — статистика

### Авторизация

- `POST /api/auth/register` — регистрация
- `POST /api/auth/login` — вход

## Настройка Telegram-бота

### 1. Создание бота

1. Напишите [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте команду `/newbot`
3. Следуйте инструкциям
4. Скопируйте токен и вставьте в `.env`:

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_NOTIFICATIONS_ENABLED=true
```

### 2. Получение Chat ID

1. Напишите вашему боту любое сообщение
2. Откройте в браузере: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
3. Найдите `"chat":{"id":123456789}` — это ваш Chat ID
4. Обновите в базе данных:

```sql
UPDATE users SET telegram_chat_id = 123456789 WHERE id = 1;
```

## Команды для разработки

```bash
# Установка зависимостей
npm install

# Запуск в dev режиме
npm run dev

# Сборка
npm run build

# Запуск в production
npm run start

# Только API
npm run dev:api

# Только Frontend
npm run dev:web

# Миграции БД
npm run db:migrate

# Prisma Studio (GUI для БД)
npm run db:studio

# Линтинг
npm run lint
```

## Docker Production

Для production разверты вания создайте `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: vk_automation
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://postgres:${DB_PASSWORD}@postgres:5432/vk_automation
      REDIS_HOST: redis
    ports:
      - "4000:4000"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    depends_on:
      - api
    ports:
      - "3000:3000"

volumes:
  postgres_data:
  redis_data:
```

## Устранение неполадок

### База данных не подключается

```bash
# Проверьте статус контейнеров
docker-compose ps

# Перезапустите
docker-compose restart postgres

# Проверьте логи
docker-compose logs postgres
```

### Ошибки VK API

- Убедитесь, что токен действителен
- Проверьте права доступа токена
- VK API имеет лимит 3 запроса/сек (автоматически обрабатывается)

### Scheduler не запускается

Проверьте переменную окружения:

```env
SCHEDULER_ENABLED=true
```

## Лицензия

MIT

## Поддержка

При возникновении вопросов создайте issue в репозитории или свяжитесь с разработчиком.

---

**Автор**: VK Automation Platform Team
**Версия**: 1.0.0
