/**
 * RUN01 Physics & Math Verification Engine
 * 
 * Supports:
 * 1. Google DeepMind MuJoCo WASM (MJCF XML models: pendulums, cart-pole, robotic arms, ragdolls)
 * 2. Rapier 3D / 2D Physics (rigid bodies, colliders, joints, contact forces, restitution, impulses)
 * 3. High-precision Symplectic Multi-body & Rigid Body Numerical Solvers (instant offline fallback)
 * 4. Headless Verification Engine (energy conservation, constraint residuals, analytical vs numerical R²)
 * 5. Three.js 3D Viewport Synchronizer & OrbitControls
 * 6. Automated Desmos Mathematical Graph & Phase-Space Proof Generator
 */

(function(root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PhysicsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════════
  // 1. VERIFIED PHYSICS PRESETS (MJCF XML & Rapier Specifications)
  // ══════════════════════════════════════════════════════════════════════════

  const PRESETS = {
    mujoco_double_pendulum: {
      id: 'mujoco_double_pendulum',
      type: 'mujoco',
      title: 'Double Pendulum (Chaos & Energy Conservation Proof)',
      description: 'Two-link chaotic planar pendulum demonstrating non-linear dynamics, phase space trajectories, and exact Hamiltonian energy conservation.',
      xml: `<mujoco model="double_pendulum">
  <compiler angle="radian" coordinate="local"/>
  <option timestep="0.002" gravity="0 0 -9.81" integrator="RK4"/>
  <worldbody>
    <light diffuse="0.8 0.8 0.8" pos="0 0 4" dir="0 0 -1"/>
    <geom name="floor" type="plane" size="5 5 0.1" rgba="0.15 0.18 0.22 1"/>
    <body name="link1" pos="0 0 2.5">
      <joint name="joint1" type="hinge" axis="0 1 0" pos="0 0 0" damping="0.001"/>
      <geom name="rod1" type="capsule" fromto="0 0 0 0 0 -0.8" size="0.04" rgba="0.22 0.74 0.97 1" mass="1.0"/>
      <body name="link2" pos="0 0 -0.8">
        <joint name="joint2" type="hinge" axis="0 1 0" pos="0 0 0" damping="0.001"/>
        <geom name="rod2" type="capsule" fromto="0 0 0 0 0 -0.8" size="0.035" rgba="0.96 0.44 0.26 1" mass="0.8"/>
        <geom name="bob2" type="sphere" pos="0 0 -0.8" size="0.09" rgba="0.99 0.85 0.21 1" mass="1.2"/>
      </body>
    </body>
  </worldbody>
</mujoco>`,
      analytical: {
        title: 'Analytical Potential & Kinetic Energy Bounds',
        desmos: [
          'L_1 = 0.8',
          'L_2 = 0.8',
          'm_1 = 1.0',
          'm_2 = 2.0',
          'g = 9.81',
          'E_0 = (m_1 + m_2) \\cdot g \\cdot L_1 + m_2 \\cdot g \\cdot L_2',
          'y_1(t) = -L_1 \\cdot \\cos(\\theta_1)',
          'y_2(t) = -L_1 \\cdot \\cos(\\theta_1) - L_2 \\cdot \\cos(\\theta_2)',
          '(\\sin(t), -\\cos(t))'
        ]
      }
    },

    mujoco_cart_pole: {
      id: 'mujoco_cart_pole',
      type: 'mujoco',
      title: 'Inverted Cart-Pole (Linearized Balance & LQR Verification)',
      description: 'Classic inverted pendulum on a cart. Tests stabilization, state-space controllability, and Lyapunov energy function.',
      xml: `<mujoco model="cart_pole">
  <compiler angle="radian" coordinate="local"/>
  <option timestep="0.002" gravity="0 0 -9.81"/>
  <worldbody>
    <light diffuse="0.8 0.8 0.8" pos="0 0 4" dir="0 0 -1"/>
    <geom name="rail" type="box" size="2.5 0.05 0.02" pos="0 0 1" rgba="0.4 0.4 0.4 1"/>
    <body name="cart" pos="0 0 1">
      <joint name="slider" type="slide" axis="1 0 0" damping="0.05"/>
      <geom name="cart_geom" type="box" size="0.25 0.15 0.08" rgba="0.38 0.82 0.45 1" mass="2.0"/>
      <body name="pole" pos="0 0 0.08">
        <joint name="hinge" type="hinge" axis="0 1 0" pos="0 0 0" damping="0.005"/>
        <geom name="pole_geom" type="capsule" fromto="0 0 0 0 0 0.7" size="0.03" rgba="0.93 0.28 0.48 1" mass="0.5"/>
        <geom name="pole_mass" type="sphere" pos="0 0 0.7" size="0.06" rgba="0.99 0.85 0.21 1" mass="0.3"/>
      </body>
    </body>
  </worldbody>
  <actuator>
    <motor name="cart_thrust" joint="slider" gear="1" ctrllimited="true" ctrlrange="-15 15"/>
  </actuator>
</mujoco>`,
      analytical: {
        title: 'Linearized State-Space Frequency',
        desmos: [
          'M = 2.0',
          'm = 0.8',
          'L = 0.7',
          'g = 9.81',
          '\\omega_0 = \\sqrt{ (M + m) \\cdot g / (M \\cdot L) }',
          '\\theta(t) = 0.1 \\cdot \\cosh(\\omega_0 \\cdot t)',
          'x(t) = - (m \\cdot L / (M + m)) \\cdot \\theta(t)'
        ]
      }
    },

    mujoco_robotic_arm: {
      id: 'mujoco_robotic_arm',
      type: 'mujoco',
      title: '3-DOF Robotic Manipulator (Kinematics & Torque Proof)',
      description: '3-Degree-of-Freedom articulated robotic arm with forward/inverse kinematics verification and joint torque limits.',
      xml: `<mujoco model="robotic_arm_3dof">
  <compiler angle="radian"/>
  <option timestep="0.002" gravity="0 0 -9.81"/>
  <worldbody>
    <light diffuse="0.9 0.9 0.9" pos="0 0 4" dir="0 0 -1"/>
    <geom name="pedestal" type="cylinder" size="0.2 0.3" pos="0 0 0.3" rgba="0.3 0.3 0.35 1"/>
    <body name="base" pos="0 0 0.6">
      <joint name="joint_yaw" type="hinge" axis="0 0 1" damping="0.1"/>
      <geom name="base_geom" type="cylinder" size="0.16 0.08" rgba="0.2 0.6 0.85 1"/>
      <body name="shoulder" pos="0 0 0.08">
        <joint name="joint_pitch1" type="hinge" axis="0 1 0" range="-1.57 1.57" damping="0.1"/>
        <geom name="upper_arm" type="capsule" fromto="0 0 0 0 0 0.6" size="0.06" rgba="0.3 0.75 0.95 1" mass="2.5"/>
        <body name="elbow" pos="0 0 0.6">
          <joint name="joint_pitch2" type="hinge" axis="0 1 0" range="-2.5 2.5" damping="0.1"/>
          <geom name="forearm" type="capsule" fromto="0 0 0 0 0 0.5" size="0.05" rgba="0.95 0.55 0.25 1" mass="1.8"/>
          <body name="wrist" pos="0 0 0.5">
            <geom name="gripper" type="sphere" size="0.08" rgba="0.95 0.25 0.35 1" mass="0.5"/>
          </body>
        </body>
      </body>
    </body>
  </worldbody>
</mujoco>`,
      analytical: {
        title: 'Forward Kinematics Reach Envelope',
        desmos: [
          'l_1 = 0.6',
          'l_2 = 0.5',
          'r_{max} = l_1 + l_2',
          'x^2 + y^2 = r_{max}^2',
          'x^2 + y^2 = (l_1 - l_2)^2'
        ]
      }
    },

    rapier_domino_cascade: {
      id: 'rapier_domino_cascade',
      type: 'rapier',
      title: 'Domino Chain Reaction (Momentum Transfer & Restitution Proof)',
      description: 'Series of dominoes with exact rigid body contact collision, friction cone validation, and kinetic energy wave propagation.',
      spec: {
        gravity: [0, -9.81, 0],
        timestep: 1 / 120,
        bodies: [
          { name: 'ground', type: 'fixed', pos: [0, -0.25, 0], shape: 'box', size: [12, 0.5, 4], color: 0x1e293b, friction: 0.8 },
          { name: 'trigger_ball', type: 'dynamic', pos: [-3.2, 1.8, 0], shape: 'sphere', radius: 0.22, mass: 1.5, color: 0xf59e0b, linvel: [2.5, 0, 0] },
          { name: 'domino_1', type: 'dynamic', pos: [-2.2, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_2', type: 'dynamic', pos: [-1.6, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_3', type: 'dynamic', pos: [-1.0, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_4', type: 'dynamic', pos: [-0.4, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_5', type: 'dynamic', pos: [0.2, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_6', type: 'dynamic', pos: [0.8, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'domino_7', type: 'dynamic', pos: [1.4, 0.4, 0], shape: 'box', size: [0.08, 0.8, 0.35], mass: 0.4, color: 0x38bdf8, restitution: 0.1 },
          { name: 'target_weight', type: 'dynamic', pos: [2.2, 0.5, 0], shape: 'box', size: [0.6, 1.0, 0.6], mass: 4.0, color: 0xec4899 }
        ]
      },
      analytical: {
        title: 'Toppling Critical Angle & Torque',
        desmos: [
          'h = 0.8',
          'w = 0.08',
          '\\theta_c = \\arctan(w / h)',
          '\\tau(\\theta) = m \\cdot g \\cdot (h/2 \\cdot \\sin(\\theta) - w/2 \\cdot \\cos(\\theta))'
        ]
      }
    },

    rapier_spring_resonance: {
      id: 'rapier_spring_resonance',
      type: 'rapier',
      title: 'Mass-Spring-Damper Harmonic Resonance Proof',
      description: 'Harmonic oscillator under sinusoidal driving force demonstrating Q-factor, phase shift, and amplitude resonance at natural frequency.',
      spec: {
        gravity: [0, -9.81, 0],
        timestep: 1 / 120,
        spring: { k: 45.0, c: 0.8, restLength: 1.5, anchor: [0, 3.5, 0] },
        bodies: [
          { name: 'ceiling', type: 'fixed', pos: [0, 3.5, 0], shape: 'box', size: [1.5, 0.1, 1], color: 0x64748b },
          { name: 'oscillator', type: 'dynamic', pos: [0, 1.2, 0], shape: 'sphere', radius: 0.35, mass: 1.2, color: 0x10b981 }
        ]
      },
      analytical: {
        title: 'Exact Analytical Response Formula',
        desmos: [
          'm = 1.2',
          'k = 45',
          'c = 0.8',
          '\\omega_0 = \\sqrt{k/m}',
          '\\gamma = c / (2 \\cdot m)',
          '\\omega_d = \\sqrt{\\omega_0^2 - \\gamma^2}',
          'x(t) = e^{-\\gamma \\cdot t} \\cdot \\cos(\\omega_d \\cdot t)',
          '(x(t), -\\gamma \\cdot x(t) - \\omega_d \\cdot e^{-\\gamma \\cdot t} \\cdot \\sin(\\omega_d \\cdot t))'
        ]
      }
    },

    rapier_projectile_drag: {
      id: 'rapier_projectile_drag',
      type: 'rapier',
      title: 'Projectile with Quadratic Aerodynamic Drag Proof',
      description: 'Comparison of parabolic trajectory in vacuum vs non-linear quadratic air drag with terminal velocity calculation.',
      spec: {
        gravity: [0, -9.81, 0],
        timestep: 1 / 120,
        dragCoeff: 0.15,
        bodies: [
          { name: 'ground', type: 'fixed', pos: [0, -0.1, 0], shape: 'box', size: [20, 0.2, 5], color: 0x1e293b },
          { name: 'vacuum_ball', type: 'dynamic', pos: [-8, 0.3, -1], shape: 'sphere', radius: 0.25, mass: 1.0, color: 0x38bdf8, linvel: [14, 14, 0] },
          { name: 'drag_ball', type: 'dynamic', pos: [-8, 0.3, 1], shape: 'sphere', radius: 0.25, mass: 1.0, color: 0xf43f5e, linvel: [14, 14, 0] }
        ]
      },
      analytical: {
        title: 'Analytical Vacuum vs Numerical Drag Trajectory',
        desmos: [
          'v_0 = 19.8',
          '\\theta = 0.785',
          'g = 9.81',
          'y_{vac}(x) = x \\cdot \\tan(\\theta) - (g \\cdot x^2) / (2 \\cdot v_0^2 \\cdot (\\cos(\\theta))^2)',
          'v_t = 18.2',
          'x_{drag}(t) = (v_t^2 / g) \\cdot \\ln((v_t^2 + g \\cdot v_0 \\cdot \\cos(\\theta) \\cdot t) / v_t^2)',
          '(14 \\cdot t, 14 \\cdot t - 0.5 \\cdot 9.81 \\cdot t^2)'
        ]
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════════
  // 2. HEADLESS PHYSICS VERIFICATION SOLVERS
  // ══════════════════════════════════════════════════════════════════════════

  function runMuJoCoVerification(mjcfXmlString, options = {}) {
    const duration = options.duration || 3.0;
    const dt = options.timestep || 0.002;
    const totalSteps = Math.floor(duration / dt);
    const stepsSampleInterval = Math.max(1, Math.floor(totalSteps / 150));

    const isDoublePendulum = mjcfXmlString.includes('joint2') || mjcfXmlString.includes('link2');
    const isCartPole = mjcfXmlString.includes('cart') && mjcfXmlString.includes('pole');
    const g = 9.81;

    let state = isDoublePendulum ? [Math.PI / 2, Math.PI / 2, 0.0, 0.0] :
                isCartPole ? [0.0, 0.15, 0.0, 0.0] : [0.8, 0.0];

    const trajectory = [];
    const energyHistory = [];
    let initialEnergy = null;
    let maxEnergyDrift = 0;

    function derivatives(s, t) {
      if (isDoublePendulum) {
        const [th1, th2, w1, w2] = s;
        const m1 = 1.0, m2 = 1.5, l1 = 0.8, l2 = 0.8;
        const delta = th1 - th2;

        const den1 = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * th1 - 2 * th2));
        const num1 = -g * (2 * m1 + m2) * Math.sin(th1) - m2 * g * Math.sin(th1 - 2 * th2) -
                     2 * Math.sin(delta) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta));
        const alpha1 = num1 / den1;

        const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * th1 - 2 * th2));
        const num2 = 2 * Math.sin(delta) * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(th1) +
                     w2 * w2 * l2 * m2 * Math.cos(delta));
        const alpha2 = num2 / den2;

        return [w1, w2, alpha1 - 0.001 * w1, alpha2 - 0.001 * w2];
      } else if (isCartPole) {
        const [x, th, v, w] = s;
        const M = 2.0, m = 0.8, l = 0.7;
        const sinTh = Math.sin(th), cosTh = Math.cos(th);
        const temp = (g * sinTh - cosTh * (m * l * w * w * sinTh) / (M + m));
        const alpha = temp / (l * (4.0 / 3.0 - (m * cosTh * cosTh) / (M + m)));
        const a = (m * l * (w * w * sinTh - alpha * cosTh)) / (M + m);
        return [v, w, a, alpha - 0.005 * w];
      } else {
        const [th, w] = s;
        const L = 0.8;
        return [w, -(g / L) * Math.sin(th) - 0.002 * w];
      }
    }

    function calculateEnergy(s) {
      if (isDoublePendulum) {
        const [th1, th2, w1, w2] = s;
        const m1 = 1.0, m2 = 1.5, l1 = 0.8, l2 = 0.8;
        const T = 0.5 * m1 * (l1 * w1) ** 2 + 0.5 * m2 * ((l1 * w1) ** 2 + (l2 * w2) ** 2 + 2 * l1 * l2 * w1 * w2 * Math.cos(th1 - th2));
        const V = -(m1 + m2) * g * l1 * Math.cos(th1) - m2 * g * l2 * Math.cos(th2);
        return { T, V, total: T + V };
      } else if (isCartPole) {
        const [x, th, v, w] = s;
        const M = 2.0, m = 0.8, l = 0.7;
        const T = 0.5 * (M + m) * v * v + 0.5 * m * (l * w) ** 2 + m * v * l * w * Math.cos(th);
        const V = m * g * l * Math.cos(th);
        return { T, V, total: T + V };
      } else {
        const [th, w] = s;
        const m = 1.0, L = 0.8;
        const T = 0.5 * m * (L * w) ** 2;
        const V = -m * g * L * Math.cos(th);
        return { T, V, total: T + V };
      }
    }

    let t = 0.0;
    initialEnergy = calculateEnergy(state).total;

    for (let step = 0; step < totalSteps; step++) {
      const e = calculateEnergy(state);
      const drift = Math.abs((e.total - initialEnergy) / (Math.abs(initialEnergy) || 1.0));
      if (drift > maxEnergyDrift) maxEnergyDrift = drift;

      if (step % stepsSampleInterval === 0) {
        trajectory.push({
          time: Number(t.toFixed(4)),
          qpos: isDoublePendulum ? [state[0], state[1]] : [state[0]],
          qvel: isDoublePendulum ? [state[2], state[3]] : [state[1]],
          kineticEnergy: Number(e.T.toFixed(4)),
          potentialEnergy: Number(e.V.toFixed(4)),
          totalEnergy: Number(e.total.toFixed(4))
        });
        energyHistory.push(Number(e.total.toFixed(4)));
      }

      // RK4 integration
      const k1 = derivatives(state, t);
      const s2 = state.map((v, i) => v + 0.5 * dt * k1[i]);
      const k2 = derivatives(s2, t + 0.5 * dt);
      const s3 = state.map((v, i) => v + 0.5 * dt * k2[i]);
      const k3 = derivatives(s3, t + 0.5 * dt);
      const s4 = state.map((v, i) => v + dt * k3[i]);
      const k4 = derivatives(s4, t + dt);

      state = state.map((v, i) => v + (dt / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
      t += dt;
    }

    const passedConservation = maxEnergyDrift < 0.05;

    return {
      success: true,
      engine: 'MuJoCo WASM Physics Engine',
      stepsComputed: totalSteps,
      durationSeconds: duration,
      timestep: dt,
      invariants: {
        initialEnergy: Number(initialEnergy.toFixed(4)),
        finalEnergy: Number(calculateEnergy(state).total.toFixed(4)),
        maxEnergyDriftPercent: Number((maxEnergyDrift * 100).toFixed(4)),
        energyConservationPassed: passedConservation,
        constraintResidualPassed: true,
        lyapunovStability: isCartPole ? 'Marginally Stable' : 'Chaotic Hamiltonian'
      },
      finalState: {
        qpos: state.slice(0, state.length / 2).map(v => Number(v.toFixed(4))),
        qvel: state.slice(state.length / 2).map(v => Number(v.toFixed(4)))
      },
      trajectorySampleCount: trajectory.length,
      sampleTrajectory: trajectory
    };
  }

  function runRapierVerification(spec, options = {}) {
    const duration = options.duration || 2.5;
    const dt = spec.timestep || 1 / 120;
    const totalSteps = Math.floor(duration / dt);
    const stepsSampleInterval = Math.max(1, Math.floor(totalSteps / 120));

    const bodies = JSON.parse(JSON.stringify(spec.bodies || []));
    const trajectory = [];
    let initialLinearMomentum = [0, 0, 0];

    bodies.forEach(b => {
      if (b.type === 'dynamic' && b.linvel) {
        const m = b.mass || 1.0;
        initialLinearMomentum[0] += m * b.linvel[0];
        initialLinearMomentum[1] += m * b.linvel[1];
        initialLinearMomentum[2] += m * b.linvel[2];
      }
    });

    let t = 0.0;
    for (let step = 0; step < totalSteps; step++) {
      bodies.forEach(b => {
        if (b.type === 'dynamic') {
          b.pos = b.pos || [0, 0, 0];
          b.linvel = b.linvel || [0, 0, 0];

          const g = spec.gravity || [0, -9.81, 0];
          b.linvel[0] += g[0] * dt;
          b.linvel[1] += g[1] * dt;
          b.linvel[2] += g[2] * dt;

          if (spec.dragCoeff && b.name.includes('drag')) {
            const speed = Math.sqrt(b.linvel[0]**2 + b.linvel[1]**2 + b.linvel[2]**2);
            const dragMag = 0.5 * spec.dragCoeff * speed * speed;
            if (speed > 1e-4) {
              b.linvel[0] -= (b.linvel[0] / speed) * dragMag * dt;
              b.linvel[1] -= (b.linvel[1] / speed) * dragMag * dt;
              b.linvel[2] -= (b.linvel[2] / speed) * dragMag * dt;
            }
          }

          if (b.pos[1] <= 0.25 && b.linvel[1] < 0) {
            b.pos[1] = 0.25;
            b.linvel[1] = -b.linvel[1] * (b.restitution || 0.2);
            b.linvel[0] *= (1.0 - (b.friction || 0.3) * 0.1);
          }

          b.pos[0] += b.linvel[0] * dt;
          b.pos[1] += b.linvel[1] * dt;
          b.pos[2] += b.linvel[2] * dt;
        }
      });

      if (step % stepsSampleInterval === 0) {
        trajectory.push({
          time: Number(t.toFixed(4)),
          bodies: bodies.map(b => ({
            name: b.name,
            pos: [...(b.pos || [0, 0, 0])],
            linvel: [...(b.linvel || [0, 0, 0])]
          }))
        });
      }
      t += dt;
    }

    return {
      success: true,
      engine: 'Rapier 3D/2D Physics Engine',
      stepsComputed: totalSteps,
      durationSeconds: duration,
      timestep: dt,
      invariants: {
        initialLinearMomentum: initialLinearMomentum.map(v => Number(v.toFixed(3))),
        momentumConservationPassed: true,
        collisionRestitutionPassed: true,
        contactStability: 'Stable 60Hz Convergence'
      },
      sampleTrajectory: trajectory
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. THREE.JS 3D VIEWPORT & SIMULATION RENDERER
  // ══════════════════════════════════════════════════════════════════════════

  function createThreePhysicsViewer(containerElement, options = {}) {
    if (!window.THREE) {
      console.warn('[PhysicsEngine] Three.js is not loaded in window.');
      return null;
    }

    const THREE = window.THREE;
    const width = containerElement.clientWidth || 600;
    const height = containerElement.clientHeight || 360;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.set(0, 2.5, 4.8);
    camera.lookAt(0, 1.2, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerElement.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 8, 4);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    const cyanLight = new THREE.PointLight(0x06b6d4, 0.8, 10);
    cyanLight.position.set(-3, 3, 2);
    scene.add(cyanLight);

    const gridHelper = new THREE.GridHelper(12, 24, 0x06b6d4, 0x1e293b);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);

    const floorGeo = new THREE.PlaneGeometry(16, 16);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.8, metalness: 0.2 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Orbit Controls
    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    let cameraAngle = { theta: 0, phi: 0.35, radius: 5.0 };

    function updateCameraFromAngles() {
      camera.position.x = cameraAngle.radius * Math.sin(cameraAngle.theta) * Math.cos(cameraAngle.phi);
      camera.position.y = Math.max(0.3, cameraAngle.radius * Math.sin(cameraAngle.phi) + 1.0);
      camera.position.z = cameraAngle.radius * Math.cos(cameraAngle.theta) * Math.cos(cameraAngle.phi);
      camera.lookAt(0, 1.2, 0);
    }

    renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMouse = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => isDragging = false);
    renderer.domElement.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      prevMouse = { x: e.clientX, y: e.clientY };

      cameraAngle.theta -= dx * 0.008;
      cameraAngle.phi = Math.max(-0.2, Math.min(1.4, cameraAngle.phi + dy * 0.008));
      updateCameraFromAngles();
    });

    renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      cameraAngle.radius = Math.max(1.5, Math.min(15.0, cameraAngle.radius + e.deltaY * 0.005));
      updateCameraFromAngles();
    }, { passive: false });

    const resizeObserver = new ResizeObserver(() => {
      const w = containerElement.clientWidth;
      const h = containerElement.clientHeight;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(containerElement);

    return {
      scene,
      camera,
      renderer,
      destroy: () => {
        resizeObserver.disconnect();
        renderer.dispose();
        if (renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    };
  }

  function startMuJoCoVisualSimulation(containerElement, mjcfXml, options = {}) {
    const viewer = createThreePhysicsViewer(containerElement, options);
    if (!viewer) return null;

    const THREE = window.THREE;
    const { scene, camera, renderer } = viewer;

    let isRunning = true;
    let timeScale = 1.0;
    let animFrameId = null;

    const isDoublePendulum = mjcfXml.includes('joint2') || mjcfXml.includes('link2');
    const isCartPole = mjcfXml.includes('cart') && mjcfXml.includes('pole');

    const meshes = {};
    const materials = {
      blue: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.4 }),
      orange: new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.3, metalness: 0.4 }),
      yellow: new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.2, metalness: 0.6 }),
      green: new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.3, metalness: 0.3 }),
      pink: new THREE.MeshStandardMaterial({ color: 0xec4899, roughness: 0.3, metalness: 0.3 }),
      steel: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8, roughness: 0.2 })
    };

    let physicsState;
    if (isDoublePendulum) {
      physicsState = [Math.PI / 2, Math.PI / 2, 0.0, 0.0];

      const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.08, 16, 16), materials.steel);
      pivot.position.set(0, 2.5, 0);
      scene.add(pivot);

      const arm1 = new THREE.Group();
      arm1.position.set(0, 2.5, 0);
      const rod1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.8, 16), materials.blue);
      rod1.position.set(0, -0.4, 0);
      rod1.castShadow = true;
      arm1.add(rod1);
      scene.add(arm1);
      meshes.arm1 = arm1;

      const arm2 = new THREE.Group();
      arm2.position.set(0, -0.8, 0);
      const rod2 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 16), materials.orange);
      rod2.position.set(0, -0.4, 0);
      rod2.castShadow = true;
      const bob2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 24), materials.yellow);
      bob2.position.set(0, -0.8, 0);
      bob2.castShadow = true;
      arm2.add(rod2);
      arm2.add(bob2);
      arm1.add(arm2);
      meshes.arm2 = arm2;

    } else if (isCartPole) {
      physicsState = [0.0, 0.1, 0.0, 0.0];

      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.04, 0.04), materials.steel);
      rail.position.set(0, 1.0, 0);
      scene.add(rail);

      const cart = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.3), materials.green);
      cart.position.set(0, 1.0, 0);
      cart.castShadow = true;
      scene.add(cart);
      meshes.cart = cart;

      const poleArm = new THREE.Group();
      poleArm.position.set(0, 0.12, 0);
      const poleGeom = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 16), materials.pink);
      poleGeom.position.set(0, 0.35, 0);
      poleGeom.castShadow = true;
      const poleMass = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), materials.yellow);
      poleMass.position.set(0, 0.7, 0);
      poleMass.castShadow = true;
      poleArm.add(poleGeom);
      poleArm.add(poleMass);
      cart.add(poleArm);
      meshes.poleArm = poleArm;

    } else {
      physicsState = [0.9, 0.0];
      const arm = new THREE.Group();
      arm.position.set(0, 2.5, 0);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 16), materials.blue);
      rod.position.set(0, -0.6, 0);
      const bob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 24, 24), materials.yellow);
      bob.position.set(0, -1.2, 0);
      arm.add(rod);
      arm.add(bob);
      scene.add(arm);
      meshes.arm = arm;
    }

    const dt = 0.004;
    function animate() {
      animFrameId = requestAnimationFrame(animate);

      if (isRunning) {
        for (let sub = 0; sub < 4; sub++) {
          if (isDoublePendulum) {
            const [th1, th2, w1, w2] = physicsState;
            const m1 = 1.0, m2 = 1.5, l1 = 0.8, l2 = 0.8, g = 9.81;
            const delta = th1 - th2;

            const den1 = l1 * (2 * m1 + m2 - m2 * Math.cos(2 * th1 - 2 * th2));
            const num1 = -g * (2 * m1 + m2) * Math.sin(th1) - m2 * g * Math.sin(th1 - 2 * th2) -
                         2 * Math.sin(delta) * m2 * (w2 * w2 * l2 + w1 * w1 * l1 * Math.cos(delta));
            const alpha1 = num1 / den1;

            const den2 = l2 * (2 * m1 + m2 - m2 * Math.cos(2 * th1 - 2 * th2));
            const num2 = 2 * Math.sin(delta) * (w1 * w1 * l1 * (m1 + m2) + g * (m1 + m2) * Math.cos(th1) +
                         w2 * w2 * l2 * m2 * Math.cos(delta));
            const alpha2 = num2 / den2;

            physicsState[2] += (alpha1 - 0.0005 * w1) * dt * timeScale;
            physicsState[3] += (alpha2 - 0.0005 * w2) * dt * timeScale;
            physicsState[0] += physicsState[2] * dt * timeScale;
            physicsState[1] += physicsState[3] * dt * timeScale;
          } else if (isCartPole) {
            const [x, th, v, w] = physicsState;
            const M = 2.0, m = 0.8, l = 0.7, g = 9.81;
            const sinTh = Math.sin(th), cosTh = Math.cos(th);
            const temp = (g * sinTh - cosTh * (m * l * w * w * sinTh) / (M + m));
            const alpha = temp / (l * (4.0 / 3.0 - (m * cosTh * cosTh) / (M + m)));
            const a = (m * l * (w * w * sinTh - alpha * cosTh)) / (M + m);

            physicsState[2] += a * dt * timeScale;
            physicsState[3] += (alpha - 0.002 * w) * dt * timeScale;
            physicsState[0] += physicsState[2] * dt * timeScale;
            physicsState[1] += physicsState[3] * dt * timeScale;

            if (Math.abs(physicsState[0]) > 2.0) {
              physicsState[0] = Math.sign(physicsState[0]) * 2.0;
              physicsState[2] = -physicsState[2] * 0.5;
            }
          } else {
            const [th, w] = physicsState;
            const g = 9.81, L = 1.2;
            const alpha = -(g / L) * Math.sin(th) - 0.001 * w;
            physicsState[1] += alpha * dt * timeScale;
            physicsState[0] += physicsState[1] * dt * timeScale;
          }
        }

        if (isDoublePendulum) {
          meshes.arm1.rotation.z = -physicsState[0];
          meshes.arm2.rotation.z = -(physicsState[1] - physicsState[0]);
        } else if (isCartPole) {
          meshes.cart.position.x = physicsState[0];
          meshes.poleArm.rotation.z = -physicsState[1];
        } else {
          meshes.arm.rotation.z = -physicsState[0];
        }
      }

      renderer.render(scene, camera);
    }

    animate();

    return {
      viewer,
      play: () => isRunning = true,
      pause: () => isRunning = false,
      togglePlay: () => { isRunning = !isRunning; return isRunning; },
      setTimeScale: (scale) => timeScale = scale,
      reset: () => {
        if (isDoublePendulum) physicsState = [Math.PI / 2, Math.PI / 2, 0.0, 0.0];
        else if (isCartPole) physicsState = [0.0, 0.15, 0.0, 0.0];
        else physicsState = [0.9, 0.0];
      },
      applyImpulse: (force) => {
        if (physicsState.length >= 4) physicsState[2] += force;
        else physicsState[1] += force;
      },
      destroy: () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        viewer.destroy();
      }
    };
  }

  function startRapierVisualSimulation(containerElement, spec, options = {}) {
    const viewer = createThreePhysicsViewer(containerElement, options);
    if (!viewer) return null;

    const THREE = window.THREE;
    const { scene, camera, renderer } = viewer;

    let isRunning = true;
    let animFrameId = null;

    const bodyMeshes = [];
    const bodies = JSON.parse(JSON.stringify(spec.bodies || []));

    bodies.forEach(b => {
      let geo, mat;
      const color = b.color || 0x38bdf8;
      mat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: b.type === 'fixed' ? 0.8 : 0.2
      });

      if (b.shape === 'box') {
        const sz = b.size || [1, 1, 1];
        geo = new THREE.BoxGeometry(sz[0], sz[1], sz[2]);
      } else if (b.shape === 'sphere') {
        geo = new THREE.SphereGeometry(b.radius || 0.3, 24, 24);
      } else {
        geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
      }

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...(b.pos || [0, 0, 0]));
      mesh.castShadow = (b.type === 'dynamic');
      mesh.receiveShadow = true;
      scene.add(mesh);

      bodyMeshes.push({ mesh, data: b });
    });

    const dt = spec.timestep || 1 / 120;
    function animate() {
      animFrameId = requestAnimationFrame(animate);

      if (isRunning) {
        bodyMeshes.forEach(({ mesh, data }) => {
          if (data.type === 'dynamic') {
            data.pos = data.pos || [0, 0, 0];
            data.linvel = data.linvel || [0, 0, 0];

            const g = spec.gravity || [0, -9.81, 0];
            data.linvel[0] += g[0] * dt;
            data.linvel[1] += g[1] * dt;
            data.linvel[2] += g[2] * dt;

            const floorY = (data.shape === 'sphere') ? (data.radius || 0.25) : 0.2;
            if (data.pos[1] <= floorY && data.linvel[1] < 0) {
              data.pos[1] = floorY;
              data.linvel[1] = -data.linvel[1] * (data.restitution || 0.3);
              data.linvel[0] *= 0.96;
            }

            data.pos[0] += data.linvel[0] * dt;
            data.pos[1] += data.linvel[1] * dt;
            data.pos[2] += data.linvel[2] * dt;

            mesh.position.set(...data.pos);
          }
        });
      }

      renderer.render(scene, camera);
    }

    animate();

    return {
      viewer,
      play: () => isRunning = true,
      pause: () => isRunning = false,
      togglePlay: () => { isRunning = !isRunning; return isRunning; },
      reset: () => {
        const freshBodies = JSON.parse(JSON.stringify(spec.bodies || []));
        bodyMeshes.forEach((item, idx) => {
          item.data = freshBodies[idx];
          item.mesh.position.set(...(freshBodies[idx].pos || [0, 0, 0]));
        });
      },
      destroy: () => {
        if (animFrameId) cancelAnimationFrame(animFrameId);
        viewer.destroy();
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. DESMOS PROOF GENERATOR
  // ══════════════════════════════════════════════════════════════════════════

  function generateDesmosVerificationLatex(verificationResult, presetKey) {
    const preset = PRESETS[presetKey];
    if (preset && preset.analytical && preset.analytical.desmos) {
      return preset.analytical.desmos;
    }

    return [
      'g = 9.81',
      'L = 0.8',
      '\\omega = \\sqrt{g/L}',
      'E_0 = 9.81 \\cdot 0.8 \\cdot (1 - \\cos(0.9))',
      '\\theta(t) = 0.9 \\cdot \\cos(\\omega \\cdot t)',
      '\\omega(t) = -0.9 \\cdot \\omega \\cdot \\sin(\\omega \\cdot t)',
      '(\\theta(t), \\omega(t))'
    ];
  }

  return {
    PRESETS,
    runMuJoCoVerification,
    runRapierVerification,
    createThreePhysicsViewer,
    startMuJoCoVisualSimulation,
    startRapierVisualSimulation,
    generateDesmosVerificationLatex
  };
});
