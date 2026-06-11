import type { Request, Response, NextFunction } from "express";

export type Role = "maker" | "checker" | "backend" | "admin";

const VALID_ROLES: Role[] = ["maker", "checker", "backend", "admin"];

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role; name: string };
    }
  }
}

/**
 * Attaches a simulated user to the request based on the `X-Role` header sent by
 * the frontend role switcher. This is NOT real authentication — there is no
 * login or token verification. It exists so that `authorize()` can enforce
 * role-based access on the backend in a way that mirrors the spec's RBAC design.
 *
 * Defaults to the `maker` role when no (or an invalid) header is supplied.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const headerRole = String(req.header("x-role") ?? "").toLowerCase();
  const role: Role = VALID_ROLES.includes(headerRole as Role)
    ? (headerRole as Role)
    : "maker";
  const name = req.header("x-user-name") ?? `${role.charAt(0).toUpperCase()}${role.slice(1)} User`;
  req.user = { id: `sim-${role}`, role, name };
  next();
}

/**
 * Express middleware factory that restricts a route to the given roles.
 * Usage: router.post("/route", authorize(["checker", "admin"]), handler)
 */
export function authorize(roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({
        error: "Forbidden",
        message: `This action requires one of the following roles: ${roles.join(", ")}. Current role: ${role ?? "none"}.`,
        requiredRoles: roles,
        currentRole: role ?? null,
      });
    }
    next();
  };
}
