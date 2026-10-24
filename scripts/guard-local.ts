const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

for (const name of ["DATABASE_URL", "REDIS_URL", "BASE_URL"]) {
  const value = process.env[name];
  if (!value) {
    if (name === "BASE_URL") continue; // optional
    console.error(`REFUSING TO RUN: ${name} is not set.`);
    process.exit(1);
  }
  const host = new URL(value).hostname;
  if (!LOCAL_HOSTS.includes(host)) {
    console.error(`REFUSING TO RUN: ${name} points to "${host}", not localhost.`);
    process.exit(1);
  }
}