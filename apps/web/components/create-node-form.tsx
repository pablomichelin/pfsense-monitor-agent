'use client';

import { createNodeAction } from '@/lib/admin';

type Client = { id: string; name: string; code: string };

export function CreateNodeForm({
  clients,
  sectionMessage,
}: {
  clients: Client[];
  sites: never[];
  sectionMessage: React.ReactNode;
}) {
  return (
    <form action={createNodeAction} className="mt-4 space-y-3">
      {sectionMessage}
      <select
        name="client_id"
        required
        className="w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-200 outline-none"
        defaultValue=""
      >
        <option value="" disabled>
          Selecione o cliente
        </option>
        {clients.map((client) => (
          <option key={client.id} value={client.id}>
            {client.name}
          </option>
        ))}
      </select>
      <input
        type="text"
        name="hostname"
        placeholder="Hostname ou ID do firewall (opcional – deixe em branco para gerar um ID)"
        className="w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        title="Deixe em branco para o sistema gerar um ID; use o comando de bootstrap no firewall para associar. Ou informe o hostname que o firewall já reporta."
      />
      <div className="rounded-xl border border-slate-700/80 bg-panel-soft/50 px-4 py-3 text-xs text-slate-400">
        <strong className="text-slate-300">Só o cliente é obrigatório.</strong> Pode deixar hostname e IPs em branco: o sistema gera um ID para o firewall e, após rodar o comando de bootstrap no pfSense, nome, IPs e interfaces são preenchidos automaticamente pelo agente no primeiro heartbeat.
      </div>
      <input
        type="text"
        name="display_name"
        placeholder="Nome exibido (opcional – preenchido pelo agente)"
        className="w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      <input
        type="text"
        name="management_ip"
        placeholder="IP de rede / gerenciamento (opcional – preenchido pelo agente)"
        className="w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      <input
        type="text"
        name="wan_ip"
        placeholder="IP WAN (opcional – preenchido pelo agente)"
        className="w-full rounded-lg border border-slate-600/80 bg-panel-soft h-11 px-4 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      <label className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-panel-soft/50 px-4 py-3 text-sm text-slate-300">
        <input type="checkbox" name="maintenance_mode" className="h-4 w-4" />
        Criar firewall em modo manutenção
      </label>
      <button
        type="submit"
        className="w-full rounded-lg bg-cyan-500 h-11 px-5 py-3 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
      >
        Criar firewall
      </button>
    </form>
  );
}
