import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adifFilename, buildAdifExport, serializeQsoToAdifRecord } from "@/lib/adif/export";
import { buildPortalAdifHeader } from "@/lib/adif/export/portal";
import { canManageUsers } from "@/lib/roles";
import { connectDb } from "@/lib/db";
import { publicErrorMessage } from "@/lib/safe-error";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id || !canManageUsers(session.user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId")?.trim() ?? "";

    await connectDb();
    const filter = userId ? { userId } : {};
    const qsos = await QsoLog.find(filter).sort({ qsoAt: 1 }).lean();

    const userIds = [...new Set(qsos.map((qso) => String(qso.userId)))];
    const users = userIds.length
      ? await User.find({ _id: { $in: userIds } }).select("callsign name").lean()
      : [];
    const stationByUserId = new Map(
      users.map((user) => [
        String(user._id),
        user.callsign?.trim() || user.name?.trim() || "UNKNOWN",
      ]),
    );

    const records = qsos.map((qso) => ({
      workedCallsign: qso.workedCallsign,
      workedName: qso.workedName,
      qsoAt: qso.qsoAt,
      band: qso.band,
      freqMhz: qso.freqMhz,
      mode: qso.mode,
      rstSent: qso.rstSent,
      rstRcvd: qso.rstRcvd,
      grid: qso.grid,
      notes: qso.notes,
      source: qso.source,
      qso_confirmed: qso.qso_confirmed,
      confirmedAt: qso.confirmedAt,
      stationCallsign: userId
        ? stationByUserId.get(String(qso.userId)) || "UNKNOWN"
        : stationByUserId.get(String(qso.userId)) || "UNKNOWN",
    }));

    const body = userId
      ? buildAdifExport(
          records.map(({ stationCallsign, ...qso }) => {
            void stationCallsign;
            return qso;
          }),
          records[0]?.stationCallsign || "UNKNOWN",
        )
      : [
          buildPortalAdifHeader(),
          ...records.map((record) => {
            const { stationCallsign, ...qso } = record;
            return serializeQsoToAdifRecord(qso, stationCallsign);
          }),
        ].join("\r\n");

    const filename = userId
      ? adifFilename(stationByUserId.get(userId) || "LOG")
      : `varc_all_qsos_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.adi`;

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to export ADIF") },
      { status: 500 },
    );
  }
}
