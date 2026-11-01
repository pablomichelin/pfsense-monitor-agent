import './synthetic-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { NodeRequestAuthService } from '../dist/common/node-request-auth.service.js';

function fixture() {
  const seen = new Set();
  const node = { id: 'node-synthetic', nodeUidStatus: 'active', credentials: [{ id: 'cred-synthetic', secretEncrypted: 'encrypted' }] };
  const prisma = {
    node: { findUnique: async () => node },
    nodeRequestNonce: {
      deleteMany: async () => ({}),
      create: async ({ data }) => {
        if (seen.has(data.signatureHash)) throw { code: 'P2002' };
        seen.add(data.signatureHash);
      },
    },
  };
  const service = new NodeRequestAuthService(prisma, { decrypt: () => 'synthetic-secret' });
  const rawBody = Buffer.from('{"synthetic":true}');
  const timestamp = new Date().toISOString();
  const signature = createHmac('sha256', 'synthetic-secret').update(`${timestamp}\n`).update(rawBody).digest('hex');
  return { service, prisma, request: { rawBody, headerNodeUid: 'synthetic', headerTimestamp: timestamp, headerSignature: signature, receivedAt: new Date(timestamp) } };
}

test('assinatura legítima passa e replay com representação alternativa é recusado', async () => {
  const { service, request } = fixture();
  const result = await service.authenticateNodeRequest(request);
  assert.equal(result.node.id, 'node-synthetic');
  await assert.rejects(service.authenticateNodeRequest({ ...request, headerSignature: `sha256=${request.headerSignature.toUpperCase()}` }), /replayed/);
});

test('alteração do corpo e assinatura malformada são recusadas', async () => {
  const { service, request } = fixture();
  await assert.rejects(service.authenticateNodeRequest({ ...request, rawBody: Buffer.from('{}') }), /invalid node request signature/);
  await assert.rejects(service.authenticateNodeRequest({ ...request, headerSignature: 'zz'.repeat(32) }), /invalid node request signature/);
});

test('relógio fora da janela e UID desconhecido continuam recusados', async () => {
  const { service, prisma, request } = fixture();
  await assert.rejects(service.authenticateNodeRequest({ ...request, receivedAt: new Date(Date.parse(request.headerTimestamp) + 301_000) }), /timestamp outside/);
  prisma.node.findUnique = async () => null;
  await assert.rejects(service.authenticateNodeRequest(request), /unknown node/);
});
