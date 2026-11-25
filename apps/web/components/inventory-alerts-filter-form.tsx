'use client';

import { createContext, useContext, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

const FilterClientContext = createContext('');

export function InventoryAlertsFilterForm({
  clientId,
  ...props
}: Omit<ComponentPropsWithoutRef<'form'>, 'onChange'> & { clientId?: string }) {
  const [selectedClient, setSelectedClient] = useState(clientId ?? '');

  return (
    <FilterClientContext.Provider value={selectedClient}>
      <form
        {...props}
        onChange={({ target }) => {
          if (target instanceof HTMLSelectElement && target.name === 'client_id') {
            setSelectedClient(target.value);
          }
        }}
      />
    </FilterClientContext.Provider>
  );
}

type FilterOption = {
  id: string;
  clientId: string;
  label: string;
};

export function ClientScopedFilterSelect({
  options,
  placeholder,
  defaultValue,
  ...props
}: Pick<ComponentPropsWithoutRef<'select'>, 'name' | 'aria-label' | 'className'> & {
  options: FilterOption[];
  placeholder: string;
  defaultValue?: string;
}) {
  const clientId = useContext(FilterClientContext);
  const [selection, setSelection] = useState({ value: defaultValue ?? '', clientId });
  const { value } = selection;
  const visibleOptions = clientId ? options.filter((option) => option.clientId === clientId) : options;
  const unavailable = value !== '' && (!clientId || clientId === selection.clientId)
    && !options.some((option) => option.id === value);
  const visibleValue = unavailable || visibleOptions.some((option) => option.id === value) ? value : '';

  if (value !== visibleValue) {
    setSelection({ value: visibleValue, clientId });
  }

  return (
    <select {...props} value={visibleValue} onChange={(event) => setSelection({ value: event.target.value, clientId })}>
      <option value="">{placeholder}</option>
      {unavailable ? <option value={visibleValue}>Opção da consulta (indisponível na lista)</option> : null}
      {visibleOptions.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  );
}
