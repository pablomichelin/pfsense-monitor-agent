import { Transform } from 'class-transformer';

/** Campo opcional enviado como "" pelo filtro "Todos" do painel. */
export function EmptyStringToUndefined() {
  return Transform(({ value }: { value: unknown }) => {
    if (typeof value === 'string' && value.trim() === '') {
      return undefined;
    }
    return value;
  });
}
