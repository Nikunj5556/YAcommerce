const API_URL = process.env.REACT_APP_BACKEND_URL || '';

export async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.detail || err.error || err.message || 'Request failed');
  }
  return res.json();
}

const S3_PRESIGN_URL = 'https://aykqayvu7k.us-east-1.awsapprunner.com';

export async function uploadToS3(file, folder) {
  const res = await fetch(`${S3_PRESIGN_URL}/get-presigned-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileType: file.type, folder }),
  });
  if (!res.ok) throw new Error('Failed to get upload URL');
  const { uploadUrl, publicUrl } = await res.json();
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!uploadRes.ok) throw new Error('Failed to upload file');
  return publicUrl;
}
