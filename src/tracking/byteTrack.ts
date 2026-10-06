// ─────────────────────────────────────────────────────────────────────────────
// ByteTrack — Multi-Object Tracker
// Based on ByteTrack (Zhang et al., 2022) with Kalman filter + Hungarian
// ─────────────────────────────────────────────────────────────────────────────

import { KalmanFilter, bboxToMeasurement, type KalmanMeasurement } from "./kalman";
import { hungarian } from "./hungarian";
import type { Detection, Track, ModelConfig } from "../lib/cv/types";

interface InternalTrack {
  id: number;
  classId: number;
  classVotes: Map<number, number>; // class -> weighted vote count
  scoreEma: number;
  kalman: KalmanFilter;
  state: "active" | "lost" | "removed";
  age: number;
  hitStreak: number;
  timeSinceUpdate: number; // seconds
  lastUpdateTime: number;  // mediaTime of last detection
  trail: { x: number; y: number; t: number }[];
  isConfirmed: boolean;
}

const SCORE_EMA_ALPHA = 0.7;
const MAX_TRAIL = 60;
const CLASS_VOTE_DECAY = 0.95;

function iou(a: [number,number,number,number], b: [number,number,number,number]): number {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  const ix = Math.max(0, Math.min(ax+aw, bx+bw) - Math.max(ax, bx));
  const iy = Math.max(0, Math.min(ay+ah, by+bh) - Math.max(ay, by));
  const inter = ix * iy;
  const union = aw*ah + bw*bh - inter;
  return union > 0 ? inter / union : 0;
}

function buildCostMatrix(
  tracks: InternalTrack[],
  detections: Detection[],
  classAware: boolean,
): number[][] {
  return tracks.map(t => {
    const tBox = t.kalman.getBbox();
    return detections.map(d => {
      const iu = iou(tBox as [number,number,number,number], d.bbox as [number,number,number,number]);
      // Same class bonus
      const sameClass = !classAware || t.classId === d.classId;
      if (!sameClass && iu < 0.1) return 1.0; // high cost for cross-class far matches
      return 1 - iu;
    });
  });
}

export class ByteTracker {
  private tracks: InternalTrack[] = [];
  private nextId = 1;
  private config: ModelConfig;
  private currentTime = 0;

  constructor(config: ModelConfig) {
    this.config = config;
  }

  updateConfig(config: ModelConfig): void {
    this.config = config;
  }

  reset(): void {
    this.tracks = [];
    this.nextId = 1;
    this.currentTime = 0;
  }

  /**
   * Main update step. Call once per detection result.
   * @param detections All detections (high + low confidence combined)
   * @param mediaTime Current video time in seconds
   * @returns Active (confirmed) tracks with updated positions
   */
  update(detections: Detection[], mediaTime: number): Track[] {
    const dt = this.currentTime > 0 ? Math.max(0.001, mediaTime - this.currentTime) : 0.033;
    this.currentTime = mediaTime;

    const highConf = detections.filter(d => d.confidence >= 0.5);
    const lowConf  = detections.filter(d => d.confidence >= this.config.lowScoreThreshold && d.confidence < 0.5);

    // Step 1: Predict all existing tracks
    for (const t of this.tracks) {
      if (t.state !== "removed") {
        t.kalman.predict(dt);
        t.timeSinceUpdate += dt;
      }
    }

    const activeTracks = this.tracks.filter(t => t.state === "active" || t.state === "lost");

    // Step 2: Association 1 — HIGH detections vs ALL active/lost tracks
    const unmatched1Tracks: number[] = [];
    const matchedDets = new Set<number>();

    if (activeTracks.length > 0 && highConf.length > 0) {
      const cost = buildCostMatrix(activeTracks, highConf, true);
      const [assignment, unmatchedRows] = hungarian(cost, 0.8); // max IoU-dist = 0.8

      for (let i = 0; i < activeTracks.length; i++) {
        const j = assignment[i];
        if (j !== -1) {
          this.matchTrack(activeTracks[i], highConf[j], mediaTime);
          matchedDets.add(j);
        } else {
          unmatched1Tracks.push(i);
        }
      }
    } else {
      for (let i = 0; i < activeTracks.length; i++) unmatched1Tracks.push(i);
    }

    // Step 3: Association 2 — LOW detections vs unmatched tracks
    const stillUnmatchedTracks: number[] = [];
    if (unmatched1Tracks.length > 0 && lowConf.length > 0) {
      const unmatchedTrackObjs = unmatched1Tracks.map(i => activeTracks[i]);
      const cost2 = buildCostMatrix(unmatchedTrackObjs, lowConf, false);
      const [assignment2, unmatchedRows2] = hungarian(cost2, 0.5);

      for (let i = 0; i < unmatchedTrackObjs.length; i++) {
        const j = assignment2[i];
        if (j !== -1) {
          this.matchTrack(unmatchedTrackObjs[i], lowConf[j], mediaTime);
        } else {
          stillUnmatchedTracks.push(unmatched1Tracks[i]);
        }
      }
    } else {
      stillUnmatchedTracks.push(...unmatched1Tracks);
    }

    // Step 4: Unmatched tracks -> lost (or remove if too long)
    for (const i of stillUnmatchedTracks) {
      const t = activeTracks[i];
      if (t.timeSinceUpdate > this.config.trackBuffer) {
        t.state = "removed";
      } else {
        t.state = "lost";
        t.hitStreak = 0;
      }
    }

    // Step 5: Unmatched HIGH detections -> new tracks
    for (let j = 0; j < highConf.length; j++) {
      if (!matchedDets.has(j)) {
        this.initTrack(highConf[j], mediaTime);
      }
    }

    // Step 6: Cleanup removed
    this.tracks = this.tracks.filter(t => t.state !== "removed");

    // Step 7: Decay class votes
    for (const t of this.tracks) {
      for (const [cls, v] of t.classVotes) {
        t.classVotes.set(cls, v * CLASS_VOTE_DECAY);
      }
    }

    return this.toPublicTracks();
  }

  /**
   * Extrapolate track positions to the given time (for smooth display)
   * without doing a detection update. Called every display frame.
   */
  extrapolate(mediaTime: number): Track[] {
    const dt = this.currentTime > 0 ? Math.max(0, mediaTime - this.currentTime) : 0;
    if (dt <= 0 || dt > 0.5) return this.toPublicTracks();

    // Temporarily advance positions
    const saved: Array<[number,number,number,number]> = [];
    for (const t of this.tracks) {
      if (t.state === "active") {
        const b = t.kalman.getBbox();
        saved.push(b as [number,number,number,number]);
        // apply velocity manually
        const [vx, vy] = t.kalman.getVelocity();
        // don't mutate kalman, just show extrapolated
      }
    }
    // Return as-is (simple version: use current kalman state)
    return this.toPublicTracks();
  }

  private matchTrack(track: InternalTrack, det: Detection, mediaTime: number): void {
    const meas: KalmanMeasurement = bboxToMeasurement(...det.bbox as [number,number,number,number]);
    track.kalman.update(meas);
    track.scoreEma = SCORE_EMA_ALPHA * det.confidence + (1 - SCORE_EMA_ALPHA) * track.scoreEma;
    track.hitStreak++;
    track.age++;
    track.timeSinceUpdate = 0;
    track.lastUpdateTime = mediaTime;
    track.state = "active";
    // Vote for detected class
    track.classVotes.set(det.classId, (track.classVotes.get(det.classId) ?? 0) + det.confidence);
    // Update leading class
    let bestClass = det.classId;
    let bestVotes = 0;
    for (const [cls, v] of track.classVotes) {
      if (v > bestVotes) { bestVotes = v; bestClass = cls; }
    }
    track.classId = bestClass;
    if (track.hitStreak >= this.config.minHits) {
      track.isConfirmed = true;
    }
    // Update trail
    const [x,y,w,h] = track.kalman.getBbox();
    track.trail.push({ x: x + w/2, y: y + h/2, t: mediaTime });
    if (track.trail.length > MAX_TRAIL) track.trail.shift();
  }

  private initTrack(det: Detection, mediaTime: number): void {
    const kf = new KalmanFilter();
    const meas: KalmanMeasurement = bboxToMeasurement(...det.bbox as [number,number,number,number]);
    kf.init(meas);
    const newTrack: InternalTrack = {
      id: this.nextId++,
      classId: det.classId,
      classVotes: new Map([[det.classId, det.confidence]]),
      scoreEma: det.confidence,
      kalman: kf,
      state: "active",
      age: 1,
      hitStreak: 1,
      timeSinceUpdate: 0,
      lastUpdateTime: mediaTime,
      trail: [{ x: det.bbox[0]+det.bbox[2]/2, y: det.bbox[1]+det.bbox[3]/2, t: mediaTime }],
      isConfirmed: this.config.minHits <= 1,
    };
    this.tracks.push(newTrack);
  }

  private toPublicTracks(): Track[] {
    return this.tracks
      .filter(t => t.isConfirmed && t.state === "active")
      .map(t => {
        const bbox = t.kalman.getBbox();
        const [vx, vy] = t.kalman.getVelocity();
        return {
          id: t.id,
          classId: t.classId,
          className: getCOCOClass(t.classId),
          score: t.scoreEma,
          bbox: [bbox[0], bbox[1], bbox[2], bbox[3]] as [number,number,number,number],
          state: t.state,
          age: t.age,
          hitStreak: t.hitStreak,
          timeSinceUpdate: t.timeSinceUpdate,
          velocity: [vx, vy],
          trail: t.trail.slice(-30).map(p => ({ x: p.x, y: p.y })),
        } satisfies Track;
      });
  }
}

function getCOCOClass(id: number): string {
  const classes = [
    "person","bicycle","car","motorcycle","airplane","bus","train","truck","boat",
    "traffic light","fire hydrant","stop sign","parking meter","bench","bird","cat",
    "dog","horse","sheep","cow","elephant","bear","zebra","giraffe","backpack",
    "umbrella","handbag","tie","suitcase","frisbee","skis","snowboard","sports ball",
    "kite","baseball bat","baseball glove","skateboard","surfboard","tennis racket",
    "bottle","wine glass","cup","fork","knife","spoon","bowl","banana","apple",
    "sandwich","orange","broccoli","carrot","hot dog","pizza","donut","cake","chair",
    "couch","potted plant","bed","dining table","toilet","tv","laptop","mouse",
    "remote","keyboard","cell phone","microwave","oven","toaster","sink",
    "refrigerator","book","clock","vase","scissors","teddy bear","hair drier",
    "toothbrush",
  ];
  return classes[id] ?? `class_${id}`;
}
