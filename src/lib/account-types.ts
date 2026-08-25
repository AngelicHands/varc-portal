import type { UserDocumentKind } from "@/lib/validations/qso";
import type { QsoSource } from "@/lib/qso-source";

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
export type CallsignVerificationStatus =
  | "unverified"
  | "pending"
  | "verified"
  | "rejected";

export type AccountProfileDto = {
  id: string;
  name: string;
  email: string;
  callsign: string;
  callsignVerified: boolean;
  callsignVerificationStatus: CallsignVerificationStatus;
  birthday: string | null;
  gender: ProfileGender;
  isProfilePublic: boolean;
  isQsoPublic: boolean;
  isLocationPublic: boolean;
  isDocumentsPublic: boolean;
  homeGrid: string;
  homeLat: number | null;
  homeLng: number | null;
  address: string;
  addressCountry: string;
  hasPassword: boolean;
};

export type QsoListItemDto = {
  id: string;
  workedCallsign: string;
  /** Contact display name (ADIF NAME and/or portal account name). */
  workedName: string;
  qsoAt: string;
  band: string;
  freqMhz: number | null;
  mode: string;
  rstSent: string;
  rstRcvd: string;
  qso_sent: boolean;
  qso_confirmed: boolean;
  source: QsoSource;
  grid: string;
  notes: string;
};
