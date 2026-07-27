/** GPU slot caps shared by pack + adapters. */
export const MAX_GPU_LIGHTS = 4;
export const MAX_GPU_MEDIA = 4;
/** Grid NS fog / smoke volumes. */
export const MAX_GPU_FOGS = 2;
/** Analytical water tanks (WaterOpticsBinder PP + volumetric medium). */
export const MAX_GPU_WATERS = 1;
/**
 * Screen-space lens flare sources (GPU lights + optional sun).
 * Packed separately from volumetric light slots so the sun can flare.
 */
export const MAX_LENS_FLARES = 5;
/** @deprecated Use MAX_GPU_FOGS; kept for volumetric shader slot count during migration. */
export const MAX_GPU_FLUIDS = MAX_GPU_FOGS;
export const VOLUMETRIC_LIGHT_SLOTS = MAX_GPU_LIGHTS;
export const VOLUMETRIC_MEDIA_SLOTS = MAX_GPU_MEDIA;
export const VOLUMETRIC_FLUID_SLOTS = MAX_GPU_FOGS;
export const VOLUMETRIC_FOG_SLOTS = MAX_GPU_FOGS;
export const LENS_FLARE_SLOTS = MAX_LENS_FLARES;
export const SURFACE_MAX_SIMULTANEOUS_LIGHTS = 2;
