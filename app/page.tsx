import { auth, signIn, signOut } from "@/auth"

export default async function Home() {
  const session = await auth()

  if (!session) {
    return (
      <form action={async () => { "use server"; await signIn("github") }}>
        <button type="submit">Sign in with GitHub</button>
      </form>
    )
  }

  return (
    <div>
      <p>Signed in as {session.user?.email}</p>
      <form action={async () => { "use server"; await signOut() }}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  )
}