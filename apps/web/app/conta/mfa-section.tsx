'use client';

import { useEffect, useState } from 'react';
import { Alert, Button } from '@/components/ui';

type MfaStatus = {
  enabled: boolean;
  enrolled_at: string | null;
  recovery_codes_remaining: number;
  enforcement_required: boolean;
};

type EnrollStart = {
  secret: string;
  otpauth_uri: string;
  qr_data_url: string;
};

type Phase = 'idle' | 'enrolling' | 'recovery';

async function postJson(path: string, body?: unknown) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (Array.isArray(data?.message) ? data.message.join(', ') : data?.message) ||
      'Falha na operação de MFA.';
    throw new Error(message);
  }
  return data;
}

export function MfaSection() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [enroll, setEnroll] = useState<EnrollStart | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [code, setCode] = useState('');
  const [disableCode, setDisableCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/mfa/status', { cache: 'no-store' });
      if (res.ok) {
        setStatus((await res.json()) as MfaStatus);
      }
    } catch {
      // silencioso; mantem ultimo estado
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const handleStart = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = (await postJson('/api/mfa/enroll/start')) as EnrollStart;
      setEnroll(data);
      setPhase('enrolling');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao iniciar enrollment.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setError(null);
    setBusy(true);
    try {
      const data = (await postJson('/api/mfa/enroll/verify', { code })) as {
        recovery_codes: string[];
      };
      setRecoveryCodes(data.recovery_codes ?? []);
      setPhase('recovery');
      setCode('');
      setEnroll(null);
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async () => {
    setError(null);
    setBusy(true);
    try {
      await postJson('/api/mfa/disable', { code: disableCode });
      setDisableCode('');
      setPhase('idle');
      await loadStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-5 sm:p-6">
      {status?.enforcement_required ? (
        <Alert variant="warning" className="mb-4">
          Seu perfil exige verificação em duas etapas. Ative o MFA para manter a conta em conformidade.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      {phase === 'recovery' ? (
        <div className="space-y-4">
          <Alert variant="success">
            MFA ativado. Guarde os códigos de recuperação abaixo — eles aparecem só uma vez e cada um pode ser usado uma única vez.
          </Alert>
          <ul className="grid grid-cols-2 gap-2 font-mono text-sm text-slate-100 sm:grid-cols-2">
            {recoveryCodes.map((rc) => (
              <li key={rc} className="rounded-lg border border-slate-700/70 bg-panel-soft px-3 py-2">
                {rc}
              </li>
            ))}
          </ul>
          <Button onClick={() => setPhase('idle')}>Concluir</Button>
        </div>
      ) : status?.enabled ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-200">
              MFA ativo
            </span>
            <span className="text-sm text-slate-400">
              {status.recovery_codes_remaining} código(s) de recuperação restante(s)
            </span>
          </div>
          <p className="text-sm text-slate-400">
            Para desativar, informe um código TOTP atual ou um código de recuperação.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="mfa-disable-code" className="block text-sm font-medium text-slate-300">
                Código
              </label>
              <input
                id="mfa-disable-code"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="mt-1.5 h-10 w-48 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm tracking-widest text-slate-100 outline-none"
                placeholder="000000"
              />
            </div>
            <Button variant="danger" onClick={handleDisable} loading={busy} disabled={!disableCode}>
              Desativar MFA
            </Button>
          </div>
        </div>
      ) : phase === 'enrolling' && enroll ? (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            Escaneie o QR no seu aplicativo autenticador (Google Authenticator, Authy, etc.) ou cadastre a chave manualmente.
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enroll.qr_data_url}
            alt="QR Code MFA"
            width={180}
            height={180}
            className="rounded-lg border border-slate-700/70 bg-white p-2"
          />
          <p className="font-mono text-xs text-slate-400">
            Chave: <span className="text-slate-200">{enroll.secret}</span>
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="mfa-code" className="block text-sm font-medium text-slate-300">
                Código gerado
              </label>
              <input
                id="mfa-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="mt-1.5 h-10 w-48 rounded-lg border border-slate-600/80 bg-panel-soft px-3 text-sm tracking-widest text-slate-100 outline-none"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>
            <Button onClick={handleVerify} loading={busy} disabled={!code}>
              Confirmar e ativar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setPhase('idle');
                setEnroll(null);
                setCode('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">
            A verificação em duas etapas (TOTP) adiciona uma camada extra de segurança ao seu login.
          </p>
          <Button onClick={handleStart} loading={busy}>
            Ativar verificação em duas etapas
          </Button>
        </div>
      )}
    </div>
  );
}
