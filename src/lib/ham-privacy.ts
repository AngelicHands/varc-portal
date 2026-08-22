type HamPrivacyFlags = {
  isProfilePublic: boolean;
  isLocationPublic: boolean;
  isDocumentsPublic: boolean;
  isQsoPublic: boolean;
};

type ViewerAccess = {
  canEdit: boolean;
  canAdminManage: boolean;
};

export type { ViewerAccess };

export function canViewHamBasicProfile(
  ham: Pick<HamPrivacyFlags, "isProfilePublic">,
  access: ViewerAccess,
): boolean {
  return access.canEdit || access.canAdminManage || ham.isProfilePublic;
}

export function canViewHamLocation(
  ham: Pick<HamPrivacyFlags, "isProfilePublic" | "isLocationPublic">,
  access: ViewerAccess,
): boolean {
  return (
    access.canEdit ||
    access.canAdminManage ||
    (ham.isProfilePublic && ham.isLocationPublic)
  );
}

export function canViewHamDocuments(
  ham: Pick<HamPrivacyFlags, "isProfilePublic" | "isDocumentsPublic">,
  access: ViewerAccess,
): boolean {
  return (
    access.canEdit ||
    access.canAdminManage ||
    (ham.isProfilePublic && ham.isDocumentsPublic)
  );
}

export function canViewHamLogbook(
  ham: Pick<HamPrivacyFlags, "isProfilePublic" | "isQsoPublic">,
  access: ViewerAccess,
): boolean {
  return (
    access.canEdit ||
    access.canAdminManage ||
    (ham.isProfilePublic && ham.isQsoPublic)
  );
}

/** Profile tab for visitors: shared basic and/or location fields; admins always see it. */
export function canViewHamProfileTab(
  ham: Pick<HamPrivacyFlags, "isProfilePublic">,
  access: ViewerAccess,
): boolean {
  return canViewHamBasicProfile(ham, access);
}
