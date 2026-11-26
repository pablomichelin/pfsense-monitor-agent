'use client';

import { useSearchParams } from 'next/navigation';
import { Alert } from '@/components/ui';
import PageError from '../error';

export default function AlertsError(props: Parameters<typeof PageError>[0]) {
  const uncertainty = useSearchParams().get('alert_notice') === 'unavailable';
  return (
    <>
      {uncertainty ? (
        <Alert variant="warning">
          Não foi possível confirmar a operação nem recarregar a lista. Confira o estado do alerta quando a lista voltar.
        </Alert>
      ) : null}
      <PageError {...props} reset={uncertainty ? () => window.location.reload() : props.reset} />
    </>
  );
}
