import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly sender: string;
  private readonly frontendUrl: string;

  constructor(private readonly config: ConfigService) {
    this.sender = this.config.getOrThrow<string>('SMTP_FROM');
    this.frontendUrl = this.config.getOrThrow<string>('FRONTEND_URL').replace(/\/$/, '');
    this.transporter = nodemailer.createTransport({
      host: this.config.getOrThrow<string>('SMTP_HOST'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: this.config.get<boolean>('SMTP_SECURE', false),
      auth: {
        user: this.config.getOrThrow<string>('SMTP_USER'),
        pass: this.config.getOrThrow<string>('SMTP_PASSWORD'),
      },
    });
  }

  sendVerificationEmail(email: string, fullName: string, token: string): Promise<void> {
    const url = `${this.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Verify your email address',
      `Hello ${fullName}, verify your email address: ${url}`,
      `<p>Hello ${this.escapeHtml(fullName)},</p><p>Verify your email address:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
    );
  }

  sendPasswordResetEmail(email: string, fullName: string, token: string): Promise<void> {
    const url = `${this.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    return this.send(
      email,
      'Reset your password',
      `Hello ${fullName}, reset your password: ${url}`,
      `<p>Hello ${this.escapeHtml(fullName)},</p><p>Reset your password:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 30 minutes. If you did not request it, ignore this message.</p>`,
    );
  }

  private async send(to: string, subject: string, text: string, html: string): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.sender, to, subject, text, html });
    } catch {
      throw new ServiceUnavailableException('Email delivery is temporarily unavailable');
    }
  }

  private escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    })[character] as string);
  }
}
