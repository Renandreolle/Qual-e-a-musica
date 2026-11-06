<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from "vue";
import { Check, Play, SkipForward } from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";
import { createTeamRound, type TeamRound, type TrackStatus } from "./types";

const props = defineProps<{
  teams: Team[];
  activeTeamMarker: string;
  rounds: Record<string, TeamRound>;
}>();
const emit = defineEmits<{
  back: [];
  toggleTurn: [];
  pointScored: [teamMarker: string, points: number];
  roundsChanged: [rounds: Record<string, TeamRound>];
}>();

interface ClockTrack {
  team: 1 | 2;
  number: number;
  title: string;
  artist: string;
  audioUrl: string;
}

const clockNumbers = Array.from({ length: 12 }, (_, index) => index + 1);
const tracks = ref<ClockTrack[]>([]);
const trackLoadMessage = ref("Carregando músicas...");
const audioElement = ref<HTMLAudioElement | null>(null);
const audioError = ref("");

function parseTrackFilename(fileName: string): ClockTrack | null {
  const fields = fileName.replace(/\.mp3$/i, "").split(" - ");
  if (fields.length !== 4) {
    return null;
  }

  const [teamText, numberText, title, artist] = fields;
  const team = Number(teamText);
  const number = Number(numberText);
  if (
    (team !== 1 && team !== 2) ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > 12 ||
    !title.trim() ||
    !artist.trim()
  ) {
    return null;
  }

  return {
    team,
    number,
    title: title.trim(),
    artist: artist.trim(),
    audioUrl: `/relogio-musical/${encodeURIComponent(fileName)}`,
  };
}

async function loadTracks() {
  try {
    const response = await fetch("/__dev/relogio-musical-audios");
    if (!response.ok) {
      throw new Error(`O servidor respondeu com status ${response.status}.`);
    }

    const fileNames: unknown = await response.json();
    if (
      !Array.isArray(fileNames) ||
      !fileNames.every((fileName) => typeof fileName === "string")
    ) {
      throw new Error("A lista de áudios retornada pelo servidor é inválida.");
    }

    const parsedTracks = fileNames
      .map(parseTrackFilename)
      .filter((track): track is ClockTrack => track !== null);
    const tracksById = new Map<string, ClockTrack>();
    const duplicates = new Set<string>();

    for (const track of parsedTracks) {
      const id = `${track.team}-${track.number}`;
      if (tracksById.has(id)) {
        duplicates.add(id);
      } else {
        tracksById.set(id, track);
      }
    }

    tracks.value = [1, 2].flatMap((team) =>
      clockNumbers.flatMap((number) => {
        const track = tracksById.get(`${team}-${number}`);
        return track ? [track] : [];
      }),
    );
    const missing = [1, 2].flatMap((team) =>
      clockNumbers
        .map((number) => `${team}-${number}`)
        .filter((id) => !tracksById.has(id)),
    );
    const issues = [
      fileNames.length !== parsedTracks.length
        ? `${fileNames.length - parsedTracks.length} arquivo(s) têm nome fora do padrão.`
        : "",
      duplicates.size
        ? `Há faixas duplicadas para: ${[...duplicates].join(", ")}.`
        : "",
      missing.length ? `Faltam faixas para: ${missing.join(", ")}.` : "",
    ].filter(Boolean);
    trackLoadMessage.value = issues.join(" ");
  } catch (error) {
    trackLoadMessage.value =
      error instanceof Error
        ? `Não foi possível carregar as músicas do Relógio musical: ${error.message}`
        : "Não foi possível carregar as músicas do Relógio musical.";
  }
}

function cloneRound(round: TeamRound): TeamRound {
  return {
    ...round,
    trackStatuses: [...round.trackStatuses],
    skippedTrackIndices: [...round.skippedTrackIndices],
  };
}

const rounds = reactive<Record<string, TeamRound>>(
  Object.fromEntries(
    props.teams.map((team) => [
      team.marker,
      cloneRound(props.rounds[team.marker] ?? createTeamRound()),
    ]),
  ),
);
let timerInterval: ReturnType<typeof setInterval> | undefined;

const currentRound = computed(() => rounds[props.activeTeamMarker]);
const activeTeam = computed(() =>
  props.teams.find((team) => team.marker === props.activeTeamMarker),
);
const activeTeamNumber = computed(() => {
  const index = props.teams.findIndex(
    (team) => team.marker === props.activeTeamMarker,
  );
  return index === 1 ? 2 : 1;
});
const currentTrack = computed(() =>
  tracks.value.find(
    (track) =>
      track.team === activeTeamNumber.value &&
      track.number === (currentRound.value?.currentTrackIndex ?? 0) + 1,
  ),
);
const trackLabels = computed(() =>
  clockNumbers.map((number) => {
    const track = tracks.value.find(
      (candidate) =>
        candidate.team === activeTeamNumber.value &&
        candidate.number === number,
    );
    const status = currentRound.value?.trackStatuses[number - 1];
    return status === "correct" || currentRound.value?.finished
      ? track?.title ?? `Música ${String(number).padStart(2, "0")}`
      : `Música ${String(number).padStart(2, "0")}`;
  }),
);
const formattedTime = computed(() => {
  const seconds = currentRound.value?.timeLeft ?? 60;
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
});
const isRoundRunning = computed(
  () => !!currentRound.value?.started && !currentRound.value.finished,
);

function stopTimer() {
  if (timerInterval !== undefined) {
    clearInterval(timerInterval);
    timerInterval = undefined;
  }
}

function stopAudio() {
  audioElement.value?.pause();
  if (audioElement.value) {
    audioElement.value.currentTime = 0;
  }
}

async function playCurrentTrack() {
  if (!isRoundRunning.value || !currentTrack.value) {
    stopAudio();
    return;
  }

  const audio = audioElement.value;
  if (!audio) {
    audioError.value = "Não foi possível carregar o áudio desta música.";
    return;
  }

  audioError.value = "";
  try {
    await nextTick();
    audio.currentTime = 0;
    await audio.play();
  } catch (error) {
    audioError.value = "Não foi possível reproduzir a música.";
    console.error("Falha ao reproduzir áudio do Relógio Musical.", error);
  }
}

function handleAudioError() {
  audioError.value = "Não foi possível carregar o áudio desta música.";
}

function saveRounds() {
  emit(
    "roundsChanged",
    Object.fromEntries(
      Object.entries(rounds).map(([marker, round]) => [marker, cloneRound(round)]),
    ),
  );
}

function endRound(marker: string) {
  const round = rounds[marker];
  if (!round || round.finished) {
    return;
  }

  round.finished = true;
  round.trackStatuses = round.trackStatuses.map((status) =>
    status === "pending" ? "skipped" : status,
  );
  if (marker === props.activeTeamMarker) {
    stopTimer();
    stopAudio();
  }
  saveRounds();
}

function startRound() {
  const marker = props.activeTeamMarker;
  const round = rounds[marker];
  if (!round || round.started || round.finished || !currentTrack.value) {
    return;
  }

  round.started = true;
  round.timeLeft = 60;
  round.currentTrackIndex = 0;
  void playCurrentTrack();
  timerInterval = setInterval(() => {
    round.timeLeft -= 1;
    if (round.timeLeft <= 0) {
      round.timeLeft = 0;
      endRound(marker);
    } else {
      saveRounds();
    }
  }, 1000);
  saveRounds();
}

function moveToNextTrack(round: TeamRound, marker: string) {
  const nextTrackIndex = round.trackStatuses.findIndex(
    (status) => status === "pending",
  );

  if (nextTrackIndex !== -1) {
    round.currentTrackIndex = nextTrackIndex;
    return;
  }

  if (round.skippedTrackIndices.length === 0) {
    endRound(marker);
    return;
  }

  round.revisitCursor %= round.skippedTrackIndices.length;
  round.currentTrackIndex =
    round.skippedTrackIndices[round.revisitCursor];
}

function markCurrentTrack(status: "correct" | "skipped") {
  const marker = props.activeTeamMarker;
  const round = rounds[marker];
  if (!round || !isRoundRunning.value) {
    return;
  }

  const trackIndex = round.currentTrackIndex;
  const previousStatus = round.trackStatuses[trackIndex];
  if (previousStatus === "pending") {
    if (status === "skipped") {
      round.skippedTrackIndices.push(trackIndex);
    } else {
      emit("pointScored", marker, 1);
    }
  } else if (status === "correct") {
    emit("pointScored", marker, 1);
    const skippedIndex = round.skippedTrackIndices.indexOf(trackIndex);
    if (skippedIndex !== -1) {
      round.skippedTrackIndices.splice(skippedIndex, 1);
      round.revisitCursor %= Math.max(round.skippedTrackIndices.length, 1);
    }
  } else {
    const skippedIndex = round.skippedTrackIndices.indexOf(trackIndex);
    if (skippedIndex !== -1 && round.skippedTrackIndices.length > 1) {
      round.revisitCursor = (skippedIndex + 1) % round.skippedTrackIndices.length;
    }
  }

  round.trackStatuses[trackIndex] = status;
  moveToNextTrack(round, marker);
  saveRounds();
  if (isRoundRunning.value) {
    void playCurrentTrack();
  }
}

function trackStatusLabel(status: TrackStatus, finished: boolean) {
  if (status === "correct") {
    return "Acertada";
  }
  if (finished) {
    return "Não acertada";
  }
  if (status === "skipped") {
    return "Pulada, aguardando revisão";
  }
  return "Ainda não tocada";
}

function resumeRound() {
  const marker = props.activeTeamMarker;
  const round = rounds[marker];
  if (!round?.started || round.finished || timerInterval !== undefined) {
    return;
  }

  void playCurrentTrack();
  timerInterval = setInterval(() => {
    round.timeLeft -= 1;
    if (round.timeLeft <= 0) {
      round.timeLeft = 0;
      endRound(marker);
    } else {
      saveRounds();
    }
  }, 1000);
}

onMounted(async () => {
  await loadTracks();
  resumeRound();
});
onUnmounted(() => {
  stopTimer();
  stopAudio();
});
</script>

<template>
  <GameScreen
    title="Relógio musical"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    :turn-switch-disabled="isRoundRunning"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section
      class="music-clock-game"
      :class="`team-${activeTeam?.accent ?? 'coral'}`"
      aria-label="Relógio musical"
    >
      <header class="music-clock-heading">
        <h1>Relógio musical</h1>
      </header>

      <div class="music-clock-layout">
        <div
          class="music-clock-face"
          :class="{
            'team-coral': activeTeam?.accent === 'coral',
            'team-violet': activeTeam?.accent === 'violet',
            'is-running': isRoundRunning,
          }"
          role="group"
          :aria-label="`Relógio musical, ${activeTeam?.name ?? 'equipe ativa'}`"
        >
          <span
            v-for="number in clockNumbers"
            :key="number"
            class="music-clock-number"
            :class="[
              `clock-hour-${number}`,
              {
                'is-current':
                  isRoundRunning &&
                  currentRound.currentTrackIndex === number - 1,
                'is-correct':
                  currentRound.trackStatuses[number - 1] === 'correct',
                  'is-finished-miss':
                    currentRound.finished &&
                    currentRound.trackStatuses[number - 1] !== 'correct',
                },
              ]"
              :aria-label="`${number}: ${trackStatusLabel(currentRound.trackStatuses[number - 1], currentRound.finished)}`"
          >
              {{ number }}
              <span
                v-if="
                  currentRound.trackStatuses[number - 1] === 'correct' ||
                  currentRound.finished
                "
                class="music-clock-track-name"
                aria-hidden="true"
              >
              {{ trackLabels[number - 1] }}
            </span>
          </span>

          <div class="music-clock-center" aria-live="polite">
            <span class="clock-time">{{ formattedTime }}</span>
            <span v-if="!currentRound.finished" class="clock-caption">
              {{ isRoundRunning ? "Tempo restante" : "Pronto para começar" }}
            </span>
          </div>
        </div>

        <div class="music-clock-controls">
          <audio
            ref="audioElement"
            :src="currentTrack?.audioUrl"
            preload="metadata"
            @error="handleAudioError"
          />
          <button
            v-if="!currentRound.started"
            class="clock-action-button clock-start-button"
            type="button"
            :disabled="currentRound.finished || !currentTrack"
            @click="startRound"
          >
            <Play :size="17" :stroke-width="2" />
            <span>Começar</span>
          </button>
          <template v-else-if="isRoundRunning">
            <button
              class="clock-action-button clock-skip-button"
              type="button"
              @click="markCurrentTrack('skipped')"
            >
              <SkipForward :size="17" :stroke-width="2" />
              <span>Passar música</span>
            </button>
            <button
              class="clock-action-button clock-correct-button"
              type="button"
              @click="markCurrentTrack('correct')"
            >
              <Check :size="17" :stroke-width="2" />
              <span>Acertou</span>
            </button>
          </template>
        </div>
      </div>
      <p v-if="trackLoadMessage" class="clock-audio-message" role="status">
        {{ trackLoadMessage }}
      </p>
      <p v-if="audioError" class="clock-audio-message" role="alert">
        {{ audioError }}
      </p>
    </section>
  </GameScreen>
</template>
