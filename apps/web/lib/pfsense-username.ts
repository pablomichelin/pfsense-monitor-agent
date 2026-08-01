/** Contas locais do pfSense que o painel nunca cadastra nem gerencia. */
export const RESERVED_PFSENSE_USERNAMES = ['admin', 'root'] as const;

export const PFSENSE_USERNAME_PATTERN = /^[a-z][a-z0-9._-]{2,31}$/;

export function isReservedPfsenseUsername(username: string): boolean {
  return (RESERVED_PFSENSE_USERNAMES as readonly string[]).includes(
    username.trim().toLowerCase(),
  );
}

export function isValidManagedPfsenseUsername(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  return PFSENSE_USERNAME_PATTERN.test(normalized) && !isReservedPfsenseUsername(normalized);
}

export function pfsenseUsernameValidationMessage(username: string): string | null {
  const normalized = username.trim().toLowerCase();
  if (!normalized) {
    return 'Informe o login pfSense.';
  }
  if (isReservedPfsenseUsername(normalized)) {
    return 'O usuário admin (e root) é exclusivo do pfSense e não pode ser cadastrado ou gerenciado pelo sistema.';
  }
  if (!PFSENSE_USERNAME_PATTERN.test(normalized)) {
    return 'Login inválido: use 3–32 caracteres, começando com letra (a-z, 0-9, . _ -).';
  }
  return null;
}
