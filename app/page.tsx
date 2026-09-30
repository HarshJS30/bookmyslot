import { auth, signIn, signOut } from "@/auth"
import Hero from "./components/Hero";
import NowShowing from "./components/NowShowing";

export default async function Home() {
  const session = await auth()

  async function signInWithGitHub() {
    "use server"
    await signIn("github")
  }

  async function signOutUser() {
    "use server"
    await signOut()
  }

  return (
    <>
      <Hero
        isSignedIn={Boolean(session)}
        userName={session?.user?.name ?? null}
        userEmail={session?.user?.email ?? null}
        signInAction={signInWithGitHub}
        signOutAction={signOutUser}
      />
      <NowShowing />
    </>
  )
}