export type TrackStatus = "pending" | "correct" | "skipped";

export interface TeamRound {
  timeLeft: number;
  started: boolean;
  finished: boolean;
  currentTrackIndex: number;
  trackStatuses: TrackStatus[];
  skippedTrackIndices: number[];
  revisitCursor: number;
}

export function createTeamRound(): TeamRound {
  return {
    timeLeft: 60,
    started: false,
    finished: false,
    currentTrackIndex: 0,
    trackStatuses: Array.from({ length: 12 }, () => "pending"),
    skippedTrackIndices: [],
    revisitCursor: 0,
  };
}
