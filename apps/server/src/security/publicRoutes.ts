const publicRoutes = new Set(["POST /api/login/login", "GET /api/meta"]);

export function isPublicApiPath(path: string, method: string): boolean {
  return publicRoutes.has(`${method.toUpperCase()} ${path}`);
}
