import type { UserDocumentKind } from "@/lib/validations/qso";

export type UserDocumentDto = {
  id: string;
  kind: UserDocumentKind;
  originalName: string;
  contentType: string;
  size: number;
  createdAt: string;
  downloadUrl: string;
};

export type ProfileGender = "male" | "female" | "other" | "";

export type AccountProfileDto = {
  id: string;
  name: string;
  email: string;
  callsign: string;
  birthday: string | null;
  gender: ProfileGender;
  isProfilePublic: boolean;
  isQsoPublic: boolean;
};

export type QsoListItemDto = {
  id: string;
  workedCallsign: string;
  qsoAt: string;
  band: string;
  freqMhz: number | null;
  mode: string;
  rstSent: string;
  rstRcvd: string;
  qso_sent: boolean;
  qso_confirmed: boolean;
  grid: string;
  notes: string;
};
