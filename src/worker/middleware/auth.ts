import { AuthService } from "../services/auth-service";
import type { AuthenticatedUser } from "../types";

export type RequestContext = { request: Request; env: Env; user?: AuthenticatedUser };
export type Handler = (context: RequestContext) => Promise<Response>;

export const requireAuth = (handler: (context: RequestContext & { user: AuthenticatedUser }) => Promise<Response>): Handler =>
  async (context) => {
    const user = await new AuthService(context.env.DB).authenticate(context.request);
    return handler({ ...context, user });
  };
