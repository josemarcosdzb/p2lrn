export function columnasTablaUnicas(
  columnas: Array<string | null | undefined>,
  prefijo = 'Columna',
) {
  const vistos = new Map<string, number>();
  return columnas.map((columna, index) => {
    const base = String(columna ?? '').trim() || `${prefijo} ${index + 1}`;
    const clave = base.toLocaleLowerCase('es-ES');
    const numero = (vistos.get(clave) ?? 0) + 1;
    vistos.set(clave, numero);
    return numero === 1 ? base : `${base}_${numero}`;
  });
}

export function filaConEnfasisEsCabecera(params: {
  totalCeldas: number;
  celdasEnfatizadas: number;
  marcadaComoCabecera?: boolean;
}) {
  if (params.marcadaComoCabecera) return true;
  if (params.totalCeldas <= 0) return false;
  return params.celdasEnfatizadas >= Math.ceil(params.totalCeldas / 2);
}
