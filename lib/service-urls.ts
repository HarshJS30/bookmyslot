const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL ?? "https://bookmyslot.helloharsh.me";

export const realtimeServerUrl =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? "https://bookmyslot-wykl.onrender.com";

export function apiUrl(path: string) {
  return new URL(path, `${apiBaseUrl.replace(/\/+$/, "")}/`).toString();
}