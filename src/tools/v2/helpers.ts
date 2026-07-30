import { apiKeyParam } from "../shared.js";

export { buildQuery, paginationHint, toolError } from "../shared.js";
export type { Pagination as V2Pagination } from "../shared.js";

/** Chave v2 (override opcional). */
export const v2ApiKey = apiKeyParam("v2");
