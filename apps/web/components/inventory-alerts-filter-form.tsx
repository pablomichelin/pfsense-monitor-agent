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
  const [value, setValue] = useState(defaultValue ?? '');
  const visibleOptions = clientId ? options.filter((option) => option.clientId === clientId) : options;
  const visibleValue = visibleOptions.some((option) => option.id === value) ? value : '';

  if (value !== visibleValue) {
    setValue(visibleValue);
  }

  return (
    <select {...props} value={visibleValue} onChange={(event) => setValue(event.target.value)}>
      <option value="">{placeholder}</option>
      {visibleOptions.map((option) => (
        <option key={option.id} value={option.id}>{option.label}</option>
      ))}
    </select>
  );
}
