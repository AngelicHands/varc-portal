import { redirect } from "next/navigation";

export default function AdminHlsPostersRedirectPage() {
  redirect("/admin/background-jobs");
}
