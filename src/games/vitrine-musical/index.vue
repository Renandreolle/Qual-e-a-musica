<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { Pause, Play, X } from "lucide-vue-next";
import GameScreen from "../../components/GameScreen.vue";
import type { Team } from "../../types/team";

type SongPoints = 0 | 1 | 2;
type SongResult = { points: SongPoints; teamMarker: string | null };
interface ShowcaseSong {
  id: number;
  title: string;
  artist: string;
  videoUrl: string;
}

const props = defineProps<{
  teams: Team[];
  activeTeamMarker: string;
  songResults: Record<number, SongResult>;
}>();
const emit = defineEmits<{
  back: [];
  toggleTurn: [];
  resultSelected: [songId: number, points: SongPoints, teamMarker: string | null];
}>();

const songIds = Array.from({ length: 10 }, (_, index) => index + 1);
const songs = ref<ShowcaseSong[]>([]);
const songsById = computed(() =>
  Object.fromEntries(songs.value.map((song) => [song.id, song])),
);
const songLoadMessage = ref("Carregando clipes...");
const songDialog = ref<HTMLDialogElement | null>(null);
const videoElement = ref<HTMLVideoElement | null>(null);
const selectedSongId = ref<number | null>(null);
const videoMessage = ref("");
const previewPlaying = ref(false);
const audioEnabled = ref(false);
const selectedSong = computed(
  () => songsById.value[selectedSongId.value ?? 0] ?? null,
);
const selectedResult = computed(() =>
  selectedSongId.value === null
    ? undefined
    : props.songResults[selectedSongId.value],
);

function parseVideoFilename(fileName: string): ShowcaseSong | null {
  const match = fileName.match(/^(10|[1-9]) - (.+) - (.+)\.mp4$/i);
  if (!match) {
    return null;
  }

  const [, numberText, title, artist] = match;
  const id = Number(numberText);
  if (!title.trim() || !artist.trim()) {
    return null;
  }

  return {
    id,
    title: title.trim(),
    artist: artist.trim(),
    videoUrl: `/vitrine-musical/${encodeURIComponent(fileName)}`,
  };
}

async function loadSongs() {
  try {
    const response = await fetch("/__dev/vitrine-musical-videos");
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
      .filter((song): song is ShowcaseSong => song !== null);
    const songsByKey = new Map<number, ShowcaseSong>();
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
        ? `Há clipes duplicados para os desafios: ${[...duplicateIds].join(", ")}.`
        : "",
      missingIds.length
        ? `Faltam clipes para os desafios: ${missingIds.join(", ")}.`
        : "",
    ].filter(Boolean);

    songLoadMessage.value = issues.join(" ");
  } catch (error) {
    songLoadMessage.value =
      error instanceof Error
        ? `Não foi possível carregar os clipes da Vitrine musical: ${error.message}`
        : "Não foi possível carregar os clipes da Vitrine musical.";
  }
}

const hasResult = computed(() => selectedResult.value !== undefined);

function teamForMarker(marker: string) {
  return props.teams.find((team) => team.marker === marker);
}

async function showSongDialog(songId: number) {
  if (!songsById.value[songId]) {
    return;
  }

  stopVideo();
  selectedSongId.value = songId;
  audioEnabled.value = false;
  videoMessage.value = "";
  await nextTick();
  if (!songDialog.value?.open) {
    songDialog.value?.showModal();
  }
}

function resultClass(songId: number) {
  const result = props.songResults[songId];
  if (!result) {
    return "";
  }
  if (result.points === 0 || !result.teamMarker) {
    return "is-neutral";
  }
  return `is-${teamForMarker(result.teamMarker)?.accent ?? "neutral"}`;
}

async function playVideo(withAudio: boolean) {
  const video = videoElement.value;
  if (!video) {
    videoMessage.value = "Não foi possível carregar o clipe deste desafio.";
    return;
  }

  audioEnabled.value = withAudio;
  video.muted = !withAudio;
  video.currentTime = 0;

  try {
    await video.play();
    previewPlaying.value = true;
    videoMessage.value = "";
  } catch {
    previewPlaying.value = false;
    videoMessage.value = "Não foi possível reproduzir este clipe.";
  }
}

async function previewClip() {
  const video = videoElement.value;
  if (!video) {
    videoMessage.value = "Não foi possível carregar o clipe deste desafio.";
    return;
  }

  if (previewPlaying.value) {
    video.pause();
    previewPlaying.value = false;
    audioEnabled.value = false;
    video.muted = true;
    return;
  }

  await playVideo(false);
}

async function scoreSong(points: SongPoints) {
  const song = selectedSong.value;
  if (!song) {
    return;
  }

  emit(
    "resultSelected",
    song.id,
    points,
    points === 0 ? null : props.activeTeamMarker,
  );
  await nextTick();
  await playVideo(true);
}

function stopVideo() {
  videoElement.value?.pause();
  if (videoElement.value) {
    videoElement.value.currentTime = 0;
  }
  previewPlaying.value = false;
  audioEnabled.value = false;
}

function closeDialog() {
  stopVideo();
  selectedSongId.value = null;
  videoMessage.value = "";
}

function handleVideoEnded() {
  previewPlaying.value = false;
}

function handleVideoError() {
  previewPlaying.value = false;
  videoMessage.value = "Não foi possível carregar o clipe deste desafio.";
}

onMounted(loadSongs);
onUnmounted(stopVideo);
</script>

<template>
  <GameScreen
    title="Vitrine musical"
    :teams="teams"
    :active-team-marker="activeTeamMarker"
    @back="emit('back')"
    @toggle-turn="emit('toggleTurn')"
  >
    <section class="showcase-game" aria-label="Desafios da Vitrine musical">
      <h1 class="showcase-heading">Vitrine musical</h1>
      <p v-if="songLoadMessage" class="time-tunnel-audio-message" role="status">
        {{ songLoadMessage }}
      </p>
      <div class="showcase-grid">
        <button
          v-for="songId in songIds"
          :key="songId"
          class="showcase-card"
          :class="resultClass(songId)"
          type="button"
          :disabled="!songsById[songId]"
          :aria-label="`Música ${songId}${songResults[songId] ? `, ${songResults[songId].points} pontos` : ''}`"
          @click="showSongDialog(songId)"
        >
          <span class="showcase-card-number">{{ String(songId).padStart(2, "0") }}</span>
          <span>Vitrine</span>
        </button>
      </div>
    </section>

    <dialog
      ref="songDialog"
      class="showcase-dialog"
      aria-labelledby="showcase-dialog-title"
      @close="closeDialog"
      @click.self="songDialog?.close()"
    >
      <button
        class="showcase-dialog-close"
        type="button"
        aria-label="Fechar modal"
        @click="songDialog?.close()"
      >
        <X :size="18" :stroke-width="2" />
      </button>
      <section v-if="selectedSong" class="showcase-dialog-content">
        <p class="dialog-eyebrow">
          VITRINE MUSICAL · MÚSICA {{ String(selectedSong.id).padStart(2, "0") }}
        </p>
        <h2 id="showcase-dialog-title">Qual é a música?</h2>

        <div
          class="showcase-video-frame"
          :class="{ 'has-audio-result': hasResult }"
        >
          <video
            ref="videoElement"
            class="showcase-video"
            :src="selectedSong.videoUrl"
            :muted="!audioEnabled"
            playsinline
            preload="metadata"
            @ended="handleVideoEnded"
            @error="handleVideoError"
          ></video>
          <div v-if="hasResult" class="showcase-clip-caption">
            <strong>{{ selectedSong.title }}</strong>
            <span>{{ selectedSong.artist }}</span>
          </div>
          <span class="showcase-clip-badge">
            <span class="showcase-audio-indicator" :class="{ 'is-on': audioEnabled }"></span>
            {{ audioEnabled ? "COM ÁUDIO" : "SEM ÁUDIO" }}
          </span>
        </div>

        <div class="showcase-actions" aria-label="Resultado da música">
          <button
            class="showcase-action showcase-preview-action"
            type="button"
            :aria-pressed="previewPlaying && !audioEnabled"
            @click="previewClip"
          >
            <Pause v-if="previewPlaying && !audioEnabled" :size="18" :stroke-width="2" />
            <Play v-else :size="18" :stroke-width="2" />
            <span>{{ previewPlaying && !audioEnabled ? "Pausar clipe sem áudio" : "Tocar clipe sem áudio" }}</span>
          </button>
          <button
            class="showcase-action showcase-score-action"
            :class="{ 'is-selected': selectedResult?.points === 2 }"
            type="button"
            :aria-pressed="selectedResult?.points === 2"
            @click="scoreSong(2)"
          >
            <span>Acertou música e artista</span>
            <strong>2 pontos</strong>
          </button>
          <button
            class="showcase-action showcase-score-action"
            :class="{ 'is-selected': selectedResult?.points === 1 }"
            type="button"
            :aria-pressed="selectedResult?.points === 1"
            @click="scoreSong(1)"
          >
            <span>Acertou música ou artista</span>
            <strong>1 ponto</strong>
          </button>
          <button
            class="showcase-action showcase-score-action"
            :class="{ 'is-selected is-neutral': selectedResult?.points === 0 }"
            type="button"
            :aria-pressed="selectedResult?.points === 0"
            @click="scoreSong(0)"
          >
            <span>Nenhum acerto</span>
            <strong>0 pontos</strong>
          </button>
        </div>

        <p v-if="videoMessage" class="showcase-audio-message" role="status">
          {{ videoMessage }}
        </p>
      </section>
    </dialog>
  </GameScreen>
</template>
