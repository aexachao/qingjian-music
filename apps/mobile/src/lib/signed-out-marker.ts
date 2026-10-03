import { Directory, File, Paths } from 'expo-file-system'

function marker(): File {
  return new File(new Directory(Paths.document, 'qj'), 'signed-out')
}

export function wasExplicitlySignedOut(): boolean {
  // If storage is unreadable, the caller's bootstrap error path stays signed out.
  return marker().exists
}

export function markExplicitlySignedOut(): void {
  const file = marker()
  if (!file.exists) file.create({ intermediates: true })
}

export function clearSignedOutMarker(): void {
  const file = marker()
  if (file.exists) file.delete()
}
