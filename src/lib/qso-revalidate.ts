import { revalidatePath } from "next/cache";

export function revalidateLogbook(callsign: string) {
  revalidatePath("/logbook");
  if (!callsign) return;
  revalidatePath(`/${callsign}`);
  revalidatePath(`/vi/${callsign}`);
  revalidatePath(`/en/${callsign}`);
}
