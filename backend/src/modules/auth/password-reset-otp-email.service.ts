import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes } from 'crypto';
import type { EntityManager } from 'typeorm';
import { EmailOutbox } from './entities/email-outbox.entity';

interface EmailPayload {
  to: string;
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class PasswordResetOtpEmailService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly config: ConfigService) {
    this.encryptionKey = Buffer.from(
      this.config.getOrThrow<string>('EMAIL_OUTBOX_ENCRYPTION_KEY'),
      'base64',
    );
    if (this.encryptionKey.length !== 32) {
      throw new Error('EMAIL_OUTBOX_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
    }
  }

  queueCode(
    manager: EntityManager,
    email: string,
    fullName: string,
    code: string,
    lifetimeSeconds: number,
  ): Promise<EmailOutbox> {
    const lifetimeMinutes = Math.max(1, Math.ceil(lifetimeSeconds / 60));
    const safeName = this.escapeHtml(fullName);
    const groupedCode = code.split('').join(' ');

    return this.enqueue(manager, {
      to: email,
      subject: `${code} is your password reset code`,
      text: [
        `Hello ${fullName},`,
        '',
        `Your My Doctor & The Professor password reset code is: ${code}`,
        `This code expires in ${lifetimeMinutes} minutes and can be used only once.`,
        '',
        'If you did not request a password reset, ignore this email. Your password will remain unchanged.',
      ].join('\n'),
      html: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <meta name="supported-color-schemes" content="dark light">
  <title>Password reset code</title>
</head>
<body style="margin:0;padding:0;background:#060919;color:#f7f9ff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your password reset code is ${code}. It expires in ${lifetimeMinutes} minutes.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#060919;">
    <tr>
      <td align="center" style="padding:34px 14px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;border-collapse:separate;background:#0b1124;border:1px solid #202b4a;border-radius:20px;overflow:hidden;">
          <tr>
            <td style="padding:26px 30px;background:#0e1630;border-bottom:1px solid #202b4a;">
              <div style="font-size:18px;font-weight:800;letter-spacing:-.2px;color:#ffffff;">My Doctor <span style="color:#47d5c8;">&</span> The Professor</div>
              <div style="margin-top:5px;color:#7887aa;font-size:11px;letter-spacing:1.2px;text-transform:uppercase;">Medical learning, built around you</div>
            </td>
          </tr>
          <tr>
            <td style="padding:36px 34px 32px;">
              <div style="color:#47d5c8;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;">ACCOUNT RECOVERY</div>
              <h1 style="margin:12px 0 14px;color:#ffffff;font-family:Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.2;">Reset your password</h1>
              <p style="margin:0;color:#aeb8d3;font-size:14px;line-height:1.75;">Hello ${safeName}, use the one-time code below to continue securely to password reset.</p>
              <div style="margin:28px 0 24px;padding:24px 18px;border-radius:16px;background:#0f1730;border:1px solid #27365f;text-align:center;">
                <div style="margin-bottom:9px;color:#98a6c7;font-size:11px;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;">Your reset code</div>
                <div style="color:#f8fbff;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:800;letter-spacing:9px;line-height:1.2;">${groupedCode}</div>
              </div>
              <p style="margin:0;color:#aeb8d3;font-size:14px;line-height:1.7;text-align:center;">This code expires in <strong style="color:#ffffff;">${lifetimeMinutes} minutes</strong> and works once.</p>
              <div style="margin-top:26px;padding:14px 16px;border-radius:12px;background:#111a31;border-left:3px solid #47d5c8;color:#9eabc8;font-size:12px;line-height:1.6;">For your security, never share this code with anyone. Our team will never ask you for it.</div>
            </td>
          </tr>
          <tr>
            <td style="padding:22px 30px;background:#080e1e;border-top:1px solid #202b4a;color:#7482a3;font-size:11px;line-height:1.65;">If you did not request a password reset, you can safely ignore this message.</td>
          </tr>
        </table>
        <div style="max-width:600px;margin:16px auto 0;color:#586686;font-size:10px;line-height:1.6;text-align:center;">My Doctor & The Professor · Secure account communication</div>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });
  }

  private enqueue(manager: EntityManager, payload: EmailPayload): Promise<EmailOutbox> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);

    return manager.save(
      EmailOutbox,
      manager.create(EmailOutbox, {
        encryptedPayload: encrypted.toString('base64'),
        encryptionIv: iv.toString('base64'),
        encryptionTag: cipher.getAuthTag().toString('base64'),
        attempts: 0,
        nextAttemptAt: null,
        sentAt: null,
        lastError: null,
      }),
    );
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
