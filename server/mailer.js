import nodemailer from 'nodemailer';

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function buildDrawEmail({ giver, receiver, event }) {
  const detail = (icon, label, value) =>
    value
      ? `<p style="margin:6px 0;color:#475569">${icon} <strong>${label}:</strong> ${escapeHtml(value)}</p>`
      : '';

  const wishlist = receiver.wishlist
    ? `<div style="background:#eef2ff;border-left:4px solid #4f46e5;padding:12px 16px;margin:16px 0;border-radius:6px">
         <strong style="color:#3730a3">🎁 Dica de presente de ${escapeHtml(receiver.name)}:</strong>
         <p style="margin:6px 0 0;color:#334155;font-style:italic">“${escapeHtml(receiver.wishlist)}”</p>
       </div>`
    : '';

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f1f5f9;font-family:Helvetica,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:28px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;background:#fff;border-radius:14px;overflow:hidden">
      <tr><td style="background:#b91c1c;color:#fff;text-align:center;padding:30px 24px">
        <div style="font-size:38px">🎁 🎅 🎄</div>
        <h1 style="margin:8px 0 0;font-size:24px">${escapeHtml(event.eventName)}</h1>
      </td></tr>
      <tr><td style="padding:30px;color:#1e293b">
        <p style="font-size:18px;margin-top:0">Olá, <strong>${escapeHtml(giver.name)}</strong>!</p>
        <p style="line-height:1.6;color:#475569">O sorteio foi realizado. Guarde este segredo:</p>
        <div style="background:#f0fdf4;border:2px dashed #16a34a;border-radius:12px;padding:24px;text-align:center;margin:22px 0">
          <div style="font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:#15803d;font-weight:bold">Seu amigo secreto é</div>
          <div style="font-size:30px;font-weight:800;color:#166534;margin-top:6px">🎉 ${escapeHtml(receiver.name)} 🎉</div>
        </div>
        ${wishlist}
        ${detail('💰', 'Valor sugerido', event.suggestedBudget ? `R$ ${event.suggestedBudget}` : '')}
        ${detail('📅', 'Data', event.eventDate)}
        ${detail('📍', 'Local', event.eventLocation)}
        <p style="margin-top:24px;padding:14px;background:#fef2f2;border-radius:8px;color:#991b1b;text-align:center;font-weight:600">
          🤫 Não conte para ninguém até a revelação!
        </p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

export function createMailer(env = process.env) {
  const host = env.SMTP_HOST?.trim();
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS?.replace(/\s+/g, '');
  const configured = Boolean(host && user && pass);
  const fromName = env.MAIL_FROM_NAME?.trim() || 'Amigo Secreto';

  const transporter = configured
    ? nodemailer.createTransport({
        host,
        port: Number(env.SMTP_PORT) || 587,
        secure: String(env.SMTP_SECURE).toLowerCase() === 'true',
        auth: { user, pass }
      })
    : null;

  const from = `"${fromName.replace(/"/g, '')}" <${user}>`;

  return {
    configured,
    fromName,
    sender: configured ? user : '',

    async verify() {
      if (!transporter) throw new Error('SMTP não configurado. Defina as variáveis SMTP_* no arquivo .env.');
      await transporter.verify();
    },

    async sendTest(to, event) {
      await this.verify();
      await transporter.sendMail({
        from,
        to,
        subject: `🧪 Teste de e-mail — ${event.eventName}`,
        html: `<p>✅ A conexão SMTP está funcionando para o evento <strong>${escapeHtml(event.eventName)}</strong>.</p>`
      });
    },

    async sendDraw({ giver, receiver, event }) {
      if (!transporter) throw new Error('SMTP não configurado.');
      await transporter.sendMail({
        from,
        to: giver.email,
        subject: `🎅 ${giver.name}, seu amigo secreto — ${event.eventName}`,
        html: buildDrawEmail({ giver, receiver, event })
      });
    }
  };
}

export { buildDrawEmail };
