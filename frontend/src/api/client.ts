import { config } from "@/lib/config";
import type {
  AddIngredientEdgeBody,
  ApiErrorBody,
  Atlas,
  CreateAtlasBody,
  CreateItemBody,
  CreateRecipeBody,
  Graph,
  Item,
  ItemDetail,
  Location,
  Recipe,
  Tag,
  TreeNode,
  UpdateAtlasBody,
  UpdateItemBody,
  UpdateRecipeBody,
} from "./types";

export class ApiError extends Error {
  status: number;
  code: string;
  body?: ApiErrorBody;

  constructor(status: number, body?: ApiErrorBody, fallbackMessage?: string) {
    super(body?.error?.message ?? fallbackMessage ?? `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "unknown";
    this.body = body;
  }
}

// The OIDC layer registers a token getter so the client can attach a Bearer
// header on every call without importing React.
type TokenGetter = () => string | undefined;
let getToken: TokenGetter = () => undefined;
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(
    config.apiBaseUrl.replace(/\/$/, "") + path,
    window.location.origin,
  );
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {};
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await res.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, body);
  }

  if (res.status === 201 || res.status === 200) {
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
  return (await res.json()) as T;
}

export const api = {
  // Atlases
  listAtlases: () => request<Atlas[]>("/atlases"),
  createAtlas: (body: CreateAtlasBody) =>
    request<Atlas>("/atlases", { method: "POST", body }),
  getAtlas: (id: string) => request<Atlas>(`/atlases/${id}`),
  updateAtlas: (id: string, body: UpdateAtlasBody) =>
    request<Atlas>(`/atlases/${id}`, { method: "PATCH", body }),
  deleteAtlas: (id: string) =>
    request<void>(`/atlases/${id}`, { method: "DELETE" }),

  // Graph
  getGraph: (atlasId: string) => request<Graph>(`/atlases/${atlasId}/graph`),

  // Items
  listItems: (atlasId: string) => request<Item[]>(`/atlases/${atlasId}/items`),
  createItem: (atlasId: string, body: CreateItemBody) =>
    request<Item>(`/atlases/${atlasId}/items`, { method: "POST", body }),
  getItem: (id: string) => request<ItemDetail>(`/items/${id}`),
  updateItem: (id: string, body: UpdateItemBody) =>
    request<Item>(`/items/${id}`, { method: "PATCH", body }),
  deleteItem: (id: string, force = false) =>
    request<void>(`/items/${id}`, {
      method: "DELETE",
      query: force ? { force: true } : undefined,
    }),
  getTree: (id: string, maxDepth?: number) =>
    request<TreeNode>(`/items/${id}/tree`, {
      query: maxDepth !== undefined ? { maxDepth } : undefined,
    }),

  // Recipes
  createRecipe: (itemId: string, body: CreateRecipeBody) =>
    request<Recipe>(`/items/${itemId}/recipes`, { method: "POST", body }),
  addIngredientEdge: (body: AddIngredientEdgeBody) =>
    request<Recipe>(`/recipes/ingredient`, { method: "POST", body }),
  updateRecipe: (id: string, body: UpdateRecipeBody) =>
    request<Recipe>(`/recipes/${id}`, { method: "PATCH", body }),
  deleteRecipe: (id: string) =>
    request<void>(`/recipes/${id}`, { method: "DELETE" }),

  // Locations & Tags
  listLocations: (atlasId: string) =>
    request<Location[]>(`/atlases/${atlasId}/locations`),
  createLocation: (atlasId: string, name: string) =>
    request<Location>(`/atlases/${atlasId}/locations`, {
      method: "POST",
      body: { name },
    }),
  listTags: (atlasId: string) => request<Tag[]>(`/atlases/${atlasId}/tags`),
  createTag: (atlasId: string, name: string, color?: string) =>
    request<Tag>(`/atlases/${atlasId}/tags`, {
      method: "POST",
      body: { name, color },
    }),
};
