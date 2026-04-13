const BASE = import.meta.env.BASE_URL || "/";

export function apiUrl(path: string): string {
  const base = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  return `${base}${path}`;
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(apiUrl(path), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || err.message || "Request failed");
  }
  return res.json();
}

const S3_PRESIGN_URL = "https://aykqayvu7k.us-east-1.awsapprunner.com";

export async function uploadToS3(file: File, folder: string): Promise<string> {
  const res = await fetch(`${S3_PRESIGN_URL}/get-presigned-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type,
      folder,
    }),
  });

  if (!res.ok) throw new Error("Failed to get upload URL");
  const { uploadUrl, publicUrl } = await res.json();

  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) throw new Error("Failed to upload file");
  return publicUrl;
}
