import { auth } from "@/lib/auth";
import { CreateJoinRoomPanel } from "@/components/room/create-join-room-panel";

export default async function RoomsPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.28em] text-accentSoft">Party control room</p>
        <h1 className="mt-4 font-display text-5xl text-white">Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}.</h1>
        <p className="mt-4 max-w-2xl text-base leading-8 text-cream/70">
          Create a new private room for tonight&apos;s game or join one with a code from the host.
        </p>
      </div>
      <CreateJoinRoomPanel />
    </div>
  );
}
