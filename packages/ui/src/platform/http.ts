export async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`请求失败 (${response.status}): ${url}`);
  }

  return response.json();
}
