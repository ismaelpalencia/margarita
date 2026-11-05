/** Percentil con interpolación por rango (el mismo criterio para mediana y p90). */
export function percentile(values: number[], p: number): number | null {
    if (values.length === 0) {
        return null;
    }

    const ordered = [...values].sort((a, b) => a - b);
    const index = Math.min(
        ordered.length - 1,
        Math.max(0, Math.ceil((p / 100) * ordered.length) - 1)
    );

    return ordered[index];
}