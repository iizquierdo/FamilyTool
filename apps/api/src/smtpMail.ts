import nodemailer from 'nodemailer';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

export const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** Apply patch on top of base; empty strings in patch do not clear base. */
export const mergeSmtpDraftOntoStored = (base: Record<string, unknown>, patch: Record<string, unknown>) => {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
};

export const MASKED_SECRET = '********';

export const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export const sanitizeSmtpConfigForResponse = (provider: string, config: Record<string, unknown> = {}) => {
  if (provider === 'SES') {
    return {
      ...config,
      secretAccessKey: config.secretAccessKey ? MASKED_SECRET : ''
    };
  }

  return {
    ...config,
    pass: config.pass ? MASKED_SECRET : ''
  };
};

/**
 * Normalizes JSON from PlatformSetting key `smtp` to `{ provider, config }`.
 * Accepts either `{ provider, config: { host, ... } }` or a flat `{ provider, host, ... }`.
 */
export const coercePlatformSmtpJson = (
  value: unknown
): { provider: string; config: Record<string, unknown> } | null => {
  if (!isPlainObject(value)) return null;
  if (isPlainObject(value.config)) {
    const provider = value.provider === 'SES' ? 'SES' : 'SMTP';
    return { provider, config: { ...(value.config as Record<string, unknown>) } };
  }
  const provider = value.provider === 'SES' ? 'SES' : 'SMTP';
  const cfg: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'provider') continue;
    cfg[k] = v;
  }
  return { provider, config: cfg };
};

const smtpRowSendReady = (row: { provider: string; config: Record<string, unknown> } | null): boolean => {
  if (!row) return false;
  const { provider, config: cfg } = row;
  if (provider === 'SES') {
    return Boolean(
      String(cfg.region || '').trim() &&
        String(cfg.accessKeyId || '').trim() &&
        String(cfg.secretAccessKey || '').trim() &&
        String(cfg.fromEmail || '').trim()
    );
  }
  const host = String(cfg.host || '').trim();
  const fromOrUser = String(cfg.fromEmail || cfg.user || '').trim();
  return Boolean(host && fromOrUser);
};

/** True if PlatformSetting `smtp` JSON has enough data to attempt sending (same checks as send). */
export const platformSmtpPayloadReady = (value: unknown): boolean => smtpRowSendReady(coercePlatformSmtpJson(value));

/** Parsed platform SMTP when ready; otherwise null. */
export const parseReadyPlatformSmtp = (
  value: unknown
): { provider: string; config: Record<string, unknown> } | null => {
  const row = coercePlatformSmtpJson(value);
  return smtpRowSendReady(row) ? row : null;
};

export const normalizeSmtpConfig = (provider: string, incoming: Record<string, unknown>, existing: Record<string, unknown> = {}) => {
  if (provider === 'SES') {
    const incomingSecret = typeof incoming?.secretAccessKey === 'string' ? incoming.secretAccessKey.trim() : '';
    const persistedSecret =
      incomingSecret && incomingSecret !== MASKED_SECRET ? incomingSecret : String(existing.secretAccessKey || '');

    return {
      region: String(incoming?.region || '').trim(),
      accessKeyId: String(incoming?.accessKeyId || '').trim(),
      secretAccessKey: persistedSecret,
      fromEmail: String(incoming?.fromEmail || '').trim()
    };
  }

  const incomingPass = typeof incoming?.pass === 'string' ? incoming.pass : '';
  const persistedPass = incomingPass && incomingPass !== MASKED_SECRET ? incomingPass : String(existing.pass || '');

  return {
    host: String(incoming?.host || '').trim(),
    port: String(incoming?.port || '587').trim() || '587',
    user: String(incoming?.user || '').trim(),
    pass: persistedPass,
    encryption: String(incoming?.encryption || 'TLS').trim() || 'TLS',
    fromEmail: String(incoming?.fromEmail || '').trim()
  };
};

export const sendEmailWithConfig = async (
  provider: string,
  config: Record<string, unknown>,
  toEmail: string,
  subject: string,
  textBody: string,
  htmlBody: string
) => {
  if (provider === 'SES') {
    const region = String(config.region || process.env.AWS_REGION || '').trim();
    const accessKeyId = String(config.accessKeyId || '').trim();
    const secretAccessKey = String(config.secretAccessKey || '').trim();
    const fromEmail = String(config.fromEmail || '').trim();

    if (!region || !accessKeyId || !secretAccessKey || !fromEmail) {
      throw new Error('SES config incomplete: region, accessKeyId, secretAccessKey, fromEmail are required.');
    }

    const sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });

    await sesClient.send(
      new SendEmailCommand({
        Source: fromEmail,
        Destination: { ToAddresses: [toEmail] },
        Message: {
          Subject: { Data: subject, Charset: 'UTF-8' },
          Body: {
            Text: { Data: textBody, Charset: 'UTF-8' },
            Html: { Data: htmlBody, Charset: 'UTF-8' }
          }
        }
      })
    );
    return;
  }

  const host = String(config.host || '').trim();
  const port = Number(config.port || 587);
  const user = String(config.user || '').trim();
  const pass = String(config.pass || '');
  const encryption = String(config.encryption || 'TLS').toUpperCase();
  const fromEmail = String(config.fromEmail || user || '').trim();

  if (!host || !port || !fromEmail) {
    throw new Error('SMTP config incomplete: host, port and fromEmail (or user) are required.');
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: encryption === 'SSL' || port === 465,
    auth: user && pass ? { user, pass } : undefined,
    requireTLS: encryption === 'TLS'
  });

  await transporter.sendMail({
    from: fromEmail,
    to: toEmail,
    subject,
    text: textBody,
    html: htmlBody
  });
};

export const sendTestEmailWithConfig = async (provider: string, config: Record<string, unknown>, toEmail: string) => {
  const subject = 'Sinapsis test email (' + provider + ')';
  const textBody = 'Test email sent using ' + provider + ' configuration.';
  const htmlBody = '<p>Test email sent using <strong>' + provider + '</strong> configuration.</p>';
  await sendEmailWithConfig(provider, config, toEmail, subject, textBody, htmlBody);
};
