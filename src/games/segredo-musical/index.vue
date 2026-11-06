<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { Lightbulb, X } from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";

type SecretOutcome = "active" | "other" | "none" | null;
interface SecretResult {
  hintShown: boolean;
  outcome: SecretOutcome;
  teamMarker: string | null;
  points: number;
}

interface SecretSong {
  id: number;
  word: string;
  hint: string;
  title: string;
  artist: string;
  videoUrl: string;
}

const props = defineProps<{
  teams: Team[];
  activeTeamMarker: string;
  results: Record<number, SecretResult>;
}>();
const emit = defineEmits<{
  back: [];
  toggleTurn: [];
  resultChanged: [songId: number, result: SecretResult];
}>();

const songIds = Array.from({ length: 10 }, (_, index) => index + 1);
const songs = ref<SecretSong[]>([]);
const songsById = computed(() =>
  Object.fromEntries(songs.value.map((song) => [song.id, song])),
);
const songLoadMessage = ref("Carregando desafios...");
const songDialog = ref<HTMLDialogElement | null>(null);
const dialogContent = ref<HTMLElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const selectedSongId = ref<number | null>(null);
const videoMessage = ref("");
const selectedSong = computed(
  () => songsById.value[selectedSongId.value ?? 0] ?? null,
);
const selectedResult = computed(() =>
  selectedSongId.value === null
    ? undefined
    : props.results[selectedSongId.value],
);
const otherTeam = computed(() =>
  props.teams.find((team) => team.marker !== props.activeTeamMarker),
);
const scoringTeam = computed(() =>
  selectedResult.value?.teamMarker
    ? props.teams.find(
        (team) => team.marker === selectedResult.value?.teamMarker,
      )
    : undefined,
);
const selectedOutcome = computed(() => {
  const result = selectedResult.value;
  if (!result?.outcome) {
    return null;
  }
  if (result.outcome === "none") {
    return "none";
  }
  return result.teamMarker === props.activeTeamMarker ? "active" : "other";
});

function parseVideoFilename(fileName: string): SecretSong | null {
  const parts = fileName.replace(/\.mp4$/i, "").split(" - ");
  if (parts.length !== 5) {
    return null;
  }

  const [numberText, word, hint, title, artist] = parts;
  const id = Number(numberText);
  if (
    !Number.isInteger(id) ||
    id < 1 ||
    id > 10 ||
    !word.trim() ||
    !hint.trim() ||
    !title.trim() ||
    !artist.trim()
  ) {
    return null;
  }

  return {
    id,
    word: word.trim(),
    hint: hint.trim(),
    title: title.trim(),
    artist: artist.trim(),
    videoUrl: `/segredo-musical/${encodeURIComponent(fileName)}`,
  };
}

async function loadSongs() {
  try {
    const response = await fetch("/__dev/segredo-musical-videos");
    if (!response.ok) {
      throw new Error(`O servidor respondeu com status ${response.status}.`);
    }

    const fileNames: unknown = await response.json();
    if (
      !Array.isArray(fileNames) ||
      !fileNames.every((fileName) => typeof fileName === "string")
    ) {
      throw new Error("A lista de vídeos retornada pelo servidor é inválida.");
    }

    const parsedSongs = fileNames
      .map(parseVideoFilename)
      .filter((song): song is SecretSong => song !== null);
    const songsByKey = new Map<number, SecretSong>();
    const duplicateIds = new Set<number>();

    for (const song of parsedSongs) {
      if (songsByKey.has(song.id)) {
        duplicateIds.add(song.id);
      } else {
        songsByKey.set(song.id, song);
      }
    }

    songs.value = songIds.flatMap((id) => {
      const song = songsByKey.get(id);
      return song ? [song] : [];
    });

    const missingIds = songIds.filter((id) => !songsByKey.has(id));
    const issues = [
      fileNames.length !== parsedSongs.length
        ? `${fileNames.length - parsedSongs.length} arquivo(s) têm nome fora do padrão.`
        : "",
      duplicateIds.size
        ? `Há vídeos duplicados para os desafios: ${[...duplicateIds].join(", ")}.`
        : "",
      missingIds.length
        ? `Faltam vídeos para os desafios: ${missingIds.join(", ")}.`
        : "",
    ].filter(Boolean);

    songLoadMessage.value = issues.join(" ");
  } catch (error) {
    songLoadMessage.value =
      error instanceof Error
        ? `Não foi possível carregar os vídeos do Segredo musical: ${error.message}`
        : "Não foi possível carregar os vídeos do Segredo musical.";
  }
}

async function openSong(songId: number) {
  if (!songsById.value[songId]) {
    return;
  }

  stopVideo();
  selectedSongId.value = songId;
  videoMessage.value = "";
  await nextTick();
  if (!songDialog.value?.open) {
    songDialog.value?.showModal();
  }
}

function cardClass(songId: number) {
  const result = props.results[songId];
  if (!result?.outcome) {
    return "";
  }
  if (!result.teamMarker) {
    return "is-neutral";
  }
  return `is-${props.teams.find((team) => team.marker === result.teamMarker)?.accent ?? "neutral"}`;
}

async function playVideo() {
  const video = videoElement.value;
  if (!video) {
    videoMessage.value = "Não foi possível carregar o clipe deste desafio.";
    return;
  }

  if (dialogContent.value) {
    dialogContent.value.scrollTop = 0;
  }
  video.currentTime = 0;
  try {
    await video.play();
    videoMessage.value = "";
  } catch {
    videoMessage.value = "Não foi possível reproduzir este clipe.";
  }
}

async function markCorrect(outcome: "active" | "other") {
  const song = selectedSong.value;
  if (!song) {
    return;
  }

  const team =
    outcome === "active"
      ? props.teams.find((candidate) => candidate.marker === props.activeTeamMarker)
      : otherTeam.value;
  if (!team) {
    return;
  }

  emit("resultChanged", song.id, {
    hintShown: selectedResult.value?.hintShown ?? false,
    outcome,
    teamMarker: team.marker,
    points:
      outcome === "other"
        ? 1
        : selectedResult.value?.hintShown
          ? 2
          : 3,
  });
  await nextTick();
  await playVideo();
}

async function markNobodyCorrect() {
  const song = selectedSong.value;
  if (!song || !selectedResult.value?.hintShown) {
    return;
  }

  emit("resultChanged", song.id, {
    hintShown: true,
    outcome: "none",
    teamMarker: null,
    points: 0,
  });
  await nextTick();
  await playVideo();
}

function revealHint() {
  const song = selectedSong.value;
  if (!song) {
    return;
  }

  const previous = selectedResult.value;
  emit("resultChanged", song.id, {
    hintShown: true,
    outcome: previous?.outcome ?? null,
    teamMarker: previous?.teamMarker ?? null,
    points:
      previous?.outcome === "active"
        ? 2
        : previous?.outcome === "other"
          ? 1
          : 0,
  });
}

function stopVideo() {
  videoElement.value?.pause();
  if (videoElement.value) {
    videoElement.value.currentTime = 0;
  }
}

function closeDialog() {
  stopVideo();
  selectedSongId.value = null;
  videoMessage.value = "";
}

function handleVideoError() {
  videoMessage.value = "Não foi possível carregar o clipe deste desafio.";
}

onMounted(loadSongs);
onUnmounted(stopVideo);
</script>

<template>
  <GameScreen
    title="Segredo musical"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section class="secret-song-game" aria-label="Desafios do Segredo musical">
      <h1 class="secret-song-heading">Segredo musical</h1>
      <p v-if="songLoadMessage" class="time-tunnel-audio-message" role="status">
        {{ songLoadMessage }}
      </p>
      <div class="secret-song-grid">
        <button
          v-for="songId in songIds"
          :key="songId"
          class="secret-song-card"
          :class="cardClass(songId)"
          type="button"
          :disabled="!songsById[songId]"
          :aria-label="`Música ${songId}${results[songId]?.outcome ? ', respondida' : ''}`"
          @click="openSong(songId)"
        >
          <span class="secret-song-number">{{ String(songId).padStart(2, "0") }}</span>
          <span>Segredo</span>
        </button>
      </div>
    </section>

    <dialog
      ref="songDialog"
      class="secret-song-dialog"
      aria-labelledby="secret-song-dialog-title"
      @close="closeDialog"
      @click.self="songDialog?.close()"
    >
      <button
        class="secret-song-dialog-close"
        type="button"
        aria-label="Fechar modal"
        @click="songDialog?.close()"
      >
        <X :size="18" :stroke-width="2" />
      </button>
      <section
        v-if="selectedSong"
        ref="dialogContent"
        class="secret-song-dialog-content"
        :class="{ 'is-resolved': !!selectedResult?.outcome }"
      >
        <p class="dialog-eyebrow">
          SEGREDO MUSICAL · MÚSICA {{ String(selectedSong.id).padStart(2, "0") }}
        </p>
        <h2 id="secret-song-dialog-title">Qual é a música?</h2>

        <div
          v-if="selectedResult?.outcome"
          class="secret-resolved-clip"
          aria-live="polite"
        >
          <video
            ref="videoElement"
            class="secret-video"
            :src="selectedSong.videoUrl"
            controls
            playsinline
            preload="metadata"
            @error="handleVideoError"
          ></video>
          <div class="secret-video-caption">
            <strong>{{ selectedSong.title }}</strong>
            <span>{{ selectedSong.artist }}</span>
          </div>
        </div>

        <div
          v-if="selectedResult?.outcome"
          class="secret-resolved-details"
          aria-live="polite"
        >
          <div class="secret-word-card is-revealed">
            <span>PALAVRA DA MÚSICA</span>
            <strong>{{ selectedSong.word }}</strong>
          </div>
        </div>

        <div v-else class="secret-word-card">
          <span>PALAVRA DA MÚSICA</span>
          <strong>{{ selectedSong.word }}</strong>
        </div>

        <div
          v-if="selectedResult?.hintShown"
          class="secret-hint-card"
          aria-live="polite"
        >
          <Lightbulb :size="18" :stroke-width="1.8" />
          <span>{{ selectedSong.hint }}</span>
        </div>

        <p v-if="videoMessage" class="secret-score-message" role="status">
          {{ videoMessage }}
        </p>

        <div class="secret-song-actions">
          <button
            class="secret-song-action secret-active-action"
            :class="{
              'is-selected': selectedOutcome === 'active',
              [`is-selected-${scoringTeam?.accent}`]: selectedOutcome === 'active',
            }"
            type="button"
            :aria-pressed="selectedOutcome === 'active'"
            @click="markCorrect('active')"
          >
            <span>{{ teams.find((team) => team.marker === activeTeamMarker)?.name }} acertou</span>
            <strong>{{ selectedResult?.hintShown ? 2 : 3 }} pontos</strong>
          </button>
          <button
            class="secret-song-action secret-other-action"
            :class="{
              'is-selected': selectedOutcome === 'other',
              [`is-selected-${scoringTeam?.accent}`]: selectedOutcome === 'other',
            }"
            type="button"
            :aria-pressed="selectedOutcome === 'other'"
            @click="markCorrect('other')"
          >
            <span>{{ otherTeam?.name ?? "Outro time" }} acertou</span>
            <strong>1 ponto</strong>
          </button>
          <button
            v-if="selectedResult?.hintShown"
            class="secret-song-action secret-none-action"
            :class="{ 'is-selected': selectedOutcome === 'none' }"
            type="button"
            :aria-pressed="selectedOutcome === 'none'"
            @click="markNobodyCorrect"
          >
            <span>Ninguém acertou</span>
            <strong>0 pontos</strong>
          </button>
          <button
            class="secret-song-action secret-hint-action"
            :class="{ 'is-selected': selectedResult?.hintShown }"
            type="button"
            :aria-pressed="!!selectedResult?.hintShown"
            :disabled="!!selectedResult?.hintShown"
            @click="revealHint"
          >
            <Lightbulb :size="17" :stroke-width="1.8" />
            <span>{{ selectedResult?.hintShown ? "Dica revelada" : "Mostrar dica" }}</span>
          </button>
        </div>

        <p v-if="scoringTeam && selectedResult" class="secret-score-message" role="status">
          {{ scoringTeam.name }} ganhou {{ selectedResult.points }}
          {{ selectedResult.points === 1 ? "ponto" : "pontos" }}.
        </p>
        <p
          v-else-if="selectedOutcome === 'none' && selectedResult"
          class="secret-score-message"
          role="status"
        >
          Ninguém acertou. Nenhum ponto marcado.
        </p>
      </section>
    </dialog>
  </GameScreen>
</template>
