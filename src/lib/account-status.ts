/** SUSPENDED with a past `suspendedUntil` counts as active again. Shared by server guards and the client shell. */
export function isSuspendedNow(me: {
  status: string;
  suspendedUntil?: Date | string | null;
}) {
  return (
    me.status === "SUSPENDED" &&
    (!me.suspendedUntil || new Date(me.suspendedUntil) > new Date())
  );
}

/** ACTIVE, or a suspension that has already expired. */
export function isActiveNow(me: Parameters<typeof isSuspendedNow>[0]) {
  return (
    me.status === "ACTIVE" || (me.status === "SUSPENDED" && !isSuspendedNow(me))
  );
}
