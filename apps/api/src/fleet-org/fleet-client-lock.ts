import { Prisma } from '@prisma/client';

export async function lockFleetClient(
  tx: Prisma.TransactionClient,
  clientId: string,
): Promise<boolean> {
  const [client] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM clients WHERE id = ${clientId}::uuid FOR KEY SHARE
  `;
  return client !== undefined;
}
