'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { acknowledgeAlert, resolveAlert } from './api';

const sanitizeReturnTo = (value: string): string => {
  if (!value.startsWith('/alerts')) {
    return '/alerts';
  }

  return value;
};

export async function acknowledgeAlertAction(formData: FormData): Promise<void> {
  const alertId = String(formData.get('alert_id') ?? '').trim();
  const returnTo = sanitizeReturnTo(String(formData.get('return_to') ?? '/alerts'));

  if (!alertId) {
    redirect(returnTo);
  }

  await acknowledgeAlert(alertId);
  revalidatePath('/alerts');
  redirect(returnTo);
}

export async function resolveAlertAction(formData: FormData): Promise<void> {
  const alertId = String(formData.get('alert_id') ?? '').trim();
  const resolutionNote = String(formData.get('resolution_note') ?? '').trim();
  const returnTo = sanitizeReturnTo(String(formData.get('return_to') ?? '/alerts'));

  if (!alertId) {
    redirect(returnTo);
  }

  await resolveAlert(alertId, resolutionNote || undefined);
  revalidatePath('/alerts');
  redirect(returnTo);
}
