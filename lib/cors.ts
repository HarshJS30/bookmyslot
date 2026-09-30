const configuredOrigins = new Set(
  (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) return false;

  return (
    origin === "https://bookmyslot.helloharsh.me" ||
    configuredOrigins.has(origin) ||
    origin === "http://localhost:3000" ||
    origin === "http://127.0.0.1:3000"
  );
}

function createCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  });

  if (isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
  }

  return headers;
}

export function withCors(request: Request, response: Response) {
  const headers = new Headers(response.headers);

  for (const [name, value] of createCorsHeaders(request)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function corsOptions(request: Request) {
  return new Response(null, {
    status: 204,
    headers: createCorsHeaders(request),
  });
}