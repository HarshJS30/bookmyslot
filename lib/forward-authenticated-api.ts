import { cookies } from "next/headers";
import { auth } from "@/auth";
import { apiUrl } from "@/lib/service-urls";

const localSessionCookie = "authjs.session-token";
const secureSessionCookie = `__Secure-${localSessionCookie}`;

export async function forwardAuthenticatedPost(request: Request, apiPath: string) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return new Response("Forbidden", { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const requestCookies = await cookies();
  const allCookies = requestCookies.getAll();
  const secureCookies = allCookies.filter(
    ({ name }) => name === secureSessionCookie || name.startsWith(`${secureSessionCookie}.`),
  );
  const localCookies = allCookies.filter(
    ({ name }) => name === localSessionCookie || name.startsWith(`${localSessionCookie}.`),
  );
  const sourceCookies = secureCookies.length ? secureCookies : localCookies;
  const sourcePrefix = secureCookies.length ? secureSessionCookie : localSessionCookie;

  if (!sourceCookies.length) {
    return new Response("Unauthorized", { status: 401 });
  }

  const cookieHeader = sourceCookies
    .map(({ name, value }) => `${secureSessionCookie}${name.slice(sourcePrefix.length)}=${value}`)
    .join("; ");
  const body = await request.text();
  const contentType = request.headers.get("content-type");
  const upstream = await fetch(apiUrl(apiPath), {
    method: "POST",
    headers: {
      Cookie: cookieHeader,
      ...(contentType ? { "Content-Type": contentType } : {}),
    },
    body,
    cache: "no-store",
  });

  const headers = new Headers({ "Cache-Control": "no-store" });
  const upstreamContentType = upstream.headers.get("content-type");
  if (upstreamContentType) headers.set("Content-Type", upstreamContentType);

  return new Response(await upstream.arrayBuffer(), {
    status: upstream.status,
    headers,
  });
}