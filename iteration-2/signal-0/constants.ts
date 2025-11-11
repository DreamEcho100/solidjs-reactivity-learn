import type { Owner } from "./reactive-types.ts";

/** Computation is up to date */
export const FRESH = 0;
/** Computation may need to recompute */
export const STALE = 1;
/** Computation is waiting on upstream dependencies */
export const PENDING = 2;

export const IS_DEV = true;

/**
 * The UNOWNED singleton - represents computations without an owner
 */
export const UNOWNED_OWNER: Owner = {
  owned: null,
  cleanups: null,
  context: null,
  owner: null,
};
