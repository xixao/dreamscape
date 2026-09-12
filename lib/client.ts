export async function request<T>(path: string, payload?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: payload ? "POST" : "GET",
    headers: payload ? { "Content-Type": "application/json" } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The service is unavailable. Please try again.");
  }
  if (!response.ok)
    throw Object.assign(
      new Error((data as { error?: string }).error ?? "Something went wrong"),
      { status: response.status },
    );
  return data as T;
}
export function download(
  name: string,
  value: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
