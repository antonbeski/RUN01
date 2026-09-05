# React-Three-Rapier & Rapier Core Simulation Catalog

This reference guide provides fundamental physics simulations and patterns from `@react-three/rapier` (`pmndrs/react-three-rapier`) for use in RUN01. The AI can retrieve, adapt, and build upon any of these patterns.

---

## Table of Contents
1. [The Physics Component](#1-the-physics-component)
2. [The RigidBody Component](#2-the-rigidbody-component)
3. [Automatic Colliders](#3-automatic-colliders)
4. [Collider Components & Compound Shapes](#4-collider-components--compound-shapes)
5. [Instanced Meshes (InstancedRigidBodies)](#5-instanced-meshes-instancedrigidbodies)
6. [Debug Visualizer](#6-debug-visualizer)
7. [Moving Things Around & Applying Forces / Impulses](#7-moving-things-around--applying-forces--impulses)
8. [Collision Events & Interaction Groups](#8-collision-events--interaction-groups)
9. [Contact Force Events](#9-contact-force-events)
10. [Sensors & Trigger Zones](#10-sensors--trigger-zones)
11. [Configuring Time Step Size](#11-configuring-time-step-size)
12. [Joints (Fixed, Spherical, Revolute, Prismatic, Rope, Spring)](#12-joints)
13. [Advanced Hooks & Collision Filtering (One-Way Platforms)](#13-advanced-hooks--collision-filtering)
14. [Manual Stepping](#14-manual-stepping)
15. [On-Demand Rendering](#15-on-demand-rendering)
16. [Snapshots & State Serialization](#16-snapshots--state-serialization)
17. [JSON Spec Mapping for RUN01 Engine](#17-json-spec-mapping-for-run01-engine)

---

## 1. The Physics Component

The `<Physics />` component initializes the Rapier WASM physics simulation world.

```tsx
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense } from "react";

export const PhysicsScene = () => {
  return (
    <Canvas>
      <Suspense fallback={null}>
        <Physics
          gravity={[0, -9.81, 0]}       // 3D Gravity vector [x, y, z]
          timeStep={1 / 60}              // Fixed 60 Hz time step (or "vary")
          substeps={4}                   // Substeps for enhanced stability
          colliders="cuboid"             // Default automatic collider for all children
          interpolate={true}             // Smooth rendering interpolation
          paused={false}                 // Pause/resume simulation
          debug={false}                  // Live debug wireframes
        >
          {/* Rigid bodies, colliders, joints go here */}
        </Physics>
      </Suspense>
    </Canvas>
  );
};
```

---

## 2. The RigidBody Component

Wraps 3D meshes to introduce them into the Rapier physics simulation.

```tsx
import { Box, Sphere } from "@react-three/drei";
import { RigidBody } from "@react-three/rapier";

export const RigidBodyExamples = () => {
  return (
    <>
      {/* Dynamic Body (affected by gravity, forces, contacts) */}
      <RigidBody
        type="dynamic"
        position={[0, 5, 0]}
        mass={2.0}
        restitution={0.7}               // Bounciness (0.0 = none, 1.0 = elastic)
        friction={0.4}                  // Surface friction
        linearDamping={0.1}             // Air drag damping
        angularDamping={0.1}            // Rotational resistance
        canSleep={true}                 // Energy saver when stationary
        enabledRotations={[true, true, true]} // Lock rotational axes if needed
        enabledTranslations={[true, true, true]} // Lock linear axes if needed
      >
        <Box args={[1, 1, 1]}>
          <meshStandardMaterial color="royalblue" />
        </Box>
      </RigidBody>

      {/* Fixed Static Body (Ground or Anchor) */}
      <RigidBody type="fixed" position={[0, -0.5, 0]}>
        <Box args={[20, 1, 20]}>
          <meshStandardMaterial color="#333333" />
        </Box>
      </RigidBody>

      {/* Kinematic Position Based (moved strictly by setting position) */}
      <RigidBody type="kinematicPosition" position={[0, 2, 0]}>
        <Sphere args={[0.5]}>
          <meshStandardMaterial color="gold" />
        </Sphere>
      </RigidBody>

      {/* Kinematic Velocity Based (moved by continuous velocity control) */}
      <RigidBody type="kinematicVelocity" position={[2, 2, 0]}>
        <Box args={[0.8, 0.8, 0.8]}>
          <meshStandardMaterial color="crimson" />
        </Box>
      </RigidBody>
    </>
  );
};
```

---

## 3. Automatic Colliders

Automatic colliders derive physics hulls directly from Three.js geometries:

- `"cuboid"`: Generates an axis-aligned bounding box collider.
- `"ball"`: Generates a bounding sphere collider.
- `"trimesh"`: Generates an exact triangle mesh (ideal for static irregular geometry).
- `"hull"`: Generates a tight convex hull around vertices.
- `false`: Disables automatic collider generation for custom shapes.

```tsx
import { RigidBody, Physics } from "@react-three/rapier";
import { Box, Sphere, Torus } from "@react-three/drei";

export const AutoCollidersScene = () => (
  <Physics colliders={false}>
    {/* Automatic Cuboid */}
    <RigidBody colliders="cuboid" position={[-2, 4, 0]}>
      <Box args={[1, 1, 1]} />
    </RigidBody>

    {/* Automatic Ball */}
    <RigidBody colliders="ball" position={[0, 4, 0]}>
      <Sphere args={[0.6]} />
    </RigidBody>

    {/* Convex Hull for complex geometries like Torus */}
    <RigidBody colliders="hull" position={[2, 4, 0]} restitution={0.8}>
      <Torus args={[0.5, 0.2, 16, 32]} />
    </RigidBody>
  </Physics>
);
```

---

## 4. Collider Components & Compound Shapes

Explicit colliders allow exact shape definitions and compound multi-part shapes:

```tsx
import { 
  RigidBody, 
  CuboidCollider, 
  BallCollider, 
  CylinderCollider, 
  CapsuleCollider,
  MeshCollider 
} from "@react-three/rapier";

export const CompoundShapes = () => (
  <RigidBody position={[0, 5, 0]} colliders={false}>
    {/* Central mesh */}
    <mesh>
      <sphereGeometry args={[0.5]} />
      <meshStandardMaterial color="teal" />
    </mesh>

    {/* Compound Collider 1: Sphere at center */}
    <BallCollider args={[0.5]} position={[0, 0, 0]} />

    {/* Compound Collider 2: Left Wing */}
    <CuboidCollider args={[0.8, 0.1, 0.3]} position={[-1.0, 0, 0]} />

    {/* Compound Collider 3: Right Wing */}
    <CuboidCollider args={[0.8, 0.1, 0.3]} position={[1.0, 0, 0]} />

    {/* Compound Collider 4: Capsule tail */}
    <CapsuleCollider args={[0.5, 0.15]} position={[0, 0, -1.0]} />
  </RigidBody>
);
```

---

## 5. Instanced Meshes (InstancedRigidBodies)

Simulate hundreds or thousands of rigid bodies efficiently using `InstancedRigidBodies`:

```tsx
import { useRef, useMemo, useEffect } from "react";
import { InstancedRigidBodies, RapierRigidBody, InstancedRigidBodyProps } from "@react-three/rapier";

const COUNT = 300;

export const InstancedSimulation = () => {
  const rigidBodies = useRef<RapierRigidBody[]>(null);

  const instances = useMemo(() => {
    const arr: InstancedRigidBodyProps[] = [];
    for (let i = 0; i < COUNT; i++) {
      arr.push({
        key: "inst_" + i,
        position: [(Math.random() - 0.5) * 8, 4 + Math.random() * 8, (Math.random() - 0.5) * 8],
        rotation: [Math.random(), Math.random(), Math.random()]
      });
    }
    return arr;
  }, []);

  useEffect(() => {
    if (!rigidBodies.current) return;
    // Example: push instance 0 upward
    rigidBodies.current[0].applyImpulse({ x: 0, y: 15, z: 0 }, true);
  }, []);

  return (
    <InstancedRigidBodies
      ref={rigidBodies}
      instances={instances}
      colliders="cuboid"
    >
      <instancedMesh args={[undefined, undefined, COUNT]} count={COUNT}>
        <boxGeometry args={[0.4, 0.4, 0.4]} />
        <meshStandardMaterial color="orange" />
      </instancedMesh>
    </InstancedRigidBodies>
  );
};
```

---

## 6. Debug Visualizer

Enabling `debug` renders wireframes of all underlying Rapier colliders and contact points:

```tsx
<Physics debug>
  {/* All colliders will display their real wireframe hulls */}
  <RigidBody colliders="hull">
    <Torus />
  </RigidBody>
  <RigidBody type="fixed">
    <Box args={[10, 0.2, 10]} />
  </RigidBody>
</Physics>
```

---

## 7. Moving Things Around & Applying Forces / Impulses

Direct control over velocity, position, torque, and impulses via `RapierRigidBody` reference:

```tsx
import { useRef } from "react";
import { RigidBody, RapierRigidBody, vec3, quat, euler } from "@react-three/rapier";
import { useFrame } from "@react-three/fiber";

export const ForceController = () => {
  const bodyRef = useRef<RapierRigidBody>(null);

  const onJump = () => {
    if (!bodyRef.current) return;

    // Instantaneous impulse (Push)
    bodyRef.current.applyImpulse({ x: 0, y: 8.0, z: 0 }, true);

    // Instantaneous rotational torque impulse (Spin)
    bodyRef.current.applyTorqueImpulse({ x: 0, y: 2.0, z: 0 }, true);
  };

  useFrame((state, delta) => {
    if (!bodyRef.current) return;

    // Continuous force (e.g., Thruster / Wind)
    bodyRef.current.addForce({ x: 0.5, y: 0, z: 0 }, true);

    // Read state with r3/rapier helpers
    const currentPos = vec3(bodyRef.current.translation());
    const currentRot = quat(bodyRef.current.rotation());

    // Direct telemetry overrides
    if (currentPos.y < -5) {
      bodyRef.current.setTranslation({ x: 0, y: 5, z: 0 }, true);
      bodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
      bodyRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
  });

  return (
    <RigidBody ref={bodyRef} position={[0, 2, 0]} colliders="ball">
      <mesh onClick={onJump}>
        <sphereGeometry args={[0.5]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>
    </RigidBody>
  );
};
```

---

## 8. Collision Events & Interaction Groups

### Collision Callbacks
```tsx
<RigidBody
  colliders="ball"
  onCollisionEnter={({ manifold, target, other }) => {
    console.log("Contact point:", manifold.solverContactPoint(0));
    console.log("Collided with body:", other.rigidBodyObject?.name);
  }}
  onCollisionExit={({ target, other }) => {
    console.log("Separated from body:", other.rigidBodyObject?.name);
  }}
  onSleep={() => console.log("Body entered sleep state")}
  onWake={() => console.log("Body woke up")}
>
  <Sphere args={[0.5]} />
</RigidBody>
```

### Collision & Solver Groups (Bitmask Filtering)
Rapier uses 16-bit masks. The `interactionGroups` helper sets `(membershipGroup, interactionGroup)`:

```tsx
import { interactionGroups, CapsuleCollider, RigidBody } from "@react-three/rapier";

// Group 0 = Player, Group 1 = Enemies, Group 2 = Bullets
export const CollisionFiltering = () => (
  <>
    {/* Player: member of 0, interacts with 1 and 2 */}
    <RigidBody collisionGroups={interactionGroups(0, [1, 2])}>
      <mesh><boxGeometry /></mesh>
    </RigidBody>

    {/* Enemy: member of 1, interacts with 0 and 2 */}
    <RigidBody collisionGroups={interactionGroups(1, [0, 2])}>
      <mesh><boxGeometry /></mesh>
    </RigidBody>

    {/* Ghost: interacts with nothing */}
    <RigidBody collisionGroups={interactionGroups(3, [])}>
      <mesh><boxGeometry /></mesh>
    </RigidBody>
  </>
);
```

---

## 9. Contact Force Events

Monitor impact intensity, damage, and impact normal vectors:

```tsx
<RigidBody
  colliders="cuboid"
  onContactForce={(payload) => {
    const forceMag = payload.totalForceMagnitude;
    if (forceMag > 50) {
      console.warn("High velocity collision! Magnitude:", forceMag);
      console.log("Force direction:", payload.maxForceDirection);
    }
  }}
>
  <Box args={[1, 1, 1]} />
</RigidBody>
```

---

## 10. Sensors & Trigger Zones

Sensors detect overlaps without generating physical resistance or contact normal forces:

```tsx
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import { useState } from "react";

export const TriggerZone = () => {
  const [active, setActive] = useState(false);

  return (
    <RigidBody type="fixed">
      {/* Sensor volume */}
      <CuboidCollider
        args={[3, 2, 3]}
        sensor={true}
        onIntersectionEnter={({ other }) => {
          console.log("Entered zone:", other.rigidBodyObject?.name);
          setActive(true);
        }}
        onIntersectionExit={({ other }) => {
          console.log("Exited zone:", other.rigidBodyObject?.name);
          setActive(false);
        }}
      />
    </RigidBody>
  );
};
```

---

## 11. Configuring Time Step Size

```tsx
// 1. Fixed high precision 120 Hz
<Physics timeStep={1 / 120} substeps={2}>
  ...
</Physics>

// 2. Variable frame-rate (uses browser requestAnimationFrame delta)
<Physics timeStep="vary">
  ...
</Physics>
```

---

## 12. Joints

Connect bodies with 6 fundamental Rapier joint types:

### 12.1 Fixed Joint (Rigid weld)
```tsx
import { useRef } from "react";
import { RigidBody, RapierRigidBody, useFixedJoint } from "@react-three/rapier";

export const WeldJoint = () => {
  const bodyA = useRef<RapierRigidBody>(null);
  const bodyB = useRef<RapierRigidBody>(null);

  useFixedJoint(bodyA, bodyB, [
    [0, 0, 0],       // Anchor in bodyA local space
    [0, 0, 0, 1],    // Quaternion rotation in bodyA
    [0, -1, 0],      // Anchor in bodyB local space
    [0, 0, 0, 1]     // Quaternion rotation in bodyB
  ]);

  return (
    <group>
      <RigidBody ref={bodyA} position={[0, 3, 0]}><mesh><boxGeometry /></mesh></RigidBody>
      <RigidBody ref={bodyB} position={[0, 2, 0]}><mesh><boxGeometry /></mesh></RigidBody>
    </group>
  );
};
```

### 12.2 Spherical Joint (Ball and socket)
```tsx
import { useSphericalJoint } from "@react-three/rapier";

useSphericalJoint(bodyA, bodyB, [
  [0, -0.5, 0],      // Joint point on bodyA
  [0, 0.5, 0]        // Joint point on bodyB
]);
```

### 12.3 Revolute Joint (Hinge / Wheel / Door)
```tsx
import { useRevoluteJoint } from "@react-three/rapier";

const joint = useRevoluteJoint(bodyA, bodyB, [
  [0, 0, 0],         // Local pos A
  [0, 1, 0],         // Local pos B
  [0, 0, 1]          // Hinge axis: rotation around Z
]);

// Motor control
// joint.current?.configureMotorVelocity(targetVel, maxForce);
```

### 12.4 Prismatic Joint (Slider / Piston)
```tsx
import { usePrismaticJoint } from "@react-three/rapier";

const joint = usePrismaticJoint(bodyA, bodyB, [
  [0, 0, 0],         // Local pos A
  [0, 0, 0],         // Local pos B
  [0, 1, 0]          // Sliding axis along Y
]);
// joint.current?.configureMotorPosition(targetPos, stiffness, damping);
```

### 12.5 Rope Joint (Distance limit / Cable)
```tsx
import { useRopeJoint } from "@react-three/rapier";

useRopeJoint(bodyA, bodyB, [
  [0, 0, 0],         // Local pos A
  [0, 0, 0],         // Local pos B
  2.5                // Maximum distance (rope length in meters)
]);
```

### 12.6 Spring Joint (Hooke's Law damper)
```tsx
import { useSpringJoint } from "@react-three/rapier";

useSpringJoint(bodyA, bodyB, [
  [0, 0, 0],         // Local pos A
  [0, 0, 0],         // Local pos B
  1.5,               // Rest length (m)
  200.0,             // Stiffness k (N/m)
  5.0                // Damping c
]);
```

---

## 13. Advanced Hooks & Collision Filtering

Implement one-way platforms and selective collisions:

```tsx
import { useRapier, useBeforePhysicsStep, useFilterContactPair, RapierRigidBody, RapierCollider } from "@react-three/rapier";
import { useRef, useEffect } from "react";

export const OneWayPlatform = () => {
  const platformRef = useRef<RapierRigidBody>(null);
  const ballRef = useRef<RapierRigidBody>(null);
  const colliderRef = useRef<RapierCollider>(null);
  const cache = useRef(new Map());
  const { rapier } = useRapier();

  useBeforePhysicsStep(() => {
    if (ballRef.current) {
      cache.current.set(ballRef.current.handle, {
        pos: ballRef.current.translation(),
        vel: ballRef.current.linvel()
      });
    }
  });

  useFilterContactPair((collider1, collider2, body1, body2) => {
    const ballState = cache.current.get(body1) || cache.current.get(body2);
    if (!ballState) return null;

    // Only allow collision when falling down from above
    if (ballState.vel.y < 0 && ballState.pos.y > 0) {
      return rapier.SolverFlags.COMPUTE_IMPULSE;
    }
    return rapier.SolverFlags.EMPTY; // Pass through
  });

  useEffect(() => {
    colliderRef.current?.setActiveHooks(rapier.ActiveHooks.FILTER_CONTACT_PAIRS);
  }, [rapier]);

  return (
    <>
      <RigidBody ref={platformRef} type="fixed">
        <CuboidCollider ref={colliderRef} args={[5, 0.1, 5]} />
      </RigidBody>
      <RigidBody ref={ballRef} position={[0, 4, 0]}>
        <BallCollider args={[0.5]} />
      </RigidBody>
    </>
  );
};
```

---

## 14. Manual Stepping

Control physics progression frame-by-frame for turn-based simulations or deterministic verifications:

```tsx
import { useRapier } from "@react-three/rapier";

export const SteppingController = () => {
  const { step, world } = useRapier();

  const handleStep = () => {
    step(1 / 60); // Advance exactly one tick
  };

  return <button onClick={handleStep}>Step Simulation</button>;
};
```

---

## 15. On-Demand Rendering

```tsx
<Canvas frameloop="demand">
  <Physics updateLoop="independent">
    {/* Physics steps independently and only renders when bodies move */}
    ...
  </Physics>
</Canvas>
```

---

## 16. Snapshots & State Serialization

Save and restore world state as binary snapshots:

```tsx
import { useRapier } from "@react-three/rapier";
import { useRef } from "react";

export const StateManager = () => {
  const { world, setWorld, rapier } = useRapier();
  const snapshotRef = useRef<Uint8Array>();

  const saveState = () => {
    snapshotRef.current = world.takeSnapshot();
    console.log("Snapshot size bytes:", snapshotRef.current.byteLength);
  };

  const restoreState = () => {
    if (snapshotRef.current) {
      setWorld(rapier.World.restoreSnapshot(snapshotRef.current));
      console.log("World restored to saved state");
    }
  };

  return (
    <div>
      <button onClick={saveState}>Save State</button>
      <button onClick={restoreState}>Restore State</button>
    </div>
  );
};
```

---

## 17. JSON Spec Mapping for RUN01 Engine

When generating simulations for RUN01 via `physics.show_rapier(...)` or ` ```physics `, the React-Three-Rapier concepts map to the following JSON structure:

```json
{
  "gravity": [0, -9.81, 0],
  "timestep": 0.008333,
  "substeps": 4,
  "bodies": [
    {
      "name": "ground",
      "type": "fixed",
      "shape": "box",
      "size": [16, 0.4, 8],
      "pos": [0, -0.2, 0],
      "color": 3355443
    },
    {
      "name": "cube",
      "type": "dynamic",
      "shape": "box",
      "size": [0.8, 0.8, 0.8],
      "pos": [0, 4.0, 0],
      "mass": 1.5,
      "restitution": 0.6,
      "friction": 0.3,
      "color": 3719160
    }
  ],
  "joints": [
    {
      "type": "revolute",
      "bodyA": "cube",
      "bodyB": "ground",
      "anchorA": [0, -0.4, 0],
      "anchorB": [0, 3.6, 0],
      "axis": [0, 0, 1]
    }
  ],
  "springs": [
    {
      "bodyA": "cube",
      "anchorB": [0, 6.0, 0],
      "k": 120.0,
      "c": 0.4,
      "restLength": 2.0
    }
  ]
}
```
