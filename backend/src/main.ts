import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter } from './common/filters/database-exception.filter';
import { isAllowedOrigin, parseAllowedOrigins } from './config/cors-policy';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);



  app.use((_request, response, next) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    response.setHeader('Cache-Control', 'no-store, max-age=0');
    response.setHeader('Pragma', 'no-cache');
    if (process.env.NODE_ENV === 'production') {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 0);
  if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  const allowedOrigins = parseAllowedOrigins(
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGINS,
    process.env.NODE_ENV,
  );
  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin, allowedOrigins)) return callback(null, true);
      return callback(new Error('Origin is not allowed by CORS'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type,Authorization',
    maxAge: 600,
  });

  app.useGlobalFilters(new DatabaseExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}

void bootstrap();
