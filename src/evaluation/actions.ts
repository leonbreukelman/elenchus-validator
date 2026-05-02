export function normalizeActionType(type: string): string {
  return type.trim().toLowerCase().replaceAll("-", "_");
}

export function actionTerms(type: string): string[] {
  return normalizeActionType(type).split("_").filter((part) => part.length > 2);
}
