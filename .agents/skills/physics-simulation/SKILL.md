---
name: physics-simulation
description: Comprehensive guidelines, JSON schema, and code patterns for writing error-free 2D/3D physics simulations in RUN01 (Mechanics, Multi-Body Dynamics, Springs, Pulleys, Buoyancy/Aerodynamics, and Geometric Optics).
argument-hint: "[simulation-type] [objects-description]"
metadata:
  author: run01
  version: "2.0.0"
---

# Physics Simulation Studio Skill

This skill defines the precise specifications and JSON schemas for generating dynamic physics simulations in RUN01 without runtime errors. The system contains **zero hardcoded presets**; every object, constraint, and environment property is created dynamically by the AI.

---

## 1. Simulation Modes & Output Formats

RUN01 supports two ways to run physics simulations:

### Mode A: Python Code in IDE Editor (`main.py`)
Run code using the built-in Pyodide Python environment:
```python
from app import physics  # or mujoco / rapier aliases

# 1. Headless numerical verification (returns dict with energy drift, invariants)
result = physics.verify_rapier(spec_dict, duration=3.0)
print("Energy drift:", result["invariants"]["maxEnergyDriftPercent"])

# 2. Interactive 3D WebGL viewport in the chat/output console
physics.show_rapier(spec_dict, title="Spring-Mass Resonance")
```

### Mode B: Direct JSON Specification Block in AI Chat
Output a fenced markdown block:
````markdown
```physics
{
  "gravity": [0, -9.81, 0],
  "bodies": [ ... ]
}
```
````
The IDE chat renderer automatically compiles this block into an interactive Three.js 3D viewport with Play/Pause, Reset, Perturb buttons, and a button to open in the full **Physics Studio modal**.

---

## 2. Universal Multi-Body & Fluid Dynamics Schema

For classical mechanics, rigid bodies, springs, pulleys, falling objects, and buoyancy.

### Top-Level JSON Fields
```json
{
  "gravity": [0, -9.81, 0],        // 3D gravity vector [x, y, z] (m/s²)
  "timestep": 0.008333,            // dt in seconds (default 1/120)
  "substeps": 4,                   // Substep count for symplectic stability (default 4)
  "airDensity": 1.225,             // Air density in kg/m³ (0 disables air drag)
  "waterDensity": 1000.0,          // Water density in kg/m³
  "waterLevel": -1.0,              // Y coordinate plane below which buoyancy & water drag apply
  "bodies": [],                    // Array of Body objects (Required)
  "springs": [],                   // Array of Spring objects (Optional)
  "pulleys": []                    // Array of Pulley objects (Optional)
}
```

### Body Specification (`bodies` items)
Every body MUST have a unique `name`.
```json
{
  "name": "sphere_1",              // Unique string identifier (REQUIRED)
  "type": "dynamic",               // "dynamic" (moves) or "fixed" (static ground/anchor)
  "shape": "sphere",               // "sphere" | "box" | "cylinder" | "cone" | "tube"
  "pos": [0, 2.0, 0],              // Initial position [x, y, z]
  "linvel": [0, 0, 0],             // Initial linear velocity [vx, vy, vz]
  "rot": [0, 0, 0],                // Initial Euler rotation [rx, ry, rz] in radians
  "angvel": [0, 0, 0],             // Initial angular velocity [wx, wy, wz]
  "mass": 1.5,                     // Mass in kg (fixed bodies automatically use 0)
  "color": 16777215,               // Hex integer color (e.g. 0xffffff = 16777215, 0xff3333 = 16724787)
  "restitution": 0.6,              // Elasticity coefficient of restitution (0.0 to 1.0)
  "friction": 0.3,                 // Surface friction coefficient (0.0 to 1.0)
  "dragCoeff": 0.47,               // Aerodynamic drag coefficient Cd (sphere ~ 0.47, box ~ 1.05)
  
  // Shape-specific geometric dimensions:
  "radius": 0.4,                   // For sphere, cylinder, cone, tube
  "size": [1.0, 0.5, 0.8],         // [width, height, depth] for box
  "height": 1.2,                   // For cylinder, cone, tube
  
  // Hollow / Shell geometry parameters:
  "isHollow": false,               // Set true to compute hollow shell moment of inertia
  "wallThickness": 0.05            // Wall thickness for hollow geometries (meters)
}
```

### Spring Specification (`springs` items)
Connects two bodies or one body to a fixed world anchor:
```json
{
  "bodyA": "mass_1",               // Name of first body (or omit if anchorA is used)
  "bodyB": "mass_2",               // Name of second body (or omit if anchorB is used)
  "anchorA": [0, 3.0, 0],          // World [x, y, z] anchor if bodyA is omitted
  "anchorB": [0, 0, 0],            // World [x, y, z] anchor if bodyB is omitted
  "k": 50.0,                       // Spring stiffness constant (N/m)
  "c": 0.3,                        // Viscous damping coefficient
  "restLength": 1.5                // Equilibrium natural length (meters)
}
```

### Pulley Specification (`pulleys` items)
Couples two bodies with mechanical advantage:
```json
{
  "loadBody": "heavy_crate",       // Name of load body (slow moving, high mass)
  "effortBody": "counter_weight",  // Name of effort body
  "ratio": 4.0                     // Mechanical advantage MA (e.g. 2.0, 4.0)
}
```

---

## 3. Geometric Optics & Wave Physics Schema

For Snell's law refraction, chromatic prism dispersion, lenses, and parabolic mirrors.

### Top-Level JSON Fields
```json
{
  "elements": [ ... ],             // Array of optical elements (lens, prism, mirror)
  "sources": [ ... ],              // Array of light ray emitter sources
  "maxBounces": 8                  // Maximum reflection/refraction bounces per ray
}
```

### Optical Sources (`sources` items)
```json
{
  "pos": [-4.0, 0.0, 0.0],         // Emitter origin [x, y, z]
  "dir": [1.0, 0.0, 0.0],          // Emission direction vector [dx, dy, dz]
  "beamWidth": 1.5,                // Width of the parallel ray collimated beam
  "rayCount": 9,                   // Number of rays across the beam
  "whiteLight": true,              // If true, splits into 5 wavelength components (420nm - 680nm)
  "wavelengths": [650, 532, 450]   // Custom wavelengths in nanometers (optional)
}
```

### Optical Elements (`elements` items)
- **Spherical Lens**:
  ```json
  {
    "type": "lens",
    "pos": [0, 0, 0],
    "focalLength": 2.5,            // Positive = convex (converging), Negative = concave (diverging)
    "thickness": 0.35,
    "aperture": 2.2,
    "refractiveIndex": 1.52,       // e.g. Crown glass (1.52), Flint glass (1.66)
    "dispersion": 0.004,           // Cauchy dispersion coefficient B
    "isConcave": false
  }
  ```
- **Dispersive Prism**:
  ```json
  {
    "type": "prism",
    "pos": [0, 0, 0],
    "width": 2.0,
    "height": 2.2,
    "refractiveIndex": 1.54,
    "dispersion": 0.008            // Cauchy B coefficient causing rainbow split
  }
  ```
- **Parabolic Mirror**:
  ```json
  {
    "type": "mirror",
    "pos": [2.0, 0, 0],
    "focalLength": 2.0             // Directs collimated rays to focal point (f, 0)
  }
  ```

---

## 4. Native MuJoCo MJCF XML Specification

RUN01 runs the real **MuJoCo 3.x WASM engine** in the browser. You can generate standard MJCF XML definitions for advanced multibody dynamics, robotic arms, inverted pendulums, ragdolls, and tendon-driven mechanisms.

### Python Execution:
```python
from app import physics  # or mujoco alias

xml_code = """
<mujoco model="inverted_pendulum">
  <option gravity="0 0 -9.81" integrator="RK4" timestep="0.002"/>
  <worldbody>
    <light diffuse=".5 .5 .5" pos="0 0 3" dir="0 0 -1"/>
    <geom type="plane" size="2 2 0.1" rgba=".9 .9 .9 1"/>
    <body pos="0 0 0.1">
      <joint name="slide" type="slide" axis="1 0 0"/>
      <geom name="cart" type="box" size="0.2 0.1 0.05" rgba="0.2 0.6 1 1" mass="1.0"/>
      <body pos="0 0 0">
        <joint name="hinge" type="hinge" axis="0 1 0"/>
        <geom name="pole" type="capsule" size="0.02 0.4" pos="0 0 0.4" rgba="1 0.4 0.4 1" mass="0.2"/>
      </body>
    </body>
  </worldbody>
</mujoco>
"""

# 1. Rigorous MuJoCo verification of Hamiltonian energy conservation
proof = physics.verify_mujoco(xml_code, duration=3.0)
print(f"MuJoCo Invariants: dE = {proof['invariants']['maxEnergyDriftPercent']}%")

# 2. Interactive 3D WebGL viewport driven by the MuJoCo WASM solver
physics.show_mujoco(xml_code, title="Inverted Pendulum")
```

### AI Chat Markdown Block:
````markdown
```mujoco
<mujoco model="double_pendulum">
  <option gravity="0 0 -9.81" timestep="0.002"/>
  <worldbody>
    <geom type="sphere" size="0.05" pos="0 0 1.5" rgba="0.5 0.5 0.5 1"/>
    <body pos="0 0 1.5">
      <joint name="pin1" type="hinge" axis="0 1 0"/>
      <geom name="link1" type="capsule" size="0.03 0.3" pos="0 0 -0.3" rgba="0.2 0.8 0.4 1" mass="1"/>
      <body pos="0 0 -0.6">
        <joint name="pin2" type="hinge" axis="0 1 0"/>
        <geom name="link2" type="sphere" size="0.08" pos="0 0 0" rgba="0.9 0.3 0.3 1" mass="1.5"/>
      </body>
    </body>
  </worldbody>
</mujoco>
```
````

### Supported MuJoCo MJCF Elements & Constraints:
- **Joint Types**: `free`, `hinge`, `slide`, `ball`
- **Geom Types**: `plane`, `sphere`, `capsule`, `cylinder`, `box`, `ellipsoid`
- **Integrators**: `Euler`, `RK4`, `implicit`, `implicitfast`
- **Options**: `gravity`, `timestep`, `density`, `viscosity`, `tolerance`
- **Coordinate System**: MuJoCo uses Z-up convention (`pos="x y z"` with gravity along `-Z`).

---

## 5. Best Practices to Guarantee Zero Errors

1. **Always Include a Ground/Floor**: When simulating falling objects, include a `fixed` box at `pos: [0, -0.2, 0]` with `size: [16, 0.4, 8]` (or in MJCF: `<geom type="plane" size="5 5 0.1"/>`) so objects don't fall infinitely into the void.
2. **Valid Mass Values**: Always provide `mass > 0` for `dynamic` objects (typically `0.5` to `10.0`). Do not set mass to 0 for dynamic objects.
3. **Color Formatting**: In JSON, use standard numbers for colors (e.g., `0x38bdf8` or hex integers). In MJCF, use `rgba="r g b a"` with values normalized from 0.0 to 1.0.
4. **Spring Rest Length Matching**: Set `restLength` close to the initial distance between `posA` and `posB` to avoid explosive initial acceleration unless deliberately studying sudden release.
5. **Body Names in Springs/Pulleys**: Ensure every string specified in `bodyA`, `bodyB`, `loadBody`, `effortBody` exactly matches a `name` in the `bodies` array.
6. **Optics Positioning**: Position the ray source on the negative X axis (e.g. `[-4.0, 0, 0]`) aimed toward `dir: [1.0, 0, 0]`, placing lenses and prisms near the origin `[0, 0, 0]`.
7. **MuJoCo XML Validity**: Always encapsulate MJCF definitions in root `<mujoco model="..."> ... </mujoco>` with `<worldbody>` containing child geoms and bodies.

