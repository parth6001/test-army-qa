import { useEffect, useState } from 'react';
import { apiRequest } from './api';

export function ProtectedScreenshot({ path }: { path: string }) {
  const [image, setImage] = useState<{ path: string; url: string } | null>(null);
  const [failure, setFailure] = useState<{ path: string; message: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl: string | undefined;
    async function load() {
      try {
        const response = await apiRequest(path, { signal: controller.signal });
        if (!response.ok) {
          const data = await response.json().catch(() => null);
          throw new Error(data?.error || 'Screenshot is unavailable.');
        }
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(response.headers.get('content-type')?.split(';')[0] || ''))
          throw new Error('Unsupported screenshot format.');
        const blob = await response.blob();
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setImage({ path, url: objectUrl });
      } catch (error) {
        if (!controller.signal.aborted) setFailure({ path, message: error instanceof Error ? error.message : 'Screenshot is unavailable.' });
      }
    }
    void load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (failure?.path === path) return <p role="alert">{failure.message}</p>;
  if (image?.path !== path) return <p role="status">Loading screenshot…</p>;
  return <a href={image.url} target="_blank" rel="noreferrer">
    <img className="test-shot" src={image.url} alt="failure screenshot" />
  </a>;
}
