// ─────────────────────────────────────────────────────────────────────────────
// Kalman Filter for object tracking
// State: [cx, cy, ar, h, vcx, vcy, var, vh] (constant velocity model)
// ar = aspect ratio (w/h)
// ─────────────────────────────────────────────────────────────────────────────

/** 8-element state vector: [cx, cy, ar, h, vcx, vcy, var, vh] */
export type KalmanState = Float64Array;

/** 4-element measurement: [cx, cy, ar, h] */
export type KalmanMeasurement = [number, number, number, number];

/** Convert [x,y,w,h] bbox to Kalman measurement [cx,cy,ar,h] */
export function bboxToMeasurement(x: number, y: number, w: number, h: number): KalmanMeasurement {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const ar = h > 0 ? w / h : 1;
  return [cx, cy, ar, h];
}

/** Convert Kalman state [cx,cy,ar,h,...] back to [x,y,w,h] bbox */
export function stateToBbox(state: KalmanState): [number, number, number, number] {
  const cx = state[0];
  const cy = state[1];
  const ar = state[2];
  const h = state[3];
  const w = ar * h;
  return [cx - w / 2, cy - h / 2, w, h];
}

export class KalmanFilter {
  // State vector [cx,cy,ar,h, vcx,vcy,var,vh]
  private x: Float64Array;
  // State covariance (8x8, stored as flat array)
  private P: Float64Array;

  // Process noise Q (8x8 diagonal)
  private qPos: number;
  private qVel: number;
  // Measurement noise R (4x4 diagonal)
  private rPos: number;

  constructor() {
    this.x = new Float64Array(8);
    this.P = new Float64Array(64);
    this.qPos = 1;
    this.qVel = 0.01;
    this.rPos = 1;
  }

  /** Initialize from first measurement */
  init(meas: KalmanMeasurement): void {
    const [cx, cy, ar, h] = meas;
    this.x[0] = cx; this.x[1] = cy; this.x[2] = ar; this.x[3] = h;
    this.x[4] = 0;  this.x[5] = 0;  this.x[6] = 0;  this.x[7] = 0;
    // Scale noise by height (larger objects have more measurement noise)
    const s = h;
    // P: diagonal, position = 2*s, velocity = 10000
    for (let i = 0; i < 8; i++) this.P[i * 9] = i < 4 ? 2 * s : 10000;
    this.qPos = s;
    this.qVel = s * 0.1;
    this.rPos = s;
  }

  /**
   * Predict state forward by dt seconds.
   * Uses dt to scale velocity (not just dt=1).
   */
  predict(dt: number): void {
    // x_pred = F * x  (constant velocity: pos += vel * dt)
    const dtc = Math.min(dt, 0.5); // clamp to avoid explosion
    this.x[0] += this.x[4] * dtc;
    this.x[1] += this.x[5] * dtc;
    this.x[2] += this.x[6] * dtc;
    this.x[3] += this.x[7] * dtc;

    // P_pred = F*P*F' + Q
    // With constant velocity F, the cross terms are: P[i,j+4] += dt*P[j+4,j+4]
    // Simplified: add Q to diagonal
    for (let i = 0; i < 4; i++) {
      // Propagate covariance for position: P_pos += dt^2 * P_vel
      this.P[i * 9] += dtc * dtc * this.P[(i + 4) * 9] + this.qPos;
      // Velocity covariance grows with process noise
      this.P[(i + 4) * 9] += this.qVel;
    }
  }

  /**
   * Update state with a new measurement.
   * meas = [cx, cy, ar, h]
   */
  update(meas: KalmanMeasurement): void {
    const [mcx, mcy, mar, mh] = meas;
    // Rescale noise by detected height
    const rScale = mh;
    const R = rScale;

    // Innovation: y = z - H*x (H = [I4 | 0])
    const y = [
      mcx - this.x[0],
      mcy - this.x[1],
      mar - this.x[2],
      mh  - this.x[3],
    ];

    // S = H*P*H' + R (just the 4x4 upper-left of P plus R on diagonal)
    // K = P*H' * S^-1
    // For diagonal R and block structure, each of the 4 position measurements
    // is independent:
    for (let i = 0; i < 4; i++) {
      const Pii = this.P[i * 9];
      const S = Pii + R;
      if (S <= 0) continue;
      // Kalman gain for this measurement (only x[i] and x[i+4] depend on meas[i])
      const K_pos = Pii / S;
      const K_vel = this.P[(i + 4) * 8 + i] / S;
      this.x[i]     += K_pos * y[i];
      this.x[i + 4] += K_vel * y[i];
      this.P[i * 9]         *= (1 - K_pos);
      this.P[(i + 4) * 9]   *= (1 - K_vel);
    }
  }

  /** Get current bbox [x,y,w,h] */
  getBbox(): [number, number, number, number] {
    return stateToBbox(this.x);
  }

  /** Get velocity [vx, vy] in image space */
  getVelocity(): [number, number] {
    return [this.x[4], this.x[5]];
  }

  /** Get current state (for debug) */
  getState(): Float64Array {
    return this.x.slice();
  }
}
