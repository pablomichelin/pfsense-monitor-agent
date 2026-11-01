// Somente fixtures sintéticas; nunca importar configuração de produção nos testes.
process.env.DATABASE_URL = process.env.STABILIZATION_DATABASE_URL || 'postgresql://synthetic:synthetic@127.0.0.1:1/synthetic';
process.env.AUTH_BOOTSTRAP_EMAIL = 'synthetic@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'Synthetic-only-password-2026!';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.RBAC_ENABLED = 'true';
process.env.RBAC_SCOPE_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNTS_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_CREATE_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_PASSWORD_RESET_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_DISABLE_ENABLED = 'true';
process.env.TECHNICIAN_ACCOUNT_DELETE_ENABLED = 'true';
