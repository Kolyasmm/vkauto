import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Увеличиваем лимит размера запроса для загрузки креативов (base64)
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  const configService = app.get(ConfigService);

  // CORS для фронтенда
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3001'],
    credentials: true,
  });

  // Глобальная валидация
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Префикс для всех роутов
  app.setGlobalPrefix('api');

  const port = configService.get<number>('API_PORT') || 4000;
  await app.listen(port);

  console.log(`🚀 API запущен на http://localhost:${port}/api`);
}

bootstrap();
