import nodemailer from 'nodemailer';
import { logger } from './logger';

interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  data: Record<string, unknown>;
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.ethereal.email',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

function renderTemplate(template: string, data: Record<string, unknown>): string {
  const templates: Record<string, (d: Record<string, unknown>) => string> = {
    'email-verify': (d) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#6366f1">Welcome to PinVault Pro!</h2>
        <p>Hi ${d.name},</p>
        <p>Please verify your email address by clicking the button below:</p>
        <a href="${d.link}" 
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Verify Email
        </a>
        <p style="margin-top:16px;color:#666;font-size:14px">This link expires in 24 hours.</p>
      </div>`,
    'password-reset': (d) => `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
        <h2 style="color:#6366f1">Reset Your Password</h2>
        <p>Hi ${d.name},</p>
        <p>Click the button below to reset your password:</p>
        <a href="${d.link}" 
           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">
          Reset Password
        </a>
        <p style="margin-top:16px;color:#666;font-size:14px">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
      </div>`,
  };

  const templateFn = templates[template];
  return templateFn ? templateFn(data) : `<p>${JSON.stringify(data)}</p>`;
}

export async function sendEmail(options: EmailOptions): Promise<void> {
  try {
    const html = renderTemplate(options.template, options.data);
    await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@pinvaultpro.com',
      to: options.to,
      subject: options.subject,
      html,
    });
    logger.info({ to: options.to, template: options.template }, 'Email sent');
  } catch (err) {
    logger.error({ err, to: options.to }, 'Failed to send email');
    // Don't throw – email failure shouldn't block the request
  }
}
