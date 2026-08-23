import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface PostgreSqlDriverError {
  code?: string;
  message?: string;
  detail?: string;
  table?: string;
  column?: string;
  constraint?: string;
}

@Catch(QueryFailedError)
export class DatabaseExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DatabaseExceptionFilter.name);

  catch(exception: QueryFailedError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const typed = exception as QueryFailedError & { driverError?: PostgreSqlDriverError; query?: string; parameters?: unknown[] };
    const driver = typed.driverError;
    const code = driver?.code;

    const mapped = this.map(code);
    if (!mapped) {
      this.logger.error(
        `Unexpected database operation failure: ${JSON.stringify({
          code,
          message: driver?.message,
          detail: driver?.detail,
          table: driver?.table,
          column: driver?.column,
          constraint: driver?.constraint,
          query: typed.query,
        })}`,
      );
      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: 'An unexpected database error occurred',
      });
      return;
    }

    response.status(mapped.status).json({
      statusCode: mapped.status,
      message: mapped.message,
    });
  }

  private map(
    code?: string,
  ): { status: HttpStatus; message: string } | null {
    switch (code) {
      case '23505':
        return {
          status: HttpStatus.CONFLICT,
          message: 'A record with the same unique value already exists',
        };
      case '23503':
        return {
          status: HttpStatus.CONFLICT,
          message: 'The operation conflicts with a related record',
        };
      case '23502':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A required database value is missing',
        };
      case '23514':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A database business rule was violated',
        };
      case '22P02':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A supplied identifier or value has an invalid format',
        };
      case '22001':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A supplied value exceeds its maximum length',
        };
      case '22003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'A supplied number is outside the supported range',
        };
      default:
        return null;
    }
  }
}
