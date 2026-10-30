import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';

export interface ProgressPhoto {
  id: string;
  day: string;
  path: string;
  /** A signed link, good for an hour. The bucket is private. */
  url: string | null;
}

const PENDING_KEY = 'shredder.pendingPhotos';
type Pending = { uri: string; day: string };

function readPending(): Pending[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as Pending[];
  } catch {
    return [];
  }
}
const writePending = (list: Pending[]) => localStorage.setItem(PENDING_KEY, JSON.stringify(list));

export const pendingPhotoCount = () => readPending().length;

/** Newest first. */
export async function fetchPhotos(): Promise<ProgressPhoto[]> {
  const { data, error } = await supabase.from('progress_photos').select('id, day, path').order('day', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const { data: signed } = await supabase.storage.from('progress-photos').createSignedUrls(
    rows.map((r) => r.path as string),
    3600
  );
  const urls = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return rows.map((r) => ({ ...(r as Omit<ProgressPhoto, 'url'>), url: urls.get(r.path as string) ?? null }));
}

async function upload(userId: string, uri: string, day: string) {
  const path = `${userId}/${day}-${Date.now()}.jpg`;
  const body = await new File(uri).arrayBuffer();
  const { error } = await supabase.storage.from('progress-photos').upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  const { error: rowError } = await supabase.from('progress_photos').insert({ day, path });
  if (rowError) {
    await supabase.storage.from('progress-photos').remove([path]);
    throw rowError;
  }
}

/** Saves a smaller copy on the phone first, so a photo taken offline uploads later instead of being lost. */
export async function addPhoto(userId: string, uri: string, day: string): Promise<'sent' | 'waiting'> {
  const context = ImageManipulator.manipulate(uri, { maxWidth: 1440 });
  const image = await context.renderAsync();
  const small = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 });
  const folder = new Directory(Paths.document, 'pending-photos');
  folder.create({ idempotent: true, intermediates: true });
  const kept = new File(folder, `${Date.now()}.jpg`);
  new File(small.uri).copy(kept);
  writePending([...readPending(), { uri: kept.uri, day }]);
  await sendPendingPhotos(userId);
  return readPending().some((p) => p.uri === kept.uri) ? 'waiting' : 'sent';
}

/** Tries everything waiting, oldest first. A failure leaves it for next time. */
export async function sendPendingPhotos(userId: string) {
  for (const p of readPending()) {
    try {
      await upload(userId, p.uri, p.day);
    } catch {
      return;
    }
    writePending(readPending().filter((x) => x.uri !== p.uri));
    try {
      new File(p.uri).delete();
    } catch {
      // Only a leftover copy on the phone.
    }
  }
}

export async function deletePhoto(photo: ProgressPhoto) {
  const { error } = await supabase.from('progress_photos').delete().eq('id', photo.id);
  if (error) throw error;
  await supabase.storage.from('progress-photos').remove([photo.path]);
}
