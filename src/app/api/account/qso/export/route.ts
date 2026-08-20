import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { adifFilename, buildAdifExport } from "@/lib/adif/export";
import { connectDb } from "@/lib/db";
import { publicErrorMessage } from "@/lib/safe-error";
import { QsoLog } from "@/models/QsoLog";
import { User } from "@/models/User";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectDb();
    const user = await User.findById(session.user.id).lean();
    const stationCallsign = user?.callsign?.trim() ?? "";
    if (!stationCallsign) {
      return NextResponse.json(
        { error: "Set your callsign in Account before exporting" },
        { status: 400 },
      );
    }

    const qsos = await QsoLog.find({ userId: session.user.id })
      .sort({ qsoAt: 1 })
      .lean();

    const body = buildAdifExport(
      qsos.map((qso) => ({
        workedCallsign: qso.workedCallsign,
        qsoAt: qso.qsoAt,
        band: qso.band,
        freqMhz: qso.freqMhz,
        mode: qso.mode,
        rstSent: qso.rstSent,
        rstRcvd: qso.rstRcvd,
        grid: qso.grid,
        notes: qso.notes,
      })),
      stationCallsign,
    );

    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${adifFilename(stationCallsign)}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: publicErrorMessage(error, "Failed to export ADIF") },
      { status: 500 },
    );
  }
}
