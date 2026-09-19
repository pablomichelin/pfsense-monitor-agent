-- Desbloqueio de tabelas pf (Diagnostics > Tables) via comandos do agente.
ALTER TYPE "node_command_type" ADD VALUE IF NOT EXISTS 'table_search';
ALTER TYPE "node_command_type" ADD VALUE IF NOT EXISTS 'table_entry_remove';