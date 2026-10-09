type TemplateComponent = {
    type?: string;
    text?: string;
};

export function getTemplateBodyText(components: unknown): string {
    if (!Array.isArray(components)) return "";

    const body = components.find((component) => {
        const item = component as TemplateComponent;
        return item.type === "BODY";
    }) as TemplateComponent | undefined;

    return body?.text || "";
}

export function countTemplateVariables(components: unknown): number {
    const bodyText = getTemplateBodyText(components);

    const matches = bodyText.match(/{{\s*\d+\s*}}/g);

    return matches ? matches.length : 0;
}

export function renderTemplatePreview(
    components: unknown,
    variables: string[]
): string {
    let body = getTemplateBodyText(components);

    variables.forEach((value, index) => {
        const position = index + 1;
        const regex = new RegExp(`{{\\s*${position}\\s*}}`, "g");

        body = body.replace(regex, value || `{{${position}}}`);
    });

    return body;
}

export function buildTemplateBodyParameters(variables: string[]) {
    return variables
        .filter((value) => value.trim() !== "")
        .map((value) => ({
            type: "text",
            text: value
        }));
}
