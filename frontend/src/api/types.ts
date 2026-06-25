// DTOs — mirror CONTRACTS.md exactly. All IDs are strings.

export interface Atlas {
  id: string;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: string;
  atlasId: string;
  name: string;
  color?: string | null;
}

export interface Location {
  id: string;
  atlasId: string;
  name: string;
  description?: string | null;
  address?: string | null;
}

export interface UpdateLocationBody {
  name: string;
  description?: string | null;
  address?: string | null;
}

export interface Currency {
  id: string;
  atlasId: string;
  name: string;
  isDefault: boolean;
}

export type PriceKind = "buy" | "sell";

export interface Price {
  id: string;
  kind: PriceKind;
  locationId: string;
  locationName: string;
  currencyId: string;
  currencyName: string;
  amount: number;
}

export interface ItemSummary {
  id: string;
  name: string;
  tags: Tag[];
  isRaw: boolean;
  locationIds: string[];
}

export interface Item {
  id: string;
  atlasId: string;
  name: string;
  notes?: string | null;
  tags: Tag[];
  createdAt: string;
  updatedAt: string;
}

export interface RecipeSummary {
  id: string;
  outputItemId: string;
  isPrimary: boolean;
  locationIds: string[];
}

export interface RecipeIngredient {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  outputItemId: string;
  isPrimary: boolean;
  ingredients: RecipeIngredient[];
  locations: Location[];
}

export interface ItemDetail extends Item {
  recipes: Recipe[];
  prices: Price[];
}

export interface GraphEdge {
  id: string; // "ri:<id>"
  recipeId: string;
  fromItemId: string;
  toItemId: string;
  quantity: number;
}

export interface Graph {
  atlas: Atlas;
  items: ItemSummary[];
  locations: Location[];
  edges: GraphEdge[];
  recipes: RecipeSummary[];
}

export interface TreeRecipeBranch {
  recipeId: string;
  isPrimary: boolean;
  locations: Location[];
  ingredients: TreeNode[];
}

export interface TreeNode {
  itemId: string;
  itemName: string;
  quantity: number;
  isRaw: boolean;
  recipes: TreeRecipeBranch[];
  cyclic: boolean;
}

// ---- request bodies ------------------------------------------------------

export interface CreateAtlasBody {
  name: string;
  description?: string;
}
export interface UpdateAtlasBody {
  name?: string;
  description?: string;
}

export interface CreateItemBody {
  name: string;
  notes?: string;
  tagIds?: string[];
  tagNames?: string[];
}
export interface UpdateItemBody {
  name?: string;
  notes?: string;
  tagIds?: string[];
  tagNames?: string[];
}

export interface RecipeIngredientInput {
  itemId: string;
  quantity: number;
}
export interface CreateRecipeBody {
  isPrimary?: boolean;
  ingredients: RecipeIngredientInput[];
  locationIds?: string[];
  locationNames?: string[];
}
export interface UpdateRecipeBody {
  isPrimary?: boolean;
  ingredients?: RecipeIngredientInput[];
  locationIds?: string[];
  locationNames?: string[];
}

export interface AddIngredientEdgeBody {
  outputItemId: string;
  ingredientItemId: string;
  quantity?: number;
}

export interface CreateCurrencyBody {
  name: string;
  isDefault?: boolean;
}
export interface UpdateCurrencyBody {
  name?: string;
  isDefault?: boolean;
}

export interface PriceInput {
  kind: PriceKind;
  locationId: string;
  currencyId: string;
  amount: number;
}
export interface SetItemPricesBody {
  prices: PriceInput[];
}

// ---- error shape ---------------------------------------------------------

export interface ApiErrorDetailUsage {
  recipeId: string;
  outputItemId: string;
  outputItemName: string;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: {
      usedIn?: ApiErrorDetailUsage[];
      recipeIds?: string[];
      [k: string]: unknown;
    };
  };
}
