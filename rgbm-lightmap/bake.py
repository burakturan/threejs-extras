# Builds the demo's gallery room and bakes its light, so the EXR and the RGBM PNG come from the same bake.
# blender -b --factory-startup --python rgbm-lightmap/bake.py -- <out> [samples]
# Writes into <out>: room.glb (the room with its lightmap UVs), light.exr and light.png.
import bpy, sys, os, math
from mathutils import Vector

here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, '..', 'packages', 'rgbm-lightmap', 'blender'))
from rgbm import save_rgbm

argv = sys.argv[sys.argv.index('--') + 1:]
out = os.path.abspath(argv[0])
samples = int(argv[1]) if len(argv) > 1 else 256
os.makedirs(out, exist_ok=True)

SIZE = 2048
RANGE = 16
W, D, H = 9.0, 6.0, 3.6

scene = bpy.context.scene
for o in list(scene.objects):
    bpy.data.objects.remove(o)
scene.world = bpy.data.worlds.new('dark')
scene.world.color = (0, 0, 0)


def material(name, colour):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (*colour, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    return m


wall = material('wall', (0.78, 0.76, 0.72))
floor = material('floor', (0.32, 0.27, 0.22))
ceiling = material('ceiling', (0.82, 0.82, 0.8))
plinth = material('plinth', (0.86, 0.85, 0.82))
works = [material(f'work{i}', c) for i, c in enumerate([(0.55, 0.12, 0.08), (0.08, 0.2, 0.35), (0.6, 0.45, 0.12), (0.1, 0.3, 0.18)])]

parts = []


def box(name, size, at, mat):
    bpy.ops.mesh.primitive_cube_add(size=1, location=at)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    parts.append(o)
    return o


def plane(name, size, at, turn, mat):
    bpy.ops.mesh.primitive_plane_add(size=1, location=at, rotation=turn)
    o = bpy.context.active_object
    o.name = name
    o.scale = (*size, 1)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(mat)
    parts.append(o)


# The shell as planes facing in, so the lightmap holds no outer face nobody sees.
q = math.pi / 2
plane('floor', (W, D), (0, 0, 0), (0, 0, 0), floor)
plane('ceiling', (W, D), (0, 0, H), (math.pi, 0, 0), ceiling)
plane('north', (W, H), (0, D / 2, H / 2), (q, 0, 0), wall)
plane('south', (W, H), (0, -D / 2, H / 2), (-q, 0, 0), wall)
plane('east', (H, D), (W / 2, 0, H / 2), (0, -q, 0), wall)
plane('west', (H, D), (-W / 2, 0, H / 2), (0, q, 0), wall)
for i, x in enumerate((-2.9, 0, 2.9)):
    box(f'work-n{i}', (1.3, 0.04, 0.95), (x, D / 2 - 0.02, 1.6), works[i])
box('work-e', (0.04, 1.6, 1.1), (W / 2 - 0.02, 0, 1.65), works[3])
for i, x in enumerate((-1.6, 1.6)):
    box(f'plinth{i}', (0.5, 0.5, 1.0), (x, -0.6, 0.5), plinth)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.18, location=(x, -0.6, 1.18), segments=32, ring_count=16)
    o = bpy.context.active_object
    o.name = f'stone{i}'
    o.data.materials.append(works[1 - i])
    bpy.ops.object.shade_smooth()
    parts.append(o)


def spot(at, toward, watts, angle):
    data = bpy.data.lights.new('spot', 'SPOT')
    data.energy = watts
    data.spot_size = math.radians(angle)
    data.spot_blend = 0.35
    data.shadow_soft_size = 0.03
    data.color = (1.0, 0.86, 0.7)
    o = bpy.data.objects.new('spot', data)
    o.location = at
    o.rotation_euler = (Vector(toward) - Vector(at)).to_track_quat('-Z', 'Y').to_euler()
    scene.collection.objects.link(o)


for x in (-2.9, 0, 2.9):
    spot((x, D / 2 - 1.4, H - 0.05), (x, D / 2, 1.6), 700, 32)
spot((W / 2 - 1.4, 0, H - 0.05), (W / 2, 0, 1.65), 700, 34)
for x in (-1.6, 1.6):
    spot((x, -0.6, H - 0.05), (x, -0.6, 1.1), 350, 22)

# One object, one lightmap: every part joined, its own UV kept for the glTF and a second set unwrapped for the light.
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
room = bpy.context.active_object
room.name = 'room'
light_uv = room.data.uv_layers.new(name='lightmap')
room.data.uv_layers.active = light_uv
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004)
bpy.ops.object.mode_set(mode='OBJECT')

image = bpy.data.images.new('light', SIZE, SIZE, float_buffer=True)
for m in room.data.materials:
    node = m.node_tree.nodes.new('ShaderNodeTexImage')
    node.image = image
    m.node_tree.nodes.active = node

scene.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
for kind in ('OPTIX', 'CUDA'):
    prefs.compute_device_type = kind
    prefs.get_devices()
    if any(d.type == kind for d in prefs.devices):
        for d in prefs.devices:
            d.use = d.type == kind
        scene.cycles.device = 'GPU'
        break
print('device', scene.cycles.device, prefs.compute_device_type, flush=True)
scene.cycles.samples = samples
scene.render.bake.margin = 6
# The light a white diffuse surface sends back, without the surface's colour: the page multiplies its own.
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'})

# Denoised in the compositor of a scene of its own and written as half-float EXR.
quiet = bpy.data.scenes.new('denoise')
camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
quiet.collection.objects.link(camera)
quiet.camera = camera
quiet.render.engine = 'BLENDER_WORKBENCH'
quiet.render.resolution_x = quiet.render.resolution_y = SIZE
quiet.render.resolution_percentage = 100
quiet.view_settings.view_transform = 'Standard'
settings = quiet.render.image_settings
settings.file_format = 'OPEN_EXR'
settings.color_mode = 'RGB'
settings.color_depth = '16'
settings.exr_codec = 'ZIP'
quiet.use_nodes = True
tree = quiet.node_tree
tree.nodes.clear()
source = tree.nodes.new('CompositorNodeImage')
source.image = image
denoise = tree.nodes.new('CompositorNodeDenoise')
denoise.use_hdr = True
composite = tree.nodes.new('CompositorNodeComposite')
tree.links.new(source.outputs['Image'], denoise.inputs['Image'])
tree.links.new(denoise.outputs['Image'], composite.inputs['Image'])
exr = os.path.join(out, 'light.exr')
quiet.render.filepath = exr
bpy.ops.render.render(write_still=True, scene=quiet.name)
peak = save_rgbm(exr, os.path.join(out, 'light.png'), RANGE)
print('peak', peak, 'range', RANGE, flush=True)

bpy.context.window.scene = scene
bpy.ops.object.select_all(action='DESELECT')
room.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'room.glb'), use_selection=True, export_lights=False, export_materials='EXPORT', export_image_format='NONE')
print('done', flush=True)
