export function maskSecret(value: string | null | undefined): string {
    if (!value) return "No configurado";

    if (value.length <= 10) {
        return "••••••••";
    }

    const start = value.slice(0, 6);
    const end = value.slice(-4);

    return `${start}••••••••••${end}`;
}
