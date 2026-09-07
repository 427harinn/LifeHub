export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true, app: "LifeHub", environment: env.APP_ENV ?? "local" });
    }

    return env.ASSETS.fetch(request);
  }
};
