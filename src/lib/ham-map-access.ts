export function canAccessHamMapPage(isBlockedProfile: boolean): boolean {
  return !isBlockedProfile;
}

export function canViewQsoMapMarkers(canViewLogbook: boolean): boolean {
  return canViewLogbook;
}

export function canViewHomeMapMarker(
  canViewProfile: boolean,
  homeGrid: string,
): boolean {
  return canViewProfile && homeGrid.trim().length > 0;
}
