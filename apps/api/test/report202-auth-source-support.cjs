// In-memory transpilation only: focused tests do not build or replace dist/.
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true },
  });
  module._compile(result.outputText, filename);
};
process.env.DATABASE_URL = 'postgresql://never:never@127.0.0.1:1/never_connect';
process.env.AUTH_BOOTSTRAP_EMAIL = 'report202@example.invalid';
process.env.AUTH_BOOTSTRAP_PASSWORD = 'Synthetic-report202-password';
process.env.AUTH_BOOTSTRAP_LOGIN_ENABLED = 'true';
process.env.NODE_SECRET_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 1).toString('base64');
process.env.BACKUP_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 2).toString('base64');
process.env.TRUST_PROXY = 'false';
process.env.TRUSTED_PROXY_IPS = '';
