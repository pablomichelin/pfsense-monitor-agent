export function loginErrorCode(status: number): string {
  return status === 429 ? 'limited' : status >= 500 || status === 0 ? 'unavailable' : '1';
}

export function loginErrorMessage(code: unknown): string | null {
  if (code === 'limited') return 'Muitas tentativas de acesso. Aguarde cinco minutos antes de tentar novamente.';
  if (code === 'unavailable') return 'O acesso está temporariamente indisponível. Tente novamente mais tarde.';
  return code === '1' ? 'Credenciais inválidas ou sessão indisponível.' : null;
}
