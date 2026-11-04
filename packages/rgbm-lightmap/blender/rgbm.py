# Writes a baked float image as an 8-bit RGBM PNG, inside Blender (bpy and numpy).
# Each texel is the square root of its light over light_range, kept as a colour and a multiplier in alpha, so dim
# light keeps its precision. The page reads it back with the same light_range (readRGBM in src/index.ts).
import bpy
import numpy as np


def save_rgbm(source, target, light_range=256):
    image = bpy.data.images.load(source)
    width, height = image.size
    pixels = np.empty(width * height * 4, np.float32)
    image.pixels.foreach_get(pixels)
    light = np.sqrt(np.clip(pixels.reshape(-1, 4)[:, :3], 0, light_range) / light_range)
    # The multiplier is rounded up to the next 8-bit step, so the colour over it never passes 1.
    scale = np.ceil(np.clip(light.max(axis=1, keepdims=True), 1 / 255, 1) * 255) / 255
    coded = bpy.data.images.new('rgbm', width, height, alpha=True)
    coded.colorspace_settings.name = 'Non-Color'
    coded.alpha_mode = 'STRAIGHT'
    coded.pixels.foreach_set(np.concatenate([light / scale, scale], axis=1).ravel())
    coded.filepath_raw = target
    coded.file_format = 'PNG'
    coded.save()
    peak = float(pixels.reshape(-1, 4)[:, :3].max())
    bpy.data.images.remove(coded)
    bpy.data.images.remove(image)
    return peak
