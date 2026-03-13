export const formatDateTime = (value: string | null): string => {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(new Date(value));
};

export const formatRelativeAge = (value: string | null): string => {
  if (!value) {
    return 'sem heartbeat';
  }

  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );

  if (seconds < 60) {
    return `${seconds}s atras`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min atras`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h atras`;
  }

  const days = Math.floor(hours / 24);
  return `${days} d atras`;
};

export const formatPercent = (value: number | null): string =>
  value === null ? '-' : `${value.toFixed(1)}%`;

export const formatMs = (value: number | null): string =>
  value === null ? '-' : `${value} ms`;

export const formatUptime = (seconds: number | null): string => {
  if (seconds === null) {
    return '-';
  }

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
};
