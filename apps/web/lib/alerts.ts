'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { acknowledgeAlert, ApiError, resolveAlert } from './api';
import { sanitizeInternalPath } from './internal-path';

function sanitizeReturnTo(value: string): string {
  const path = sanitizeInternalPath(value);
  return path && /^\/alerts(?:[?#]|$)/.test(path) ? path : '/alerts';
}

async function runAlertAction(
  formData: FormData,
  execute: (alertId: string) => Promise<unknown>,
): Promise<void> {
  const alertId = String(formData.get('alert_id') ?? '').trim();
  const returnTo = sanitizeReturnTo(String(formData.get('return_to') ?? '/alerts'));

  if (!alertId) {
    redirect(returnTo);
  }

  let destination = returnTo;
  try {
    await execute(alertId);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) {
      throw error;
    }

    const url = new URL(returnTo, 'https://internal.invalid');
    url.searchParams.set('alert_notice', 'changed');
    destination = `${url.pathname}${url.search}${url.hash}`;
  }

  revalidatePath('/alerts');
  redirect(destination);
}

export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  await runAlertAction(formData, acknowledgeAlert);
}

export async function resolveAlertAction(formData: FormData): Promise<void> {
  const resolutionNote = String(formData.get('resolution_note') ?? '').trim();
  await runAlertAction(formData, (alertId) => resolveAlert(alertId, resolutionNote || undefined));
}
