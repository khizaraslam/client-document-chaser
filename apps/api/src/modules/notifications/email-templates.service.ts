import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

@Injectable()
export class EmailTemplatesService {
  constructor(private readonly configService: ConfigService) {}

  private get appUrl(): string {
    const publicUrl = this.configService
      .get<string>('APP_PUBLIC_URL', '')
      .trim();
    const base =
      publicUrl ||
      this.configService.get<string>('APP_URL', 'http://localhost:3000').trim();
    return base.replace(/\/+$/, '');
  }

  buildVerificationEmail(params: {
    fullName: string;
    token: string;
  }): RenderedEmail {
    const verifyUrl = `${this.appUrl}/verify-email?token=${encodeURIComponent(params.token)}`;
    return {
      subject: 'Verify your Client Document Chaser account',
      text: `Hello ${params.fullName},\n\nPlease verify your email address by opening this link:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      html: this.wrapLayout(
        'Verify your email address',
        `<p>Hello ${this.escapeHtml(params.fullName)},</p>
         <p>Confirm your email address to activate security notifications and client portal sending for your firm.</p>
         <p style="margin:24px 0;"><a href="${verifyUrl}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Verify Email Address</a></p>
         <p style="color:#475569;font-size:13px;">This verification link expires in 24 hours.</p>`,
      ),
    };
  }

  buildPasswordResetEmail(params: {
    fullName: string;
    token: string;
  }): RenderedEmail {
    const resetUrl = `${this.appUrl}/reset-password?token=${encodeURIComponent(params.token)}`;
    return {
      subject: 'Reset your Client Document Chaser password',
      text: `Hello ${params.fullName},\n\nUse this link to reset your password:\n${resetUrl}\n\nThis link expires in 1 hour. If you did not request a reset, you can ignore this message.`,
      html: this.wrapLayout(
        'Reset your password',
        `<p>Hello ${this.escapeHtml(params.fullName)},</p>
         <p>We received a request to reset your password. Choose a new password using the link below.</p>
         <p style="margin:24px 0;"><a href="${resetUrl}" style="background:#0f172a;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Reset Password</a></p>
         <p style="color:#475569;font-size:13px;">This link expires in 1 hour. If you did not request this, no action is needed.</p>`,
      ),
    };
  }

  buildTeamInvitationEmail(params: {
    firmName: string;
    inviterName: string;
    role: string;
    token: string;
  }): RenderedEmail {
    const acceptUrl = `${this.appUrl}/accept-invite?token=${encodeURIComponent(params.token)}`;
    return {
      subject: `You were invited to join ${params.firmName} on Client Document Chaser`,
      text: `${params.inviterName} invited you to join ${params.firmName} as ${params.role}.\n\nAccept your invitation:\n${acceptUrl}\n\nThis invitation expires in 7 days.`,
      html: this.wrapLayout(
        `Join ${this.escapeHtml(params.firmName)}`,
        `<p>${this.escapeHtml(params.inviterName)} has invited you to join <strong>${this.escapeHtml(params.firmName)}</strong> as <strong>${this.escapeHtml(params.role)}</strong>.</p>
         <p style="margin:24px 0;"><a href="${acceptUrl}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Accept Team Invitation</a></p>
         <p style="color:#475569;font-size:13px;">This invitation expires in 7 days.</p>`,
      ),
    };
  }

  buildPortalUrl(rawToken: string): string {
    return `${this.appUrl}/portal/${encodeURIComponent(rawToken)}`;
  }

  buildDocumentRequestPortalEmail(params: {
    firmName: string;
    clientName: string;
    recipientName?: string | null;
    requestTitle: string;
    dueAt: Date;
    instructions?: string | null;
    itemsCount: number;
    portalUrl: string;
    expiresAt: Date;
  }): RenderedEmail {
    const greetingName = params.recipientName?.trim() || params.clientName;
    const dueFormatted = params.dueAt.toISOString().slice(0, 10);
    const expiresFormatted = params.expiresAt.toISOString().slice(0, 10);
    const instructionsBlock = params.instructions?.trim()
      ? `<p style="background:#f8fafc;border-left:3px solid #0f766e;padding:12px 14px;color:#334155;font-size:14px;">${this.escapeHtml(params.instructions.trim())}</p>`
      : '';
    const instructionsText = params.instructions?.trim()
      ? `\nInstructions from ${params.firmName}:\n${params.instructions.trim()}\n`
      : '';

    return {
      subject: `${params.firmName}: Documents requested — ${params.requestTitle}`,
      text: `Hello ${greetingName},\n\n${params.firmName} has requested ${params.itemsCount} document item(s) for ${params.clientName}: "${params.requestTitle}".\nDue date: ${dueFormatted}\n${instructionsText}\nUpload your documents securely (no account or password required):\n${params.portalUrl}\n\nThis secure portal link expires on ${expiresFormatted}.`,
      html: this.wrapLayout(
        `Documents requested by ${this.escapeHtml(params.firmName)}`,
        `<p>Hello ${this.escapeHtml(greetingName)},</p>
         <p><strong>${this.escapeHtml(params.firmName)}</strong> has invited you to upload <strong>${params.itemsCount}</strong> requested document item(s) for <strong>${this.escapeHtml(params.clientName)}</strong>.</p>
         <p style="margin:12px 0;font-size:14px;color:#334155;">
           <strong>Request:</strong> ${this.escapeHtml(params.requestTitle)}<br/>
           <strong>Due date:</strong> ${dueFormatted}
         </p>
         ${instructionsBlock}
         <p style="margin:24px 0;">
           <a href="${params.portalUrl}" style="background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">Open Secure Upload Portal</a>
         </p>
         <p style="color:#475569;font-size:13px;">No login or account creation is needed. This secure link expires on ${expiresFormatted}.</p>`,
      ),
    };
  }

  buildDocumentRejectedEmail(params: {
    firmName: string;
    clientName: string;
    recipientName?: string | null;
    requestTitle: string;
    itemTitle: string;
    rejectionReason: string;
  }): RenderedEmail {
    const greetingName = params.recipientName?.trim() || params.clientName;
    return {
      subject: `${params.firmName}: Action needed — please re-upload "${params.itemTitle}"`,
      text: `Hello ${greetingName},\n\n${params.firmName} reviewed your submission for "${params.requestTitle}" (${params.clientName}) and needs a replacement for checklist item "${params.itemTitle}".\n\nReviewer feedback:\n${params.rejectionReason}\n\nPlease open your existing secure upload portal link from the original request email to upload a corrected file, or reply to ${params.firmName} if you need a fresh link.`,
      html: this.wrapLayout(
        `Replacement document requested by ${this.escapeHtml(params.firmName)}`,
        `<p>Hello ${this.escapeHtml(greetingName)},</p>
         <p><strong>${this.escapeHtml(params.firmName)}</strong> reviewed your uploaded document for <strong>${this.escapeHtml(params.requestTitle)}</strong> (${this.escapeHtml(params.clientName)}) and rejected item <strong>${this.escapeHtml(params.itemTitle)}</strong>.</p>
         <p style="background:#FEF2F2;border-left:3px solid #DC2626;padding:12px 14px;color:#991B1B;font-size:14px;">
           <strong>Reviewer note:</strong> ${this.escapeHtml(params.rejectionReason)}
         </p>
         <p style="font-size:14px;color:#334155;">Please return to the secure portal link sent in your invitation email to upload a replacement document. If your portal link has expired, reply to ${this.escapeHtml(params.firmName)} to request a new link.</p>`,
      ),
    };
  }

  buildRequestCompletedEmail(params: {
    firmName: string;
    clientName: string;
    recipientName?: string | null;
    requestTitle: string;
  }): RenderedEmail {
    const greetingName = params.recipientName?.trim() || params.clientName;
    return {
      subject: `${params.firmName}: All documents received for "${params.requestTitle}"`,
      text: `Hello ${greetingName},\n\nAll required documents for "${params.requestTitle}" (${params.clientName}) have been reviewed and accepted by ${params.firmName}.\n\nThank you for your prompt submission.`,
      html: this.wrapLayout(
        `Document request completed`,
        `<p>Hello ${this.escapeHtml(greetingName)},</p>
         <p>All required documents for <strong>${this.escapeHtml(params.requestTitle)}</strong> (${this.escapeHtml(params.clientName)}) have been reviewed and accepted by <strong>${this.escapeHtml(params.firmName)}</strong>.</p>
         <p style="color:#0f766e;font-size:14px;font-weight:600;">No further uploads are needed for this checklist.</p>`,
      ),
    };
  }

  private wrapLayout(heading: string, bodyHtml: string): string {
    return `<!doctype html>
<html>
  <body style="margin:0;padding:32px 16px;background:#faf9f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1e293b;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:32px;">
      <div style="font-size:13px;font-weight:600;color:#0f766e;margin-bottom:16px;">Client Document Chaser</div>
      <h1 style="margin:0 0 16px;font-size:20px;color:#0f172a;">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;">${bodyHtml}</div>
    </div>
  </body>
</html>`;
  }

  private escapeHtml(raw: string): string {
    return raw
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
