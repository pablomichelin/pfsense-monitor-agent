import { JobBatchStatus, NodeCommandStatus, Prisma } from '@prisma/client';

export function summarizeCommandBatch(commands: ReadonlyArray<{ status: NodeCommandStatus }>) {
  if (commands.length === 0) {
    return null;
  }

  const counts = {
    succeeded: 0,
    failed: 0,
    cancelled: 0,
    expired: 0,
    active: 0,
  };

  for (const command of commands) {
    switch (command.status) {
      case NodeCommandStatus.succeeded:
        counts.succeeded += 1;
        break;
      case NodeCommandStatus.failed:
        counts.failed += 1;
        break;
      case NodeCommandStatus.cancelled:
        counts.cancelled += 1;
        break;
      case NodeCommandStatus.expired:
        counts.expired += 1;
        break;
      default:
        counts.active += 1;
    }
  }

  let status: JobBatchStatus = JobBatchStatus.running;
  if (counts.active === 0) {
    if (counts.succeeded === commands.length) {
      status = JobBatchStatus.completed;
    } else if (counts.failed > 0) {
      status = JobBatchStatus.failed;
    } else if (counts.cancelled === commands.length) {
      status = JobBatchStatus.cancelled;
    } else {
      status = JobBatchStatus.completed;
    }
  }

  return {
    status,
    succeededCount: counts.succeeded,
    failedCount: counts.failed,
    cancelledCount: counts.cancelled,
    expiredCount: counts.expired,
  };
}

export async function reconcileCommandBatchStatus(
  tx: Prisma.TransactionClient,
  batchId: string,
): Promise<void> {
  // Serialize writers before taking the command snapshot. This lock stays
  // compatible with foreign-key checks when a command references the batch.
  const [batch] = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM job_batches WHERE id = ${batchId}::uuid FOR NO KEY UPDATE
  `;
  if (!batch) return;

  const commands = await tx.nodeCommand.findMany({
    where: { batchId },
    select: { status: true },
  });

  const summary = summarizeCommandBatch(commands);
  if (!summary) return;

  await tx.jobBatch.update({
    where: { id: batchId },
    data: {
      ...summary,
      completedAt: summary.status === JobBatchStatus.running ? null : new Date(),
    },
  });
}
