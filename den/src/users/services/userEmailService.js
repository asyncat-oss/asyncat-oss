// users/services/userEmailService.js — email notification stubs
// Email is optional in the self-hosted build (configure SMTP in .env to enable).
// These functions are no-ops when SMTP is not configured.
import nodemailer from 'nodemailer';

const SMTP_ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (SMTP_ENABLED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_PORT === '465',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMail(to, subject, html) {
  if (!transporter) return; // silently skip if SMTP not configured
  try {
    await transporter.sendMail({ from: process.env.SMTP_USER, to, subject, html });
  } catch (err) {
    console.warn('[Email] send failed:', err.message);
  }
}

export async function sendProjectInvitation({ to, projectName, inviterName, inviteUrl }) {
  await sendMail(to, `You've been invited to ${projectName}`,
    `<p>${inviterName} invited you to join <strong>${projectName}</strong>.<br><a href="${inviteUrl}">Accept invitation</a></p>`);
}

export async function sendProjectDeleted({ to, projectName }) {
  await sendMail(to, `Project "${projectName}" was deleted`,
    `<p>The project <strong>${projectName}</strong> has been deleted.</p>`);
}

export async function sendProjectInvitationAccepted({ to, projectName, acceptedByName }) {
  await sendMail(to, `${acceptedByName} accepted your invitation to ${projectName}`,
    `<p>${acceptedByName} accepted the invitation to <strong>${projectName}</strong>.</p>`);
}

export async function sendProjectInvitationDeclined({ to, projectName, declinedByName }) {
  await sendMail(to, `Invitation to ${projectName} was declined`,
    `<p>${declinedByName} declined the invitation to <strong>${projectName}</strong>.</p>`);
}

export async function sendProjectMemberRemoved({ to, projectName }) {
  await sendMail(to, `You were removed from ${projectName}`,
    `<p>You have been removed from the project <strong>${projectName}</strong>.</p>`);
}

export async function sendProjectMemberLeft({ to, projectName, memberName }) {
  await sendMail(to, `${memberName} left ${projectName}`,
    `<p>${memberName} has left the project <strong>${projectName}</strong>.</p>`);
}
