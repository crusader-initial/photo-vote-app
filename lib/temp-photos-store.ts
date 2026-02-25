/**
 * In-memory store for selected photos when navigating create → self-guess on web.
 * Web localStorage has ~5MB limit; base64 images often exceed it, so we use memory instead.
 */

export interface TempPhoto {
  uri: string;
  base64: string;
  mimeType: string;
}

let _tempPhotos: TempPhoto[] | null = null;

export function setTempPhotos(photos: TempPhoto[]): void {
  _tempPhotos = photos;
}

export function getTempPhotos(): TempPhoto[] | null {
  return _tempPhotos;
}

export function clearTempPhotos(): void {
  _tempPhotos = null;
}
